import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH = 40;
const MAX_CHARS = 8000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type TableSpec = {
  table: "entries" | "evidence_fragments" | "document_chunks" | "learned_intelligence";
  cols: string[];
  build: (r: any) => string;
};

const SPECS: TableSpec[] = [
  {
    table: "entries",
    cols: ["id", "title", "summary", "content"],
    build: (r) => [r.title, r.summary, r.content].filter(Boolean).join("\n\n"),
  },
  {
    table: "evidence_fragments",
    cols: ["id", "title", "content"],
    build: (r) => [r.title, r.content].filter(Boolean).join("\n\n"),
  },
  {
    table: "document_chunks",
    cols: ["id", "content"],
    build: (r) => r.content || "",
  },
  {
    table: "learned_intelligence",
    cols: ["id", "title", "content"],
    build: (r) => [r.title, r.content].filter(Boolean).join("\n\n"),
  },
];

async function embedBatch(openaiKey: string, inputs: string[]): Promise<number[][] | null> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
  });
  if (!r.ok) {
    console.error("[embed] failed", r.status, (await r.text()).slice(0, 200));
    return null;
  }
  const j = await r.json();
  return (j.data || []).map((d: any) => d.embedding as number[]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    if (!isServiceRole && !isCron) {
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: uErr } = await userClient.auth.getUser(bearer);
      if (uErr || !user) return json({ error: "Unauthorized" }, 401);
    }

    if (!OPENAI) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const per_table: Record<string, { embedded: number; skipped: number; remaining: number }> = {};

    for (const spec of SPECS) {
      let embedded = 0;
      let skipped = 0;

      const { data: rows, error: selErr } = await admin
        .from(spec.table)
        .select(spec.cols.join(","))
        .is("embedding", null)
        .order("created_at", { ascending: true })
        .limit(BATCH);

      if (selErr) {
        console.error(`[backfill] ${spec.table} select failed`, selErr.message);
        per_table[spec.table] = { embedded: 0, skipped: 0, remaining: -1 };
        continue;
      }

      const list = (rows || []) as any[];
      const toEmbed: { id: string; text: string }[] = [];
      for (const r of list) {
        const text = spec.build(r).trim().slice(0, MAX_CHARS);
        if (!text) { skipped++; continue; }
        toEmbed.push({ id: r.id, text });
      }

      if (toEmbed.length > 0) {
        const vectors = await embedBatch(OPENAI, toEmbed.map((x) => x.text));
        if (vectors && vectors.length === toEmbed.length) {
          for (let i = 0; i < toEmbed.length; i++) {
            const lit = `[${vectors[i].join(",")}]`;
            const { error: updErr } = await admin
              .from(spec.table)
              .update({ embedding: lit })
              .eq("id", toEmbed[i].id);
            if (updErr) {
              console.error("[embed] update failed", spec.table, updErr.message);
            } else {
              embedded++;
            }
          }
        }
      }

      const { count: remaining } = await admin
        .from(spec.table)
        .select("id", { count: "exact", head: true })
        .is("embedding", null);

      per_table[spec.table] = { embedded, skipped, remaining: remaining ?? -1 };
      console.log(`[backfill] ${spec.table} embedded=${embedded} skipped=${skipped} remaining=${remaining ?? -1}`);
    }

    return json({ success: true, per_table });
  } catch (e) {
    console.error("backfill-embeddings error", e);
    return json({ error: (e as Error).message }, 500);
  }
});