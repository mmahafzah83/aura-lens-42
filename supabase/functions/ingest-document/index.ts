import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB safety guardrail

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

async function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract ALL legible text from this image. Return ONLY raw text, preserving structure. No commentary." },
          { type: "image_url", image_url: { url: signed.signedUrl } },
        ],
      }],
    }),
  }, 30000);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Image extraction API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Extract text from a PDF by sending base64 bytes with proper mime to Gemini.
async function extractFromPdf(adminClient: any, doc: any, lovableApiKey: string): Promise<string> {
  const storagePath = doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
  const bytes = await downloadStorageBytes(adminClient, storagePath);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`PDF too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 20 MB)`);
  }
  const b64 = bytesToBase64(bytes);
  console.log(`[ingest-document] PDF bytes=${bytes.byteLength}, base64 len=${b64.length}`);

  // Lovable AI gateway / Gemini accepts file_data via data URLs in a generic file part.
  // We use OpenAI-compatible 'image_url' with a data URL containing the PDF — this is
  // the documented transport for non-image binaries on the gateway. If the gateway
  // rejects this, we surface the API error verbatim via markError.
  const dataUrl = `data:application/pdf;base64,${b64}`;
  const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract ALL text content from this PDF document. Return ONLY the raw text, preserving structure (headings, lists, paragraphs). No commentary." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  }, 60000);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PDF extraction API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Extract text from a DOCX using mammoth (pure JS, no native deps).
async function extractFromDocx(adminClient: any, doc: any): Promise<string> {
  const storagePath = doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
  const bytes = await downloadStorageBytes(adminClient, storagePath);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`DOCX too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 20 MB)`);
  }
  // @ts-ignore dynamic esm import
  const mammoth = await import("https://esm.sh/mammoth@1.8.0?target=deno");
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
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
    try {
      console.log(`[ingest-document] before extraction path=${extractionPath}`);
      if (kind === "image") {
        extractedText = await extractFromImage(adminClient, doc, lovableApiKey);
      } else if (kind === "pdf") {
        extractedText = await extractFromPdf(adminClient, doc, lovableApiKey);
      } else if (kind === "docx") {
        extractedText = await extractFromDocx(adminClient, doc);
      }
    } catch (e) {
      await markError(adminClient, document_id, e instanceof Error ? e.message : String(e));
      return;
    }

    extractedText = normalizeText(extractedText);
    if (!extractedText || extractedText.length < 20) {
      await markError(adminClient, document_id, `No usable text extracted from ${kind.toUpperCase()} document.`);
      return;
    }
    console.log(`[ingest-document] extraction OK (${kind}), ${extractedText.length} chars`);

    // Summary (non-fatal)
    let docSummary = "";
    try {
      console.log(`[ingest-document] before summary generation id=${document_id}`);
      const summaryRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "You are a senior executive summarizer. Produce a 2-3 sentence strategic summary. Focus on key themes, frameworks, and actionable insights." },
            { role: "user", content: extractedText.slice(0, 4000) },
          ],
        }),
      }, 20000);
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        docSummary = sumData.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("[ingest-document] summary error (non-fatal):", e);
    }

    const chunks = chunkText(extractedText);
    console.log(`[ingest-document] chunking complete count=${chunks.length}`);
    const chunkRows = chunks.map((content, i) => ({
      document_id,
      user_id: userId,
      content,
      chunk_index: i,
      metadata: { filename: doc.filename, file_type: doc.file_type, kind },
    }));

    if (chunkRows.length > 0) {
      const { error: insertErr } = await adminClient.from("document_chunks").insert(chunkRows);
      if (insertErr) {
        await markError(adminClient, document_id, `Chunk insert failed: ${insertErr.message}`);
        return;
      }
    }

    console.log(`[ingest-document] final status update -> completed (${chunks.length} chunks)`);
    await adminClient.from("documents").update({
      status: "completed",
      summary: docSummary || extractedText.slice(0, 300),
      page_count: chunks.length,
      error_message: null,
    }).eq("id", document_id);

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
        }, 30000);
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
