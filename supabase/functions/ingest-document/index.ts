import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB safety guardrail
const OCR_PAGE_TEXT_THRESHOLD = 30; // <30 chars => treat as scanned
const OCR_BATCH_SIZE = 5;
const OCR_MAX_PAGES = 30;
const SEGMENT_BYTES_THRESHOLD = 12 * 1024 * 1024; // 12 MB
const SEGMENT_PAGES_THRESHOLD = 60;
const SEGMENT_PAGE_SIZE = 40;
const PROCESS_DEADLINE_MS = 220_000;

function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  if (!text || text.trim().length === 0) return chunks;

  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + chunkSize * 0.5) end = breakPoint + 1;
    }

    if (end <= start) {
      end = Math.min(start + chunkSize, text.length);
      if (end <= start) break;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);

    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchWithTimeout(url: string, options: RequestInit, ms: number, label = "request") {
  const controller = new AbortController();
  let timedOut = false;
  const id = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (timedOut) {
      throw new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

async function markError(adminClient: any, document_id: string, reason: string) {
  console.error(`[ingest-document] document ${document_id} -> error: ${reason}`);
  await adminClient
    .from("documents")
    .update({ status: "error", error_message: reason.slice(0, 500) })
    .eq("id", document_id);
}

// Classify the document into a stable extraction route.
// Uses doc.file_type first (set by client to 'image'|'pdf'|'docx'),
// falls back to filename extension.
function classifyKind(fileType: string | null | undefined, filename: string): "image" | "pdf" | "docx" | "unsupported" {
  const ft = (fileType || "").trim().toLowerCase();
  const normalizedFilename = (filename || "").trim().toLowerCase();
  const ext = normalizedFilename.includes(".") ? normalizedFilename.split(".").pop() || "" : "";

  if (
    ft.startsWith("image/") ||
    ["image", "png", "jpg", "jpeg", "webp"].includes(ft)
  ) {
    return "image";
  }

  if (
    ft === "pdf" ||
    ft === "application/pdf" ||
    ft.includes("pdf") ||
    ext === "pdf"
  ) {
    return "pdf";
  }

  if (
    ft === "docx" ||
    ft === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ft.includes("wordprocessingml.document") ||
    ext === "docx"
  ) {
    return "docx";
  }

  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return "unsupported";
}

function getExtractionPath(kind: "image" | "pdf" | "docx" | "unsupported") {
  switch (kind) {
    case "image":
      return "image_url";
    case "pdf":
      return "pdf_base64";
    case "docx":
      return "docx_mammoth";
    default:
      return "unsupported";
  }
}

function imageMime(filename: string, fileType: string | null | undefined): string {
  const ft = (fileType || "").toLowerCase();
  if (ft === "image/png" || ft === "png") return "image/png";
  if (ft === "image/jpeg" || ft === "jpg" || ft === "jpeg") return "image/jpeg";
  if (ft === "image/webp" || ft === "webp") return "image/webp";
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked conversion to avoid call-stack issues on large files
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function downloadStorageBytes(adminClient: any, storagePath: string): Promise<Uint8Array> {
  const { data, error } = await adminClient.storage.from("documents").download(storagePath);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message || "no data"}`);
  const buf = await (data as Blob).arrayBuffer();
  return new Uint8Array(buf);
}

// Extract text from an image via Gemini multimodal (signed URL is fine for real images)
async function extractFromImage(adminClient: any, doc: any, lovableApiKey: string): Promise<string> {
  const storagePath = doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
  const { data: signed, error: signErr } = await adminClient.storage
    .from("documents")
    .createSignedUrl(storagePath, 3600);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Could not generate signed URL: ${signErr?.message || "unknown"}`);
  }
  console.log(`[ingest-document] signed URL created for image path=${storagePath}`);
  const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract ALL legible text from this image. Return ONLY raw text, preserving structure. No commentary." },
          { type: "image_url", image_url: { url: signed.signedUrl } },
        ],
      }],
    }),
  }, 60000, "Image extraction");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Image extraction API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Extract text from a PDF by sending base64 bytes with proper mime to Gemini.
