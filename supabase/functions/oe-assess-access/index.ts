/**
 * oe-assess-access — reads robots.txt, records a finding, switches nothing on
 * that robots.txt does not permit.
 *
 * A source carries a recorded access finding, fetched from the edge, BEFORE it
 * is switched on. This function is that reading and nothing else: no model is
 * called, no page other than robots.txt is fetched, and `active = true` is
 * written on exactly one path — a robots.txt that allows the feed's own path.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-assess-access";
const AGENT = "AuraAccessReader";
const UA = `${AGENT}/1.0 (+https://www.aura-intel.org; access assessment; contact@aura-intel.org)`;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 4;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* robots.txt                                                          */
/* ------------------------------------------------------------------ */

type Rule = { path: string; allow: boolean; raw: string };
type Group = { agents: string[]; rules: Rule[] };

/** Parse robots.txt into user-agent groups, keeping consecutive agent lines together. */
function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    if (!current) continue; // a rule before any user-agent belongs to no group
    lastWasAgent = false;
    current.rules.push({ path: value, allow: key === "allow", raw: `${m[1]}: ${value}` });
  }
  return groups;
}

/**
 * Group selection: the most specific matching group wins — an exact match on
 * our agent name before any `*` group. Groups naming the same agent merge.
 */
function selectGroup(groups: Group[], agent: string): Group | null {
  const a = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const pool = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  if (!pool.length) return null;
  return { agents: pool.flatMap((g) => g.agents), rules: pool.flatMap((g) => g.rules) };
}

/** A robots path pattern with `*` wildcards and a `$` end anchor. */
function ruleMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false; // an empty Disallow forbids nothing
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = new RegExp("^" + escaped + (anchored ? "$" : ""));
  return re.test(path);
}

/** Longest match wins; Allow wins a tie. Returns the decisive rule, if any. */
function decide(group: Group | null, path: string): { allowed: boolean; rule: Rule | null } {
  if (!group) return { allowed: true, rule: null };
  let best: Rule | null = null;
  let bestLen = -1;
  for (const r of group.rules) {
    if (!ruleMatches(r.path, path)) continue;
    const len = r.path.replace(/\$$/, "").length;
    if (len > bestLen || (len === bestLen && r.allow)) {
      best = r;
      bestLen = len;
    }
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.allow, rule: best };
}

const looksHtml = (t: string) => /^\s*(<!doctype|<html|<\?xml)/i.test(t);
const looksRobots = (t: string) => /^\s*(user-agent|allow|disallow|sitemap|crawl-delay)\s*:/im.test(t);

type RobotsRead = {
  status: number | null;
  body: string;
  error: string | null;
};

