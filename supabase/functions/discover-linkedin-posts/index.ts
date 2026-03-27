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

interface DiscoveredPost {
  url: string | null;
  text: string;
  publishedAt: string | null;
  hook: string | null;
  mediaType: string;
  formatType: string;
  contentType: string;
}

/* ── Extract post URLs from links array ── */
function extractPostUrls(links: string[]): string[] {
  const postUrls: string[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    // Match LinkedIn post/update URLs
    if (/linkedin\.com\/(feed\/update|posts\/|pulse\/)/.test(link)) {
      const clean = link.split("?")[0].replace(/\/+$/, "");
      if (!seen.has(clean)) {
        seen.add(clean);
        postUrls.push(clean);
      }
    }
  }
  return postUrls;
}

/* ── Parse posts from markdown content ── */
function parsePostsFromMarkdown(markdown: string, allLinks: string[]): DiscoveredPost[] {
  const posts: DiscoveredPost[] = [];
  const postUrls = extractPostUrls(allLinks);

  // Strategy 1: Split by post boundaries and extract
  const sections = markdown.split(/(?=#{1,3}\s)|(?=---)|(?=\*\*\*)|(?=\n\n\n)/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length < 50) continue;

    // Skip nav/header/footer noise
    if (/^(Home|About|Experience|Education|Skills|Recommendations|Sign in|Join now)/i.test(trimmed)) continue;
    if (/^(People also viewed|More from|Similar profiles|Messaging|Notifications)/i.test(trimmed)) continue;

    const hasDate = /(\d{1,2}\s+(day|week|month|year)s?\s+ago)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(trimmed);
    const hasEngagement = /(like|comment|repost|reaction|share)\b/i.test(trimmed);

    if (!hasDate && !hasEngagement) continue;

    let cleanText = trimmed
      .replace(/#{1,6}\s*/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\*\*|__/g, "")
      .replace(/\*|_/g, "")
      .trim();

    if (cleanText.length < 80) continue;

    // Try to match a post URL from this section
    const urlMatch = trimmed.match(/linkedin\.com\/(?:feed\/update|posts?\/)\S*/);
    let postUrl = urlMatch ? `https://www.${urlMatch[0].replace(/[)\]>]+$/, "")}` : null;

    // If no URL in section text, try to assign from extracted links
    if (!postUrl && postUrls.length > 0) {
      postUrl = postUrls.shift() || null;
    }

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

  // Strategy 2: If we found post URLs but no parsed posts, create entries from the URLs
  // (the search fallback will scrape them individually)
  if (posts.length === 0 && postUrls.length > 0) {
    for (const url of postUrls) {
      posts.push({
        url,
        text: "",
        publishedAt: null,
        hook: null,
        mediaType: "text",
        formatType: "narrative",
        contentType: "insight",
      });
    }
  }

  return posts;
}

const MAX_POSTS = 50;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 1500;

/* ── Scrape with retry and headless browser ── */
async function scrapeWithRetry(
  url: string,
  apiKey: string,
  log: (step: string, detail: string) => void,
): Promise<{ url: string; markdown: string; links: string[]; html: string; ok: boolean; status: number }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log("retry", `Attempt ${attempt + 1} for ${url}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "links", "html"],
          onlyMainContent: true,
          waitFor: 7000,
          actions: [
            { type: "scroll", direction: "down", amount: 3 },
            { type: "wait", milliseconds: 2000 },
            { type: "scroll", direction: "down", amount: 3 },
            { type: "wait", milliseconds: 2000 },
            { type: "scroll", direction: "down", amount: 3 },
            { type: "wait", milliseconds: 1000 },
          ],
        }),
      });

      const data = await res.json();
      const md = data?.data?.markdown || data?.markdown || "";
      const links = data?.data?.links || data?.links || [];
      const html = data?.data?.html || data?.html || "";

      log("scrape_result", `${url} → ${md.length} chars md, ${links.length} links, ${html.length} chars html, status=${res.status}, attempt=${attempt + 1}`);

      // If we got meaningful content, return it
      if (md.length > 200 || links.length > 5) {
        return { url, markdown: md, links, html, ok: res.ok, status: res.status };
      }

      // If partial load and we have retries left, continue
      if (attempt < MAX_RETRIES) {
        log("partial_load", `Only ${md.length} chars from ${url}, retrying...`);
        continue;
      }

      return { url, markdown: md, links, html, ok: res.ok, status: res.status };
    } catch (e: any) {
      log("scrape_error", `${url} → ${e.message} (attempt ${attempt + 1})`);
      if (attempt === MAX_RETRIES) {
        return { url, markdown: "", links: [], html: "", ok: false, status: 0 };
      }
    }
  }

  return { url, markdown: "", links: [], html: "", ok: false, status: 0 };
}

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
        || (conn.display_name ? `https://www.linkedin.com/in/${conn.display_name.toLowerCase().replace(/\s+/g, "-")}` : null)
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

    // Save profile_url back to connection
    await adminClient.from("linkedin_connections")
      .update({ profile_url: profileUrl })
      .eq("user_id", user.id)
      .eq("status", "active");

    log("start", `Profile: ${profileUrl}`);

    // Build activity page URLs — pages where posts actually appear
    const base = profileUrl.replace(/\/+$/, "");
    const activityPages = [
      `${base}/recent-activity/shares/`,
      `${base}/recent-activity/all/`,
      `${base}/detail/recent-activity/shares/`,
    ];

    log("pages_planned", activityPages.join(", "));

    // Scrape activity pages sequentially with rate limiting
    const scrapeResults: Awaited<ReturnType<typeof scrapeWithRetry>>[] = [];
    for (let i = 0; i < activityPages.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
      const result = await scrapeWithRetry(activityPages[i], FIRECRAWL_API_KEY, log);
      scrapeResults.push(result);
    }

    const pagesVisited = scrapeResults.length;
    const errors: string[] = [];

    // Combine all markdown and links
    let combinedMarkdown = "";
    let allLinks: string[] = [];
    let debugHtml = "";

    for (const r of scrapeResults) {
      if (r.markdown.length > 0) {
        combinedMarkdown += r.markdown + "\n---\n";
      }
      if (r.links.length > 0) {
        allLinks = allLinks.concat(r.links);
      }
      if (!r.ok) {
        errors.push(`${r.url}: HTTP ${r.status}`);
      }
      // Keep HTML snapshot for debugging
      if (r.html.length > debugHtml.length) {
        debugHtml = r.html;
      }
    }

    log("combined", `${combinedMarkdown.length} chars md, ${allLinks.length} total links`);

    let discovered: DiscoveredPost[] = [];

    // Phase 1: Parse posts from scraped content + extracted links
    if (combinedMarkdown.length >= 100 || allLinks.length > 0) {
      discovered = parsePostsFromMarkdown(combinedMarkdown, allLinks);
      // Filter out entries with empty text (URL-only stubs)
      discovered = discovered.filter((p) => p.text.length >= 50 || p.url);
      log("parsed", `${discovered.length} posts from activity pages`);
    }

    // Phase 2: Scrape individual post URLs that had no text
    const urlOnlyPosts = discovered.filter((p) => p.text.length < 50 && p.url);
    if (urlOnlyPosts.length > 0) {
      log("scrape_individual", `Scraping ${urlOnlyPosts.length} individual post URLs for content`);
      for (const post of urlOnlyPosts.slice(0, 10)) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
        try {
          const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: post.url, formats: ["markdown"], onlyMainContent: true, waitFor: 3000 }),
          });
          const data = await res.json();
          const md = data?.data?.markdown || data?.markdown || "";
          if (md.length >= 50) {
            const cleanText = md
              .replace(/#{1,6}\s*/g, "")
              .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
              .replace(/!\[.*?\]\(.*?\)/g, "")
              .replace(/\*\*|__/g, "")
              .replace(/\*|_/g, "")
              .trim();
            post.text = cleanText.slice(0, 5000);
            post.hook = extractHook(cleanText);
            post.mediaType = detectMediaType(md);
            post.formatType = detectFormatType(cleanText, post.mediaType);
            post.contentType = detectContentType(cleanText);
          }
        } catch (e: any) {
          log("individual_scrape_error", `${post.url}: ${e.message}`);
        }
      }
      // Remove posts that still have no text
      discovered = discovered.filter((p) => p.text.length >= 50);
    }

    // Phase 3: Fallback — Firecrawl search
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
      // Record raw HTML snapshot for debugging (truncated)
      const htmlSnippet = debugHtml.slice(0, 2000);

      await adminClient.from("sync_runs").insert({
        user_id: user.id,
        sync_type: "discovery",
        status: "failed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_fetched: 0,
        records_stored: 0,
        error_message: `No posts discovered. Pages scraped: ${pagesVisited}. Combined markdown: ${combinedMarkdown.length} chars. Links found: ${allLinks.length}. LinkedIn may require login.`,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Could not discover posts. LinkedIn activity pages may require authentication. Try Historical Import.",
        profile_url: profileUrl,
        pages_visited: pagesVisited,
        markdown_length: combinedMarkdown.length,
        links_found: allLinks.length,
        html_snapshot: htmlSnippet,
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
