/**
 * build-document-brief
 *
 * A grounded, whole-document read. Every claim it keeps carries a verbatim
 * quote from a real chunk and the chunk it came from. Verification happens in
 * code, after the model has spoken — a claim whose quote is not literally
 * present in its chunk is discarded, never repaired and never softened.
 *
 * Shape: MAP over chunk slices of 20 (cursor + self-invoke, same pattern as
 * extract-evidence-slice), then REDUCE once at the end: dedupe by embedding
 * cosine > 0.92, verify every item, write one row per (document_id, version).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserContext } from "../_shared/userContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLICE_SIZE = 20;
const PIPELINE_VERSION = 1;
const MODEL = "google/gemini-3-flash-preview";
const EMBED_MODEL = "text-embedding-3-small";
const DEEP_READ_RATIO = 0.6;
const DUP_COSINE = 0.92;

type Item = {
  claim: string;
  quote: string;
  page: number | null;
  chunk_id: string;
  value?: string;
  measures?: string;
  period?: string;
  unit?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseAiJson(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* fall through */ }
  try {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse((m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " "));
  } catch { /* fall through */ }
  try {
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)); }
      }
    }
  } catch { /* fall through */ }
  return null;
}

/** Whitespace and quote/dash characters only. Nothing else is touched. */
function normaliseForMatch(s: string): string {
  return (s || "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u00B4`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function parseEmbedding(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      const s = v.trim();
      if (s.startsWith("[")) return JSON.parse(s);
      return s.split(",").map(Number).filter((n) => !Number.isNaN(n));
    } catch { return null; }
  }
  return null;
}

async function embed(inputs: string[], key: string | undefined): Promise<(number[] | null)[]> {
  if (!key || inputs.length === 0) return inputs.map(() => null);
  const out: (number[] | null)[] = inputs.map(() => null);
  const BATCH = 100;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH).map((t) => (t || " ").slice(0, 8000));
    try {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of j.data || []) out[i + e.index] = e.embedding;
    } catch (e) {
      console.warn("[build-document-brief] embed failed:", (e as Error).message);
    }
  }
  return out;
}

