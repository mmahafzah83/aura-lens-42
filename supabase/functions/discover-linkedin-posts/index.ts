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

/* ── URL validation ── */

type RejectionReason =
  | "profile_page"
  | "article_reference"
  | "comment_thread"
  | "external_reference"
  | "mention_by_other"
  | "invalid_url_pattern"
  | "failed_authorship"
  | "authorship_uncertain";

interface UrlValidation {
  valid: boolean;
  reason?: RejectionReason;
}

/** Only accept /feed/update/urn:li:activity and /posts/{handle} URLs */
function validatePostUrl(url: string, handle: string): UrlValidation {
  if (!url.includes("linkedin.com")) {
    return { valid: false, reason: "external_reference" };
  }

  const path = url.replace(/https?:\/\/(www\.)?linkedin\.com/, "").split("?")[0].replace(/\/+$/, "");

  if (/^\/in\/[^/]+\/?$/.test(path)) {
    return { valid: false, reason: "profile_page" };
  }
  if (/^\/pulse\//i.test(path)) {
    return { valid: false, reason: "article_reference" };
  }
  if (/^\/company\//i.test(path)) {
    return { valid: false, reason: "external_reference" };
  }
  if (/commentUrn|replyUrn/i.test(url)) {
    return { valid: false, reason: "comment_thread" };
  }

  if (/^\/feed\/update\/urn:li:activity:\d+/.test(path)) {
    return { valid: true };
  }

  const postsMatch = path.match(/^\/posts\/([^-]+)/);
  if (postsMatch) {
    if (handle && postsMatch[1].toLowerCase() !== handle.toLowerCase()) {
      return { valid: false, reason: "mention_by_other" };
    }
    return { valid: true };
  }

  return { valid: false, reason: "invalid_url_pattern" };
}

/** Multi-signal authorship scoring. Returns signals found and confidence. */
interface AuthorshipResult {
  confident: boolean;      // 2+ signals → true
  uncertain: boolean;      // exactly 1 signal → true (review queue)
  signals: string[];       // which signals matched
  confidence: number;      // 0-1
}

function scoreAuthorship(
  url: string,
  rawText: string,
  profileName: string,
  handle: string,
): AuthorshipResult {
  const signals: string[] = [];

  // Signal 1: author name appears in header area
  if (profileName) {
    const lower = rawText.toLowerCase().slice(0, 1500);
    const nameParts = profileName.toLowerCase().split(/\s+/).filter(p => p.length > 1);
    if (nameParts.length > 0 && nameParts.every((part) => lower.includes(part))) {
      signals.push("name_in_header");
    }
  }

  // Signal 2: profile handle appears in canonical post URL
  if (handle) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes(`/posts/${handle.toLowerCase()}`)) {
      signals.push("handle_in_url");
    }
  }

  // Signal 3: snippet clearly indicates own post (first-person patterns near top)
  const headerText = rawText.slice(0, 800).toLowerCase();
  const firstPersonPatterns = [
    /\bi wrote\b/i, /\bmy post\b/i, /\bi shared\b/i, /\bi published\b/i,
    /\bhere's what i\b/i, /\bi've been\b/i, /\bi learned\b/i, /\bi believe\b/i,
  ];
  if (firstPersonPatterns.some(p => p.test(headerText))) {
    signals.push("first_person_snippet");
  }

  // Signal 4: handle appears in the text byline area
  if (handle) {
    const bylineArea = rawText.toLowerCase().slice(0, 500);
    if (bylineArea.includes(handle.toLowerCase())) {
      signals.push("handle_in_byline");
    }
  }

  const confidence = Math.min(signals.length / 2, 1);

  return {
    confident: signals.length >= 2,
    uncertain: signals.length === 1,
    signals,
    confidence,
  };
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

interface RejectedLink {
  url: string;
  reason: RejectionReason;
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

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    if (!userId && body?.user_id) {
      userId = body.user_id;
    }

    // Cron mode
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

