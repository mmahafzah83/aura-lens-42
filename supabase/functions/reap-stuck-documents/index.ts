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

  // Reap by CURRENT ATTEMPT age (processing_started_at), not upload age.
  // Fall back to created_at only for legacy rows where processing_started_at is null.
  const cutoff = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  const { data: candidates, error: findErr } = await admin
    .from("documents")
    .select("id, attempt_count, processing_started_at, created_at")
    .eq("status", "processing")
    // PostgREST or() supports embedded and() for the legacy-fallback case.
    .or(
      `processing_started_at.lt.${cutoff},and(processing_started_at.is.null,created_at.lt.${cutoff})`,
    );

  if (findErr) {
    console.error("[reap-stuck-documents] select failed:", findErr.message);
    return new Response(JSON.stringify({ error: findErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let reaped = 0;
  for (const row of candidates ?? []) {
    const attempts = (row as any).attempt_count ?? 0;
    const message =
      attempts >= 2
        ? "This document has failed twice. It may be too complex for us to read right now — we're looking into it."
        : "Reading stopped unexpectedly. Tap to retry.";
    const { error: upErr } = await admin
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", (row as any).id)
      .eq("status", "processing");
    if (upErr) {
      console.error(`[reap-stuck-documents] update failed for ${(row as any).id}:`, upErr.message);
      continue;
    }
    reaped += 1;
  }

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

  // ---- document_jobs drain + watchdog -------------------------------------
  // Any live job whose heartbeat is > 90s old is stuck. Two behaviors:
  //  1) attempts >= 3 at the same cursor => fail with an honest failure_code.
  //  2) Otherwise re-invoke ingest-document as a worker to resume from cursor.
  let docJobsResumed = 0;
  let docJobsFailed = 0;
  const docJobCutoff = new Date(Date.now() - 90 * 1000).toISOString();
  const { data: liveJobs } = await admin
    .from("document_jobs")
    .select("id, document_id, attempts, cursor, slice_size, failure_code")
    .not("stage", "in", "(complete,failed)")
    .lt("last_heartbeat", docJobCutoff);

  for (const j of (liveJobs || []) as any[]) {
    if ((j.attempts ?? 0) >= 3) {
      const code = j.failure_code || "too_dense";
      await admin.from("document_jobs").update({
        stage: "failed",
        failure_code: code,
        error_detail: `watchdog: ${j.attempts} attempts at cursor=${j.cursor}, slice_size=${j.slice_size}`,
        last_heartbeat: new Date().toISOString(),
      }).eq("id", j.id);
      // Honest doc-level copy.
      const copy = code === "too_dense"
        ? "This document is too visually dense for us to read reliably right now — we're looking into it."
        : "Reading stopped and could not resume.";
      await admin.from("documents").update({
        status: "error", error_message: copy,
      }).eq("id", j.document_id);
      docJobsFailed += 1;
      continue;
    }
    // Re-invoke ingest-document in worker mode with this job id.
    try {
      await admin.functions.invoke("ingest-document", {
        body: { document_job_id: j.id },
      });
      docJobsResumed += 1;
    } catch (e) {
      console.error(`[reap-stuck-documents] resume failed for job ${j.id}:`, (e as Error).message);
    }
  }

  console.log(`[reap-stuck-documents] reaped=${reaped} evidence_jobs=${reapedJobs} doc_jobs_resumed=${docJobsResumed} doc_jobs_failed=${docJobsFailed}`);
  return new Response(JSON.stringify({
    reaped, evidence_jobs_reaped: reapedJobs,
    document_jobs_resumed: docJobsResumed,
    document_jobs_failed: docJobsFailed,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});