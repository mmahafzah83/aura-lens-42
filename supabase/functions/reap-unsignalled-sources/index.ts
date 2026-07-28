import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withObserve } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Asserts the OUTCOME (a signal run completed) rather than the dependency
// (a source_registry row exists). reap-unprocessed-captures covers the layer
// below this one; both are needed.
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("source_registry")
    .select("id, user_id, processed_at")
    .eq("processed", true)
    .or("signal_status.is.null,signal_status.neq.done")
    .gt("processed_at", cutoff)
    .order("processed_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[reap-unsignalled-sources] query error", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Keep only sources that actually have evidence to work with.
  const candidates: Array<{ id: string; user_id: string }> = [];
  for (const r of (rows || []) as any[]) {
    if (candidates.length >= 25) break;
    const { count } = await admin
      .from("evidence_fragments")
      .select("id", { count: "exact", head: true })
      .eq("source_registry_id", r.id);
    if ((count || 0) > 0) candidates.push({ id: r.id, user_id: r.user_id });
  }

  let reinvoked = 0;
  for (const c of candidates) {
    try {
      const { error: invErr } = await admin.functions.invoke("detect-signals-v2", {
        body: { source_registry_id: c.id, user_id: c.user_id },
      });
      if (invErr) {
        console.error("[reap-unsignalled-sources] invoke failed", c.id, invErr.message);
        continue;
      }
      reinvoked += 1;
    } catch (e: any) {
      console.error("[reap-unsignalled-sources] invoke threw", c.id, e?.message);
    }
  }

  console.log(`[reap-unsignalled-sources] scanned=${candidates.length} reinvoked=${reinvoked}`);
  return new Response(JSON.stringify({ scanned: candidates.length, reinvoked }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

Deno.serve(withObserve("reap-unsignalled-sources", handler));