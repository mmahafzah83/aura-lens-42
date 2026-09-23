/**
 * oe-harvest-apify — the job-board lane.
 *
 * Boards carry roles that never appear on an employer's own careers page in
 * time. A board record is accepted only when it carries a way in: an apply
 * link, the employer's own site, or contact details. It is marked as a board
 * record, and the day the same role is found on the employer's own site, the
 * employer's record wins and the board record is retired.
 *
 * Everything member-specific stays out of this file. The actor list, the
 * daily money ceiling and the level floor are policy data.
 *
 * No person data is ever stored from a listing: a poster's name, title or
 * profile is dropped at the door (see keepJobFieldsOnly).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";
import { apifyToken, fetchWithTimeout, kickVendorHealth } from "../_shared/vendors.ts";
import { parseLevel, levelIndex } from "../_shared/oeEligibility.ts";
import { isAggregatorFor } from "../_shared/oeGuards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const FN = "oe-harvest-apify";
const RUN_TIMEOUT_MS = 260_000;

type Row = {
  title: string | null;
  company: string | null;
  location: string | null;
  posted_at: string | null;
  description: string | null;
  url: string | null;
  apply_url: string | null;
  employer_url: string | null;
  extra: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function canonicalise(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (/^utm_/i.test(k) || /^(fbclid|ref|ref_src|gclid|mc_cid|mc_eid)$/i.test(k)) drop.push(k);
    });
    for (const k of drop) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch { return raw; }
}

const BOARD_HOSTS = /(indeed|linkedin|bayt|naukri|glassdoor|monster|ziprecruiter|jobs\.|gulftalent|talent\.com|jooble|careerjet|simplyhired|smartrecruiters|workable|greenhouse|lever|myworkdayjobs)\./i;

function hostOf(url: string | null): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** The employer's own door first, then the board's apply link, then the listing. */
function bestRoute(row: Row): string | null {
  const employer = row.employer_url && !BOARD_HOSTS.test(hostOf(row.employer_url)) ? row.employer_url : null;
  return employer ?? row.apply_url ?? row.url ?? null;
}

/**
 * A listing may carry a person: the recruiter who posted it. That is never
 * stored — not their name, not their title, not their profile. Only the job.
 */
function keepJobFieldsOnly(raw: Record<string, unknown>): Record<string, unknown> {
  const banned = /poster|recruiter|contact_?person|profile_?url|email|phone|linkedin_?profile/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (banned.test(key)) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) continue;
    out[key] = value;
  }
  return out;
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
};

const when = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/* ── ACTOR INPUTS AND MAPPINGS ─────────────────────────────────────────────
   One entry per actor: the runs it should make today, and how its result rows
   read as a job. Everything variable comes from the actor's policy row.

   The inputs are data, not code. When the actor's policy row carries a runs
   array of {label, input}, those inputs are sent to the vendor exactly as
   written — an actor that renames a field is fixed by editing the policy row,
   not this file. The generated runs below are only the fallback for an actor
   whose policy row says nothing. A request may also carry one input object to
   try a single actor once, which is how a new input is checked before it is
   written into policy. */

type RunSpec = { label: string; input: Record<string, unknown> };