// Deterministic per-page PDF extraction using unpdf (pdf.js for Deno).
// OCR fallback via Gemini gateway is applied only to pages with < OCR_PAGE_TEXT_THRESHOLD chars.
type PdfPage = { page: number; text: string };
type PdfResult = {
  pages: PdfPage[];
  pagesTotal: number;
  pagesRead: number;
  method: "text" | "ocr" | "mixed";
  ocrUnread: number; // scanned pages skipped because OCR cap was hit
};

async function extractFromPdf(
  adminClient: any,
  doc: any,
  lovableApiKey: string,
): Promise<PdfResult> {
  const storagePath = doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
  const bytes = await downloadStorageBytes(adminClient, storagePath);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`PDF too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 50 MB)`);
  }
  console.log(`[ingest-document] PDF bytes=${bytes.byteLength}, running streaming extraction`);

  // @ts-ignore dynamic esm import
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  // @ts-ignore dynamic esm import
  const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");

  // Read pagesTotal cheaply, then release the top-level proxy immediately.
  let probe: any = await getDocumentProxy(bytes);
  const pagesTotal: number = probe.numPages;
  probe = null;

  const shouldSegment =
    bytes.byteLength > SEGMENT_BYTES_THRESHOLD || pagesTotal > SEGMENT_PAGES_THRESHOLD;
  console.log(
    `[ingest-document] pdf pagesTotal=${pagesTotal} segment=${shouldSegment} segSize=${SEGMENT_PAGE_SIZE}`,
  );

  const pages: PdfPage[] = new Array(pagesTotal);
  for (let i = 1; i <= pagesTotal; i++) pages[i - 1] = { page: i, text: "" };
  const scannedPageNums: number[] = [];

  // Helper: run unpdf per-page on the given bytes, mapping local index -> absolute page.
  async function readSegmentText(segBytes: Uint8Array, absoluteStart: number, localPageCount: number) {
    let segProxy: any = await getDocumentProxy(segBytes);
    for (let local = 1; local <= localPageCount; local++) {
      const absolute = absoluteStart + local - 1;
      let text = "";
      try {
        const { text: pageText } = await extractText(segProxy, {
          mergePages: false,
          pageNumbers: [local],
        });
        const t = Array.isArray(pageText) ? (pageText[0] || "") : String(pageText || "");
        text = normalizeText(t);
      } catch (e) {
        console.warn(
          `[ingest-document] unpdf page ${absolute} failed:`,
          e instanceof Error ? e.message : e,
        );
        text = "";
      }
      pages[absolute - 1].text = text;
      if (text.length < OCR_PAGE_TEXT_THRESHOLD) scannedPageNums.push(absolute);
    }
    segProxy = null; // release per-segment
  }

  if (!shouldSegment) {
    // Small PDF: still read one page at a time to release refs between pages.
    await readSegmentText(bytes, 1, pagesTotal);
  } else {
    // Auto-split into SEGMENT_PAGE_SIZE-page slices; each slice is a fresh mini-PDF.
    for (let start = 1; start <= pagesTotal; start += SEGMENT_PAGE_SIZE) {
      const endInclusive = Math.min(start + SEGMENT_PAGE_SIZE - 1, pagesTotal);
      const count = endInclusive - start + 1;
      let segBytes: Uint8Array | null = null;
      try {
        let src: any = await PDFDocument.load(bytes);
        let out: any = await PDFDocument.create();
        const indices: number[] = [];
        for (let p = start; p <= endInclusive; p++) indices.push(p - 1);
        const copied = await out.copyPages(src, indices);
        for (const p of copied) out.addPage(p);
        const saved = await out.save();
        segBytes = new Uint8Array(saved);
        src = null;
        out = null;
        console.log(
          `[ingest-document] segment ${start}-${endInclusive} bytes=${segBytes.byteLength}`,
        );
        await readSegmentText(segBytes, start, count);
      } catch (e) {
        console.warn(
          `[ingest-document] segment ${start}-${endInclusive} failed:`,
          e instanceof Error ? e.message : e,
        );
      } finally {
        segBytes = null; // release segment bytes before next iteration
      }
    }
  }

  const textPages = pages.filter((p) => p.text.length >= OCR_PAGE_TEXT_THRESHOLD).length;

  // OCR fallback — still capped at OCR_MAX_PAGES total across the whole document.
  const ocrTargets = scannedPageNums.slice(0, OCR_MAX_PAGES);
  const ocrUnread = Math.max(0, scannedPageNums.length - ocrTargets.length);
  let ocrRead = 0;

  if (ocrTargets.length > 0) {
    for (let start = 0; start < ocrTargets.length; start += OCR_BATCH_SIZE) {
      const batchNums = ocrTargets.slice(start, start + OCR_BATCH_SIZE);
      let batchBytes: Uint8Array | null = null;
      try {
        let src: any = await PDFDocument.load(bytes);
        let out: any = await PDFDocument.create();
        const copied = await out.copyPages(src, batchNums.map((n) => n - 1));
        for (const p of copied) out.addPage(p);
        const saved = await out.save();
        batchBytes = new Uint8Array(saved);
        src = null;
        out = null;
        const b64 = bytesToBase64(batchBytes);
        const dataUrl = `data:application/pdf;base64,${b64}`;

        const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `This PDF contains ${batchNums.length} scanned page(s). Extract ALL text, preserving structure. Separate each page with the exact delimiter "\n===PAGE===\n" in order. Return ONLY raw text, no commentary.` },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            }],
          }),
        }, 120000, "PDF OCR batch");

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.warn(`[ingest-document] OCR batch ${start}-${start + batchNums.length} API ${res.status}: ${t.slice(0, 200)}`);
          continue;
        }
        const data = await res.json();
        const raw: string = data.choices?.[0]?.message?.content || "";
        const parts = raw.split(/\n===PAGE===\n/);
        for (let j = 0; j < batchNums.length; j++) {
          const pageNum = batchNums[j];
          const chunk = normalizeText(parts[j] || (parts.length === 1 ? raw : ""));
          if (chunk.length >= OCR_PAGE_TEXT_THRESHOLD) {
            pages[pageNum - 1].text = chunk;
            ocrRead += 1;
          }
        }
      } catch (e) {
        console.warn(`[ingest-document] OCR batch failed:`, e instanceof Error ? e.message : e);
      } finally {
        batchBytes = null;
      }
    }
  }

  const pagesRead = pages.filter((p) => p.text.length >= OCR_PAGE_TEXT_THRESHOLD).length;
  let method: "text" | "ocr" | "mixed";
  if (ocrRead === 0) method = "text";
  else if (textPages === 0) method = "ocr";
  else method = "mixed";

  return { pages, pagesTotal, pagesRead, method, ocrUnread };
}

