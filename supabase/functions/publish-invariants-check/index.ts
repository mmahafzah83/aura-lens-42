import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
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

  const { data, error } = await admin.rpc("publish_invariants");
  if (error) {
    console.error("[publish-invariants-check] rpc failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keys = ["unclassified", "stuck_publishing", "published_draft_twins", "stale_needs_review"];
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = Number((data as any)?.[k]?.count ?? 0);
  const anyViolation = keys.some((k) => counts[k] > 0);

  const summary =
    `invariants: unclassified=${counts.unclassified}` +
    ` stuck=${counts.stuck_publishing}` +
    ` twins=${counts.published_draft_twins}` +
    ` stale_review=${counts.stale_needs_review}`;

  try {
    await admin.from("ef_error_log").insert({
      function_name: "publish-invariants-check",
      severity: anyViolation ? "warning" : "info",
      error_message: summary,
      context: data,
    });
  } catch (e) {
    console.error("[publish-invariants-check] log insert failed:", (e as Error).message);
  }

  console.log(`[publish-invariants-check] ${summary}`);
  return new Response(JSON.stringify({ ok: !anyViolation, checks: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});