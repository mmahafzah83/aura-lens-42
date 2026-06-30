// linkedin-metrics-sync — daily LinkedIn analytics engine → influence_snapshots
// Pulls impressions, reactions, comments, reshares, members_reached, follower gains.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINKEDIN_VERSION = "202605";
const ANALYTICS_BASE = "https://api.linkedin.com/rest/memberCreatorPostAnalytics";
const FOLLOWERS_BASE = "https://api.linkedin.com/rest/memberFollowersCount";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ymd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function buildDateRange(days: number): { dr: string; startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 3600 * 1000);
  const dr =
    `(start:(day:${startDate.getUTCDate()},month:${startDate.getUTCMonth() + 1},year:${startDate.getUTCFullYear()}),` +
    `end:(day:${endDate.getUTCDate()},month:${endDate.getUTCMonth() + 1},year:${endDate.getUTCFullYear()}))`;
  return { dr, startDate, endDate };
}

/** Defensive paginated GET — returns all `elements` or throws on non-OK first page. */
async function fetchAllPaginated(url: string, headers: Record<string, string>): Promise<{ elements: any[]; status: number }> {
  const elements: any[] = [];
  let startIdx = 0;
  const count = 100;
  let firstStatus = 0;

  for (let page = 0; page < 20; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${sep}start=${startIdx}&count=${count}`;
    const res = await fetch(pageUrl, { method: "GET", headers });
    if (page === 0) firstStatus = res.status;
    if (!res.ok) {
      if (page === 0) throw new Error(`HTTP ${res.status}`);
      break;
    }
    const body = await res.json().catch(() => ({} as any));
    const els: any[] = Array.isArray(body?.elements) ? body.elements : [];
    elements.push(...els);
    const paging = body?.paging ?? {};
    const total = typeof paging?.total === "number" ? paging.total : null;
    const links = Array.isArray(paging?.links) ? paging.links : [];
    const hasMore = (total !== null && elements.length < total) || links.length > 0;
    if (!els.length || !hasMore) break;
    startIdx += els.length;
  }
  return { elements, status: firstStatus };
}

/** Single GET, no pagination (for TOTAL aggregation & followers). */
async function fetchSingle(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json().catch(() => ({}));
}

/** Parse {dateRange.start:{y,m,d}, count} into [date, count] pairs. */
function parseDailyCounts(elements: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const el of elements) {
    const s = el?.dateRange?.start;
    if (!s || typeof s.year !== "number" || typeof s.month !== "number" || typeof s.day !== "number") continue;
    const date = ymd(s.year, s.month, s.day);
    const n = Number(el?.count ?? 0) || 0;
    map.set(date, (map.get(date) ?? 0) + n);
  }
  return map;
}

type SyncReport = {
  user_id: string;
  days_upserted: number;
  query_types: Record<string, { ok: boolean; days?: number; total?: number; error?: string }>;
};

async function syncConnection(
  conn: { user_id: string; access_token: string },
  adminClient: any,
  windowDays: number,
): Promise<SyncReport> {
  const headers = {
    Authorization: `Bearer ${conn.access_token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_VERSION,
  };
  const { dr } = buildDateRange(windowDays);
  const report: SyncReport = { user_id: conn.user_id, days_upserted: 0, query_types: {} };

  // Helper: paginated DAILY metric
  async function dailyMetric(qt: string): Promise<Map<string, number>> {
    try {
      const url = `${ANALYTICS_BASE}?q=me&queryType=${qt}&aggregation=DAILY&dateRange=${dr}`;
      const { elements } = await fetchAllPaginated(url, headers);
      const map = parseDailyCounts(elements);
      report.query_types[qt] = { ok: true, days: map.size };
      return map;
    } catch (e) {
      report.query_types[qt] = { ok: false, error: (e as Error).message };
      return new Map();
    }
  }

  const [impressions, reactions, comments, reshares] = await Promise.all([
    dailyMetric("IMPRESSION"),
    dailyMetric("REACTION"),
    dailyMetric("COMMENT"),
    dailyMetric("RESHARE"),
  ]);

  // MEMBERS_REACHED — single TOTAL value for window
  let membersReachedTotal: number | null = null;
  try {
    const url = `${ANALYTICS_BASE}?q=me&queryType=MEMBERS_REACHED&aggregation=TOTAL&dateRange=${dr}`;
    const body = await fetchSingle(url, headers);
    const els: any[] = Array.isArray(body?.elements) ? body.elements : [];
    const tot = els.reduce((acc, el) => acc + (Number(el?.count ?? 0) || 0), 0);
    membersReachedTotal = tot;
    report.query_types["MEMBERS_REACHED"] = { ok: true, total: tot };
  } catch (e) {
    report.query_types["MEMBERS_REACHED"] = { ok: false, error: (e as Error).message };
  }

  // memberFollowersCount — daily follower gains
  const followerGains = new Map<string, number>();
  try {
    const url = `${FOLLOWERS_BASE}?q=dateRange&dateRange=${dr}`;
    const body = await fetchSingle(url, headers);
    console.log(`[memberFollowersCount] user=${conn.user_id} shape:`, JSON.stringify(body).slice(0, 800));
    const els: any[] = Array.isArray(body?.elements) ? body.elements : [];
    for (const el of els) {
      const s = el?.dateRange?.start ?? el?.timeRange?.start ?? el?.date;
      let date: string | null = null;
      if (s && typeof s === "object" && typeof s.year === "number") {
        date = ymd(s.year, s.month, s.day);
      }
      if (!date) continue;
      const n = Number(el?.followerGains?.organicFollowerGain ?? el?.count ?? 0) || 0;
      followerGains.set(date, (followerGains.get(date) ?? 0) + n);
    }
    report.query_types["FOLLOWERS"] = { ok: true, days: followerGains.size };
  } catch (e) {
    report.query_types["FOLLOWERS"] = { ok: false, error: (e as Error).message };
  }

  // Merge into per-date payloads
  const allDates = new Set<string>([
    ...impressions.keys(),
    ...reactions.keys(),
    ...comments.keys(),
    ...reshares.keys(),
    ...followerGains.keys(),
  ]);
  if (!allDates.size && membersReachedTotal === null) return report;

  const sortedDates = [...allDates].sort();
  const latestDate = sortedDates[sortedDates.length - 1] ?? new Date().toISOString().slice(0, 10);

  // Best-effort cumulative followers baseline
  let baselineFollowers: number | null = null;
  let baselineDate: string | null = null;
  try {
    const { data: prior } = await adminClient
      .from("influence_snapshots")
      .select("snapshot_date, followers")
      .eq("user_id", conn.user_id)
      .not("followers", "is", null)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.followers != null) {
      baselineFollowers = Number(prior.followers);
      baselineDate = prior.snapshot_date;
    }
  } catch (_e) { /* best effort */ }

  let cumulativeFollowers: number | null = null;
  if (baselineFollowers !== null) {
    const gainsSince = sortedDates
      .filter((d) => !baselineDate || d > baselineDate)
      .reduce((acc, d) => acc + (followerGains.get(d) ?? 0), 0);
    cumulativeFollowers = baselineFollowers + gainsSince;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const date of sortedDates) {
    const imp = impressions.get(date);
    const rx = reactions.get(date);
    const cm = comments.get(date);
    const rs = reshares.get(date);
    const fg = followerGains.get(date);

    const payload: Record<string, unknown> = {
      user_id: conn.user_id,
      snapshot_date: date,
      source_type: "linkedin_export",
    };
    if (imp !== undefined) payload.impressions = imp;
    if (rx !== undefined) payload.reactions = rx;
    if (cm !== undefined) payload.comments = cm;
    if (rs !== undefined) payload.shares = rs;
    if (fg !== undefined) payload.follower_growth = fg;

    // Engagement rate (always computed when impressions is known)
    if (imp !== undefined) {
      const eng = (rx ?? 0) + (cm ?? 0) + (rs ?? 0);
      payload.engagement_rate = imp > 0 ? Math.round((eng / imp) * 10000) / 100 : 0;
    }

    if (date === latestDate) {
      if (membersReachedTotal !== null) payload.members_reached = membersReachedTotal;
      if (cumulativeFollowers !== null) payload.followers = cumulativeFollowers;
    }

    rows.push(payload);
  }

  if (rows.length) {
    const { error: upErr } = await adminClient
      .from("influence_snapshots")
      .upsert(rows, { onConflict: "user_id,snapshot_date" });
    if (upErr) throw new Error(`upsert:${upErr.message}`);
    report.days_upserted = rows.length;
  }

  // Stamp last_synced_at
  await adminClient
    .from("linkedin_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", conn.user_id);

  return report;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // Parse body
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const scope: string = body?.scope ?? "all";
    const backfill: boolean = body?.backfill === true;
    const windowDays = backfill ? 365 : 90;

    // Resolve target connections
    let targetUserId: string | null = null;
    if (scope === "me") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      targetUserId = user.id;
    }

    let q = adminClient
      .from("linkedin_connections")
      .select("user_id, access_token, linkedin_id")
      .eq("status", "active");
    if (targetUserId) q = q.eq("user_id", targetUserId);

    const { data: connections, error: connErr } = await q;
    if (connErr) return json({ error: connErr.message }, 500);
    if (!connections?.length) {
      return json({ scope, backfill, window_days: windowDays, users_processed: 0, days_upserted: 0, reports: [] });
    }

    const reports: SyncReport[] = [];
    const skipped: Array<{ user_id: string; error: string }> = [];
    let users_processed = 0;
    let days_upserted = 0;

    for (const conn of connections) {
      try {
        const r = await syncConnection(conn as any, adminClient, windowDays);
        reports.push(r);
        if (r.days_upserted > 0) users_processed += 1;
        days_upserted += r.days_upserted;
      } catch (e) {
        skipped.push({ user_id: conn.user_id, error: (e as Error).message });
      }
    }

    return json({
      scope,
      backfill,
      window_days: windowDays,
      users_processed,
      days_upserted,
      reports,
      skipped,
    });
  } catch (e) {
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});