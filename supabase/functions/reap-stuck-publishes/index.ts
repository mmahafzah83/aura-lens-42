import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { alertPublishFailure } from "../_shared/publishFailureAlert.ts";

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

  // Find publishes that claimed the row > 3 minutes ago and never confirmed.
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: candidates, error: findErr } = await admin
    .from("linkedin_posts")
    .select("id, user_id, claimed_at, created_at, post_text")
    .eq("tracking_status", "publishing")
    .is("published_confirmed_at", null)
    .or(`claimed_at.lt.${cutoff},and(claimed_at.is.null,created_at.lt.${cutoff})`);

  if (findErr) {
    console.error("[reap-stuck-publishes] select failed:", findErr.message);
    return new Response(JSON.stringify({ error: findErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let reaped = 0;
  for (const row of (candidates ?? []) as any[]) {
    const { error: upErr } = await admin
      .from("linkedin_posts")
      .update({ tracking_status: "needs_review" })
      .eq("id", row.id)
      .eq("tracking_status", "publishing")
      .is("published_confirmed_at", null);
    if (upErr) {
      console.error(`[reap-stuck-publishes] update failed for ${row.id}:`, upErr.message);
      continue;
    }
    try {
      await admin.from("ef_error_log").insert({
        function_name: "reap-stuck-publishes",
        severity: "warning",
        error_message: `reaped stuck publish postId=${row.id}`,
        user_id: row.user_id,
        context: {
          stage: "reaped_stuck_publish",
          postId: row.id,
          claimed_at: row.claimed_at,
          created_at: row.created_at,
        },
      });
    } catch (e) {
      console.error(`[reap-stuck-publishes] log insert failed for ${row.id}:`, (e as Error).message);
    }
    // A failure discovered late is still a failure the founder never heard about.
    // Own try/catch — reaping must complete regardless.
    try {
      await alertPublishFailure(admin, {
        userId: row.user_id,
        postId: row.id,
        errorText: "Publish never reached LinkedIn — retired as stuck by the cleanup job",
        postText: row.post_text,
        origin: "reap-stuck-publishes",
        occurredAt: row.claimed_at || row.created_at || new Date().toISOString(),
      });
    } catch (e) {
      console.error(`[reap-stuck-publishes] alert failed for ${row.id}:`, (e as Error).message);
    }
    reaped += 1;
  }

  console.log(`[reap-stuck-publishes] reaped=${reaped}`);
  return new Response(JSON.stringify({ reaped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});