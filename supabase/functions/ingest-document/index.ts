import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withObserve } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB safety guardrail
const OCR_PAGE_TEXT_THRESHOLD = 30; // <30 chars => treat as scanned
const OCR_BATCH_SIZE = 3;         // per-slice OCR cap (was 5)
const OCR_PER_SLICE_MAX = 3;      // hard cap: 3 OCR pages / invocation
const DEFAULT_SLICE_SIZE = 25;    // pages per extract invocation
const MIN_SLICE_SIZE = 3;         // below this => too_dense
// NOTE: PROCESS_DEADLINE_MS / PDF_EXTRACT_DEADLINE_MS removed —
// the staged cursor+heartbeat pattern (document_jobs) replaces them.

type FailureCode =
  | "password_protected"
  | "corrupt_file"
  | "no_text_layer"
  | "too_dense"
  | "unsupported_type"
  | "download_failed"
  | "partial_success"
  | "internal_error";

const FAILURE_COPY: Record<FailureCode, string> = {
  password_protected: "This PDF is password-protected — we can't read it.",
  corrupt_file: "This file appears corrupted and can't be read.",
  no_text_layer: "This PDF has no readable text layer (image-only, no OCR match).",
  too_dense: "This document is too visually dense for us to read reliably right now — we're looking into it.",
  unsupported_type: "This file type isn't supported yet.",
  download_failed: "We couldn't download the file from storage.",
  partial_success: "We read most of the document but a few pages didn't come through.",
  internal_error: "Something went wrong while reading this document.",
};

function classifyFailure(msg: string): FailureCode {
  const m = (msg || "").toLowerCase();
  if (m.includes("password") || m.includes("encrypted")) return "password_protected";
  if (m.includes("invalid pdf") || m.includes("corrupt") || m.includes("malformed")) return "corrupt_file";
  if (m.includes("no text") || m.includes("no usable text")) return "no_text_layer";
  if (m.includes("storage") || m.includes("download")) return "download_failed";
  return "internal_error";
}

async function stage(adminClient: any, document_id: string, note: string) {
  try {
    await adminClient
      .from("documents")
      .update({ error_message: `stage: ${note}`.slice(0, 500) })
      .eq("id", document_id);
  } catch (_) {
    // non-fatal
  }
}

// ---- memory telemetry -------------------------------------------------------
function memMB(): { rss_mb: number; heap_mb: number } {
  try {
    // @ts-ignore Deno.memoryUsage
    const u = Deno.memoryUsage();
    return {
      rss_mb: Math.round((u.rss || 0) / (1024 * 1024)),
      heap_mb: Math.round((u.heapUsed || 0) / (1024 * 1024)),
    };
  } catch { return { rss_mb: 0, heap_mb: 0 }; }
}

async function heartbeat(
  admin: any,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  await admin
    .from("document_jobs")
    .update({ ...patch, last_heartbeat: now })
    .eq("id", jobId);
}

async function logStageInfo(
  admin: any,
  args: { document_id: string; stage: string; cursor: number; ms_elapsed: number; extra?: Record<string, unknown> },
) {
  const mem = memMB();
  try {
    await admin.from("ef_error_log").insert({
      function_name: "ingest-document",
      severity: "info",
      error_message: `stage=${args.stage}`,
      context: {
        document_id: args.document_id,
        stage: args.stage,
        cursor: args.cursor,
        rss_mb: mem.rss_mb,
        heap_mb: mem.heap_mb,
        ms_elapsed: args.ms_elapsed,
        ...(args.extra || {}),
      },
    });
  } catch (_) { /* non-fatal */ }
  return mem;
}

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

// ============================================================================
// Staged PDF pipeline — cursor + heartbeat pattern (mirrors evidence_jobs)
// ============================================================================

type PdfPage = { page: number; text: string };

function storagePathOf(doc: any): string {
  return doc.file_url.includes("/storage/v1/")
    ? doc.file_url.split("/documents/")[1]
    : doc.file_url;
}

// PROBE: load PDF only enough to read numPages. No text extraction.
async function probePdf(bytes: Uint8Array): Promise<number> {
  // Prefer pdf-lib (lighter for a numPages read) over unpdf.
  // @ts-ignore dynamic esm import
  const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");
  try {
    const src: any = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return src.getPageCount();
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("encrypt") || msg.includes("password")) {
      const err: any = new Error("password_protected");
      err.failure_code = "password_protected";
      throw err;
    }
    const err: any = new Error("corrupt_file: " + msg.slice(0, 200));
    err.failure_code = "corrupt_file";
    throw err;
  }
}

