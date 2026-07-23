import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// One claim per invocation. Do not loop.
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const worker = "worker-" + crypto.randomUUID();

  // 1) Claim exactly ONE job.
  const { data: claimed, error: claimErr } = await admin.rpc("claim_job", {
    p_job_type: "voice_distill",
    p_worker: worker,
  });
  if (claimErr) {
    return new Response(
      JSON.stringify({ claimed: false, error: `claim_failed: ${claimErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) {
    return new Response(JSON.stringify({ claimed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const jobId = (job as any).id as string;
  const userId = (job as any).user_id as string;

  // 2) POST to voice-distill with service-role auth and a hard 110s abort.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110_000);
  let status = 0;
  let bodySnippet = "";
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/voice-distill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ user_id: userId }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    status = r.status;
    try { bodySnippet = (await r.text()).slice(0, 300); } catch { /* ignore */ }

    if (r.ok) {
      // Includes graceful skips like {success:true, skipped:true, reason:'no_posts_with_text'}.
      await admin.rpc("complete_job", { p_id: jobId, p_success: true, p_error: null });
      return new Response(
        JSON.stringify({ claimed: true, job_id: jobId, user_id: userId, status, ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      const err = `http_${status}: ${bodySnippet}`;
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
      return new Response(
        JSON.stringify({ claimed: true, job_id: jobId, user_id: userId, status, ok: false, error: err }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e: any) {
    clearTimeout(timer);
    const isAbort = e?.name === "AbortError";
    const err = isAbort ? "timeout" : `${e?.name ?? "Error"}: ${String(e?.message ?? e).slice(0, 300)}`;
    try {
      await admin.rpc("complete_job", { p_id: jobId, p_success: false, p_error: err });
    } catch (_) { /* swallow: job will be reaped */ }
    return new Response(
      JSON.stringify({ claimed: true, job_id: jobId, user_id: userId, ok: false, error: err }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});