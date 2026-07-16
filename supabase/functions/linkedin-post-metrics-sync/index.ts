// linkedin-post-metrics-sync — daily per-post LinkedIn analytics for Aura-published posts.
import { withObserve } from "../_shared/observe.ts";
// Uses memberCreatorPostAnalytics with q=entity (wrapped: (share:urn%3Ali%3Ashare%3A<id>)
// or (ugc:urn%3Ali%3AugcPost%3A<id>)) and aggregation=TOTAL (lifetime totals per post).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINKEDIN_VERSION = "202605";
const ANALYTICS_BASE = "https://api.linkedin.com/rest/memberCreatorPostAnalytics";

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

const QUERY_TYPES = [
  "IMPRESSION",
  "MEMBERS_REACHED",
  "REACTION",
  "COMMENT",
  "RESHARE",
  "POST_SAVE",
  "POST_SEND",
  "LINK_CLICKS",
  "PROFILE_VIEW_FROM_CONTENT",
  "FOLLOWER_GAINED_FROM_CONTENT",
] as const;
type QueryType = typeof QUERY_TYPES[number];

const MAX_POSTS_PER_USER = 50;
const METRIC_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extract a wrapped entity param from a post_url or stored URN.
 *  - urn:li:share:<id>    → (share:urn%3Ali%3Ashare%3A<id>)
 *  - urn:li:ugcPost:<id>  → (ugc:urn%3Ali%3AugcPost%3A<id>)
 * Only the colons *inside* the URN are URL-encoded; the wrapping parens/prefix are literal.
 */
function buildEntityParam(source: string | null | undefined): string | null {
  if (!source) return null;
  const shareMatch = source.match(/urn:li:share:(\d+)/);
  if (shareMatch) {
    return `(share:urn%3Ali%3Ashare%3A${shareMatch[1]})`;
  }
  const ugcMatch = source.match(/urn:li:ugcPost:(\d+)/);
  if (ugcMatch) {
    return `(ugc:urn%3Ali%3AugcPost%3A${ugcMatch[1]})`;
  }
  // Fallback: LinkedIn post URLs commonly embed the activity id — try to recover a share URN.
  const activityMatch = source.match(/activity[-:](\d{10,})/i);
  if (activityMatch) {
    return `(share:urn%3Ali%3Ashare%3A${activityMatch[1]})`;
  }
  return null;
}

function sumTotal(body: any): number {
  const els: any[] = Array.isArray(body?.elements) ? body.elements : [];
  return els.reduce((acc, el) => acc + (Number(el?.count ?? 0) || 0), 0);
}

async function fetchMetric(
  entityParam: string,
  qt: QueryType,
  headers: Record<string, string>,
): Promise<number | null> {
  const url = `${ANALYTICS_BASE}?q=entity&queryType=${qt}&aggregation=TOTAL&entity=${entityParam}`;
  try {
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      console.warn(`[post-metrics] ${qt} ${entityParam} → HTTP ${res.status}`);
      return null;
    }
    const body = await res.json().catch(() => ({}));
    return sumTotal(body);
  } catch (e) {
    console.warn(`[post-metrics] ${qt} ${entityParam} → ${(e as Error).message}`);
    return null;
  }
}

type PostRow = { id: string; post_url: string | null; linkedin_share_urn?: string | null };

type PostReport = {
  post_id: string;
  ok: boolean;
  metrics_fetched: number;
  error?: string;
};

type UserReport = {
  user_id: string;
  posts_processed: number;
  posts_upserted: number;
  post_reports: PostReport[];
};