// EXTRACT: process ONE page range [from, to) of a PDF.
// Copies the slice out via pdf-lib, runs unpdf whole-doc extractText on the
// slice (not the whole document), then OCRs up to OCR_PER_SLICE_MAX scanned
// pages. Returns page-scoped text.
async function extractPdfSlice(
  bytes: Uint8Array,
  from: number, // 0-indexed inclusive
  to: number,   // 0-indexed exclusive
  lovableApiKey: string,
): Promise<PdfPage[]> {
  // @ts-ignore dynamic esm import
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  // @ts-ignore dynamic esm import
  const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");

  const src: any = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  const start = Math.max(0, from);
  const end = Math.min(total, to);
  if (end <= start) return [];

  const out: any = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = start; i < end; i++) indices.push(i);
  const copied = await out.copyPages(src, indices);
  for (const p of copied) out.addPage(p);
  const saved = await out.save();
  let sliceBytes: Uint8Array | null = new Uint8Array(saved);

  // Whole-slice extractText — proven fast path (~1s on 279 pages).
  let pdf: any = await getDocumentProxy(sliceBytes);
  const all: any = await extractText(pdf, { mergePages: false });
  pdf = null;
  const rawPages: string[] = Array.isArray(all?.text)
    ? all.text
    : (typeof all?.text === "string" ? [all.text] : []);

  const pages: PdfPage[] = [];
  const scannedPositions: number[] = []; // 0-indexed within the slice
  for (let i = 0; i < indices.length; i++) {
    const pageNum = indices[i] + 1; // 1-indexed absolute
    const text = normalizeText(String(rawPages[i] || ""));
    pages.push({ page: pageNum, text });
    if (text.length < OCR_PAGE_TEXT_THRESHOLD) scannedPositions.push(i);
  }

  // OCR fallback — capped per slice (not per document). Only the FIRST
  // OCR_PER_SLICE_MAX scanned pages of the slice go through OCR.
  const ocrPositions = scannedPositions.slice(0, OCR_PER_SLICE_MAX);
  if (ocrPositions.length > 0) {
    for (let s = 0; s < ocrPositions.length; s += OCR_BATCH_SIZE) {
      const batch = ocrPositions.slice(s, s + OCR_BATCH_SIZE);
      try {
        let ocrDoc: any = await PDFDocument.create();
        const ocrCopied = await ocrDoc.copyPages(src, batch.map((i) => indices[i]));
        for (const p of ocrCopied) ocrDoc.addPage(p);
        const ocrSaved = await ocrDoc.save();
        const ocrBytes = new Uint8Array(ocrSaved);
        ocrDoc = null;
        const b64 = bytesToBase64(ocrBytes);
        const dataUrl = `data:application/pdf;base64,${b64}`;

        const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `This PDF contains ${batch.length} scanned page(s). Extract ALL text, preserving structure. Separate each page with the exact delimiter "\n===PAGE===\n" in order. Return ONLY raw text, no commentary.` },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            }],
          }),
        }, 90000, "PDF OCR slice batch");

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.warn(`[ingest-document] OCR batch API ${res.status}: ${t.slice(0, 200)}`);
          continue;
        }
        const data = await res.json();
        const raw: string = data.choices?.[0]?.message?.content || "";
        const parts = raw.split(/\n===PAGE===\n/);
        for (let j = 0; j < batch.length; j++) {
          const pos = batch[j];
          const text = normalizeText(parts[j] || (parts.length === 1 ? raw : ""));
          if (text.length >= OCR_PAGE_TEXT_THRESHOLD) pages[pos].text = text;
        }
      } catch (e) {
        console.warn(`[ingest-document] OCR slice batch failed:`, e instanceof Error ? e.message : e);
      }
    }
  }

  sliceBytes = null;
  return pages;
}

// ============================================================================
// Job orchestration
// ============================================================================

