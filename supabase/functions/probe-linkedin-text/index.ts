// TEMPORARY diagnostic: probe whether LinkedIn returns post commentary with our scopes.
// Admin/service-role only. Never logs or returns tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINKEDIN_VERSION = "202605";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-probe-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const gate = Deno.env.get("PROBE_DIAG_SECRET");
  if (!gate || req.headers.get("x-probe-secret") !== gate) return json({ error: "forbidden" }, 403);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, service);
  const { data: conn } = await db.from("linkedin_connections")
    .select("user_id, access_token, linkedin_id").eq("status", "active")
    .not("access_token", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn) return json({ error: "no active connection" }, 404);

  const { data: post } = await db.from("linkedin_posts")
    .select("linkedin_post_id, post_url").eq("user_id", conn.user_id)
    .or("linkedin_post_id.like.%7%,post_url.like.%activity%")
    .not("linkedin_post_id", "is", null).limit(50);

  const cand = (post ?? []).map((p: any) => ({ id: String(p.linkedin_post_id ?? ""), url: String(p.post_url ?? "") }))
    .find((p: any) => /\d{15,25}/.test(p.id) || /\d{15,25}/.test(p.url)) ?? { id: "", url: "" };
  const raw = cand.id;
  const numeric = (`${cand.id} ${cand.url}`.match(/\d{15,25}/) ?? [])[0] ?? "";
  const shareUrn = raw.startsWith("urn:") ? raw : `urn:li:share:${numeric}`;
  const ugcUrn = `urn:li:ugcPost:${numeric}`;
  const memberUrn = `urn:li:person:${conn.linkedin_id}`;
  const headers = {
    Authorization: `Bearer ${conn.access_token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_VERSION,
  };

  const probes: Array<[string, string]> = [
    ["a) GET /rest/posts/{urn}", `https://api.linkedin.com/rest/posts/${encodeURIComponent(shareUrn)}`],
    ["a2) GET /rest/posts/{ugcUrn}", `https://api.linkedin.com/rest/posts/${encodeURIComponent(ugcUrn)}`],
    ["b) GET /rest/posts?q=author", `https://api.linkedin.com/rest/posts?author=${encodeURIComponent(memberUrn)}&q=author&count=5`],
    ["c) GET /v2/ugcPosts/{ugcUrn}", `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(ugcUrn)}`],
    ["d) GET /rest/shares?q=owners (v202401)", `https://api.linkedin.com/rest/shares?q=owners&owners=${encodeURIComponent(memberUrn)}&count=5`],
    ["d2) GET /v2/shares?q=owners", `https://api.linkedin.com/v2/shares?q=owners&owners=${encodeURIComponent(memberUrn)}&count=5`],
    ["f) per-post analytics with postUrn", `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=memberAndPost&postUrn=${encodeURIComponent(ugcUrn)}&queryType=IMPRESSION&aggregation=TOTAL&dateRange=(start:(day:1,month:1,year:2026),end:(day:1,month:8,year:2026))`],
    ["e) analytics (current sync path)", `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=me&queryType=IMPRESSION&aggregation=TOTAL&dateRange=(start:(day:1,month:1,year:2026),end:(day:1,month:8,year:2026))`],
  ];

  const results = [];
  for (const [name, url] of probes) {
    try {
      const h = name.startsWith("d)") ? { ...headers, "LinkedIn-Version": "202401" } : headers;
      const res = await fetch(url, { headers: h });
      const body = await res.text();
      results.push({
        probe: name,
        url: url.slice(0, 200),
        status: res.status,
        has_commentary: /"commentary"|shareCommentary/.test(body),
        body: body.slice(0, 600),
      });
    } catch (e) {
      results.push({ probe: name, url, status: 0, error: (e as Error).message });
    }
  }
  return json({ tested_urn: shareUrn, tested_ugc: ugcUrn, post_url: cand.url, candidates: (post ?? []).length, results });
});
