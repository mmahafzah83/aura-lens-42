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

  const runStartedAt = new Date();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // 1) Find rows that will transition to 'dead' due to this reap? No: reap only reclaims 'claimed'.
  // Instead we look for rows that became 'dead' since the previous reap heartbeat.
  const { data: lastHeartbeat } = await admin
    .from("ef_error_log")
    .select("created_at")
    .eq("function_name", "reap-stuck-jobs")
    .like("error_message", "JOB_QUEUE_HEALTH%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceIso = (lastHeartbeat?.created_at as string | undefined) ??
    new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Reclaim stuck 'claimed' rows
  const { data: reclaimed, error: reclaimErr } = await admin
    .from("job_queue")
    .update({
      status: "pending",
      last_error: "claim_expired",
      claimed_at: null,
      claimed_by: null,
    })
    .eq("status", "claimed")
    .lt("claimed_at", cutoff)
    .select("id");

  if (reclaimErr) {
    console.error("[reap-stuck-jobs] reclaim failed:", reclaimErr.message);
  }
  const reclaimedCount = reclaimed?.length ?? 0;

  // Log any rows that became 'dead' since last heartbeat
  const { data: deadRows } = await admin
    .from("job_queue")
    .select("id, job_type, user_id, attempts, last_error, updated_at")
    .eq("status", "dead")
    .gt("updated_at", sinceIso);

  for (const r of deadRows ?? []) {
    await admin.from("ef_error_log").insert({
      function_name: "reap-stuck-jobs",
      severity: "high",
      user_id: (r as any).user_id,
      error_message:
        `JOB_DEAD type=${(r as any).job_type} user=${(r as any).user_id} attempts=${(r as any).attempts}`,
      context: { job_id: (r as any).id, last_error: (r as any).last_error },
    });
  }

  // Counts for heartbeat
  const [{ count: pending }, { count: claimed }, { count: dead }] = await Promise.all([
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "dead"),
  ]);

  const { data: oldest } = await admin
    .from("job_queue")
    .select("scheduled_for")
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();
  const oldestAgeMin = oldest?.scheduled_for
    ? Math.max(
        0,
        Math.floor(
          (runStartedAt.getTime() - new Date(oldest.scheduled_for as string).getTime()) / 60000,
        ),
      )
    : 0;

  // ALWAYS write heartbeat
  await admin.from("ef_error_log").insert({
    function_name: "reap-stuck-jobs",
    severity: "info",
    error_message:
      `JOB_QUEUE_HEALTH pending=${pending ?? 0} claimed=${claimed ?? 0} dead=${dead ?? 0} reclaimed=${reclaimedCount} oldest_pending_age_min=${oldestAgeMin}`,
    context: {
      pending: pending ?? 0,
      claimed: claimed ?? 0,
      dead: dead ?? 0,
      reclaimed: reclaimedCount,
      oldest_pending_age_min: oldestAgeMin,
      dead_logged: deadRows?.length ?? 0,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      reclaimed: reclaimedCount,
      dead_logged: deadRows?.length ?? 0,
      pending: pending ?? 0,
      claimed: claimed ?? 0,
      dead: dead ?? 0,
      oldest_pending_age_min: oldestAgeMin,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});