async function markJobFailed(
  admin: any,
  job: any,
  code: FailureCode,
  detail: string,
) {
  const copy = FAILURE_COPY[code] || FAILURE_COPY.internal_error;
  await admin.from("document_jobs")
    .update({
      stage: "failed",
      failure_code: code,
      error_detail: detail.slice(0, 500),
      last_heartbeat: new Date().toISOString(),
    })
    .eq("id", job.id);
  await admin.from("documents")
    .update({ status: "error", error_message: copy })
    .eq("id", job.document_id);
}

async function runProbe(
  admin: any,
  job: any,
  doc: any,
  lovableApiKey: string,
): Promise<{ next: "extracting" | "complete" | "failed" }> {
  const t0 = Date.now();
  const kind = classifyKind(doc.file_type, doc.filename || "");

  if (kind === "unsupported") {
    await markJobFailed(admin, job, "unsupported_type", `file_type=${doc.file_type || ""}`);
    return { next: "failed" };
  }

  // Non-PDF single-shot: image + docx run entirely in probing, then complete.
  if (kind === "image" || kind === "docx") {
    try {
      const text = kind === "image"
        ? await extractFromImage(admin, doc, lovableApiKey)
        : await extractFromDocx(admin, doc);
      const clean = normalizeText(text);
      if (!clean || clean.length < 20) {
        await markJobFailed(admin, job, "no_text_layer", `empty ${kind} extraction`);
        return { next: "failed" };
      }
      const chunks = chunkText(clean).map((content, i) => ({
        document_id: doc.id,
        user_id: doc.user_id,
        content,
        chunk_index: i,
        metadata: { filename: doc.filename, file_type: doc.file_type, kind },
      }));
      if (chunks.length > 0) {
        await admin.from("document_chunks").insert(chunks);
      }
      const mem = await logStageInfo(admin, {
        document_id: doc.id, stage: "probing", cursor: 0, ms_elapsed: Date.now() - t0,
        extra: { kind, chunks: chunks.length },
      });
      await heartbeat(admin, job.id, {
        stage: "complete",
        total: null,
        cursor: 0,
        peak_memory_mb: Math.max(job.peak_memory_mb ?? 0, mem.rss_mb),
      });
      await admin.from("documents").update({
        pages_total: null, pages_read: null,
      }).eq("id", doc.id);
      return { next: "complete" };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      await markJobFailed(admin, job, classifyFailure(raw), raw);
      return { next: "failed" };
    }
  }

  // PDF probe: read numPages ONLY.
  try {
    const bytes = await downloadStorageBytes(admin, storagePathOf(doc));
    if (bytes.byteLength > MAX_BYTES) {
      await markJobFailed(admin, job, "unsupported_type",
        `PDF too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 50 MB)`);
      return { next: "failed" };
    }
    const total = await probePdf(bytes);
    const mem = await logStageInfo(admin, {
      document_id: doc.id, stage: "probing", cursor: 0, ms_elapsed: Date.now() - t0,
      extra: { total, bytes: bytes.byteLength },
    });
    await heartbeat(admin, job.id, {
      stage: "extracting",
      total,
      cursor: 0,
      peak_memory_mb: Math.max(job.peak_memory_mb ?? 0, mem.rss_mb),
    });
    await admin.from("documents").update({
      pages_total: total,
      pages_read: 0,
      page_count: total,
    }).eq("id", doc.id);
    return { next: "extracting" };
  } catch (e: any) {
    const code: FailureCode = (e && e.failure_code) || classifyFailure(e?.message || String(e));
    await markJobFailed(admin, job, code, e?.message || String(e));
    return { next: "failed" };
  }
}

