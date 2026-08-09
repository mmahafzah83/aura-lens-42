/**
 * READ-ONLY test harness: prove LinkedIn post fetching via Apify.
 * Founder-gated. No database writes. No AI calls.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const ACTOR = "scraper-engine~linkedin-profile-post-scraper";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth: founder only ---
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!bearer) return json({ error: "Forbidden" }, 403);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(bearer);
    if (userErr || !user || user.id !== FOUNDER_USER_ID) return json({ error: "Forbidden" }, 403);

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) {
      return json({ error: "APIFY_TOKEN not set — add it in Lovable Cloud secrets." }, 400);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const rawMax = Number(body?.max_posts ?? 10);
    const max_posts = Math.min(50, Math.max(1, Number.isFinite(rawMax) ? Math.floor(rawMax) : 10));

    // --- Resolve the profile URL (reads only) ---
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let resolved_url: string | null = null;
    let url_source: "passed" | "stored_by_user" | "stored_founder" | null = null;

    const passed = typeof body?.profile_url === "string" ? body.profile_url.trim() : "";
    if (passed) {
      resolved_url = passed;
      url_source = "passed";
    } else {
      const lookupId = typeof body?.user_id === "string" && body.user_id.trim()
        ? body.user_id.trim()
        : FOUNDER_USER_ID;
      const { data: conn } = await admin
        .from("linkedin_connections")
        .select("profile_url")
        .eq("user_id", lookupId)
        .maybeSingle();
      if (conn?.profile_url) {
        resolved_url = conn.profile_url as string;
        url_source = lookupId === FOUNDER_USER_ID && !body?.user_id ? "stored_founder" : "stored_by_user";
      }
    }

    if (!resolved_url) return json({ error: "No profile_url available" }, 400);

    // --- Apify run (sync) ---
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [resolved_url], maxPosts: max_posts }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status !== 200) {
      const text = await res.text();
      return json({
        error: "Apify request failed",
        status: res.status,
        apify_body: text.slice(0, 500),
      }, 502);
    }

    const items = await res.json();
    const list: any[] = Array.isArray(items) ? items : [];
    const postRows = list.filter((it) => it && (typeof it.text === "string" || typeof it.type === "string"));

    const posts = postRows.map((it) => {
      const text = typeof it.text === "string" ? it.text : "";
      const images = Array.isArray(it.images) ? it.images : [];
      return {
        text_preview: text.slice(0, 200),
        full_text_len: text.length,
        url: it.url ?? it.postUrl ?? null,
        image: it.image ?? images[0] ?? null,
        images_count: images.length,
        postedAtISO: it.postedAtISO ?? it.postedAt ?? null,
        numLikes: it.numLikes ?? null,
        numComments: it.numComments ?? null,
      };
    });

    return json({
      resolved_url,
      url_source,
      requested: max_posts,
      returned: posts.length,
      posts,
      raw_first_item: list[0] ?? null,
    });
  } catch (error) {
    console.error("test-linkedin-scrape error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});