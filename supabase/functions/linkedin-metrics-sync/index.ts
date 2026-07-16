// linkedin-metrics-sync — daily LinkedIn analytics engine → influence_snapshots
import { withObserve } from "../_shared/observe.ts";
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
  conn: { user_id: string; access_token: string; linkedin_id?: string | null; followers_total?: number | null },
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

  // memberFollowersCount — daily follower gains (field is `memberFollowersCount`, paginated)
  const followerGains = new Map<string, number>();
  try {
    const url = `${FOLLOWERS_BASE}?q=dateRange&dateRange=${dr}`;
    const { elements: els } = await fetchAllPaginated(url, headers);
    for (const el of els) {
      const s = el?.dateRange?.start;
      if (!s || typeof s.year !== "number") continue;
      const date = ymd(s.year, s.month, s.day);
      const n = Number(el?.memberFollowersCount ?? 0) || 0;
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

  // ── Establish an absolute-followers anchor for the newest date ──
  // Priority: live networkSizes call → cached linkedin_connections.followers_total
  // → newest influence_snapshots row with followers > 0. If none, anchor stays null
  // and we never write a followers value for any row (unknown ≠ 0).
  let anchor: number | null = null;
  if (conn.linkedin_id) {
    for (const edgeType of ["CompanyFollowedByMember", "FOLLOW"]) {
      try {
        const res = await fetch(
          `https://api.linkedin.com/v2/networkSizes/urn:li:person:${conn.linkedin_id}?edgeType=${edgeType}`,
          { headers: { Authorization: `Bearer ${conn.access_token}` } },
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({} as any));
          if (typeof data?.firstDegreeSize === "number") {
            anchor = data.firstDegreeSize;
            break;
          }
        }
      } catch (_e) { /* try next edgeType */ }
    }
  }
  if (anchor !== null) {
    await adminClient
      .from("linkedin_connections")
      .update({ followers_total: anchor, followers_total_at: new Date().toISOString() })
      .eq("user_id", conn.user_id);
  } else if (typeof conn.followers_total === "number" && conn.followers_total > 0) {
    anchor = conn.followers_total;
  } else {
    try {
      const { data: prior } = await adminClient
        .from("influence_snapshots")
        .select("followers")
        .eq("user_id", conn.user_id)
        .gt("followers", 0)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.followers != null) anchor = Number(prior.followers);
    } catch (_e) { /* best effort */ }
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const imp = impressions.get(date) ?? 0;
    const rx = reactions.get(date) ?? 0;
    const cm = comments.get(date) ?? 0;
    const rs = reshares.get(date) ?? 0;
    const fg = followerGains.get(date) ?? 0;
    const eng = rx + cm + rs;
    const payload: Record<string, unknown> = {
      user_id: conn.user_id,
      snapshot_date: date,
      source_type: "linkedin_api",
      impressions: imp,
      reactions: rx,
      comments: cm,
      shares: rs,
      follower_growth: fg,
      engagement_rate: imp > 0 ? Math.round((eng / imp) * 10000) / 100 : 0,
    };
    if (anchor !== null) {
      // Sum follower_growth for all dates strictly AFTER this one and subtract.
      let laterGains = 0;
      for (let j = i + 1; j < sortedDates.length; j++) {
        laterGains += followerGains.get(sortedDates[j]) ?? 0;
      }
      const v = anchor - laterGains;
      if (v > 0) payload.followers = v;
    }
    rows.push(payload);
  }


  if (rows.length) {
    // Never overwrite an existing non-null followers with null/0.
    // Fetch existing followers for these dates and drop `followers` from payload
    // when the existing value is present and the new value would be missing/lower-quality.
    const dates = rows.map((r) => r.snapshot_date as string);
    const { data: existing } = await adminClient
      .from("influence_snapshots")
      .select("snapshot_date, followers")
      .eq("user_id", conn.user_id)
      .eq("source_type", "linkedin_api")
      .in("snapshot_date", dates);
    const existingMap = new Map<string, number | null>();
    for (const r of existing ?? []) existingMap.set(r.snapshot_date as string, (r as any).followers ?? null);
    for (const row of rows) {
      const existingVal = existingMap.get(row.snapshot_date as string);
      if (existingVal != null && existingVal > 0 && (row.followers == null || Number(row.followers) <= 0)) {
        delete row.followers;
      }
    }
    const { error: upErr } = await adminClient
      .from("influence_snapshots")
      .upsert(rows, { onConflict: "user_id,snapshot_date,source_type" });
    if (upErr) throw new Error(`upsert:${upErr.message}`);
    report.days_upserted = rows.length;

    // Enrich the latest date with members_reached total (per-row API doesn't give daily).
    if (membersReachedTotal !== null) {
      await adminClient
        .from("influence_snapshots")
        .update({ members_reached: membersReachedTotal })
        .eq("user_id", conn.user_id)
        .eq("snapshot_date", latestDate);
    }
  }

  // Stamp last_synced_at
  await adminClient
    .from("linkedin_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", conn.user_id);

  return report;
}

Deno.serve(withObserve("linkedin-metrics-sync", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // Parse body
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const scope: string = body?.scope ?? "all";
    const backfill: boolean = body?.backfill === true;
    const windowDays = backfill ? 365 : 90;

    // Auth: scope=me → require a valid user JWT; anything else (mass sync) →
    // require the cron secret or the service-role key. Never run unauthenticated.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isServiceRole = !!bearer && bearer === SERVICE_KEY;
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    // Resolve target connections
    let targetUserId: string | null = null;
    if (scope === "me") {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser(bearer);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      targetUserId = user.id;
    } else if (!isServiceRole && !isCron) {
      return json({ error: "Unauthorized" }, 401);
    }

    let q = adminClient
      .from("linkedin_connections")
      .select("user_id, access_token, linkedin_id, followers_total")
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
}));