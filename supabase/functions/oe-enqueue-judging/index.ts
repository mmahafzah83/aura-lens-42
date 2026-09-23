/**
 * oe-enqueue-judging — every two hours, put a consenting member with a full set
 * of five faces into the judging queue, but only when there is something new
 * for him: an alive opportunity first seen since his last judged verdict that
 * he has no match row for. Nothing new, no job. One row per member; the
 * existing job_queue_one_live index refuses a second live job for the same
 * member.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-enqueue-judging";

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
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();
  const counts = { consented: 0, faces_complete: 0, enqueued: 0, already_queued: 0 };

  try {
    const { data: consents, error: cErr } = await admin
      .from("oe_consents")
      .select("user_id")
      .eq("kind", "matching")
      .is("revoked_at", null);
    if (cErr) throw new Error(cErr.message);

    const userIds = [...new Set((consents ?? []).map((c: any) => c.user_id))];
    counts.consented = userIds.length;

    // Five faces, or the member is not ready to be judged for.
    const complete: string[] = [];
    if (userIds.length) {
      const { data: faces } = await admin
        .from("oe_faces").select("user_id, face").in("user_id", userIds);
      const byUser = new Map<string, Set<string>>();
      for (const f of faces ?? []) {
        const set = byUser.get(f.user_id) ?? new Set<string>();
        set.add(f.face);
        byUser.set(f.user_id, set);
      }
      for (const uid of userIds) if ((byUser.get(uid)?.size ?? 0) >= 5) complete.push(uid);
    }
    counts.faces_complete = complete.length;

    for (const uid of complete) {
      const { error } = await admin.from("job_queue").insert({
        job_type: "oe_judge_member",
        user_id: uid,
        payload: {},
        priority: 2,
        max_attempts: 2,
      });
      if (!error) counts.enqueued++;
      else if ((error as any).code === "23505") counts.already_queued++;
      else throw new Error(error.message);
    }

    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "enqueue_judging",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: "ok",
      counts,
    }).select("id").maybeSingle();

    return json({ ok: true, counts, run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "enqueue_judging", started_at: startedAt,
      finished_at: new Date().toISOString(), outcome: "error", counts, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { counts } });
    return json({ ok: false, error: msg }, 500);
  }
});
