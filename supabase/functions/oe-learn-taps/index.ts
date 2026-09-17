import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };

const FN = "oe-learn-taps";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function citedFaceIds(scores: unknown): string[] {
  if (!scores || typeof scores !== "object") return [];
  const cites = (scores as { cites?: Array<{ kind?: string; id?: string }> }).cites;
  if (!Array.isArray(cites)) return [];
  return [...new Set(cites.filter((c) => c?.kind === "face" && typeof c.id === "string").map((c) => String(c.id)))];
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
  const counts = { applied: 0, corrections: 0, weight_moves: 0 };
  try {
    const { data: policy, error: policyError } = await admin.from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
    if (policyError) throw new Error(policyError.message);
    const params = (policy?.params ?? {}) as Record<string, unknown>;
    const alpha = Math.max(0, Math.min(1, Number(params.ema_alpha ?? 0.15)));
    const fewShotK = Math.max(1, Number(params.few_shot_k ?? 8));

    const { data: taps, error: tapsError } = await admin.from("oe_taps")
      .select("id,user_id,card_id,tap,scope,scope_value,tapped_at")
      .is("applied_at", null).order("tapped_at", { ascending: true }).limit(200);
    if (tapsError) throw new Error(tapsError.message);

    const byUser = new Map<string, any[]>();
    for (const tap of taps ?? []) byUser.set(tap.user_id, [...(byUser.get(tap.user_id) ?? []), tap]);

    for (const [userId, userTaps] of byUser) {
      const { data: faces, error: facesError } = await admin.from("oe_faces")
        .select("id,face,weight,few_shot").eq("user_id", userId);
      if (facesError) throw new Error(facesError.message);
      // 'avoid' is never nudged and never normalised. Its weight is a magnitude
      // the judge subtracts by, not a share of the four positive faces.
      const next = new Map<string, { weight: number; few_shot: unknown[] }>();
      for (const face of faces ?? []) {
        if (face.face === "avoid") continue;
        next.set(face.id, {
          weight: Number(face.weight ?? 0.2),
          few_shot: Array.isArray(face.few_shot) ? face.few_shot : [],
        });
      }

      for (const tap of userTaps) {
        const { data: card } = await admin.from("oe_cards")
          .select("match_id,opportunity_id,oe_matches(scores),oe_opportunities(id,title,issuer_id,seniority_band,location,chair_type)")
          .eq("id", tap.card_id).maybeSingle();
        const opportunity = card?.oe_opportunities as any;
        const match = card?.oe_matches as any;
        const title = String(opportunity?.title ?? "");
        const ids = citedFaceIds(match?.scores);
        const label = tap.tap === "right" ? "right" : tap.tap === "not_my_area" ? "not_my_area" : null;
        for (const id of ids) {
          const face = next.get(id);
          if (!face) continue;
          if (tap.tap === "right") face.weight += alpha * (1 - face.weight);
          else if (tap.tap === "not_quite") face.weight -= alpha * face.weight * 0.5;
          else if (tap.tap === "not_my_area") face.weight -= alpha * face.weight;
          if (label) face.few_shot = [...face.few_shot, { title, tap: label }].slice(-fewShotK);
          counts.weight_moves++;
        }

        if (tap.tap === "not_quite" || tap.tap === "not_my_area" || tap.tap === "less_from_here") {
          const reach = tap.scope || (tap.tap === "not_my_area" ? "type" : tap.tap === "less_from_here" ? "issuer" : "just_this");
          const reachValue = tap.scope_value || ({
            issuer: opportunity.issuer_id,
            level: opportunity.seniority_band,
            place: opportunity.location,
            type: opportunity.chair_type,
            just_this: opportunity.id,
          } as Record<string, unknown>)[reach] || opportunity.id;
          const days = reach === "type" || (reach === "issuer" && tap.tap === "less_from_here") ? 90 : 42;
          await admin.from("oe_corrections").insert({
            user_id: userId, card_id: tap.card_id, seniority_band: opportunity.seniority_band,
            chair_type: opportunity.chair_type, reach, reach_value: String(reachValue ?? ""),
            expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
            what_we_said: { title }, what_he_changed: { tap: tap.tap, scope: reach },
          });
          counts.corrections++;
        }
        await admin.from("oe_taps").update({ applied_at: new Date().toISOString() }).eq("id", tap.id).is("applied_at", null);
        counts.applied++;
      }

      const floor = 0.05;
      const raw = [...next.entries()].map(([id, value]) => ({ id, ...value, weight: Math.max(floor, value.weight) }));
      const total = raw.reduce((sum, face) => sum + face.weight, 0) || 1;
      for (const face of raw) {
        await admin.from("oe_faces").update({ weight: face.weight / total, few_shot: face.few_shot }).eq("id", face.id);
      }
    }

    await admin.from("oe_runs").insert({ run_kind: FN.replace("oe-", "").replaceAll("-", "_"), started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "learn_taps", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    await admin.from("ef_error_log").insert({ function_name: FN, error_message: message, severity: "error" }).then(() => undefined);
    return json({ error: message }, 500);
  }
});