async function runExtractSlice(
  admin: any,
  job: any,
  doc: any,
  lovableApiKey: string,
): Promise<{ next: "extracting" | "complete" | "failed" }> {
  const t0 = Date.now();
  const from = job.cursor as number;
  const total = (job.total as number) ?? 0;
  if (total <= 0) {
    await markJobFailed(admin, job, "internal_error", "extract called before probe wrote total");
    return { next: "failed" };
  }
  const sliceSize = Math.max(MIN_SLICE_SIZE, (job.slice_size as number) || DEFAULT_SLICE_SIZE);
  const to = Math.min(total, from + sliceSize);

  // Bump attempts BEFORE the risky work — the watchdog reads this on death.
  const nextAttempts = (job.attempts as number) + 1;
  await heartbeat(admin, job.id, { attempts: nextAttempts });

  try {
    const bytes = await downloadStorageBytes(admin, storagePathOf(doc));
    const pages = await extractPdfSlice(bytes, from, to, lovableApiKey);

    // Chunk and insert progressively — one range per invocation.
    const rows: any[] = [];
    let localIdx = 0;
    // Get current max chunk_index so we don't collide across slices.
    const { data: maxRow } = await admin
      .from("document_chunks")
      .select("chunk_index")
      .eq("document_id", doc.id)
      .order("chunk_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    let baseIdx = ((maxRow as any)?.chunk_index ?? -1) + 1;

    let pagesReadInSlice = 0;
    for (const p of pages) {
      if (!p.text || p.text.length < 20) continue;
      pagesReadInSlice += 1;
      const parts = chunkText(p.text);
      for (const content of parts) {
        rows.push({
          document_id: doc.id,
          user_id: doc.user_id,
          content,
          chunk_index: baseIdx + localIdx++,
          metadata: {
            filename: doc.filename,
            file_type: doc.file_type,
            kind: "pdf",
            page_start: p.page,
            page_end: p.page,
          },
        });
      }
    }
    if (rows.length > 0) {
      const { error: insErr } = await admin.from("document_chunks").insert(rows);
      if (insErr) throw new Error(`chunk insert: ${insErr.message}`);
    }

    const newCursor = to;
    const pagesReadTotal = ((doc.pages_read as number) || 0) + pagesReadInSlice;

    const mem = await logStageInfo(admin, {
      document_id: doc.id, stage: "extracting", cursor: newCursor,
      ms_elapsed: Date.now() - t0,
      extra: { from, to, pages_in_slice: pages.length, chunks_inserted: rows.length, slice_size: sliceSize },
    });

    const nextStage = newCursor >= total ? "chunking" : "extracting";
    await heartbeat(admin, job.id, {
      cursor: newCursor,
      stage: nextStage,
      // Reset attempts on progress so the "twice at same cursor" rule works.
      attempts: 0,
      peak_memory_mb: Math.max(job.peak_memory_mb ?? 0, mem.rss_mb),
    });

    // Progress on documents so UI can render "Reading 47 of 279 pages".
    await admin.from("documents").update({
      pages_read: pagesReadTotal,
    }).eq("id", doc.id);

    if (newCursor >= total) return { next: "complete" };
    return { next: "extracting" };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Halve slice size and retry, unless we've been here twice at this cursor.
    if (nextAttempts >= 2) {
      const halved = Math.floor(sliceSize / 2);
      if (halved < MIN_SLICE_SIZE) {
        // We already tried size 3 twice — give up on this range.
        // If we've read >85% of pages, mark partial_success and finish.
        const readRatio = ((doc.pages_read as number) || 0) / Math.max(1, total);
        if (readRatio >= 0.85) {
          await heartbeat(admin, job.id, {
            stage: "chunking",
            failure_code: "partial_success",
            error_detail: `stalled at page ${from}: ${raw.slice(0, 200)}`,
          });
          return { next: "complete" };
        }
        await markJobFailed(admin, job, "too_dense", `stalled at page ${from}: ${raw.slice(0, 200)}`);
        return { next: "failed" };
      }
      await heartbeat(admin, job.id, { slice_size: halved, attempts: 0 });
      console.log(`[ingest-document] halving slice_size ${sliceSize}->${halved} at cursor=${from}`);
    }
    await logStageInfo(admin, {
      document_id: doc.id, stage: "extracting_error", cursor: from,
      ms_elapsed: Date.now() - t0,
      extra: { error: raw.slice(0, 300), attempts: nextAttempts, slice_size: sliceSize },
    });
    // Return "extracting" so orchestrator re-invokes us (retry same cursor).
    return { next: "extracting" };
  }
}

async function runComplete(
  admin: any,
  job: any,
  doc: any,
  lovableApiKey: string,
) {
  const t0 = Date.now();

  // Assemble a short excerpt for summary + entries content — cap to 20k so we
  // never pull megabytes into memory at completion.
  const { data: chunkRows } = await admin
    .from("document_chunks")
    .select("content, chunk_index")
    .eq("document_id", doc.id)
    .order("chunk_index", { ascending: true })
    .limit(60);
  const excerpt = ((chunkRows || []) as any[])
    .map((r) => r.content).join("\n\n").slice(0, 20000);

  let docSummary = "";
  try {
    if (excerpt.length >= 200) {
      const summaryRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a senior executive summarizer. Produce a 2-3 sentence strategic summary. Focus on key themes, frameworks, and actionable insights." },
            { role: "user", content: excerpt.slice(0, 4000) },
          ],
        }),
      }, 30000, "Summary generation");
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        docSummary = sumData.choices?.[0]?.message?.content || "";
      }
    }
  } catch (e) {
    console.error("[ingest-document] summary error (non-fatal):", e);
  }

  const { count: chunkCount } = await admin
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", doc.id);

  const pagesTotal = (job.total as number) ?? null;
  const { data: freshDoc } = await admin
    .from("documents").select("pages_read").eq("id", doc.id).maybeSingle();
  const pagesRead = ((freshDoc as any)?.pages_read as number) ?? null;

  await admin.from("documents").update({
    status: "completed",
    summary: docSummary || excerpt.slice(0, 300),
    display_title: humanDocTitle(doc.filename, docSummary || excerpt),
    error_message: null,
    page_count: pagesTotal,
    pages_total: pagesTotal,
    pages_read: pagesRead,
    extraction_method: "text",
  }).eq("id", doc.id);

  // Ledger event
  try {
    await admin.from("entries").insert({
      user_id: doc.user_id,
      type: "document",
      title: doc.filename || null,
      content: (excerpt || doc.filename || "Document upload").slice(0, 10000),
      summary: docSummary || null,
      image_url: doc.file_url || null,
    });
  } catch (e) {
    console.error("[ingest-document] entries insert failed:", e);
  }

  await logStageInfo(admin, {
    document_id: doc.id, stage: "complete", cursor: job.cursor,
    ms_elapsed: Date.now() - t0,
    extra: { chunks: chunkCount ?? null, pages_read: pagesRead, pages_total: pagesTotal },
  });
  await heartbeat(admin, job.id, {
    stage: "complete",
  });

  // Fire-and-forget downstream pipeline.
  // @ts-ignore EdgeRuntime.waitUntil
  EdgeRuntime.waitUntil((async () => {
    try {
      const { data: extractResult, error: extractError } = await admin.functions.invoke(
        "extract-evidence",
        { body: { source_type: "document", source_id: doc.id, user_id: doc.user_id } },
      );
      if (extractError) console.error("[ingest-document] deferred extract-evidence error:", extractError);
      const registryId = extractResult?.source_registry_id;
      if (registryId) {
        const { error: sigError } = await admin.functions.invoke("detect-signals-v2", {
          body: { source_registry_id: registryId, user_id: doc.user_id },
        });
        if (sigError) console.error("[ingest-document] deferred detect-signals-v2 error:", sigError);
      }
    } catch (e) {
      console.error("[ingest-document] deferred pipeline error:", e);
    }

    // Embeddings for all chunks — batched.
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return;
    try {
      const { data: allChunks } = await admin
        .from("document_chunks")
        .select("id, content, chunk_index")
        .eq("document_id", doc.id)
        .order("chunk_index", { ascending: true });
      if (!allChunks || allChunks.length === 0) return;
      const BATCH = 100;
      for (let i = 0; i < allChunks.length; i += BATCH) {
        const batch = (allChunks as any[]).slice(i, i + BATCH);
        const embRes = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map((r) => r.content) }),
        }, 30000, "Embedding generation");
        if (!embRes.ok) continue;
        const embData = await embRes.json();
        for (const emb of embData.data || []) {
          const chunk = batch[emb.index];
          if (chunk) {
            await admin.from("document_chunks")
              .update({ embedding: `[${emb.embedding.join(",")}]` } as any)
              .eq("id", chunk.id);
          }
        }
      }
    } catch (embErr) {
      console.error("[ingest-document] deferred embedding error:", embErr);
    }
  })());
}

