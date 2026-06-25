// linkedin-analytics-probe — diagnostic only, no DB writes
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

async function probe(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: connection } = await adminClient
      .from("linkedin_connections")
      .select("access_token, linkedin_id")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connection?.access_token) return json({ error: "no active connection" });

    const headers = {
      Authorization: `Bearer ${connection.access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_VERSION,
    };

    const end = new Date();
    const start = new Date(Date.now() - 28 * 24 * 3600 * 1000);
    const dr = `(start:(day:${start.getUTCDate()},month:${start.getUTCMonth() + 1},year:${start.getUTCFullYear()}),end:(day:${end.getUTCDate()},month:${end.getUTCMonth() + 1},year:${end.getUTCFullYear()}))`;

    const base = "https://api.linkedin.com/rest/memberCreatorPostAnalytics";

    const me_total = await probe(`${base}?q=me&queryType=IMPRESSION&aggregation=TOTAL`, headers);
    const me_daily = await probe(`${base}?q=me&queryType=IMPRESSION&aggregation=DAILY&dateRange=${dr}`, headers);
    const entity = await probe(`${base}?q=entity&entity=(share:urn%3Ali%3Ashare%3A7475930891278618624)&queryType=IMPRESSION&aggregation=TOTAL`, headers);

    return json({ me_total, me_daily, entity });
  } catch (e) {
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});