import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
  const counts = { eligible: 0, asked: 0, existing: 0 };
  try {
    const from = new Date(Date.now() - 15 * 86_400_000).toISOString();
    const to = new Date(Date.now() - 13 * 86_400_000).toISOString();
    const { data: taps, error } = await admin.from("oe_taps").select("user_id,card_id,tapped_at").eq("tap", "right").gte("tapped_at", from).lte("tapped_at", to);
    if (error) throw new Error(error.message);
    counts.eligible = taps?.length ?? 0;
    for (const tap of taps ?? []) {
      const { data: existing } = await admin.from("oe_outcomes").select("id").eq("card_id", tap.card_id).limit(1).maybeSingle();
      if (existing) { counts.existing++; continue; }
      const { error: insertError } = await admin.from("oe_outcomes").insert({ user_id: tap.user_id, card_id: tap.card_id, stage: "asked" });
      if (!insertError) counts.asked++;
    }
    await admin.from("oe_runs").insert({ run_kind: "outcome_ask", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "outcome_ask", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    return json({ error: message }, 500);
  }
});