// The core orchestrator: read the job, dispatch to a stage runner, and
// re-invoke self if there is more work to do.
async function runNextStage(
  admin: any,
  jobId: string,
  lovableApiKey: string,
) {
  const { data: job } = await admin
    .from("document_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) {
    console.error(`[ingest-document] job ${jobId} not found`);
    return;
  }
  if (job.stage === "complete" || job.stage === "failed") return;

  const { data: doc } = await admin
    .from("documents").select("*").eq("id", job.document_id).maybeSingle();
  if (!doc) {
    await markJobFailed(admin, job, "internal_error", "document row missing");
    return;
  }

  let next: "extracting" | "complete" | "failed" = "failed";
  if (job.stage === "queued" || job.stage === "probing") {
    if (job.stage === "queued") {
      await heartbeat(admin, job.id, { stage: "probing" });
    }
    const r = await runProbe(admin, { ...job, stage: "probing" }, doc, lovableApiKey);
    next = r.next;
  } else if (job.stage === "extracting") {
    const r = await runExtractSlice(admin, job, doc, lovableApiKey);
    next = r.next;
  } else if (job.stage === "chunking") {
    // Explicit chunking stage exists mainly for partial_success bookkeeping —
    // real chunking is progressive per slice. Just finalize.
    await runComplete(admin, job, doc, lovableApiKey);
    return;
  }

  if (next === "extracting") {
    // Chain the next slice/finalize without blocking the current invocation.
    // @ts-ignore EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil((async () => {
      try {
        await admin.functions.invoke("ingest-document", {
          body: { document_job_id: job.id },
        });
      } catch (e) {
        console.error("[ingest-document] self-invoke failed:", (e as Error).message);
      }
    })());
    return;
  }

  if (next === "complete") {
    await runComplete(admin, { ...job }, doc, lovableApiKey);
  }
}

