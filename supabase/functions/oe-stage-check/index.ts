// LEARNING STAGES. Stage 0: the rules decide and nothing moves on its own.
// Stage 1 (15 labels): the engine may PROPOSE a rule, never activate one.
// Stage 2 (50 labels and 10 recorded outcomes): face weights may move.
// A stage belongs to one member. Nothing of another member's ever travels.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const FN = "oe-stage-check";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !service) return json({ error: "Backend credentials missing" }, 500);
  if (!((secret && req.headers.get("x-cron-secret") === secret) || bearer === service)) return json({ error: "Forbidden" }, 403);

  const admin = createClient(url, service);
  const startedAt = new Date().toISOString();
  const counts = { members: 0, promoted: 0, proposals: 0 };
  try {
    // A test serve is not a member's decision. It carries channel='test' or no
    // card at all, and it may never count towards a stage or a label.
    const { data: served, error } = await admin.from("oe_serves")
      .select("user_id,tap,outcome,channel,card_id")
      .not("channel", "eq", "test").not("card_id", "is", null);
    if (error) throw new Error(error.message);
    const byUser = new Map<string, { labels: number; outcomes: number }>();
    for (const row of served ?? []) {
      const entry = byUser.get(row.user_id) ?? { labels: 0, outcomes: 0 };
      if (row.tap) entry.labels++;
      if (row.outcome && row.outcome !== "asked") entry.outcomes++;
      byUser.set(row.user_id, entry);
    }

    for (const [userId, tally] of byUser) {
      counts.members++;
      const { data: labelRows } = await admin.from("oe_labels")
        .select("id").eq("user_id", userId).eq("excluded", false);

      const labels = Math.max(tally.labels, labelRows?.length ?? 0);
      const outcomes = tally.outcomes;
      const stage = labels >= 50 && outcomes >= 10 ? 2 : labels >= 15 ? 1 : 0;

      const { data: current } = await admin.from("oe_learning_stage")
        .select("stage").eq("user_id", userId).maybeSingle();
      const previous = Number(current?.stage ?? 0);
      await admin.from("oe_learning_stage").upsert({
        user_id: userId, stage, labels_count: labels, outcomes_count: outcomes,
        promoted_at: stage > previous ? new Date().toISOString() : undefined,
      }, { onConflict: "user_id" });
      if (stage > previous) counts.promoted++;
    }

    await admin.from("oe_runs").insert({ run_kind: "stage_check", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "stage_check", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    await admin.from("ef_error_log").insert({ function_name: FN, error_message: message, severity: "error" });
    return json({ error: message }, 500);
  }
});
