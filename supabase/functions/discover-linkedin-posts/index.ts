import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── helpers ── */

function extractHook(text: string): string | null {
  if (!text) return null;
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 10 ? firstLine.slice(0, 200) : null;
}

function detectMediaType(text: string): string {
  if (/!\[.*?\]\(.*?\)/.test(text)) return "image";
  if (/\[.*?video.*?\]/i.test(text) || /youtube|vimeo|loom/i.test(text)) return "video";
  if (/carousel|slide/i.test(text)) return "carousel";
  if (/pdf|document/i.test(text)) return "document";
  return "text";
}

function detectFormatType(text: string, mediaType: string): string {
  if (mediaType === "carousel") return "carousel";
  if (mediaType === "video") return "video";
  if (mediaType === "document") return "document";
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length > 8) return "long-form";
  if (lines.some((l) => /^\d+[\.\)]/m.test(l) || /^[-•]/m.test(l))) return "listicle";
  if (text.length < 300) return "short-form";
  return "narrative";
}

function detectContentType(text: string): string {
  const lower = text.toLowerCase();
  if (/lesson|learned|mistake|experience/i.test(lower)) return "lesson";
  if (/framework|step|process|method/i.test(lower)) return "framework";
  if (/opinion|believe|think|unpopular/i.test(lower)) return "opinion";
  if (/story|journey|when i|years ago/i.test(lower)) return "story";
  if (/tip|advice|how to|guide/i.test(lower)) return "advice";
  if (/announce|launch|excited|proud/i.test(lower)) return "announcement";
  return "insight";
}

