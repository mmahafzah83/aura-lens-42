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

function parsePostsFromMarkdown(markdown: string, profileUrl: string): DiscoveredPost[] {
  const posts: DiscoveredPost[] = [];

  // LinkedIn profile pages show posts as sections — try to split by post boundaries
  // Common patterns: activity sections, separated by horizontal rules or headers
  const sections = markdown.split(/(?=#{1,3}\s)|(?=---)|(?=\*\*\*)/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length < 50) continue;

    // Skip navigation/header/footer sections
    if (/^(Home|About|Experience|Education|Skills|Recommendations|Sign in|Join now)/i.test(trimmed)) continue;
    if (/^(People also viewed|More from|Similar profiles)/i.test(trimmed)) continue;

    // Look for post-like content: has text content and potentially dates
    const hasDate = /(\d{1,2}\s+(day|week|month|year)s?\s+ago)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(trimmed);
    const hasEngagement = /(like|comment|repost|reaction|share)/i.test(trimmed);

    // Extract text — strip markdown formatting
    let cleanText = trimmed
      .replace(/#{1,6}\s*/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
      .replace(/!\[.*?\]\(.*?\)/g, "") // images
      .replace(/\*\*|__/g, "") // bold
      .replace(/\*|_/g, "") // italic
      .trim();

    // Must have meaningful text
    if (cleanText.length < 80) continue;
    if (!hasDate && !hasEngagement) continue;

    // Try to extract a LinkedIn post URL
    const urlMatch = trimmed.match(/linkedin\.com\/(?:feed\/update|posts?)\S*/);
    const postUrl = urlMatch ? `https://www.${urlMatch[0].replace(/[)\]>]+$/, "")}` : null;

    // Try to parse relative date
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

    // Remove date/engagement metadata from the clean text
    cleanText = cleanText
      .replace(/\d+\s+(day|week|month|year)s?\s+ago/gi, "")
      .replace(/\d+\s*(likes?|comments?|reposts?|reactions?|shares?)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (cleanText.length < 50) continue;

    const mediaType = detectMediaType(trimmed);
    const formatType = detectFormatType(cleanText, mediaType);
    const contentType = detectContentType(cleanText);

    posts.push({
      url: postUrl,
      text: cleanText.slice(0, 5000),
      publishedAt,
      hook: extractHook(cleanText),
      mediaType,
      formatType,
      contentType,
    });
  }

  return posts;
}

/* ── main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth
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

    // Get body
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    // Get LinkedIn profile URL
    let profileUrl = body?.profile_url as string | undefined;

    if (!profileUrl) {
      // Look up from connection
      const { data: conn } = await adminClient
        .from("linkedin_connections")
        .select("profile_url, handle, display_name, linkedin_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      if (!conn) {
        return new Response(JSON.stringify({ success: false, error: "No active LinkedIn connection found" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      profileUrl = conn.profile_url
        || (conn.handle ? `https://www.linkedin.com/in/${conn.handle}` : null)
        || null;

      if (!profileUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: "No LinkedIn profile URL stored. Please provide your profile URL (e.g. https://www.linkedin.com/in/yourhandle).",
          needs_profile_url: true,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Normalize URL
    if (!profileUrl.startsWith("http")) {
      profileUrl = `https://www.linkedin.com/in/${profileUrl.replace(/^\/+/, "")}`;
    }

    console.log(`[discover] Scraping profile: ${profileUrl}`);

    // Also scrape /recent-activity/all/ for posts
    const activityUrl = profileUrl.replace(/\/$/, "") + "/recent-activity/all/";

    // Scrape both URLs via Firecrawl
    const [profileRes, activityRes] = await Promise.all([
      fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: profileUrl, formats: ["markdown", "links"], onlyMainContent: true, waitFor: 3000 }),
      }),
      fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: activityUrl, formats: ["markdown", "links"], onlyMainContent: true, waitFor: 3000 }),
      }),
    ]);

    const profileData = await profileRes.json();
    const activityData = await activityRes.json();

    const profileMarkdown = profileData?.data?.markdown || profileData?.markdown || "";
    const activityMarkdown = activityData?.data?.markdown || activityData?.markdown || "";
    const combinedMarkdown = profileMarkdown + "\n---\n" + activityMarkdown;

    console.log(`[discover] Profile markdown length: ${profileMarkdown.length}, Activity markdown length: ${activityMarkdown.length}`);

    if (combinedMarkdown.length < 100) {
      return new Response(JSON.stringify({
        success: false,
        error: "Could not scrape LinkedIn profile. The page may require login or be restricted.",
        profile_url: profileUrl,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse posts
    const discovered = parsePostsFromMarkdown(combinedMarkdown, profileUrl);
    console.log(`[discover] Parsed ${discovered.length} candidate posts`);

    if (discovered.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        discovered: 0,
        inserted: 0,
        duplicates: 0,
        message: "Scrape succeeded but no post content could be extracted. LinkedIn may require authentication to view posts.",
        profile_url: profileUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing posts for dedup
    const { data: existingPosts } = await adminClient
      .from("linkedin_posts")
      .select("linkedin_post_id, post_text")
      .eq("user_id", user.id);

    const existingTexts = new Set((existingPosts || []).map((p: any) => p.post_text?.slice(0, 100)));
    const existingIds = new Set((existingPosts || []).map((p: any) => p.linkedin_post_id));

    let inserted = 0;
    let duplicates = 0;

    for (const post of discovered) {
      // Dedup by URL or text prefix
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
        // likely duplicate constraint
        if (insertErr.code === "23505") duplicates++;
        else console.error(`[discover] Insert error:`, insertErr);
      } else {
        inserted++;
        existingTexts.add(textKey);
      }
    }

    // Update last_synced_at on connection
    await adminClient.from("linkedin_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Log the discovery run
    await adminClient.from("sync_runs").insert({
      user_id: user.id,
      sync_type: "discovery",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_fetched: discovered.length,
      records_stored: inserted,
    });

    console.log(`[discover] Done: ${discovered.length} found, ${inserted} inserted, ${duplicates} duplicates`);

    return new Response(JSON.stringify({
      success: true,
      discovered: discovered.length,
      inserted,
      duplicates,
      profile_url: profileUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[discover] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
