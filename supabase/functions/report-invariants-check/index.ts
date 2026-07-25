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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.rpc("report_invariants");
  if (error) {
    console.error("[report-invariants-check] rpc failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keys = ["answers_without_results", "empty_results_object", "completed_without_results"];
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = Number((data as any)?.[k]?.count ?? 0);
  const violated = keys.filter((k) => counts[k] > 0);

  const summary =
    `report invariants: answers_without_results=${counts.answers_without_results}` +
    ` empty_results=${counts.empty_results_object}` +
    ` completed_without_results=${counts.completed_without_results}`;

  try {
    if (violated.length > 0) {
      for (const k of violated) {
        await admin.from("ef_error_log").insert({
          function_name: "report-invariants-check",
          severity: "high",
          error_message: `REPORT_INVARIANT_VIOLATION ${k} — ${counts[k]} user(s) affected`,
          context: { assertion: k, affected: counts[k], checks: data },
        });
      }
    } else {
      await admin.from("ef_error_log").insert({
        function_name: "report-invariants-check",
        severity: "info",
        error_message: summary,
        context: data,
      });
    }
  } catch (e) {
    console.error("[report-invariants-check] log insert failed:", (e as Error).message);
  }

  console.log(`[report-invariants-check] ${summary}`);
  return new Response(JSON.stringify({ ok: violated.length === 0, checks: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
