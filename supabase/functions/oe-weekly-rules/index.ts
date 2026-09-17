import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };

const FN = "oe-weekly-rules";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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
  const counts = { feeds_scored: 0, paused: 0, promoted: 0 };
  try {
    const since28 = new Date(Date.now() - 28 * 86_400_000).toISOString();
    const since42 = new Date(Date.now() - 42 * 86_400_000).toISOString();
    const { data: feeds, error } = await admin.from("oe_feeds").select("id,cadence,created_at").eq("active", true);
    if (error) throw new Error(error.message);
    for (const feed of feeds ?? []) {
      const { data: opportunities } = await admin.from("oe_opportunities").select("id,created_at").eq("feed_id", feed.id).gte("created_at", since42);
      const ids = (opportunities ?? []).map((o) => o.id);
      const recentIds = (opportunities ?? []).filter((o) => o.created_at >= since28).map((o) => o.id);
      let carded = 0, right = 0, notMyArea = 0, tapped = 0;
      if (recentIds.length) {
        const { data: cards } = await admin.from("oe_cards").select("id").in("opportunity_id", recentIds);
        carded = cards?.length ?? 0;
        const cardIds = (cards ?? []).map((c) => c.id);
        if (cardIds.length) {
          const { data: taps } = await admin.from("oe_taps").select("tap").in("card_id", cardIds).gte("tapped_at", since28);
          tapped = taps?.length ?? 0;
          right = (taps ?? []).filter((t) => t.tap === "right").length;
          notMyArea = (taps ?? []).filter((t) => t.tap === "not_my_area").length;
        }
      }
      const { data: pairs } = ids.length
        ? await admin.from("oe_leadtime_pairs").select("lead_days").in("opportunity_id", ids).not("lead_days", "is", null)
        : { data: [] as Array<{ lead_days: number }> };
      const inserted28 = recentIds.length;
      const inserted42 = (opportunities ?? []).length;
      const scoreSpeed = median((pairs ?? []).map((p) => Number(p.lead_days)).filter(Number.isFinite));
      const scoreYield = inserted28 ? carded / inserted28 : 0;
      const scoreTaps = (right - notMyArea) / Math.max(1, tapped);
      let cadence = feed.cadence;
      if (right > 0) { cadence = "daily"; if (feed.cadence !== cadence) counts.promoted++; }
      else if (inserted28 > 0 && scoreYield === 0 && scoreTaps <= 0) cadence = "weekly";
      else if (inserted42 > 0 && carded === 0 && scoreTaps <= 0 && feed.cadence === "weekly") { cadence = "paused"; counts.paused++; }
      await admin.from("oe_feeds").update({ score_speed: scoreSpeed, score_yield: scoreYield, score_quality: scoreTaps, cadence }).eq("id", feed.id);
      counts.feeds_scored++;
    }
    await admin.from("oe_runs").insert({ run_kind: "weekly_rules", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "weekly_rules", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    return json({ error: message }, 500);
  }
});