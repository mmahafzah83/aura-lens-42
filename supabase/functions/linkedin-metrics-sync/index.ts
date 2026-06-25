// linkedin-metrics-sync — daily LinkedIn impressions → influence_snapshots
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINKEDIN_VERSION = "202605";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: connections, error: connErr } = await adminClient
      .from("linkedin_connections")
      .select("user_id, access_token, linkedin_id")
      .eq("status", "active");

    if (connErr) return json({ error: connErr.message }, 500);
    if (!connections?.length) return json({ users_processed: 0, days_upserted: 0, skipped: [], sample: [] });

    const end = new Date();
    const start = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const dr = `(start:(day:${start.getUTCDate()},month:${start.getUTCMonth() + 1},year:${start.getUTCFullYear()}),end:(day:${end.getUTCDate()},month:${end.getUTCMonth() + 1},year:${end.getUTCFullYear()}))`;
    const base = "https://api.linkedin.com/rest/memberCreatorPostAnalytics";

    let users_processed = 0;
    let days_upserted = 0;
    const skipped: Array<{ user_id: string; status: number | string }> = [];
    let sample: any[] = [];

    for (const conn of connections) {
      const headers = {
        Authorization: `Bearer ${conn.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
      };

      const elements: any[] = [];
      let startIdx = 0;
      const count = 100;
      let firstStatus: number | null = null;

      // paginate defensively
      for (let page = 0; page < 20; page++) {
        const url = `${base}?q=me&queryType=IMPRESSION&aggregation=DAILY&dateRange=${dr}&start=${startIdx}&count=${count}`;
        const res = await fetch(url, { method: "GET", headers });
        firstStatus = firstStatus ?? res.status;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            skipped.push({ user_id: conn.user_id, status: res.status });
          } else {
            skipped.push({ user_id: conn.user_id, status: res.status });
          }
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

      if (firstStatus && (firstStatus === 401 || firstStatus === 403)) continue;
      if (!elements.length) continue;

      const rows: Array<{ user_id: string; snapshot_date: string; impressions: number; source_type: string }> = [];
      for (const el of elements) {
        const s = el?.dateRange?.start;
        if (!s || typeof s.year !== "number" || typeof s.month !== "number" || typeof s.day !== "number") continue;
        const impressions = Number(el?.count ?? 0) || 0;
        rows.push({
          user_id: conn.user_id,
          snapshot_date: ymd(s.year, s.month, s.day),
          impressions,
          source_type: "linkedin_export",
        });
      }

      if (!rows.length) continue;

      const { error: upErr } = await adminClient
        .from("influence_snapshots")
        .upsert(rows, { onConflict: "user_id,snapshot_date" });

      if (upErr) {
        skipped.push({ user_id: conn.user_id, status: `upsert:${upErr.message}` });
        continue;
      }

      users_processed += 1;
      days_upserted += rows.length;
      if (sample.length < 3) sample = sample.concat(rows.slice(0, 3 - sample.length));
    }

    return json({ users_processed, days_upserted, skipped, sample });
  } catch (e) {
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});