// ============================================================================
// HTTP handler
// ============================================================================

Deno./**
 * Human display title for a document. Hash-style upload names ("file_UUID.pdf")
 * never reach the user: those fall back to the first sentence of the summary.
 */
function humanDocTitle(filename: string | null, summary: string): string | null {
  const name = (filename || "").trim();
  const hashy = /^file_[0-9a-fA-F-]{8,}/.test(name) || !name;
  if (!hashy) {
    const cleaned = name.replace(/\.[A-Za-z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
    if (cleaned) return cleaned.slice(0, 80);
  }
  const first = (summary || "").replace(/[*#`]/g, "").split(/(?<=\.)\s|\n/)[0]?.trim();
  if (first) return first.slice(0, 60);
  return name || null;
}

serve(withObserve("ingest-document", async (req) => {
  console.log(`[ingest-document] handler start method=${req.method}`);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const document_id: string | undefined = body?.document_id;
    const document_job_id: string | undefined = body?.document_job_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ---- Worker mode: self-invoke or watchdog ----
    if (document_job_id && !document_id) {
      // Authorized: service-role bearer OR cron secret.
      const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const cronHeader = req.headers.get("x-cron-secret") || "";
      const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
      const ok = (bearer && bearer === serviceRoleKey) ||
                 (CRON_SECRET && cronHeader === CRON_SECRET);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // @ts-ignore EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(runNextStage(admin, document_job_id, LOVABLE_API_KEY));
      return new Response(JSON.stringify({ success: true, worker: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Client mode: initiate a new job for a fresh document ----
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id or document_job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership guard.
    const { data: ownershipRow } = await admin
      .from("documents").select("user_id, attempt_count").eq("id", document_id).maybeSingle();
    if (!ownershipRow || (ownershipRow as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextAttempt = ((ownershipRow as any).attempt_count ?? 0) + 1;
    await admin.from("documents").update({
      status: "processing",
      error_message: null,
      processing_started_at: new Date().toISOString(),
      attempt_count: nextAttempt,
      pages_read: 0,
    }).eq("id", document_id);

    // Clear any previous chunks so retries don't duplicate.
    await admin.from("document_chunks").delete().eq("document_id", document_id);

    // Cancel any in-flight jobs for this doc.
    await admin.from("document_jobs")
      .update({ stage: "failed", failure_code: "internal_error", error_detail: "superseded by new job" })
      .eq("document_id", document_id)
      .not("stage", "in", "(complete,failed)");

    const { data: job, error: jobErr } = await admin.from("document_jobs").insert({
      document_id,
      user_id: user.id,
      stage: "queued",
      cursor: 0,
      slice_size: DEFAULT_SLICE_SIZE,
    }).select("id").single();
    if (jobErr) throw new Error(`document_jobs insert: ${jobErr.message}`);

    // @ts-ignore EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(runNextStage(admin, job.id, LOVABLE_API_KEY));

    return new Response(
      JSON.stringify({ success: true, document_job_id: job.id, message: "Processing started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ingest-document] handler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}));
