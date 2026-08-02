// TEMPORARY diagnostic: probe whether LinkedIn returns post commentary with our scopes.
// Admin/service-role only. Never logs or returns tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINKEDIN_VERSION = "202605";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-probe-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${service}`) return json({ error: "forbidden" }, 403);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, service);
  const { data: conn } = await db.from("linkedin_connections")
    .select("user_id, access_token, linkedin_id").eq("status", "active")
    .not("access_token", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn) return json({ error: "no active connection" }, 404);

  const { data: post } = await db.from("linkedin_posts")
    .select("linkedin_post_id, post_url").eq("user_id", conn.user_id)
    .eq("source_type", "linkedin_export").not("linkedin_post_id", "is", null).limit(1).maybeSingle();

  const raw = String(post?.linkedin_post_id ?? "");
  const numeric = (raw.match(/\d{15,25}/) ?? [])[0] ?? "";
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
    ["d) GET /rest/shares?q=owners", `https://api.linkedin.com/rest/shares?q=owners&owners=${encodeURIComponent(memberUrn)}&count=5`],
    ["e) analytics (current sync path)", `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=me&queryType=IMPRESSION&aggregation=TOTAL&dateRange=(start:(day:1,month:1,year:2026),end:(day:1,month:8,year:2026))`],
  ];

  const results = [];
  for (const [name, url] of probes) {
    try {
      const res = await fetch(url, { headers });
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
  return json({ tested_urn: shareUrn, post_url: post?.post_url ?? null, results });
});