function runsFor(actor: string, cfg: any, body: any): RunSpec[] {
  // One input sent from the request: that run and nothing else.
  const testInput = body?.input;
  if (testInput && typeof testInput === "object" && !Array.isArray(testInput)) {
    return [{ label: "request", input: testInput as Record<string, unknown> }];
  }

  // Inputs held as policy data: sent verbatim, in the order written.
  if (Array.isArray(cfg?.runs) && cfg.runs.length) {
    return (cfg.runs as any[])
      .filter((run) => run && typeof run.input === "object" && run.input !== null && !Array.isArray(run.input))
      .map((run, index) => ({
        label: str(run.label) ?? `run-${index + 1}`,
        input: run.input as Record<string, unknown>,
      }));
  }

  const pick = <T,>(fromBody: T[] | undefined, fromCfg: T[] | undefined, fallback: T[]): T[] =>
    (Array.isArray(fromBody) && fromBody.length ? fromBody : Array.isArray(fromCfg) && fromCfg.length ? fromCfg : fallback);


  if (actor === "blackfalcondata~bayt-scraper") {
    const countries = pick<string>(body?.countries, cfg?.countries, ["AE", "SA", "QA", "KW", "BH", "OM"]);
    const levels = pick<string>(body?.levels, cfg?.levels, ["director", "executive"]);
    const out: RunSpec[] = [];
    for (const country of countries) for (const level of levels) {
      out.push({
        label: `${country}/${level}`,
        input: {
          country, careerLevel: level, datePosted: "past-24h",
          maxResults: Number(cfg?.max_results ?? 60),
          incrementalMode: true, stateKey: `aura-bayt-${country}-${level}`,
        },
      });
    }
    return out;
  }

  if (actor === "blackfalcondata~naukrigulf-scraper") {
    const locations = pick<string>(body?.locations, cfg?.locations, ["uae", "saudi arabia", "qatar", "kuwait", "bahrain", "oman"]);
    return locations.map((location) => ({
      label: location,
      input: {
        location,
        keywords: "director OR head OR vice president OR chief OR general manager OR senior manager",
        datePosted: 1, maxResults: Number(cfg?.max_results ?? 60),
      },
    }));
  }

  if (actor === "fantastic-jobs~career-site-job-listing-api") {
    return [{
      label: "gcc",
      input: {
        timeRange: "24h", maxJobs: Number(cfg?.max_jobs ?? 200),
        locationSearch: "Saudi Arabia | United Arab Emirates | Qatar | Kuwait | Bahrain | Oman",
        titleSearch: "director | head | vice president | chief | general manager | senior manager | partner",
        removeAgency: true, descriptionType: "text",
      },
    }];
  }

  if (actor === "curious_coder~linkedin-jobs-scraper") {
    const urls = [
      "https://www.linkedin.com/jobs/search?keywords=director%20OR%20%22head%20of%22%20OR%20%22vice%20president%22%20OR%20chief%20OR%20%22general%20manager%22&location=Saudi%20Arabia&f_TPR=r86400",
      "https://www.linkedin.com/jobs/search?keywords=director%20OR%20%22head%20of%22%20OR%20%22vice%20president%22%20OR%20chief%20OR%20%22general%20manager%22&location=United%20Arab%20Emirates&f_TPR=r86400",
    ];
    return urls.map((url, i) => ({ label: `search-${i + 1}`, input: { urls: [url], count: 100, scrapeCompany: false } }));
  }

  if (actor === "johnvc~google-jobs-scraper") {
    const queries = pick<string>(body?.queries, cfg?.queries, [
      "director Saudi Arabia", "head of Saudi Arabia", "vice president Dubai",
      "chief officer Riyadh", "general manager UAE",
    ]);
    return queries.map((query) => ({
      label: query,
      input: { queries: [query], posted_within: "24h", max_pages: Number(cfg?.max_pages ?? 3) },
    }));
  }

  return [];
}

/**
 * Some actors answer with one item per page and the jobs inside it. A page is
 * not a job, so those wrappers are opened before anything is mapped.
 */
function flattenItems(items: any[]): any[] {
  const out: any[] = [];
  for (const item of items ?? []) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const inner = Array.isArray(item.jobs) ? item.jobs
        : Array.isArray(item.results) ? item.results : null;
      if (inner) {
        for (const row of inner) if (row && typeof row === "object") out.push(row);
        continue;
      }
    }
    out.push(item);
  }
  return out;
}

