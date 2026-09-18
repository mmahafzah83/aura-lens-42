/**
 * oe-worker — claims exactly one opportunity-engine job per invocation and hands
 * it to the function that does the work. One claim, one POST, one completion.
 * Nothing loops here. Stuck claims are reset by reap-stuck-jobs, which is
 * job_type-agnostic (it resets every 'claimed' row older than ten minutes).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const JOB_ROUTES: Array<{ job_type: string; fn: string }> = [
  { job_type: "oe_fetch_feed", fn: "oe-fetch-feed" },
  { job_type: "oe_read_candidate", fn: "oe-fetch-feed" },
  { job_type: "oe_judge_member", fn: "oe-judge-member" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";

  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const allowed = (!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE;
  if (!allowed) return json({ error: "Forbidden" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const worker = "oe-worker-" + crypto.randomUUID();

  // 1) Claim exactly one job, feeds first.
  let job: any = null;
  let route: { job_type: string; fn: string } | null = null;
  for (const r of JOB_ROUTES) {
    const { data, error } = await admin.rpc("claim_job", {
      p_job_type: r.job_type,
      p_worker: worker,
    });
    if (error) return json({ claimed: false, error: `claim_failed: ${error.message}` }, 500);
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      job = row;
      route = r;
      break;
    }
  }
  if (!job || !route) return json({ claimed: false });

  const jobId = job.id as string;
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  // 2) Hand it over, with a hard 110-second abort.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110_000);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${route.fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ job_id: jobId, ...payload, user_id: job.user_id ?? payload.user_id ?? null }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const snippet = await r.text().then((t) => t.slice(0, 300)).catch(() => "");

    // The judge lands in a later step. Until then its jobs fail softly and retry.
    if (r.status === 404 && route.job_type === "oe_judge_member") {
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: "judge_not_deployed" });
      return json({ claimed: true, job_id: jobId, ok: false, error: "judge_not_deployed" });
    }

    if (r.ok) {
      await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });
      return json({ claimed: true, job_id: jobId, job_type: route.job_type, status: r.status, ok: true });
    }
    const err = `http_${r.status}: ${snippet}`;
    await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
    return json({ claimed: true, job_id: jobId, job_type: route.job_type, ok: false, error: err });
  } catch (e: any) {
    clearTimeout(timer);
    const err = e?.name === "AbortError"
      ? "timeout"
      : `${e?.name ?? "Error"}: ${String(e?.message ?? e).slice(0, 300)}`;
    try {
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
    } catch (_) { /* the reaper will pick it up */ }
    return json({ claimed: true, job_id: jobId, ok: false, error: err });
  }
});