    // Normalize
    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://www.linkedin.com/in/${profileUrl.replace(/^\/+/, "")}`;
    }
    const handleMatch = profileUrl.match(/linkedin\.com\/in\/([^\/?#]+)/);
    if (handleMatch) {
      profileUrl = `https://www.linkedin.com/in/${handleMatch[1]}`;
    }

    await adminClient.from("linkedin_connections")
      .update({ profile_url: profileUrl })
      .eq("user_id", userId)
      .eq("status", "active");

    const handle = handleMatch?.[1] || "";

    if (!profileName) {
      const { data: conn } = await adminClient
        .from("linkedin_connections")
        .select("profile_name, display_name")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();
      profileName = conn?.profile_name || conn?.display_name || "";
    }

    log("start", `Profile: ${profileUrl}, handle: ${handle}, name: ${profileName}`);

    // ── Search-based discovery with filtering ──
    const errors: string[] = [];
    let pagesVisited = 0;
    const discovered: DiscoveredPost[] = [];
    const rejected: RejectedLink[] = [];
    const seenTexts = new Set<string>();
    const seenUrls = new Set<string>();
    let rawLinksFound = 0;

    const searchQueries: string[] = [];
    if (handle) {
      searchQueries.push(
        `site:linkedin.com/posts "${handle}"`,
        `site:linkedin.com/feed/update "urn:li:activity" "${handle}"`,
        `site:linkedin.com/in/${handle} "/posts/"`,
      );
    }
    if (profileName) {
      searchQueries.push(
        `"${profileName}" site:linkedin.com/posts`,
      );
    }
    if (searchQueries.length === 0) {
      searchQueries.push(`site:linkedin.com/posts ${profileUrl}`);
    }

    // Rejection reason counts
    const rejectionCounts: Record<RejectionReason, number> = {
      profile_page: 0,
      article_reference: 0,
      comment_thread: 0,
      external_reference: 0,
      mention_by_other: 0,
      invalid_url_pattern: 0,
      failed_authorship: 0,
    };

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
          rawLinksFound++;

          // Step 1: URL pattern validation
          const urlCheck = validatePostUrl(url, handle);
          if (!urlCheck.valid) {
            rejected.push({ url, reason: urlCheck.reason! });
            rejectionCounts[urlCheck.reason!]++;
            continue;
          }

          const rawText = sr.markdown || sr.description || sr.title || "";
          if (rawText.length < 30) {
            rejected.push({ url, reason: "invalid_url_pattern" });
            rejectionCounts.invalid_url_pattern++;
            continue;
          }

          // Step 2: Authorship validation
          if (!validateAuthorship(rawText, profileName, handle)) {
            rejected.push({ url, reason: "failed_authorship" });
            rejectionCounts.failed_authorship++;
            continue;
          }

          let cleanText = cleanPostText(rawText);
          const publishedAt = parseRelativeDate(cleanText);
          cleanText = cleanText.replace(/\d+\s+(day|week|month|year)s?\s+ago/gi, "").trim();

          if (cleanText.length < 50) {
            rejected.push({ url, reason: "invalid_url_pattern" });
            rejectionCounts.invalid_url_pattern++;
            continue;
          }

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

      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }

    log("filter_summary", `raw=${rawLinksFound}, valid=${discovered.length}, rejected=${rejected.length}`);
    log("rejection_breakdown", JSON.stringify(rejectionCounts));

    if (discovered.length === 0) {
      await adminClient.from("sync_runs").insert({
        user_id: userId,
        sync_type: "search_discovery",
        status: "failed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_fetched: rawLinksFound,
        records_stored: 0,
        error_message: `No authored posts found. ${rawLinksFound} links scanned, ${rejected.length} rejected.`,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "No authored posts found. Try Historical Import with a CSV export from LinkedIn.",
        source_type: "search_discovery",
        profile_url: profileUrl,
        queries_run: pagesVisited,
        raw_links_found: rawLinksFound,
        valid_posts: 0,
        rejected_count: rejected.length,
        rejection_reasons: rejectionCounts,
        errors,
        logs,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mark existing non-authored posts as external_reference ──
    // Find posts that don't match the current handle pattern
    if (handle) {
      const { data: existingAll } = await adminClient
        .from("linkedin_posts")
        .select("id, post_url, linkedin_post_id, tracking_status")
        .eq("user_id", userId)
        .neq("tracking_status", "external_reference");

      let markedExternal = 0;
      for (const post of existingAll || []) {
        const url = post.post_url || post.linkedin_post_id || "";
        if (url.includes("linkedin.com")) {
          const check = validatePostUrl(url, handle);
          if (!check.valid) {
            await adminClient.from("linkedin_posts")
              .update({ tracking_status: "external_reference" })
              .eq("id", post.id);
            markedExternal++;
          }
        }
      }
      if (markedExternal > 0) {
        log("mark_external", `Marked ${markedExternal} existing posts as external_reference`);
      }
    }

    // Dedup against existing posts
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

    await adminClient.from("linkedin_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    await adminClient.from("sync_runs").insert({
      user_id: userId,
      sync_type: "search_discovery",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_fetched: rawLinksFound,
      records_stored: inserted,
    });

    log("complete", `raw=${rawLinksFound}, valid=${discovered.length}, inserted=${inserted}, dupes=${duplicates}`);

    // Auto-classify
    let classifyResult: any = null;
    if (inserted > 0) {
      try {
        log("auto_classify", `Triggering classification for ${inserted} new posts`);
        const classifyRes = await fetch(`${SUPABASE_URL}/functions/v1/classify-posts`, {
          method: "POST",
          headers: {
            Authorization: authHeader || `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
        });
        if (classifyRes.ok) {
          classifyResult = await classifyRes.json();
          log("auto_classify_done", `Classified ${classifyResult?.classified || 0} posts`);
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
      raw_links_found: rawLinksFound,
      valid_posts: discovered.length,
      discovered: discovered.length,
      inserted,
      duplicates,
      rejected_count: rejected.length,
      rejection_reasons: rejectionCounts,
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
