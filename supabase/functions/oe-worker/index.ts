/**
 * oe-worker — claims a handful of opportunity-engine jobs per invocation and
 * hands each to the function that does the work. Jobs run concurrently, but
 * never more than one in flight per host, so no site is hammered. Retry,
 * dead-lettering and the reaper are unchanged: every job still ends in one
 * complete_job call, and a stuck claim is still reset by reap-stuck-jobs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withRun } from "../_shared/oeRun.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const JOB_ROUTES: Array<{ job_type: string; fn: string }> = [
  { job_type: "oe_fetch_feed", fn: "oe-fetch-feed" },
  { job_type: "oe_read_candidate", fn: "oe-fetch-feed" },
  { job_type: "oe_judge_member", fn: "oe-judge-member" },
  // Screening runs after judging: it narrows match rows the judge has created.
  { job_type: "oe_screen_member", fn: "oe-screen-member" },
  { job_type: "oe_resolve_entity", fn: "oe-resolve-entity" },
  { job_type: "oe_harvest_ats", fn: "oe-harvest-ats" },
];
const ROUTE_BY_TYPE = new Map(JOB_ROUTES.map((r) => [r.job_type, r.fn]));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hostOf(url: unknown): string {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); } catch { return ""; }
}

Deno.serve(withRun("worker", async (req) => {
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
  const workerStartedAt = new Date().toISOString();

  // 0) Money first. A closed tap claims nothing.
  const { data: spend } = await admin.rpc("oe_spend_allowed", { p_stage: "worker", p_estimate: 0.01 });
  if (spend && (spend as any).allowed === false) {
    return json({ claimed: 0, reason: "spend_cap", spend });
  }

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const concurrency = Math.max(
    1,
    Math.min(Number((policy?.params as any)?.worker_concurrency ?? 8) || 8, 16),
  );

  // 1) Claim up to `concurrency` jobs in one atomic statement.
  const { data: claimedRows, error: claimErr } = await admin.rpc("claim_jobs", {
    p_job_types: JOB_ROUTES.map((r) => r.job_type),
    p_worker: worker,
    p_limit: concurrency,
  });
  if (claimErr) return json({ claimed: 0, error: `claim_failed: ${claimErr.message}` }, 500);
  const jobs = (Array.isArray(claimedRows) ? claimedRows : []) as any[];
  if (!jobs.length) return json({ claimed: 0 });

  /** One job, start to finish. */
  async function runJob(job: any) {
    const jobId = job.id as string;
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const fn = ROUTE_BY_TYPE.get(job.job_type as string);
    if (!fn) {
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: "unknown_job_type" });
      return { job_id: jobId, ok: false, error: "unknown_job_type" };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110_000);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
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
      if (r.status === 404 && job.job_type === "oe_judge_member") {
        await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: "judge_not_deployed" });
        return { job_id: jobId, ok: false, error: "judge_not_deployed" };
      }

      if (r.ok) {
        await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });
        return { job_id: jobId, job_type: job.job_type, status: r.status, ok: true };
      }
      // 429 means the work was refused, not attempted: the job is put back so
      // it runs again once the ceiling lifts.
      if (r.status === 429) {
        await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: "deferred_cap" });
        return { job_id: jobId, job_type: job.job_type, ok: false, error: "deferred_cap" };
      }
      const err = `http_${r.status}: ${snippet}`;
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
      return { job_id: jobId, job_type: job.job_type, ok: false, error: err };

    } catch (e: any) {
      clearTimeout(timer);
      const err = e?.name === "AbortError"
        ? "timeout"
        : `${e?.name ?? "Error"}: ${String(e?.message ?? e).slice(0, 300)}`;
      try {
        await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
      } catch (_) { /* the reaper will pick it up */ }
      return { job_id: jobId, ok: false, error: err };
    }
  }

  // 2) One queue per host: hosts run in parallel, a host's jobs run one by one.
  const byHost = new Map<string, any[]>();
  for (const job of jobs) {
    const p = (job.payload ?? {}) as Record<string, unknown>;
    const host = hostOf(p.url) || `job:${job.id}`;
    const list = byHost.get(host) ?? [];
    list.push(job);
    byHost.set(host, list);
  }

  const results = (await Promise.all(
    [...byHost.values()].map(async (list) => {
      const out: any[] = [];
      for (const job of list) out.push(await runJob(job));
      return out;
    }),
  )).flat();

  // 3) New opportunities landed? Enqueue judging now (fresh lane), at most once
  // per member per 30 minutes. The 2-hour cron stays as the safety net.
  let judgingEnqueued = 0;
  const readTypes = new Set(["oe_fetch_feed", "oe_read_candidate", "oe_harvest_ats"]);
  if (results.some((r: any) => r.ok && readTypes.has(r.job_type))) {
    try {
      const { count: landed } = await admin.from("oe_opportunities")
        .select("id", { count: "exact", head: true }).gte("first_seen_at", workerStartedAt);
      if ((landed ?? 0) > 0) {
        const { data: consents } = await admin.from("oe_consents")
          .select("user_id").eq("kind", "matching").is("revoked_at", null);
        const uids = [...new Set((consents ?? []).map((c: any) => String(c.user_id)))];
        const since30 = new Date(Date.now() - 30 * 60_000).toISOString();
        for (const uid of uids) {
          const { count: recent } = await admin.from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("job_type", "oe_judge_member").eq("user_id", uid).gte("created_at", since30);
          if ((recent ?? 0) > 0) continue;
          const { error } = await admin.from("job_queue").insert({
            job_type: "oe_judge_member", user_id: uid,
            payload: { lane: "fresh", reason: "new_opportunities" }, priority: 9, max_attempts: 2,
          });
          if (!error) judgingEnqueued++;
        }
      }
    } catch (_) { /* the 2-hour cron still enqueues */ }
  }

  return json({
    judging_enqueued: judgingEnqueued,
    claimed: jobs.length,
    concurrency,
    hosts: byHost.size,
    ok: results.filter((r) => r.ok).length,
    results,
  });
}));