// Extract text from a DOCX using mammoth (pure JS, no native deps).
async function extractFromDocx(adminClient: any, doc: any): Promise<string> {
  const storagePath = doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
  const bytes = await downloadStorageBytes(adminClient, storagePath);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`DOCX too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 50 MB)`);
  }
  // @ts-ignore dynamic esm import
  const mammoth = await import("https://esm.sh/mammoth@1.8.0?target=deno");
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer });
  return result?.value || "";
}

async function processDocument(
  document_id: string,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  lovableApiKey: string,
) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  console.log(`[ingest-document] processDocument START id=${document_id} user=${userId}`);

  // Hard deadline: extraction must always end in completed or error.
  let deadlineTimer: number | undefined;
  const deadlinePromise = new Promise<"__deadline__">((resolve) => {
    deadlineTimer = setTimeout(() => resolve("__deadline__"), PROCESS_DEADLINE_MS) as unknown as number;
  });

  const work = (async () => {
   try {
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      await markError(adminClient, document_id, `Document not found: ${docErr?.message || "missing"}`);
      return;
    }

    const kind = classifyKind(doc.file_type, doc.filename || "");
    const extractionPath = getExtractionPath(kind);
    console.log(`[ingest-document] file_type=${doc.file_type} filename=${doc.filename} -> kind=${kind}`);
    console.log(`[ingest-document] extraction_path=${extractionPath}`);

    if (kind === "unsupported") {
      await markError(adminClient, document_id, `Unsupported file type: ${doc.file_type || "unknown"}`);
      return;
    }

    if (kind === "pdf" && extractionPath !== "pdf_base64") {
      await markError(adminClient, document_id, "Routing error: PDF was not sent through pdf_base64 path");
      return;
    }

    if (kind === "docx" && extractionPath !== "docx_mammoth") {
      await markError(adminClient, document_id, "Routing error: DOCX was not sent through docx_mammoth path");
      return;
    }

    let extractedText = "";
    let pdfResult: PdfResult | null = null;
    try {
      console.log(`[ingest-document] stage=extracting path=${extractionPath}`);
      if (kind === "image") {
        extractedText = await extractFromImage(adminClient, doc, lovableApiKey);
      } else if (kind === "pdf") {
        pdfResult = await extractFromPdf(adminClient, doc, lovableApiKey);
        extractedText = pdfResult.pages.map((p) => p.text).filter(Boolean).join("\n\n");
      } else if (kind === "docx") {
        extractedText = await extractFromDocx(adminClient, doc);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Prefix with stage so the UI can name the failure clearly.
      await markError(adminClient, document_id, `Extraction failed (${kind}): ${raw}`);
      return;
    }

    extractedText = normalizeText(extractedText);
    if (!extractedText || extractedText.length < 20) {
      await markError(adminClient, document_id, `No usable text extracted from ${kind.toUpperCase()} (empty extracted text).`);
      return;
    }
    console.log(`[ingest-document] stage=extracted ok (${kind}), ${extractedText.length} chars`);

    // Summary (non-fatal)
    let docSummary = "";
    try {
      console.log(`[ingest-document] before summary generation id=${document_id}`);
      const summaryRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a senior executive summarizer. Produce a 2-3 sentence strategic summary. Focus on key themes, frameworks, and actionable insights." },
            { role: "user", content: extractedText.slice(0, 4000) },
          ],
        }),
      }, 30000, "Summary generation");
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        docSummary = sumData.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("[ingest-document] summary error (non-fatal):", e);
    }

    // Chunk with page provenance for PDFs; plain chunking otherwise.
    let chunkRows: any[] = [];
    if (pdfResult) {
      let idx = 0;
      for (const p of pdfResult.pages) {
        if (!p.text || p.text.length < 20) continue;
        const parts = chunkText(p.text);
        for (const content of parts) {
          chunkRows.push({
            document_id,
            user_id: userId,
            content,
            chunk_index: idx++,
            metadata: {
              filename: doc.filename,
              file_type: doc.file_type,
              kind,
              page_start: p.page,
              page_end: p.page,
            },
          });
        }
      }
    } else {
      const chunks = chunkText(extractedText);
      chunkRows = chunks.map((content, i) => ({
        document_id,
        user_id: userId,
        content,
        chunk_index: i,
        metadata: { filename: doc.filename, file_type: doc.file_type, kind },
      }));
    }
    console.log(`[ingest-document] chunking complete count=${chunkRows.length}`);

    if (chunkRows.length > 0) {
      console.log(`[ingest-document] stage=chunking inserting ${chunkRows.length} rows`);
      const { error: insertErr } = await adminClient.from("document_chunks").insert(chunkRows);
      if (insertErr) {
        await markError(adminClient, document_id, `Chunk insert failed: ${insertErr.message}`);
        return;
      }
    }

    // Honest counts: page_count reflects real total pages for PDFs; null for DOCX/images.
    const completionPayload: Record<string, unknown> = {
      status: "completed",
      summary: docSummary || extractedText.slice(0, 300),
      error_message: null,
    };
    if (pdfResult) {
      completionPayload.page_count = pdfResult.pagesTotal;
      completionPayload.pages_total = pdfResult.pagesTotal;
      completionPayload.pages_read = pdfResult.pagesRead;
      completionPayload.extraction_method = pdfResult.method;
      console.log(`[ingest-document] final status -> completed pdf pages ${pdfResult.pagesRead}/${pdfResult.pagesTotal} method=${pdfResult.method} ocrUnread=${pdfResult.ocrUnread}`);
    } else {
      completionPayload.page_count = null;
      completionPayload.pages_total = null;
      completionPayload.pages_read = null;
      completionPayload.extraction_method = "text";
      console.log(`[ingest-document] final status -> completed (${kind}, ${chunkRows.length} chunks)`);
    }
    await adminClient.from("documents").update(completionPayload).eq("id", document_id);

    // Write to entries so document uploads count toward capture score
    const { error: entryErr } = await adminClient
      .from("entries")
      .insert({
        user_id: userId,
        type: "document",
        title: doc.filename || null,
        content: (extractedText || doc.filename || "Document upload").slice(0, 10000),
        summary: docSummary || null,
        image_url: doc.file_url || null,
      });
    if (entryErr) {
      console.error("[ingest-document] entries insert failed:", entryErr.message);
      // Non-blocking — document processing already succeeded
    }

    // Emit ledger event — non-blocking on failure
    try {
      const sbUrl = Deno.env.get("SUPABASE_URL")!;
      const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const res = await fetch(`${sbUrl}/functions/v1/ingest-source-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${srk}`,
          apikey: srk,
        },
        body: JSON.stringify({
          user_id: userId,
          event_type: "document",
          source_table: "documents",
          source_id: document_id,
          payload: {
            page_count: pdfResult ? pdfResult.pagesTotal : null,
            pages_read: pdfResult ? pdfResult.pagesRead : null,
            extraction_method: pdfResult ? pdfResult.method : "text",
          },
        }),
      });
      if (!res.ok) {
        console.error("[source-event] emit failed", res.status, await res.text());
      }
    } catch (e: any) {
      console.error("[source-event] emit failed", e?.message);
    }

    // Defer ALL non-essential downstream work so the document row appears `completed`
    // to the UI immediately. None of these block the perceived completion.
    // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil((async () => {
      try {
        const { data: extractResult, error: extractError } = await adminClient.functions.invoke(
          "extract-evidence",
          { body: { source_type: "document", source_id: document_id, user_id: userId } },
        );
        if (extractError) {
          console.error("[ingest-document] deferred extract-evidence error:", extractError);
        } else {
          const registryId = extractResult?.source_registry_id;
          if (registryId) {
            const { error: sigError } = await adminClient.functions.invoke("detect-signals-v2", {
              body: { source_registry_id: registryId, user_id: userId },
            });
            if (sigError) console.error("[ingest-document] deferred detect-signals-v2 error:", sigError);
          }
        }
      } catch (e) {
        console.error("[ingest-document] deferred pipeline error:", e);
      }

      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY || chunkRows.length === 0) return;
      try {
        const embRes = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: chunkRows.map((r) => r.content) }),
        }, 30000, "Embedding generation");
        if (!embRes.ok) return;
        const embData = await embRes.json();
        const { data: insertedChunks } = await adminClient
          .from("document_chunks")
          .select("id, chunk_index")
          .eq("document_id", document_id)
          .order("chunk_index", { ascending: true });
        if (!insertedChunks) return;
        for (const emb of embData.data || []) {
          const chunk = insertedChunks[emb.index];
          if (chunk) {
            await adminClient
              .from("document_chunks")
              .update({ embedding: `[${emb.embedding.join(",")}]` } as any)
              .eq("id", chunk.id);
          }
        }
      } catch (embErr) {
        console.error("[ingest-document] deferred embedding error:", embErr);
      }
    })());
  } catch (e) {
    await markError(adminClient, document_id, `Unexpected: ${e instanceof Error ? e.message : String(e)}`);
  }
  })();

  const outcome = await Promise.race([work, deadlinePromise]);
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  if (outcome === "__deadline__") {
    await markError(
      adminClient,
      document_id,
      "Reading timed out — file too complex; try a smaller export",
    );
  }
}

Deno.serve(async (req) => {
  console.log(`[ingest-document] handler start method=${req.method}`);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[ingest-document] LOVABLE_API_KEY missing");
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.error("[ingest-document] auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[ingest-document] auth OK user=${user.id} doc=${document_id}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Ownership guard: caller must own this document before we do anything.
    const { data: ownershipRow, error: ownErr } = await adminClient
      .from("documents")
      .select("user_id")
      .eq("id", document_id)
      .maybeSingle();
    if (ownErr) {
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ownershipRow || (ownershipRow as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient
      .from("documents")
      .update({ status: "processing", error_message: null })
      .eq("id", document_id);

    console.log(`[ingest-document] kicking off background processDocument for ${document_id}`);
    // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processDocument(document_id, user.id, supabaseUrl, serviceRoleKey, LOVABLE_API_KEY)
    );

    return new Response(
      JSON.stringify({ success: true, message: "Processing started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[ingest-document] handler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