function mapRow(actor: string, raw: any): Row | null {

  const base = keepJobFieldsOnly(raw ?? {});
  if (actor === "blackfalcondata~bayt-scraper") {
    return {
      title: str(raw.title), company: str(raw.company), location: str(raw.location),
      posted_at: when(raw.postedDate ?? raw.postedAt),
      description: str(raw.descriptionMarkdown ?? raw.description),
      url: str(raw.url), apply_url: str(raw.applyUrl),
      employer_url: raw.isExternal ? str(raw.applyUrl) : null,
      extra: { ...base, career_level: str(raw.careerLevel) },
    };
  }
  if (actor === "blackfalcondata~naukrigulf-scraper") {
    return {
      title: str(raw.title), company: str(raw.company),
      location: str(raw.location ?? raw.jobCountry),
      posted_at: when(raw.postedAt), description: str(raw.description),
      url: str(raw.url), apply_url: null, employer_url: str(raw.companyWebsite),
      extra: { ...base, experience_min: raw.experienceMin ?? null },
    };
  }
  if (actor === "fantastic-jobs~career-site-job-listing-api") {
    const loc = Array.isArray(raw.locations_derived) ? raw.locations_derived.join(", ")
      : Array.isArray(raw.countries_derived) ? raw.countries_derived.join(", ") : str(raw.location);
    return {
      title: str(raw.title), company: str(raw.organization), location: str(loc),
      posted_at: when(raw.date_posted), description: str(raw.description_text),
      url: str(raw.url), apply_url: str(raw.url), employer_url: str(raw.organization_url ?? raw.url),
      extra: base,
    };
  }
  if (actor === "curious_coder~linkedin-jobs-scraper") {
    return {
      title: str(raw.title), company: str(raw.companyName), location: str(raw.location),
      posted_at: when(raw.postedAt), description: str(raw.descriptionText),
      url: str(raw.link), apply_url: str(raw.applyUrl), employer_url: null,
      extra: { seniority_level: str(raw.seniorityLevel) },
    };
  }
  if (actor === "johnvc~google-jobs-scraper") {
    const options: any[] = Array.isArray(raw.apply_options) ? raw.apply_options : [];
    const employerOption = options.find((o) => o?.link && !BOARD_HOSTS.test(hostOf(String(o.link))));
    return {
      title: str(raw.title), company: str(raw.company_name), location: str(raw.location),
      posted_at: when(raw.detected_extensions?.posted_at),
      description: str(raw.description),
      url: str(employerOption?.link ?? options[0]?.link),
      apply_url: str(options[0]?.link),
      employer_url: str(employerOption?.link),
      extra: base,
    };
  }
  return null;
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
  const token = apifyToken();
  const startedAt = new Date().toISOString();
  const body = await req.json().catch(() => ({} as any));

  const counts: Record<string, any> = {
    actors: 0, runs: 0, results: 0, inserted: 0, deduped: 0,
    junior_skipped: 0, no_route: 0, aggregator: 0, errors: 0,
    usd: 0, per_actor: {} as Record<string, unknown>, input_schema: {} as Record<string, unknown>,
  };

  if (!token) {
    await admin.from("oe_runs").insert({
      run_kind: "harvest_apify", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, error: "no apify token", severity: "warn",
    });
    return json({ ok: false, error: "no apify token" }, 500);
  }

  try {
    const { data: policy } = await admin.from("oe_policy_versions")
      .select("params").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const params = ((policy?.params ?? {}) as any);
    const actorsCfg: any[] = Array.isArray(params.apify_actors) ? params.apify_actors : [];
    const capUsd = Number(params.apify_daily_usd_cap ?? 3);
    const readMinLevel = String(params.read_min_level ?? "senior_manager");
    const only = str(body?.only);

    // Apify spend over the rolling last 24 hours, read from this lane's runs.
    const dayStart = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: todayRuns } = await admin.from("oe_runs")
      .select("counts").eq("run_kind", "harvest_apify").gte("started_at", dayStart);
    let spentToday = (todayRuns ?? []).reduce((sum: number, r: any) => sum + (Number(r?.counts?.usd) || 0), 0);

    for (const cfg of actorsCfg) {
      const actor = String(cfg?.actor ?? "");
      if (!actor) continue;
      if (only && actor !== only) continue;
      if (!only && cfg?.active === false) continue;
      counts.actors++;
      const perActor: Record<string, any> = { runs: 0, results: 0, inserted: 0, deduped: 0, junior: 0, usd: 0, errors: [] as string[] };
      counts.per_actor[actor] = perActor;

      // The feed row that owns everything this actor brings in.
      const feedName = `Apify · ${actor}`;
      let feedId: string | null = null;
      const { data: existingFeed } = await admin.from("oe_feeds").select("id").eq("name", feedName).maybeSingle();
      if (existingFeed?.id) feedId = existingFeed.id as string;
      else {
        const { data: created, error: feedErr } = await admin.from("oe_feeds").insert({
          name: feedName, lane: "open", kind: "api", source_type: "job_board",
          url: `https://apify.com/${actor.replace("~", "/")}`,
          country: "SA", language: "en", cadence: "daily",
          terms_ok: true, access_finding: "official_api",
          terms_note: "Read through the vendor's own API under its terms.",
          active: true, read_method: "apify",
        }).select("id").maybeSingle();
        if (feedErr) { perActor.errors.push(`feed: ${feedErr.message}`); counts.errors++; continue; }
        feedId = created?.id as string;
      }

      // What the actor says it accepts — recorded once so the inputs can be checked.
      try {
        const metaRes = await fetchWithTimeout(`https://api.apify.com/v2/acts/${actor}?token=${token}`, {}, 15_000);
        const meta = await metaRes.json().catch(() => null) as any;
        const schema = meta?.data?.defaultRunOptions ? meta?.data : meta?.data;
        const inputSchema = schema?.exampleRunInput?.body ?? schema?.inputSchema ?? null;
        let fields: string[] = [];
        try {
          const parsed = typeof inputSchema === "string" ? JSON.parse(inputSchema) : inputSchema;
          fields = parsed?.properties ? Object.keys(parsed.properties) : parsed ? Object.keys(parsed) : [];
        } catch { fields = []; }
        counts.input_schema[actor] = { status: metaRes.status, fields: fields.slice(0, 40) };
      } catch (e) {
        counts.input_schema[actor] = { error: String((e as Error).message ?? e).slice(0, 160) };
      }

      for (const spec of runsFor(actor, cfg, body)) {
        if (spentToday >= capUsd) {
          await admin.from("oe_runs").insert({
            run_kind: "harvest_apify", feed_id: feedId, started_at: startedAt,
            finished_at: new Date().toISOString(), outcome: "deferred", severity: "warn",
            counts: { reason: "apify_daily_cap", actor, spent_today: +spentToday.toFixed(4), cap: capUsd },
          });
          counts.deferred = "apify_daily_cap";
          break;
        }

        counts.runs++; perActor.runs++;
        let items: any[] = [];
        try {
          const res = await fetchWithTimeout(
            `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=240`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec.input) },
            RUN_TIMEOUT_MS,
          );
          const header = res.headers.get("x-apify-usage-total-usd");
          if (res.status === 402) {
            await kickVendorHealth(admin, "apify 402");
            perActor.errors.push(`${spec.label}: 402 payment required`);
            counts.errors++;
            break;
          }
          if (!res.ok) {
            // A refused input is only fixable if its whole complaint is kept.
            const text = (await res.text()).slice(0, 1000);
            perActor.errors.push(`${spec.label}: ${res.status} ${text}`);
            counts.errors++;
            await admin.from("oe_runs").insert({
              run_kind: "harvest_apify", feed_id: feedId, started_at: startedAt,
              finished_at: new Date().toISOString(), outcome: "error", severity: "warn",
              counts: { actor, run: spec.label, status: res.status, input: spec.input },
              error: text.slice(0, 500),
            });
            continue; // one refused input never ends the lane
          }
          const payload = await res.json().catch(() => []);
          items = flattenItems(Array.isArray(payload) ? payload : [payload]);
          const usd = header ? Number(header) : (items.length / 1000) * Number(cfg?.price_per_1k_usd ?? 1);
          spentToday += usd; counts.usd += usd; perActor.usd += usd;
        } catch (e) {
          perActor.errors.push(`${spec.label}: ${String((e as Error).message ?? e).slice(0, 160)}`);
          counts.errors++;
          continue;
        }

        counts.results += items.length; perActor.results += items.length;

        // A dry call reads the vendor and shows the first rows, storing nothing.
        if (body?.dry === true) {
          perActor.sample = items.slice(0, 3).map((item) => mapRow(actor, item));
          perActor.raw_keys = items.length ? Object.keys(items[0] ?? {}).slice(0, 40) : [];
          continue;
        }



        for (const item of items) {
          const row = mapRow(actor, item);
          if (!row || !row.title) continue;
          const route = bestRoute(row);
          if (!route) { counts.no_route++; continue; }
          const canonical = canonicalise(route);

          // A title below the floor is never opened, and never asked twice.
          const level = parseLevel(row.title, null);
          if (level && levelIndex(level) < levelIndex(readMinLevel)) {
            counts.junior_skipped++; perActor.junior++;
            await admin.from("oe_seen_links").upsert({
              canonical_url: canonical, feed_id: feedId, verdict: "junior_title",
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "canonical_url" });
            continue;
          }

          // A board listing with a door is one chair, not a directory.
          if (isAggregatorFor("job_board", true, canonical, row.title, row.description)) {
            counts.aggregator++; continue;
          }

          const { data: seen } = await admin.from("oe_seen_links")
            .select("canonical_url").eq("canonical_url", canonical).maybeSingle();
          if (seen) { counts.deduped++; perActor.deduped++; continue; }

          const { data: dupCand } = await admin.from("oe_candidates")
            .select("id").eq("canonical_url", canonical).maybeSingle();
          const { data: dupOpp } = await admin.from("oe_opportunities")
            .select("id").eq("url", canonical).maybeSingle();
          if (dupCand || dupOpp) { counts.deduped++; perActor.deduped++; continue; }

          // The same chair posted twice under two links: same title, same
          // employer, inside a month.
          if (row.company) {
            const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
            const { data: twin } = await admin.from("oe_opportunities")
              .select("id").gte("first_seen_at", since)
              .ilike("title", row.title).ilike("issuer_raw", row.company).limit(1);
            if (twin && twin.length) { counts.deduped++; perActor.deduped++; continue; }
          }

          const { error: insErr } = await admin.from("oe_candidates").insert({
            feed_id: feedId, url: route, canonical_url: canonical,
            title: row.title, snippet: (row.description ?? "").slice(0, 4000),
            published_at: row.posted_at, lang: "en",
            raw: {
              source: "apify", actor, run: spec.label,
              discovery_kind: "job_board",
              issuer_raw: row.company, location: row.location,
              apply_url: row.apply_url, employer_url: row.employer_url,
              listing_url: row.url,
              description_text: row.description ?? null,
              fields: row.extra,
            } as any,
          });
          if (insErr) { counts.errors++; perActor.errors.push(`insert: ${insErr.message}`); continue; }
          counts.inserted++; perActor.inserted++;
          await admin.from("oe_seen_links").upsert({
            canonical_url: canonical, feed_id: feedId, verdict: "opportunity",
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "canonical_url" });
        }
      }

      await admin.from("oe_feeds").update({ last_fetched_at: new Date().toISOString() }).eq("id", feedId);
      perActor.usd = +perActor.usd.toFixed(4);
    }

    counts.usd = +Number(counts.usd).toFixed(4);
    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "harvest_apify", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts, cost_usd: counts.usd,
    }).select("id").maybeSingle();

    await logEfError(admin, {
      function_name: FN, severity: "info",
      error: `APIFY_HARVEST inserted=${counts.inserted} results=${counts.results} usd=${counts.usd}`,
      context: { counts },
    });

    return json({ ok: true, counts, run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "harvest_apify", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { counts } });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