async function syncUser(
  conn: { user_id: string; access_token: string },
  adminClient: any,
): Promise<UserReport> {
  const report: UserReport = {
    user_id: conn.user_id,
    posts_processed: 0,
    posts_upserted: 0,
    post_reports: [],
  };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: posts, error: postsErr } = await adminClient
    .from("linkedin_posts")
    .select("id, post_url, published_at")
    .eq("user_id", conn.user_id)
    .not("post_url", "is", null)
    .gte("published_at", ninetyDaysAgo)
    .order("published_at", { ascending: false })
    .limit(MAX_POSTS_PER_USER);

  if (postsErr) throw new Error(`posts:${postsErr.message}`);
  if (!posts?.length) return report;

  const headers = {
    Authorization: `Bearer ${conn.access_token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_VERSION,
  };

  const today = new Date().toISOString().slice(0, 10);

  for (const p of posts as PostRow[]) {
    const entityParam = buildEntityParam(p.post_url);
    if (!entityParam) {
      report.post_reports.push({ post_id: p.id, ok: false, metrics_fetched: 0, error: "no_urn" });
      continue;
    }

    const results: Record<QueryType, number | null> = {} as any;
    let fetched = 0;
    for (const qt of QUERY_TYPES) {
      const val = await fetchMetric(entityParam, qt, headers);
      results[qt] = val;
      if (val !== null) fetched += 1;
      await sleep(METRIC_DELAY_MS);
    }

    if (fetched === 0) {
      report.post_reports.push({
        post_id: p.id,
        ok: false,
        metrics_fetched: 0,
        error: "all_metrics_failed",
      });
      continue;
    }

    const impressions = results.IMPRESSION ?? 0;
    const reactions = results.REACTION ?? 0;
    const comments = results.COMMENT ?? 0;
    const shares = results.RESHARE ?? 0;
    const eng = reactions + comments + shares;
    const row = {
      user_id: conn.user_id,
      post_id: p.id,
      snapshot_date: today,
      source_type: "linkedin_api",
      impressions,
      members_reached: results.MEMBERS_REACHED ?? 0,
      reactions,
      comments,
      shares,
      saves: results.POST_SAVE ?? 0,
      sends: results.POST_SEND ?? 0,
      link_clicks: results.LINK_CLICKS ?? 0,
      profile_views: results.PROFILE_VIEW_FROM_CONTENT ?? 0,
      followers_gained: results.FOLLOWER_GAINED_FROM_CONTENT ?? 0,
      engagement_rate: impressions > 0 ? Math.round((eng / impressions) * 10000) / 100 : 0,
    };

    const { error: upErr } = await adminClient
      .from("linkedin_post_metrics")
      .upsert(row, { onConflict: "post_id,snapshot_date" });

    if (upErr) {
      report.post_reports.push({
        post_id: p.id,
        ok: false,
        metrics_fetched: fetched,
        error: `upsert:${upErr.message}`,
      });
    } else {
      report.posts_upserted += 1;
      report.post_reports.push({ post_id: p.id, ok: true, metrics_fetched: fetched });
    }

    report.posts_processed += 1;
  }

  return report;
}

Deno.serve(withObserve("linkedin-post-metrics-sync", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const scope: string = body?.scope ?? "all";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isServiceRole = !!bearer && bearer === SERVICE_KEY;
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

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
      .select("user_id, access_token")
      .eq("status", "active");
    if (targetUserId) q = q.eq("user_id", targetUserId);

    const { data: connections, error: connErr } = await q;
    if (connErr) return json({ error: connErr.message }, 500);
    if (!connections?.length) {
      return json({ scope, users_processed: 0, posts_upserted: 0, reports: [] });
    }

    const reports: UserReport[] = [];
    const skipped: Array<{ user_id: string; error: string }> = [];
    let users_processed = 0;
    let posts_upserted = 0;

    for (const conn of connections) {
      try {
        const r = await syncUser(conn as any, adminClient);
        reports.push(r);
        if (r.posts_upserted > 0) users_processed += 1;
        posts_upserted += r.posts_upserted;
      } catch (e) {
        skipped.push({ user_id: conn.user_id, error: (e as Error).message });
      }
    }

    return json({ scope, users_processed, posts_upserted, reports, skipped });
  } catch (e) {
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
}));