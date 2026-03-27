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

function detectMediaType(markdown: string): string {
  if (/!\[.*?\]\(.*?\)/.test(markdown)) return "image";
  if (/\[.*?video.*?\]/i.test(markdown) || /youtube|vimeo|loom/i.test(markdown)) return "video";
  if (/carousel|slide/i.test(markdown)) return "carousel";
  if (/pdf|document/i.test(markdown)) return "document";
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

interface DiscoveredPost {
  url: string | null;
  text: string;
  publishedAt: string | null;
  hook: string | null;
  mediaType: string;
  formatType: string;
  contentType: string;
}

function parsePostsFromMarkdown(markdown: string): DiscoveredPost[] {
  const posts: DiscoveredPost[] = [];

  // Split by common post boundaries
  const sections = markdown.split(/(?=#{1,3}\s)|(?=---)|(?=\*\*\*)/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length < 50) continue;

    // Skip nav/header/footer
    if (/^(Home|About|Experience|Education|Skills|Recommendations|Sign in|Join now)/i.test(trimmed)) continue;
    if (/^(People also viewed|More from|Similar profiles)/i.test(trimmed)) continue;

    const hasDate = /(\d{1,2}\s+(day|week|month|year)s?\s+ago)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(trimmed);
    const hasEngagement = /(like|comment|repost|reaction|share)/i.test(trimmed);

    let cleanText = trimmed
      .replace(/#{1,6}\s*/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\*\*|__/g, "")
      .replace(/\*|_/g, "")
      .trim();

    if (cleanText.length < 80) continue;
    if (!hasDate && !hasEngagement) continue;

    const urlMatch = trimmed.match(/linkedin\.com\/(?:feed\/update|posts?)\S*/);
    const postUrl = urlMatch ? `https://www.${urlMatch[0].replace(/[)\]>]+$/, "")}` : null;

    let publishedAt: string | null = null;
    const relMatch = cleanText.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
    if (relMatch) {
      const num = parseInt(relMatch[1]);
      const unit = relMatch[2].toLowerCase();
      const now = new Date();
      if (unit === "day") now.setDate(now.getDate() - num);
      else if (unit === "week") now.setDate(now.getDate() - num * 7);
      else if (unit === "month") now.setMonth(now.getMonth() - num);
      else if (unit === "year") now.setFullYear(now.getFullYear() - num);
      publishedAt = now.toISOString();
    }

    cleanText = cleanText
      .replace(/\d+\s+(day|week|month|year)s?\s+ago/gi, "")
      .replace(/\d+\s*(likes?|comments?|reposts?|reactions?|shares?)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (cleanText.length < 50) continue;

    const mediaType = detectMediaType(trimmed);
    posts.push({
      url: postUrl,
      text: cleanText.slice(0, 5000),
      publishedAt,
      hook: extractHook(cleanText),
      mediaType,
      formatType: detectFormatType(cleanText, mediaType),
      contentType: detectContentType(cleanText),
    });
  }

  return posts;
}

const MAX_POSTS = 50;

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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    // Resolve profile URL
    let profileUrl = body?.profile_url as string | undefined;

    if (!profileUrl) {
      const { data: conn } = await adminClient
        .from("linkedin_connections")
        .select("profile_url, handle, display_name")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      if (!conn) {
        return new Response(JSON.stringify({ success: false, error: "No active LinkedIn connection found", needs_profile_url: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      profileUrl = conn.profile_url
        || (conn.handle ? `https://www.linkedin.com/in/${conn.handle}` : null)
        || (conn.display_name ? `https://www.linkedin.com/in/${conn.display_name.toLowerCase().replace(/\s+/g, '-')}` : null)
        || null;

      if (!profileUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: "No LinkedIn profile URL stored. Please provide your profile URL.",
          needs_profile_url: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://www.linkedin.com/in/${profileUrl.replace(/^\/+/, "")}`;
    }

    // Save profile_url back to connection for future use
    await adminClient.from("linkedin_connections")
      .update({ profile_url: profileUrl })
      .eq("user_id", user.id)
      .eq("status", "active");

    log("start", `Profile: ${profileUrl}`);

    // Build activity page URLs
    const base = profileUrl.replace(/\/+$/, "");
    const activityPages = [
      `${base}/recent-activity/shares/`,
      `${base}/recent-activity/all/`,
    ];

    log("pages_planned", activityPages.join(", "));

    // Scrape activity pages via Firecrawl
    const scrapeUrl = async (url: string) => {
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true, waitFor: 3000 }),
        });
        const data = await res.json();
        const md = data?.data?.markdown || data?.markdown || "";
        log("scrape_result", `${url} → ${md.length} chars, status=${res.status}`);
        return { url, markdown: md, ok: res.ok, status: res.status };
      } catch (e: any) {
        log("scrape_error", `${url} → ${e.message}`);
        return { url, markdown: "", ok: false, status: 0 };
      }
    };

    const scrapeResults = await Promise.all(activityPages.map(scrapeUrl));
    const pagesVisited = scrapeResults.length;
    const errors: string[] = [];

    // Combine all markdown
    let combinedMarkdown = "";
    for (const r of scrapeResults) {
      if (r.markdown.length > 0) {
        combinedMarkdown += r.markdown + "\n---\n";
      }
      if (!r.ok) {
        errors.push(`${r.url}: HTTP ${r.status}`);
      }
    }

    let discovered: DiscoveredPost[] = [];

    if (combinedMarkdown.length >= 100) {
      discovered = parsePostsFromMarkdown(combinedMarkdown);
      log("parsed", `${discovered.length} posts from activity pages`);
    }

    // Fallback: Firecrawl search
    if (discovered.length === 0) {
      log("fallback", "Activity pages returned no posts. Trying search...");
      const handle = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/)?.[1] || "";
      const searchQuery = handle
        ? `site:linkedin.com/posts "${handle}"`
        : `site:linkedin.com/posts ${profileUrl}`;

      try {
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: MAX_POSTS }),
        });
        const searchData = await searchRes.json();
        const searchResults = searchData?.data || [];
        log("search_result", `${searchResults.length} search results`);

        for (const sr of searchResults) {
          const url = sr.url || "";
          if (!url.includes("linkedin.com")) continue;
          const text = sr.markdown || sr.description || sr.title || "";
          if (text.length < 30) continue;

          const mediaType = detectMediaType(text);
          discovered.push({
            url,
            text: text.slice(0, 3000),
            publishedAt: null,
            hook: extractHook(text),
            mediaType,
            formatType: detectFormatType(text, mediaType),
            contentType: detectContentType(text),
          });
        }
      } catch (e: any) {
        errors.push(`search_fallback: ${e.message}`);
        log("search_error", e.message);
      }
    }

    // Cap at MAX_POSTS
    discovered = discovered.slice(0, MAX_POSTS);

    if (discovered.length === 0) {
      // Record error instead of placeholder
      await adminClient.from("sync_runs").insert({
        user_id: user.id,
        sync_type: "discovery",
        status: "failed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_fetched: 0,
        records_stored: 0,
        error_message: "No posts discovered. LinkedIn may require login to view activity pages.",
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Could not discover posts. LinkedIn activity pages may require authentication. Try Historical Import.",
        profile_url: profileUrl,
        pages_visited: pagesVisited,
        errors,
        logs,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedup against existing posts
    const { data: existingPosts } = await adminClient
      .from("linkedin_posts")
      .select("linkedin_post_id, post_text")
      .eq("user_id", user.id);

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
        user_id: user.id,
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
      .eq("user_id", user.id)
      .eq("status", "active");

    // Log sync run
    await adminClient.from("sync_runs").insert({
      user_id: user.id,
      sync_type: "discovery",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_fetched: discovered.length,
      records_stored: inserted,
    });

    log("complete", `${discovered.length} found, ${inserted} inserted, ${duplicates} dupes`);

    return new Response(JSON.stringify({
      success: true,
      profile_url: profileUrl,
      pages_visited: pagesVisited,
      discovered: discovered.length,
      inserted,
      duplicates,
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
