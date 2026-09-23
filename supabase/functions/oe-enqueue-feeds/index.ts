/**
 * oe-enqueue-feeds — once a night, decides which feeds are due and puts one job
 * on job_queue for each. It reads nothing from the web itself. Member-forwarded
 * messages get one job per member who has forwarded something in the last week
 * that the engine has not read yet.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-enqueue-feeds";
const FETCHABLE_KINDS = new Set(["listing", "rss", "sitemap", "calendar", "telegram", "api"]);
const CADENCE_HOURS: Record<string, number> = { daily: 20, weekly: 24 * 6, monthly: 24 * 27 };
const LANE_PRIORITY: Record<string, number> = { official: 3, licensed: 3, open: 2, member: 1 };

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
  let enqueued = 0;
  let skippedTerms = 0;
  let skippedCadence = 0;

  /** Insert one job; a duplicate live job for the same feed is not an error. */
  async function enqueue(row: Record<string, unknown>) {
    const { error } = await admin.from("job_queue").insert(row);
    if (!error) {
      enqueued++;
      return;
    }
    // 23505 = the partial unique index already holds a live job for this feed.
    if ((error as any).code === "23505") return;
    throw new Error(`enqueue failed: ${error.message}`);
  }

  try {
    const { data: feeds, error: feedErr } = await admin
      .from("oe_feeds")
      .select("id, name, lane, kind, url, cadence, terms_ok, active, last_fetched_at, country");
    if (feedErr) throw new Error(feedErr.message);

    for (const f of feeds ?? []) {
      if (!f.active) continue;
      if (f.kind === "member_forward") {
        if (!f.terms_ok) { skippedTerms++; continue; }
        continue; // handled below, one job per member
      }
      if (!FETCHABLE_KINDS.has(f.kind)) continue;
      if (!f.terms_ok) { skippedTerms++; continue; }
      if (f.cadence === "paused" || f.cadence === "out") { skippedCadence++; continue; }

      const hours = CADENCE_HOURS[f.cadence as string] ?? CADENCE_HOURS.daily;
      const last = f.last_fetched_at ? new Date(f.last_fetched_at).getTime() : 0;
      if (last && Date.now() - last < hours * 3600_000) { skippedCadence++; continue; }

      await enqueue({
        job_type: "oe_fetch_feed",
        user_id: null,
        payload: { feed_id: f.id, kind: f.kind, url: f.url, lane: f.lane },
        priority: LANE_PRIORITY[f.lane as string] ?? 1,
        max_attempts: 3,
      });
    }

    // ── Member-forwarded messages ───────────────────────────────────────────
    const memberFeed = (feeds ?? []).find((f) => f.kind === "member_forward" && f.active && f.terms_ok);
    if (memberFeed) {
      const { data: consents } = await admin
        .from("oe_consents")
        .select("user_id")
        .eq("kind", "forwarding")
        .is("revoked_at", null);

      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      for (const c of consents ?? []) {
        const { data: fwd } = await admin
          .from("entries")
          .select("id")
          .eq("user_id", c.user_id)
          .eq("source_type", "member_forward")
          .gte("created_at", since)
          .limit(50);
        if (!fwd?.length) continue;

        const { data: already } = await admin
          .from("oe_opportunities")
          .select("raw")
          .in("raw->>entry_id", fwd.map((e) => e.id));
        const seen = new Set((already ?? []).map((r: any) => r?.raw?.entry_id).filter(Boolean));
        if (fwd.every((e) => seen.has(e.id))) continue;

        await enqueue({
          job_type: "oe_fetch_feed",
          user_id: c.user_id,
          payload: { feed_id: memberFeed.id, kind: "member_forward", url: null, lane: "member", user_id: c.user_id },
          priority: LANE_PRIORITY.member,
          max_attempts: 3,
        });
      }
    }

    // ── The read backlog ────────────────────────────────────────────────────
    // What passed triage and was never read is not a queue, it is a debt. A
    // fixed number of the oldest are enqueued each run, Gulf-located first.
    const { data: policy } = await admin
      .from("oe_policy_versions")
      .select("params")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const readCap = Number((policy?.params as any)?.read_cap_per_day ?? 200);
    const readMinLevel = String((policy?.params as any)?.read_min_level ?? "senior_manager");
    const feedCountry = new Map((feeds ?? []).map((f) => [f.id as string, String((f as any).country ?? "").toUpperCase()]));

    // Which country is read first is demand, measured from the members
    // themselves, not a list of countries written into this file.
    const { data: demandRows } = await admin
      .from("oe_demand_map")
      .select("value, demand")
      .eq("dimension", "country");
    const demandByCountry = new Map(
      (demandRows ?? []).map((d: any) => [String(d.value).toUpperCase(), Number(d.demand) || 0]),
    );

    const { data: backlogRows } = await admin
      .from("oe_read_backlog")
      .select("candidate_id, feed_id, url, title, created_at")
      .order("created_at", { ascending: true })
      .limit(Math.max(readCap * 4, 400));

    // A seat below the ladder floor is not worth opening. Decided from the
    // candidate's own title, in code, for nothing.
    const tooJunior: string[] = [];
    const worthReading = (backlogRows ?? []).filter((row: any) => {
      const lvl = parseLevel(row.title, null);
      if (lvl && levelIndex(lvl) < levelIndex(readMinLevel)) {
        tooJunior.push(row.candidate_id as string);
        return false;
      }
      return true;
    });
    for (let i = 0; i < tooJunior.length; i += 200) {
      await admin.from("oe_candidates")
        .update({ triage_state: "junior_title" })
        .in("id", tooJunior.slice(i, i + 200));
    }

    const ordered = [...worthReading].sort((a: any, b: any) => {
      const da = demandByCountry.get(feedCountry.get(a.feed_id as string) ?? "") ?? 0;
      const db = demandByCountry.get(feedCountry.get(b.feed_id as string) ?? "") ?? 0;
      if (da !== db) return db - da;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    let readEnqueued = 0;
    for (const row of ordered.slice(0, readCap)) {
      const before = enqueued;
      await enqueue({
        job_type: "oe_read_candidate",
        user_id: null,
        payload: { candidate_id: row.candidate_id, url: row.url, feed_id: row.feed_id },
        priority: 2,
        max_attempts: 3,
      });
      if (enqueued > before) readEnqueued++;
    }

    const counts = {
      enqueued,
      skipped_terms: skippedTerms,
      skipped_cadence: skippedCadence,
      read_enqueued: readEnqueued,
      read_cap_per_day: readCap,
    };
    await admin.from("oe_runs").insert({
      run_kind: "enqueue_feeds",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: "ok",
      severity: "info",
      counts,
    });
    await logEfError(admin, {
      function_name: FN,
      error: `OE_ENQUEUE_OK enqueued=${enqueued} read=${readEnqueued}`,
      severity: "info",
      context: counts,
    });
    return json({ ok: true, counts });
  } catch (e) {
    await admin.from("oe_runs").insert({
      run_kind: "enqueue_feeds",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: "error",
      severity: "error",
      counts: { enqueued, skipped_terms: skippedTerms, skipped_cadence: skippedCadence },
      error: String((e as Error).message).slice(0, 500),
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high" });
    return json({ ok: false, error: String((e as Error).message) }, 500);
  }
});
