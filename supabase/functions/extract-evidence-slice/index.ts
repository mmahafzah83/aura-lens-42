import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withObserve, logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SLICE_SIZE = 20;

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

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasSubstantiveClaim(text: string): boolean {
  if (!text) return false;
  if (/\d/.test(text)) return true;                       // any number
  if (/[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)+/.test(text)) return true; // proper noun / entity
  return wordCount(text) >= 14;                           // otherwise reasonable length
}

function restatesTitle(fragTitle: string, sourceTitle: string): boolean {
  const a = (fragTitle || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const b = (sourceTitle || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (!a || !b) return false;
  return a === b || (b.length > 8 && a.startsWith(b));
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

Deno.serve(withObserve("extract-evidence-slice", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  // Service-role / cron only (this is chained by extract-evidence and its own tail).
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const apiKey = req.headers.get("apikey") || "";
  const authorized =
    (bearer && bearer === serviceKey) ||
    (apiKey && apiKey === serviceKey) ||
    (CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const jobId: string | undefined = body?.evidence_job_id;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "evidence_job_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error: jobErr } = await admin
    .from("evidence_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message || jobId}`);
  if (job.status === "complete" || job.status === "failed") {
    return new Response(JSON.stringify({ skipped: true, status: job.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: registry } = await admin
    .from("source_registry").select("*").eq("id", job.source_registry_id).maybeSingle();
  if (!registry) throw new Error("Registry entry not found");

  // Resolve total chunks lazily.
  let total: number = job.total ?? 0;
  if (!total) {
    const { count } = await admin
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", registry.source_id);
    total = count || 0;
    await admin.from("evidence_jobs").update({ total }).eq("id", jobId);
  }

  const { data: doc } = await admin
    .from("documents").select("filename, summary, file_type").eq("id", registry.source_id).maybeSingle();
  const sourceTitle = doc?.filename || registry.title || "Unknown Document";

  const cursor = job.cursor || 0;

  // Reducer path
  if (cursor >= total) {
    await admin.from("evidence_jobs")
      .update({ status: "reducing", last_heartbeat: new Date().toISOString() })
      .eq("id", jobId);
    try {
      await reduce(admin, job, registry, total);
      return new Response(JSON.stringify({ success: true, phase: "reduced" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      await admin.from("evidence_jobs").update({
        status: "failed",
        error_detail: `reduce: ${(e as Error).message}`.slice(0, 500),
        last_heartbeat: new Date().toISOString(),
      }).eq("id", jobId);
      throw e;
    }
  }

  // Mapping phase — process EXACTLY one slice.
  await admin.from("evidence_jobs")
    .update({ status: "mapping", last_heartbeat: new Date().toISOString() })
    .eq("id", jobId);

  const { data: chunks } = await admin
    .from("document_chunks")
    .select("content, chunk_index, metadata")
    .eq("document_id", registry.source_id)
    .order("chunk_index", { ascending: true })
    .range(cursor, cursor + SLICE_SIZE - 1);

  const chunkRows = chunks || [];
  const nextCursor = cursor + SLICE_SIZE;

  if (chunkRows.length > 0) {
    // Build the model input with chunk boundaries so the model can quote correctly.
    const chunkText = chunkRows.map((c: any) => {
      const p = c.metadata?.page_start ?? c.metadata?.page ?? "?";
      return `--- CHUNK ${c.chunk_index} | PAGE ${p} ---\n${(c.content || "").slice(0, 3500)}`;
    }).join("\n\n");

    const { data: profile } = await admin
      .from("diagnostic_profiles").select("generated_skills").eq("user_id", registry.user_id).maybeSingle();
    const skillContext = profile
      ? `\nUser's skills: ${JSON.stringify((profile as any).generated_skills?.slice(0, 5)?.map((s: any) => s.name))}`
      : "";

    const systemPrompt = `You are an Evidence Extraction Engine.
Extract structured evidence fragments ONLY from the chunks provided below.
Each fragment must be one of: "claim"|"signal"|"framework_step"|"market_fact"|"skill_evidence"|"insight"|"pattern"|"recommendation".
For each fragment return:
- title: 5-10 words, a specific claim not a topic
- content: 2-4 sentences of detail grounded in the chunk
- fragment_type
- confidence: 0.0-1.0
- skill_pillars: subset of ["Strategic Client Advisory","Revenue Growth Leadership","Executive Presence","Team Development","Industry Thought Leadership","Complex Program Delivery","Stakeholder Management","Market Positioning","Digital Fluency","Resilience Under Pressure"]
- tags: 2-5 keywords
- entities: array of {name, type} where type is "company"|"person"|"metric"|"technology"|"regulation"
- page: the PAGE integer this fragment came from (as marked in the chunk header)
- source_quote: a VERBATIM span (max 25 words) from that chunk that supports the fragment. Never paraphrase. Never invent.

Drop anything that is generic, restates the document title, or lacks a supporting quote. Prefer specific numbers, named entities, dated events. Extract up to 6 fragments per slice — fewer is fine.${skillContext}

Output valid JSON: { "fragments": [...] }`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Document: ${sourceTitle}\n\n${chunkText}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    let fragments: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const parsed = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");
      fragments = Array.isArray(parsed?.fragments) ? parsed.fragments : [];
    } else {
      await logEfError(admin, {
        function_name: "extract-evidence-slice",
        error: new Error(`AI ${aiRes.status}`),
        severity: "info",
        user_id: registry.user_id,
        context: { job_id: jobId, cursor, sample: (await aiRes.text()).slice(0, 300) },
      });
    }

    // Quality gate
    const kept = fragments.filter((f) => {
      const q = String(f?.source_quote || "").trim();
      if (!q) return false;
      if (wordCount(q) > 25) f.source_quote = q.split(/\s+/).slice(0, 25).join(" ");
      if (restatesTitle(f?.title, sourceTitle)) return false;
      const body = `${f?.title || ""} ${f?.content || ""}`;
      if (!hasSubstantiveClaim(body)) return false;
      return true;
    });

    // Insert
    let insertedRows: any[] = [];
    if (kept.length) {
      const rows = kept.map((f) => ({
        user_id: registry.user_id,
        source_registry_id: registry.id,
        fragment_type: f.fragment_type || "insight",
        title: String(f.title || "").slice(0, 300),
        content: String(f.content || ""),
        confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.7)),
        skill_pillars: Array.isArray(f.skill_pillars) ? f.skill_pillars : [],
        tags: Array.isArray(f.tags) ? f.tags : [],
        entities: Array.isArray(f.entities) ? f.entities : [],
        metadata: {
          source_title: sourceTitle,
          page: Number(f.page) || null,
          source_quote: String(f.source_quote || "").slice(0, 400),
          slice_cursor: cursor,
        },
      }));
      const { data: ins, error: insErr } = await admin
        .from("evidence_fragments").insert(rows).select("id, title, content");
      if (insErr) throw new Error(`Fragment insert: ${insErr.message}`);
      insertedRows = ins || [];

      // Embed (best-effort, non-blocking on failure)
      if (OPENAI_API_KEY && insertedRows.length) {
        try {
          const inputs = insertedRows.map((r: any) => `${r.title || ""}\n\n${r.content || ""}`.slice(0, 8000));
          const embRes = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
          });
          if (embRes.ok) {
            const embData = await embRes.json();
            for (const emb of embData.data || []) {
              const row = insertedRows[emb.index];
              if (row?.id) {
                await admin.from("evidence_fragments")
                  .update({ embedding: `[${emb.embedding.join(",")}]` } as any)
                  .eq("id", row.id);
              }
            }
          }
        } catch (e) {
          console.error("[extract-evidence-slice] embed failed:", (e as Error).message);
        }
      }
    }

    await admin.from("evidence_jobs").update({
      cursor: nextCursor,
      fragments_written: (job.fragments_written || 0) + insertedRows.length,
      last_heartbeat: new Date().toISOString(),
    }).eq("id", jobId);
  } else {
    // Empty range — advance the cursor anyway to avoid a stuck job.
    await admin.from("evidence_jobs").update({
      cursor: nextCursor,
      last_heartbeat: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // Chain: process next slice OR trigger reduce.
  try {
    // @ts-ignore EdgeRuntime is available in Supabase Edge
    EdgeRuntime.waitUntil((async () => {
      try {
        await admin.functions.invoke("extract-evidence-slice", {
          body: { evidence_job_id: jobId },
        });
      } catch (e) {
        console.error("[extract-evidence-slice] chain failed:", (e as Error).message);
      }
    })());
  } catch { /* EdgeRuntime unavailable */ }

  return new Response(JSON.stringify({
    success: true,
    phase: "mapped",
    cursor: nextCursor,
    total,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // ── reducer ──
  async function reduce(admin: any, job: any, registry: any, total: number) {
    // Fetch all fragments for this source
    const { data: frags } = await admin
      .from("evidence_fragments")
      .select("id, title, confidence, tags, entities, embedding")
      .eq("source_registry_id", registry.id);
    const all: any[] = frags || [];

    // Sort by confidence desc; dedupe by cosine > 0.92 on embeddings.
    all.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const kept: any[] = [];
    const dropped: string[] = [];
    const keptVecs: (number[] | null)[] = [];
    for (const f of all) {
      const v = parseEmbedding(f.embedding);
      let duplicateOf: any = null;
      if (v) {
        for (let i = 0; i < kept.length; i++) {
          const kv = keptVecs[i];
          if (kv && cosine(v, kv) > 0.92) { duplicateOf = kept[i]; break; }
        }
      }
      if (duplicateOf) {
        // Merge tags/entities into the winner
        const mergedTags = Array.from(new Set([...(duplicateOf.tags || []), ...(f.tags || [])]));
        const mergedEnts = [...(duplicateOf.entities || []), ...(f.entities || [])];
        duplicateOf.tags = mergedTags;
        duplicateOf.entities = mergedEnts;
        await admin.from("evidence_fragments")
          .update({ tags: mergedTags, entities: mergedEnts })
          .eq("id", duplicateOf.id);
        dropped.push(f.id);
      } else {
        kept.push(f);
        keptVecs.push(v);
      }
    }

    // Cap by 15% of total_chunks, clamped [5, 80]
    const cap = Math.max(5, Math.min(80, Math.round((total || 0) * 0.15)));
    const finalKept = kept.slice(0, cap);
    const surplusIds = kept.slice(cap).map((f) => f.id);
    const toDelete = [...dropped, ...surplusIds];

    if (toDelete.length) {
      await admin.from("evidence_fragments").delete().in("id", toDelete);
      // Prune stale ids from signals' supporting_evidence_ids
      const removed = new Set(toDelete);
      const { data: sigs } = await admin
        .from("strategic_signals")
        .select("id, supporting_evidence_ids")
        .eq("user_id", registry.user_id)
        .overlaps("supporting_evidence_ids", toDelete);
      for (const s of (sigs || []) as any[]) {
        const cur: string[] = s.supporting_evidence_ids || [];
        const pruned = cur.filter((x) => !removed.has(x));
        if (pruned.length !== cur.length) {
          await admin.from("strategic_signals").update({
            supporting_evidence_ids: pruned,
            fragment_count: pruned.length,
            updated_at: new Date().toISOString(),
          }).eq("id", s.id);
        }
      }
    }

    await admin.from("source_registry").update({
      processed: true,
      processed_at: new Date().toISOString(),
      fragment_count: finalKept.length,
    }).eq("id", registry.id);

    await admin.from("evidence_jobs").update({
      status: "complete",
      fragments_written: finalKept.length,
      last_heartbeat: new Date().toISOString(),
    }).eq("id", job.id);

    // Trigger signal detection ONCE for the whole source (non-blocking)
    try {
      // @ts-ignore EdgeRuntime
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.functions.invoke("detect-signals-v2", {
            body: {
              source_registry_id: registry.id,
              user_id: registry.user_id,
            },
          });
        } catch (e) {
          console.error("[extract-evidence-slice] detect-signals-v2 chain failed:", (e as Error).message);
        }
      })());
    } catch { /* noop */ }
  }
}));