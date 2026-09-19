// BOOK THREE — the source ledger. What each source gave us, how fast, and how
// often it lied. No member appears here: the table has no user column.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const FN = "oe-source-facts";
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
  const counts = { feeds: 0, rows: 0, routes_dead: 0, quote_failures: 0 };
  try {
    const windowDays = 28;
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const { data: feeds, error } = await admin.from("oe_feeds").select("id,cadence");
    if (error) throw new Error(error.message);

    for (const feed of feeds ?? []) {
      const { data: rows } = await admin.from("oe_opportunities")
        .select("id,alive,route_url,route_dead,evidence_quote,quote_verified,signal_date,created_at")
        .eq("feed_id", feed.id).gte("created_at", since);
      const items = rows ?? [];
      const pulled = items.length;
      /* Source facts are global — Book Three holds no member. A lane is a
         per-member verdict and now lives on oe_matches, so survival here is
         measured as the record still being alive. */
      const kept = items.filter((r: any) => r.alive).length;
      const withRoute = items.filter((r: any) => r.route_url);
      const withQuote = items.filter((r: any) => r.evidence_quote);
      const dead = withRoute.filter((r: any) => r.route_dead).length;
      const quoteFail = withQuote.filter((r: any) => r.quote_verified === false).length;
      const lags = items
        .filter((r: any) => r.signal_date)
        .map((r: any) => (new Date(r.created_at).getTime() - new Date(r.signal_date).getTime()) / 3_600_000)
        .filter((n: number) => Number.isFinite(n) && n >= 0);
      const lastOk = items.length
        ? items.map((r: any) => r.created_at).sort().slice(-1)[0]
        : null;

      counts.routes_dead += dead;
      counts.quote_failures += quoteFail;

      const { error: insertError } = await admin.from("oe_source_facts").insert({
        feed_id: feed.id,
        window_days: windowDays,
        items_pulled: pulled,
        items_kept: kept,
        yield: pulled ? kept / pulled : 0,
        median_discovery_lag_hours: median(lags),
        route_death_rate: withRoute.length ? dead / withRoute.length : 0,
        quote_fail_rate: withQuote.length ? quoteFail / withQuote.length : 0,
        last_ok_at: lastOk,
        cadence: feed.cadence,
      });
      if (!insertError) counts.rows++;
      counts.feeds++;
    }

    await admin.from("oe_runs").insert({ run_kind: "source_facts", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "ok", counts });
    return json({ ok: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("oe_runs").insert({ run_kind: "source_facts", started_at: startedAt, finished_at: new Date().toISOString(), outcome: "error", counts, error: message });
    await admin.from("ef_error_log").insert({ function_name: FN, error_message: message, severity: "error" });
    return json({ error: message }, 500);
  }
});
