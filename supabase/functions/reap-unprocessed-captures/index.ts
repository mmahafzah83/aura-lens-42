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

  // Ask Postgres for the actually-stuck entries via anti-join on source_registry.
  // Avoids the fetch-oldest-100-then-filter bug that missed recent stuck captures.
  const { data: stuckRows, error: rpcErr } = await admin.rpc("pending_capture_entries", {
    p_limit: 25,
  });
  if (rpcErr) {
    console.error("[reap-unprocessed-captures] rpc error", rpcErr.message);
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const stuck = (stuckRows || []) as Array<{ id: string; user_id: string; extract_attempts: number }>;
  if (stuck.length === 0) {
    return new Response(JSON.stringify({ scanned: 0, reprocessed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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