async function fetchRobots(origin: string): Promise<RobotsRead> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      redirect: "follow",
      signal: control.signal,
      headers: { "User-Agent": UA, "Accept": "text/plain,*/*" },
    });
    const body = await res.text();
    return { status: res.status, body, error: null };
  } catch (e) {
    return { status: null, body: "", error: String((e as Error)?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

type Finding = "robots_allows" | "robots_disallows" | "bot_defended" | "unreachable";

function findingFor(read: RobotsRead, path: string): {
  finding: Finding;
  note: string;
  matched_rule: string | null;
} {
  if (read.error !== null) {
    return { finding: "unreachable", note: `robots.txt could not be read: ${read.error}`, matched_rule: null };
  }
  const s = read.status ?? 0;
  if (s === 401 || s === 403) {
    return { finding: "bot_defended", note: `robots.txt answered ${s} — the host refuses non-browser agents.`, matched_rule: null };
  }
  if (s === 429 || s >= 500) {
    return { finding: "unreachable", note: `robots.txt answered ${s}.`, matched_rule: null };
  }
  if (s === 404 || read.body.trim() === "") {
    return { finding: "robots_allows", note: "No robots.txt on this host — nothing restricts this path.", matched_rule: null };
  }
  if (s < 200 || s >= 300) {
    return { finding: "unreachable", note: `robots.txt answered ${s}.`, matched_rule: null };
  }
  if (looksHtml(read.body) || !looksRobots(read.body)) {
    return {
      finding: "robots_allows",
      note: "The host serves no real robots.txt — the address answers with a page, not robots syntax. Nothing restricts this path.",
      matched_rule: null,
    };
  }
  const group = selectGroup(parseRobots(read.body), AGENT);
  const { allowed, rule } = decide(group, path);
  if (allowed) {
    return {
      finding: "robots_allows",
      note: rule ? `robots.txt allows this path: ${rule.raw}` : "robots.txt carries no rule against this path.",
      matched_rule: rule?.raw ?? null,
    };
  }
  return {
    finding: "robots_disallows",
    note: `robots.txt refuses this path: ${rule!.raw}`,
    matched_rule: rule!.raw,
  };
}

/* ------------------------------------------------------------------ */

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

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { /* an empty body is a default run */ }
  const limit = Math.max(1, Math.min(Number(payload?.limit ?? 50) || 50, 200));

  const { data: policy } = await admin
    .from("oe_policy_versions")
    .select("params")
    .eq("active", true)
    .maybeSingle();
  const skipHosts: string[] = Array.isArray((policy?.params as any)?.discovery_skip_hosts)
    ? (policy!.params as any).discovery_skip_hosts.map((h: string) => String(h).toLowerCase())
    : [];

  const { data: feeds, error: readErr } = await admin
    .from("oe_feeds")
    .select("id, url")
    .eq("source_type", "careers_page")
    .not("active", "is", true)
    .eq("access_finding", "not_assessed")
    .order("id", { ascending: true })
    .limit(limit);

  if (readErr) return json({ error: readErr.message }, 500);

  const counts = {
    assessed: 0,
    allowed: 0,
    disallowed: 0,
    bot_defended: 0,
    unreachable: 0,
    activated: 0,
    skipped: 0,
  };

  /** One robots.txt per origin per run. */
  const robotsCache = new Map<string, RobotsRead>();
  const inflight = new Map<string, Promise<RobotsRead>>();
  async function robotsFor(origin: string): Promise<RobotsRead> {
    if (robotsCache.has(origin)) return robotsCache.get(origin)!;
    if (inflight.has(origin)) return await inflight.get(origin)!;
    const p = fetchRobots(origin).then((r) => {
      robotsCache.set(origin, r);
      inflight.delete(origin);
      return r;
    });
    inflight.set(origin, p);
    return await p;
  }

  async function handle(feed: { id: string; url: string }) {
    let u: URL;
    try {
      u = new URL(feed.url);
    } catch {
      counts.skipped++;
      await logEfError(admin, {
        function_name: FN,
        error: `unreadable feed url: ${feed.url}`,
        severity: "warn",
        context: { feed_id: feed.id },
      });
      return;
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (skipHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      counts.skipped++;
      return;
    }

    const read = await robotsFor(u.origin);
    const { finding, note, matched_rule } = findingFor(read, u.pathname || "/");

    const patch: Record<string, unknown> = {
      access_finding: finding,
      terms_note: note.slice(0, 1000),
      access_detail: {
        status: read.status,
        robots_url: `${u.origin}/robots.txt`,
        checked_at: new Date().toISOString(),
        matched_rule,
      },
      updated_at: new Date().toISOString(),
    };
    // The single path on which a feed is switched on.
    if (finding === "robots_allows") {
      patch.terms_ok = true;
      patch.active = true;
    }

    const { error: upErr } = await admin.from("oe_feeds").update(patch).eq("id", feed.id);
    if (upErr) {
      counts.skipped++;
      await logEfError(admin, {
        function_name: FN,
        error: `write failed: ${upErr.message}`,
        severity: "warn",
        context: { feed_id: feed.id, finding },
      });
      return;
    }

    counts.assessed++;
    if (finding === "robots_allows") { counts.allowed++; counts.activated++; }
    else if (finding === "robots_disallows") counts.disallowed++;
    else if (finding === "bot_defended") counts.bot_defended++;
    else counts.unreachable++;
  }

  const queue = [...(feeds ?? [])] as Array<{ id: string; url: string }>;
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(queue.length, 1)) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        await handle(next);
      } catch (e) {
        counts.skipped++;
        await logEfError(admin, {
          function_name: FN,
          error: e,
          severity: "warn",
          context: { feed_id: next.id },
        });
      }
    }
  });
  await Promise.all(workers);

  const { count: remaining } = await admin
    .from("oe_feeds")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "careers_page")
    .not("active", "is", true)
    .eq("access_finding", "not_assessed");

  await logEfError(admin, {
    function_name: FN,
    error: `ACCESS_ASSESSED assessed=${counts.assessed} allowed=${counts.allowed} disallowed=${counts.disallowed} bot_defended=${counts.bot_defended} unreachable=${counts.unreachable} activated=${counts.activated} remaining=${remaining ?? 0}`,
    severity: "info",
    context: { ...counts, remaining: remaining ?? 0, origins_read: robotsCache.size },
  });

  return json({
    assessed: counts.assessed,
    allowed: counts.allowed,
    disallowed: counts.disallowed,
    bot_defended: counts.bot_defended,
    unreachable: counts.unreachable,
    activated: counts.activated,
    remaining: remaining ?? 0,
  });
});