function cleanPostText(rawText: string): string {
  return rawText
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/\*|_/g, "")
    .replace(/^(Sign in|Join now|Skip to main|Report this|LinkedIn|See who|More from LinkedIn).*$/gm, "")
    .replace(/\d+\s*(likes?|comments?|reposts?|reactions?|shares?|followers?)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseRelativeDate(text: string): string | null {
  const relMatch = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  if (!relMatch) return null;
  const num = parseInt(relMatch[1]);
  const unit = relMatch[2].toLowerCase();
  const now = new Date();
  if (unit === "day") now.setDate(now.getDate() - num);
  else if (unit === "week") now.setDate(now.getDate() - num * 7);
  else if (unit === "month") now.setMonth(now.getMonth() - num);
  else if (unit === "year") now.setFullYear(now.getFullYear() - num);
  return now.toISOString();
}

interface DiscoveredPost {
  url: string | null;
  text: string;
  publishedAt: string | null;
  hook: string | null;
  mediaType: string;
  formatType: string;
  contentType: string;
}

const MAX_POSTS = 50;
const RATE_LIMIT_DELAY_MS = 1500;

/* ── main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: { step: string; detail: string; ts: string }[] = [];
  const log = (step: string, detail: string) => {
    logs.push({ step, detail, ts: new Date().toISOString() });
    console.log(`[discover] ${step}: ${detail}`);
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Support both authenticated user calls and service-role cron calls
    let userId: string | null = null;

    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (!userError && user) {
        userId = user.id;
      }
    }

    // For cron: if no user from auth, check body.user_id or discover all active connections
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    if (!userId && body?.user_id) {
      userId = body.user_id;
    }

    // Cron mode: process all active connections
    if (!userId) {
      log("cron_mode", "No user_id provided – processing all active LinkedIn connections");
      const { data: connections } = await adminClient
        .from("linkedin_connections")
        .select("user_id, handle, profile_url, profile_name, display_name")
        .eq("status", "active");

      if (!connections || connections.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No active connections to process" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];
      for (const conn of connections) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/discover-linkedin-posts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
            },
            body: JSON.stringify({ user_id: conn.user_id }),
          });
          const data = await res.json();
          results.push({ user_id: conn.user_id, ...data });
        } catch (e: any) {
          results.push({ user_id: conn.user_id, error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, cron: true, results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Resolve profile URL
    let profileUrl = body?.profile_url as string | undefined;

    // Resolve profile from connection if not provided
    let profileName = "";
    if (!profileUrl) {
      const { data: conn } = await adminClient
        .from("linkedin_connections")
        .select("profile_url, handle, display_name, profile_name")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      if (!conn) {
        return new Response(JSON.stringify({ success: false, error: "No active LinkedIn connection found", needs_profile_url: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      profileName = conn.profile_name || conn.display_name || "";
      profileUrl = conn.profile_url
        || (conn.handle ? `https://www.linkedin.com/in/${conn.handle}` : null)
        || (profileName ? `https://www.linkedin.com/in/${profileName.toLowerCase().replace(/\s+/g, "-")}` : null)
        || null;

      if (!profileUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: "No LinkedIn profile URL stored. Please provide your profile URL.",
          needs_profile_url: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Normalize: ensure https and extract handle
    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://www.linkedin.com/in/${profileUrl.replace(/^\/+/, "")}`;
    }
    const handleMatch = profileUrl.match(/linkedin\.com\/in\/([^\/?#]+)/);
    if (handleMatch) {
      profileUrl = `https://www.linkedin.com/in/${handleMatch[1]}`;
    }

    // Save profile_url back to connection
    await adminClient.from("linkedin_connections")
      .update({ profile_url: profileUrl })
      .eq("user_id", userId)
      .eq("status", "active");

    const handle = handleMatch?.[1] || "";

    // If we don't have profile name yet, fetch it
    if (!profileName) {
      const { data: conn } = await adminClient
        .from("linkedin_connections")
        .select("profile_name, display_name")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();
      profileName = conn?.profile_name || conn?.display_name || "";
    }

    log("start", `Profile: ${profileUrl}, handle: ${handle}, name: ${profileName}, source_type: search_discovery`);

    // ── Primary: Firecrawl search-based discovery ──
    const errors: string[] = [];
    let pagesVisited = 0;
    const discovered: DiscoveredPost[] = [];
    const seenTexts = new Set<string>();
    const seenUrls = new Set<string>();

    // Build comprehensive search queries
    const searchQueries: string[] = [];
    if (handle) {
      searchQueries.push(
        `site:linkedin.com/posts "${handle}"`,
        `site:linkedin.com/pulse "${handle}"`,
        `site:linkedin.com/in/${handle} "/posts/"`,
        `site:linkedin.com "linkedin.com/posts" "${handle}"`,
      );
    }
    if (profileName) {
      searchQueries.push(
        `"${profileName}" site:linkedin.com/posts`,
        `"${profileName}" LinkedIn post`,
      );
    }
    if (searchQueries.length === 0) {
      searchQueries.push(`site:linkedin.com/posts ${profileUrl}`);
    }

    for (const searchQuery of searchQueries) {
      if (discovered.length >= MAX_POSTS) break;

      log("search", `Query: ${searchQuery}`);
      pagesVisited++;

      try {
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            limit: MAX_POSTS,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });
        const searchData = await searchRes.json();
        const searchResults = searchData?.data || [];
        log("search_result", `${searchResults.length} results for "${searchQuery}"`);

        for (const sr of searchResults) {
          if (discovered.length >= MAX_POSTS) break;

          const url = sr.url || "";
          if (!url.includes("linkedin.com")) continue;

          const rawText = sr.markdown || sr.description || sr.title || "";
          if (rawText.length < 30) continue;

          let cleanText = cleanPostText(rawText);
          const publishedAt = parseRelativeDate(cleanText);
          cleanText = cleanText.replace(/\d+\s+(day|week|month|year)s?\s+ago/gi, "").trim();

          if (cleanText.length < 50) continue;

          const postUrl = url.split("?")[0].replace(/\/+$/, "");
          const textKey = cleanText.slice(0, 100);

          if (seenUrls.has(postUrl) || seenTexts.has(textKey)) continue;
          seenUrls.add(postUrl);
          seenTexts.add(textKey);

          const mediaType = detectMediaType(rawText);
          discovered.push({
            url: postUrl,
            text: cleanText.slice(0, 5000),
            publishedAt,
            hook: extractHook(cleanText),
            mediaType,
            formatType: detectFormatType(cleanText, mediaType),
            contentType: detectContentType(cleanText),
          });
        }
      } catch (e: any) {
        errors.push(`search: ${e.message}`);
        log("search_error", e.message);
      }

      // Rate limit between queries
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }

    log("total_discovered", `${discovered.length} posts from ${pagesVisited} search queries`);

    if (discovered.length === 0) {
      await adminClient.from("sync_runs").insert({
        user_id: userId,
        sync_type: "search_discovery",
        status: "failed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_fetched: 0,
        records_stored: 0,
        error_message: `No posts discovered via search for "${handle || profileName}". Queries run: ${pagesVisited}. Try Historical Import with CSV export.`,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "No posts found via search. Try Historical Import with a CSV export from LinkedIn.",
        source_type: "search_discovery",
        profile_url: profileUrl,
        queries_run: pagesVisited,
        errors,
        logs,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedup against existing posts in DB
    const { data: existingPosts } = await adminClient
      .from("linkedin_posts")
      .select("linkedin_post_id, post_text")
      .eq("user_id", userId);

    const existingTexts = new Set((existingPosts || []).map((p: any) => p.post_text?.slice(0, 100)));
    const existingIds = new Set((existingPosts || []).map((p: any) => p.linkedin_post_id));

    let inserted = 0;
    let duplicates = 0;
    const insertErrors: string[] = [];

    for (const post of discovered) {
      const textKey = post.text.slice(0, 100);
      const urlKey = post.url || `discovered-${textKey.slice(0, 50).replace(/\W/g, "-")}-${Date.now()}`;

      if (existingTexts.has(textKey) || existingIds.has(urlKey)) {
        duplicates++;
        continue;
      }

      const { error: insertErr } = await adminClient.from("linkedin_posts").insert({
        user_id: userId,
        linkedin_post_id: urlKey,
        post_url: post.url,
        post_text: post.text,
        hook: post.hook,
        published_at: post.publishedAt,
        media_type: post.mediaType,
        format_type: post.formatType,
        content_type: post.contentType,
        topic_label: null,
        engagement_score: 0,
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
      });

      if (insertErr) {
        if (insertErr.code === "23505") duplicates++;
        else insertErrors.push(insertErr.message);
      } else {
        inserted++;
        existingTexts.add(textKey);
      }
    }

    // Update connection
    await adminClient.from("linkedin_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    // Log sync run
    await adminClient.from("sync_runs").insert({
      user_id: userId,
      sync_type: "search_discovery",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_fetched: discovered.length,
      records_stored: inserted,
    });

    log("complete", `${discovered.length} found, ${inserted} inserted, ${duplicates} dupes, source_type: search_discovery`);

    // Auto-classify newly inserted posts
    let classifyResult: any = null;
    if (inserted > 0) {
      try {
        log("auto_classify", `Triggering classification for ${inserted} new posts`);
        const classifyRes = await fetch(`${SUPABASE_URL}/functions/v1/classify-posts`, {
          method: "POST",
          headers: {
            Authorization: authHeader!,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
        });
        if (classifyRes.ok) {
          classifyResult = await classifyRes.json();
          log("auto_classify_done", `Classified ${classifyResult?.classified || 0} posts`);
        } else {
          const errText = await classifyRes.text();
          log("auto_classify_error", `HTTP ${classifyRes.status}: ${errText.slice(0, 200)}`);
        }
      } catch (e: any) {
        log("auto_classify_error", e.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      source_type: "search_discovery",
      profile_url: profileUrl,
      queries_run: pagesVisited,
      total_results: discovered.length,
      valid_posts: discovered.length,
      discovered: discovered.length,
      inserted,
      duplicates,
      classified: classifyResult?.classified || 0,
      labels: classifyResult?.labels || [],
      errors: [...errors, ...insertErrors],
      logs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[discover] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message, logs }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
