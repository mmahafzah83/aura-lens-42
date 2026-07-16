import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withObserve } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Candidates: entries older than 10 min, extract_attempts < 3, oldest first.
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: candidates, error: candErr } = await admin
    .from("entries")
    .select("id, user_id, extract_attempts, created_at")
    .lt("created_at", cutoff)
    .lt("extract_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(100);
  if (candErr) {
    console.error("[reap-unprocessed-captures] candidates error", candErr.message);
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scanned = (candidates || []).length;
  if (scanned === 0) {
    return new Response(JSON.stringify({ scanned: 0, reprocessed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter out those already processed by source_registry.
  const ids = (candidates || []).map((e: any) => e.id);
  const { data: regRows } = await admin
    .from("source_registry")
    .select("source_id")
    .eq("source_type", "entry")
    .eq("processed", true)
    .in("source_id", ids);
  const processedSet = new Set((regRows || []).map((r: any) => r.source_id as string));
  const stuck = (candidates || []).filter((e: any) => !processedSet.has(e.id)).slice(0, 25);

  let reprocessed = 0;
  for (const e of stuck) {
    const { error: updErr } = await admin
      .from("entries")
      .update({ extract_attempts: (e.extract_attempts ?? 0) + 1 })
      .eq("id", e.id);
    if (updErr) {
      console.error("[reap-unprocessed-captures] attempt bump failed", e.id, updErr.message);
      continue;
    }
    try {
      const { error: invErr } = await admin.functions.invoke("extract-evidence", {
        body: {
          source_type: "entry",
          source_id: e.id,
          user_id: e.user_id,
        },
      });
      if (invErr) {
        console.error("[reap-unprocessed-captures] invoke failed", e.id, invErr.message);
        continue;
      }
      reprocessed += 1;
    } catch (err: any) {
      console.error("[reap-unprocessed-captures] invoke threw", e.id, err?.message);
    }
  }

  console.log(`[reap-unprocessed-captures] scanned=${stuck.length} reprocessed=${reprocessed}`);
  return new Response(JSON.stringify({ scanned: stuck.length, reprocessed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

Deno.serve(withObserve("reap-unprocessed-captures", handler));