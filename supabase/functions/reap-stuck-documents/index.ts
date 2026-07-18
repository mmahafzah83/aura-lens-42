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

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("documents")
    .update({
      status: "error",
      error_message:
        "Processing exceeded time limit — please re-upload or split the file.",
    })
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[reap-stuck-documents] update failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reaped = data?.length ?? 0;

  // Evidence-job watchdog: a job whose last_heartbeat is > 5 minutes old and
  // whose status is not "complete"/"failed" is stuck. Mark it failed and keep
  // the real error_detail if one exists.
  const jobCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stuckJobs, error: jobErr } = await admin
    .from("evidence_jobs")
    .update({
      status: "failed",
      error_detail:
        // COALESCE-style: keep existing detail, otherwise write a default.
        "watchdog: last_heartbeat older than 5 minutes",
    })
    .in("status", ["queued", "mapping", "reducing"])
    .lt("last_heartbeat", jobCutoff)
    .is("error_detail", null)
    .select("id");
  if (jobErr) console.error("[reap-stuck-documents] evidence_jobs update failed:", jobErr.message);

  const reapedJobs = stuckJobs?.length ?? 0;
  console.log(`[reap-stuck-documents] reaped=${reaped} evidence_jobs=${reapedJobs}`);
  return new Response(JSON.stringify({ reaped, evidence_jobs_reaped: reapedJobs }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});