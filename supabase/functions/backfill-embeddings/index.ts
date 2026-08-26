/**
 * backfill-embeddings — fill missing vectors, one batch at a time.
 *
 * Admin-gated (service role, or a signed-in admin — same gate as send-invite).
 * Always text-embedding-3-small: 8,400 existing vectors live in that space and
 * mixing models makes comparisons meaningless.
 *
 * Body: { table, batch_size? }. Chains itself while rows remain, exactly like
 * ingest-document chains its slices. Idempotent and safely re-runnable.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isAdmin } from "../_shared/adminRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const EMBED_MODEL = "text-embedding-3-small";
const MAX_CHARS = 8000;
const DEFAULT_BATCH = 100;
const MAX_BATCH = 100;

type TableName =
  | "document_chunks"
  | "evidence_fragments"
  | "entries"
  | "strategic_signals"
  | "linkedin_posts";

/**
 * Per table: which columns to read, how to build the text, and the "has text"
 * predicate. The predicate runs at the query level so unembeddable rows never
 * enter the queue and never stall the chain.
 */
const SPECS: Record<
  TableName,
  { cols: string[]; build: (r: any) => string; hasText: string }
> = {
  document_chunks: {
    cols: ["id", "content"],
    build: (r) => r.content || "",
    hasText: "content.neq.",
  },
  evidence_fragments: {
    cols: ["id", "title", "content"],
    build: (r) => [r.title, r.content].filter(Boolean).join("\n\n"),
    hasText: "content.neq.,title.neq.",
  },
  entries: {
    cols: ["id", "title", "summary", "content"],
    build: (r) => [r.title, r.summary, r.content].filter(Boolean).join("\n\n"),
    hasText: "content.neq.,summary.neq.,title.neq.",
  },
  strategic_signals: {
    cols: ["id", "signal_title", "explanation", "strategic_implications"],
    build: (r) =>
      [r.signal_title, r.explanation, r.strategic_implications].filter(Boolean).join("\n\n"),
    hasText: "signal_title.neq.,explanation.neq.,strategic_implications.neq.",
  },
  linkedin_posts: {
    cols: ["id", "hook", "post_text"],
    build: (r) => [r.hook, r.post_text].filter(Boolean).join("\n\n"),
    hasText: "post_text.neq.,hook.neq.",
  },
};


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedBatch(key: string, inputs: string[]): Promise<number[][] | null> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!r.ok) {
    console.error("[backfill-embeddings] embed failed", r.status, (await r.text()).slice(0, 300));
    return null;
  }
  const j = await r.json();
  return (j?.data || []).map((d: any) => d.embedding as number[]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

    // ---- admin gate ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);

    if (!isServiceRole) {
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(userClient, userData.user.id))) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    if (!openaiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const body = await req.json().catch(() => ({}));
    const table = String(body?.table || "") as TableName;
    const spec = SPECS[table];
    if (!spec) return json({ error: "Unknown table" }, 400);

    const batchSize = Math.min(
      Math.max(Number(body?.batch_size) || DEFAULT_BATCH, 1),
      MAX_BATCH,
    );

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: rows, error: selErr } = await admin
      .from(table)
      .select(spec.cols.join(","))
      .is("embedding", null)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (selErr) {
      console.error(`[backfill-embeddings] ${table} select failed:`, selErr.message);
      return json({ error: selErr.message }, 500);
    }

    const list = (rows || []) as any[];
    const toEmbed: { id: string; text: string }[] = [];
    for (const r of list) {
      const text = spec.build(r).trim().slice(0, MAX_CHARS);
      if (text) toEmbed.push({ id: r.id, text });
    }

    let processed = 0;
    if (toEmbed.length > 0) {
      const vectors = await embedBatch(openaiKey, toEmbed.map((x) => x.text));
      if (!vectors || vectors.length !== toEmbed.length) {
        return json({ error: "Embedding request failed" }, 502);
      }
      for (let i = 0; i < toEmbed.length; i++) {
        const { error: updErr } = await admin
          .from(table)
          .update({ embedding: `[${vectors[i].join(",")}]` })
          .eq("id", toEmbed[i].id);
        if (updErr) {
          console.error(`[backfill-embeddings] ${table} update failed:`, updErr.message);
        } else {
          processed++;
        }
      }
    }

    const { count: remaining } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .is("embedding", null);

    const left = remaining ?? 0;
    console.log(`[backfill-embeddings] ${table} processed=${processed} remaining=${left}`);

    // Chain the next batch without blocking this response. Only chain when this
    // batch actually moved rows — otherwise a permanently unembeddable row
    // would loop forever.
    if (left > 0 && processed > 0) {
      // @ts-ignore EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.functions.invoke("backfill-embeddings", {
            body: { table, batch_size: batchSize },
          });
        } catch (e) {
          console.error("[backfill-embeddings] self-invoke failed:", (e as Error).message);
        }
      })());
    }

    return json({ table, processed, remaining: left });
  } catch (e) {
    console.error("[backfill-embeddings] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
