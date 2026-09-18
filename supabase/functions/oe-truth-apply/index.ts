// TRUTH TRAVELS. A member's factual correction about the world improves the
// engine for everyone; his taste never leaves his own lane. This reads the
// truth signals recorded in Book Two, applies the consequence to the record
// and to Book Three, and writes nothing about who reported it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const FN = "oe-truth-apply";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KIND: Record<string, string> = {
  dead_route: "route_pattern",
  quote_absent: "route_pattern",
  listing_page: "aggregator_fingerprint",
  already_happened: "recurring_event",
  wrong_issuer: "route_pattern",
};

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
  const counts = { signals: 0, records_changed: 0, world_facts: 0, skipped: 0 };
  try {
    const { data: signals, error } = await admin.from("oe_serves")
      .select("id,opportunity_id,truth_code,tapped_at")
      .eq("signal_class", "truth").not("truth_code", "is", null)
      .order("tapped_at", { ascending: true }).limit(200);
    if (error) throw new Error(error.message);

    for (const signal of signals ?? []) {
      counts.signals++;
      const code = String(signal.truth_code);
      if (!signal.opportunity_id || !KIND[code]) { counts.skipped++; continue; }

      const { data: opportunity } = await admin.from("oe_opportunities")
        .select("id,feed_id,route_url,source_url,route_dead,quote_verified,alive")
        .eq("id", signal.opportunity_id).maybeSingle();
      if (!opportunity) { counts.skipped++; continue; }

      const patch = code === "dead_route"
        ? (opportunity.route_dead ? null : { route_dead: true })
        : code === "quote_absent"
          ? (opportunity.quote_verified === false ? null : { quote_verified: false })
          : (opportunity.alive === false ? null : { alive: false });
      if (patch) {
        await admin.from("oe_opportunities").update(patch).eq("id", opportunity.id);
        counts.records_changed++;
      }

      // Book Three carries the fact once, never the person.
      const { data: existing } = await admin.from("oe_world_facts")
        .select("id").eq("kind", KIND[code])
        .contains("payload", { code, opportunity_id: opportunity.id }).limit(1).maybeSingle();
      if (!existing) {
        await admin.from("oe_world_facts").insert({
          kind: KIND[code],
          payload: { code, opportunity_id: opportunity.id, feed_id: opportunity.feed_id },
          evidence_url: opportunity.route_url ?? opportunity.source_url,
          confidence: 0.8,
        });
        counts.world_facts++;
      }
    }

    await admin.from("oe_runs").insert({ run_kind: "truth_apply", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "truth_apply", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    await admin.from("ef_error_log").insert({ function_name: FN, error_message: message, severity: "error" });
    return json({ error: message }, 500);
  }
});
