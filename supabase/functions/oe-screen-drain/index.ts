/**
 * oe-screen-drain — every member with never-screened matches gets screened,
 * batch by batch, until none remain. Runs on a guarded 10-minute schedule so a
 * re-screen never needs a person to push it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withRun } from "../_shared/oeRun.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(withRun("screen_drain", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ok = (!!CRON && req.headers.get("x-cron-secret") === CRON) || bearer === SR;
  if (!ok) return json({ error: "Forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const batch = Math.max(1, Math.min(Number(body.batch ?? 20) || 20, 40));
  const budgetMs = Math.min(Number(body.budget_ms ?? 120_000) || 120_000, 140_000);
  const started = Date.now();

  const admin = createClient(URL_, SR);
  const { data: members, error } = await admin.rpc("oe_unscreened_members");
  if (error) return json({ ok: false, error: error.message }, 500);

  const perMember: Record<string, { batches: number; before: number; failures: number }> = {};
  for (const m of (members ?? []) as any[]) {
    const uid = String(m.user_id);
    perMember[uid] = { batches: 0, before: Number(m.unscreened), failures: 0 };
    let left = Number(m.unscreened);
    while (left > 0 && Date.now() - started < budgetMs) {
      const r = await fetch(`${URL_}/functions/v1/oe-screen-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SR}`, apikey: SR },
        body: JSON.stringify({ user_id: uid, batch }),
      }).catch(() => null);
      await r?.text().catch(() => "");
      perMember[uid].batches++;
      if (!r || !r.ok) { perMember[uid].failures++; if (perMember[uid].failures >= 2) break; continue; }
      left -= batch;
    }
  }
  const { data: after } = await admin.rpc("oe_unscreened_members");
  const remaining = ((after ?? []) as any[]).reduce((s, r) => s + Number(r.unscreened), 0);
  return json({ ok: true, counts: { members: Object.keys(perMember).length, remaining, per_member: perMember } });
}));