function normItem(raw: any, allowFigure: boolean): Item | null {
  const claim = String(raw?.claim || "").trim();
  const quote = String(raw?.quote || "").trim();
  const chunk_id = String(raw?.chunk_id || "").trim();
  if (!claim || !quote || !chunk_id) return null;
  const pageNum = Number(raw?.page);
  const item: Item = {
    claim: claim.slice(0, 600),
    quote: quote.slice(0, 600),
    page: Number.isFinite(pageNum) && pageNum > 0 ? Math.round(pageNum) : null,
    chunk_id,
  };
  if (allowFigure) {
    item.value = String(raw?.value ?? "").slice(0, 120);
    item.measures = String(raw?.measures ?? "").slice(0, 300);
    item.period = String(raw?.period ?? "").slice(0, 120);
    item.unit = String(raw?.unit ?? "").slice(0, 60);
  }
  return item;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const documentId: string | undefined = body?.document_id;
  if (!documentId) return json({ error: "document_id required" }, 400);

  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const internal = !!bearer && bearer === serviceKey;

  const { data: doc } = await admin
    .from("documents")
    .select("id, user_id, filename, summary, file_url")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return json({ error: "Document not found" }, 404);

  // Identity comes from the verified JWT. A body-supplied user id is never trusted.
  if (!internal) {
    if (!bearer) return json({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
    const callerId = userData?.user?.id;
    if (userErr || !callerId) return json({ error: "Unauthorized" }, 401);
    if (callerId !== doc.user_id) return json({ error: "Forbidden" }, 403);
  }
  const userId: string = doc.user_id;

  // ── Load or open the brief row; it doubles as the job record. ──
  const { data: existing } = await admin
    .from("document_briefs")
    .select("id, coverage")
    .eq("document_id", documentId)
    .eq("pipeline_version", PIPELINE_VERSION)
    .maybeSingle();

  const restart = body?.restart === true;
  let state: any = (!restart && existing?.coverage && (existing.coverage as any).status)
    ? existing.coverage
    : null;

  // ── Chunk plan: rank once, deep-read the top 60%, skim the rest. ──
  const { data: chunkRows } = await admin
    .from("document_chunks")
    .select("id, chunk_index, content, metadata, embedding")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("chunk_index", { ascending: true });
  const chunks = (chunkRows || []) as any[];
  const totalChunks = chunks.length;
  if (totalChunks === 0) return json({ error: "Document has no chunks" }, 400);

  const ctx = await getUserContext(admin, userId);

  if (!state) {
    const themeQuery = [
      ...(ctx.active_themes || []),
      ...(ctx.brand_pillars || []),
      ctx.sector_focus || "",
      ctx.core_practice || "",
      doc.summary || "",
    ].filter(Boolean).join(" ").slice(0, 4000);

    const [qVec] = await embed([themeQuery || doc.filename || "document"], OPENAI_API_KEY);
    const terms = normaliseForMatch(themeQuery).split(" ").filter((t) => t.length > 4);
    const termSet = new Set(terms);

    const scored = chunks.map((c) => {
      const v = parseEmbedding(c.embedding);
      const vecScore = v && qVec ? (cosine(v, qVec) + 1) / 2 : 0.5;
      const words = normaliseForMatch(c.content || "").split(" ");
      let hits = 0;
      for (const w of words) if (termSet.has(w)) hits++;
      const kwScore = Math.min(1, hits / 12);
      return { id: c.id, score: 0.7 * vecScore + 0.3 * kwScore };
    });
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    const deepCount = Math.max(1, Math.ceil(ranked.length * DEEP_READ_RATIO));
    const deepSet = new Set(ranked.slice(0, deepCount).map((r) => r.id));
    // Deep chunks are read in document order so the model sees an argument, not a ranking.
    const deepIds = chunks.filter((c) => deepSet.has(c.id)).map((c) => c.id);
    const skipped = chunks.filter((c) => !deepSet.has(c.id))
      .map((c) => ({ chunk_id: c.id, chunk_index: c.chunk_index }));

    state = {
      status: "mapping",
      cursor: 0,
      deep_ids: deepIds,
      total_chunks: totalChunks,
      chunks_read: 0,
      skipped_chunks: skipped,
      candidates: { key_points: [], key_figures: [], contrarian_angles: [], so_what: [] },
    };
    await admin.from("document_briefs").upsert({
      user_id: userId,
      document_id: documentId,
      pipeline_version: PIPELINE_VERSION,
      model: MODEL,
      coverage: state,
    }, { onConflict: "document_id,pipeline_version" });
  }

  const deepIds: string[] = state.deep_ids || [];
  const byId = new Map(chunks.map((c) => [c.id, c]));

  // ══════════════════════════ MAP ══════════════════════════
  if (state.status === "mapping" && state.cursor < deepIds.length) {
    const sliceIds = deepIds.slice(state.cursor, state.cursor + SLICE_SIZE);
    const sliceChunks = sliceIds.map((id) => byId.get(id)).filter(Boolean);

    const chunkText = sliceChunks.map((c: any) => {
      const p = c.metadata?.page_start ?? c.metadata?.page ?? "?";
      return `--- CHUNK_ID ${c.id} | PAGE ${p} ---\n${(c.content || "").slice(0, 3500)}`;
    }).join("\n\n");

    const systemPrompt = `You are a senior consultant reading a document on behalf of one specific member. You are reading for what matters TO THEM.

${ctx.toPromptBlock()}

Read ONLY the chunks supplied below. You have no other knowledge. Do not use general knowledge, outside facts, background context, or anything that is not written in these chunks. If the chunks do not say it, it does not exist.

Return, from these chunks only:
- key_points: the substantive things this document actually argues or establishes.
- key_figures: the numbers that matter, each with what it measures, over what period, and its unit.
- contrarian_angles: where this document is arguable, contested, one-sided, or assumes something it does not prove.
- so_what: what this means specifically for the member described above.

Every single item MUST be an object with:
  claim     — one plain sentence in your own words
  quote     — a VERBATIM substring, copied character for character from the chunk it came from (max 40 words). Never paraphrase inside the quote. Never join two separate passages. Never add ellipses.
  page      — the PAGE integer from that chunk's header, or null if unknown
  chunk_id  — the exact CHUNK_ID from that chunk's header
key_figures items additionally carry: value, measures, period, unit.

The caller verifies every quote against the real chunk text in code. Any item whose quote is not literally present in the chunk you named is DISCARDED. Nothing is repaired. Copy quotes exactly.

Up to 6 key_points, 6 key_figures, 3 contrarian_angles and 3 so_what per slice. Fewer is correct when the chunks are thin.

Output valid JSON: { "key_points": [], "key_figures": [], "contrarian_angles": [], "so_what": [] }`;

    let parsed: any = null;
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Document: ${doc.filename || "Untitled"}\n\n${chunkText}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        parsed = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");
      } else {
        console.warn(`[build-document-brief] AI ${aiRes.status}: ${(await aiRes.text()).slice(0, 300)}`);
      }
    } catch (e) {
      console.warn("[build-document-brief] AI call failed:", (e as Error).message);
    }

    const cand = state.candidates;
    for (const [key, isFigure] of [
      ["key_points", false], ["key_figures", true],
      ["contrarian_angles", false], ["so_what", false],
    ] as const) {
      const arr = Array.isArray(parsed?.[key]) ? parsed[key] : [];
      for (const raw of arr) {
        const it = normItem(raw, isFigure);
        if (it) cand[key].push(it);
      }
    }

    state.cursor = state.cursor + sliceIds.length;
    state.chunks_read = state.cursor;
    state.candidates = cand;
    if (state.cursor >= deepIds.length) state.status = "reducing";

    await admin.from("document_briefs")
      .update({ coverage: state })
      .eq("document_id", documentId)
      .eq("pipeline_version", PIPELINE_VERSION);

    try {
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.functions.invoke("build-document-brief", { body: { document_id: documentId } });
        } catch (e) {
          console.error("[build-document-brief] chain failed:", (e as Error).message);
        }
      })());
    } catch { /* EdgeRuntime unavailable */ }

    return json({ success: true, phase: "mapped", cursor: state.cursor, deep_total: deepIds.length });
  }

  // ══════════════════════════ REDUCE ══════════════════════════
  const cand = state.candidates || { key_points: [], key_figures: [], contrarian_angles: [], so_what: [] };
  const keys = ["key_points", "key_figures", "contrarian_angles", "so_what"] as const;

  let generated = 0;
  for (const k of keys) generated += (cand[k] || []).length;

  // 1. Verification gate — in code, against the real chunk. No repairs.
  const verifiedByKey: Record<string, Item[]> = {};
  let verified = 0;
  for (const k of keys) {
    const out: Item[] = [];
    for (const it of (cand[k] || []) as Item[]) {
      const chunk = byId.get(it.chunk_id);
      if (!chunk) continue;
      const hay = normaliseForMatch(chunk.content || "");
      const needle = normaliseForMatch(it.quote);
      if (!needle || needle.length < 12) continue;
      if (!hay.includes(needle)) continue;
      out.push(it);
    }
    verifiedByKey[k] = out;
    verified += out.length;
  }

  // 2. Near-duplicate removal on the surviving claims.
  const flat: { k: string; it: Item }[] = [];
  for (const k of keys) for (const it of verifiedByKey[k]) flat.push({ k, it });
  const vecs = await embed(flat.map((f) => f.it.claim), OPENAI_API_KEY);
  const keptFlat: { k: string; it: Item }[] = [];
  const keptVecs: (number[] | null)[] = [];
  for (let i = 0; i < flat.length; i++) {
    const v = vecs[i];
    let dup = false;
    if (v) {
      for (let j = 0; j < keptFlat.length; j++) {
        if (keptFlat[j].k !== flat[i].k) continue;
        const kv = keptVecs[j];
        if (kv && cosine(v, kv) > DUP_COSINE) { dup = true; break; }
      }
    }
    if (!dup) { keptFlat.push(flat[i]); keptVecs.push(v); }
  }
  const finalByKey: Record<string, Item[]> = { key_points: [], key_figures: [], contrarian_angles: [], so_what: [] };
  for (const f of keptFlat) finalByKey[f.k].push(f.it);

  // 3. Thesis and the author's point of view, from the verified material only.
  let thesis = "";
  let authorPov = "";
  try {
    const evidence = keptFlat.slice(0, 40)
      .map((f) => `- (${f.k}) ${f.it.claim} — "${f.it.quote}"`).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are a senior consultant. Using ONLY the verified extracts below, state:
- thesis: the document's actual argument in 2-3 plain sentences. Not a topic. Not a summary of what it covers.
- author_pov: the author's point of view, stated as distinct from established fact, in 2-3 plain sentences.
Use nothing outside the extracts. No general knowledge. Plain English, no jargon.
Output valid JSON: { "thesis": "...", "author_pov": "..." }`,
          },
          { role: "user", content: `Document: ${doc.filename || "Untitled"}\n\nVerified extracts:\n${evidence}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const p = parseAiJson(d.choices?.[0]?.message?.content || "{}");
      thesis = String(p?.thesis || "").slice(0, 4000);
      authorPov = String(p?.author_pov || "").slice(0, 4000);
    }
  } catch (e) {
    console.warn("[build-document-brief] synthesis failed:", (e as Error).message);
  }

  const discarded = generated - verified;
  const grounding = generated > 0 ? verified / generated : 0;

  const coverage: Record<string, unknown> = {
    status: "complete",
    generated,
    verified,
    discarded,
    duplicates_dropped: verified - keptFlat.length,
    chunks_read: state.chunks_read ?? deepIds.length,
    total_chunks: state.total_chunks ?? totalChunks,
    skipped_chunks: state.skipped_chunks || [],
  };
  if (grounding < 0.6) coverage.low_confidence = true;

  const briefText = [thesis, ...finalByKey.key_points.map((i) => i.claim)].filter(Boolean).join("\n");
  const [briefVec] = await embed([briefText || doc.filename || "brief"], OPENAI_API_KEY);

  const { data: written, error: wErr } = await admin.from("document_briefs").upsert({
    user_id: userId,
    document_id: documentId,
    pipeline_version: PIPELINE_VERSION,
    thesis: thesis || null,
    key_points: finalByKey.key_points,
    key_figures: finalByKey.key_figures,
    contrarian_angles: finalByKey.contrarian_angles,
    so_what: finalByKey.so_what,
    author_pov: authorPov || null,
    coverage,
    grounding_score: Number(grounding.toFixed(4)),
    model: MODEL,
    embedding: briefVec ? `[${briefVec.join(",")}]` : null,
  } as any, { onConflict: "document_id,pipeline_version" }).select("id").maybeSingle();
  if (wErr) return json({ error: `brief write: ${wErr.message}` }, 500);

  return json({
    success: true,
    phase: "complete",
    brief_id: written?.id ?? null,
    grounding_score: Number(grounding.toFixed(4)),
    coverage,
  });
});
