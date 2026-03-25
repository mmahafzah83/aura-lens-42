import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── LinkedIn API helpers ── */

async function fetchLinkedInProfile(accessToken: string) {
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return await res.json();
    console.error("Profile fetch:", res.status, await res.text());
  } catch (e) {
    console.error("Profile fetch failed:", e);
  }
  return {};
}

async function fetchLinkedInPosts(accessToken: string, linkedinId: string) {
  let posts: any[] = [];

  // Try ugcPosts first
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${linkedinId})&count=50`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (res.ok) {
      posts = (await res.json()).elements || [];
    } else {
      console.log("ugcPosts API:", res.status, await res.text());
    }
  } catch (e) {
    console.log("ugcPosts not available:", e);
  }

  // Fallback to shares
  if (posts.length === 0) {
    try {
      const res = await fetch(
        `https://api.linkedin.com/v2/shares?q=owners&owners=urn%3Ali%3Aperson%3A${linkedinId}&count=50`,
        { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
      );
      if (res.ok) posts = (await res.json()).elements || [];
      else await res.text();
    } catch (e) {
      console.log("Shares API not available:", e);
    }
  }

  return posts;
}

async function fetchPostEngagement(accessToken: string, postUrn: string): Promise<{ likes: number; comments: number; reposts: number }> {
  const result = { likes: 0, comments: 0, reposts: 0 };

  // Try socialActions summary
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (res.ok) {
      const data = await res.json();
      result.likes = data.likesSummary?.totalLikes || data.numLikes || 0;
      result.comments = data.commentsSummary?.totalFirstLevelComments || data.numComments || 0;
      result.reposts = data.numShares || 0;
    } else {
      await res.text(); // consume body
    }
  } catch {
    // socialActions may not be available
  }

  return result;
}

function extractPostData(post: any): { text: string; postUrn: string; mediaType: string; publishedAt: string | null } {
  const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text
    || post.text?.text || "";

  const postUrn = post.id || post.activity || "";

  const mc = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareMediaCategory;
  const content = post.content;
  let mediaType = "text";
  if (mc === "IMAGE" || content?.contentEntities?.[0]?.entityLocation?.includes("image")) mediaType = "image";
  else if (mc === "VIDEO") mediaType = "video";
  else if (mc === "ARTICLE" || mc === "RICH") mediaType = "article";
  else if (mc === "CAROUSEL") mediaType = "carousel";

  // Extract timestamp
  let publishedAt: string | null = null;
  if (post.created?.time) {
    publishedAt = new Date(post.created.time).toISOString();
  } else if (post.createdAt) {
    publishedAt = new Date(post.createdAt).toISOString();
  }

  return { text: text.trim(), postUrn, mediaType, publishedAt };
}

function analyzeFormats(posts: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    const { mediaType } = extractPostData(post);
    const format = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
    counts[format] = (counts[format] || 0) + 1;
  }
  return counts;
}

async function fetchFollowerCount(accessToken: string, linkedinId: string): Promise<number | null> {
  for (const edgeType of ["CompanyFollowedByMember", "FOLLOW"]) {
    try {
      const res = await fetch(
        `https://api.linkedin.com/v2/networkSizes/urn:li:person:${linkedinId}?edgeType=${edgeType}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data.firstDegreeSize === "number") return data.firstDegreeSize;
      } else {
        await res.text();
      }
    } catch {
      // try next edge type
    }
  }
  return null;
}

/* ── AI Classification ── */

interface AIAnalysis {
  themes: string[];
  tones: { tone: string; score: number; impact: string }[];
  topTopic: string;
  recommendations: string[];
  engagementEstimate: number;
  authorityTrajectory: string;
  writeNextSuggestions: string[];
  postClassifications: { postIndex: number; theme: string; tone: string; format: string }[];
}

async function classifyWithAI(
  postTexts: string[],
  formatBreakdown: Record<string, number>,
  prevSnapshot: any
): Promise<AIAnalysis | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || postTexts.length === 0) return null;

  try {
    const samplePosts = postTexts.slice(0, 20).map((t, i) => `Post ${i + 1}: ${t.slice(0, 500)}`).join("\n\n");

    const contextInfo = prevSnapshot
      ? `Previous snapshot: ${prevSnapshot.followers} followers, engagement ${prevSnapshot.engagement_rate}%, themes: ${JSON.stringify(prevSnapshot.authority_themes)}`
      : "No previous snapshot data.";

    const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a LinkedIn content analyst for a senior professional. Analyze their posts and provide strategic intelligence. Context: ${contextInfo}. Format breakdown: ${JSON.stringify(formatBreakdown)}.`
          },
          { role: "user", content: `Analyze these ${postTexts.length} LinkedIn posts and classify each one:\n\n${samplePosts}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_posts",
            description: "Classify LinkedIn posts and generate strategic insights",
            parameters: {
              type: "object",
              properties: {
                themes: { type: "array", items: { type: "string" }, description: "Top 5 authority themes" },
                tones: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tone: { type: "string" },
                      score: { type: "number" },
                      impact: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["tone", "score", "impact"],
                  },
                },
                topTopic: { type: "string" },
                recommendations: { type: "array", items: { type: "string" } },
                engagementEstimate: { type: "number" },
                authorityTrajectory: { type: "string" },
                writeNextSuggestions: { type: "array", items: { type: "string" } },
                postClassifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      postIndex: { type: "number", description: "1-indexed post number" },
                      theme: { type: "string", description: "Primary theme of this post" },
                      tone: { type: "string", description: "Dominant tone (visionary, analytical, educational, operational, inspirational)" },
                      format: { type: "string", description: "Content format (insight, framework, case study, opinion, storytelling, commentary)" },
                    },
                    required: ["postIndex", "theme", "tone", "format"],
                  },
                  description: "Classification for each analyzed post",
                },
              },
              required: ["themes", "tones", "topTopic", "recommendations", "engagementEstimate", "authorityTrajectory", "writeNextSuggestions", "postClassifications"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_posts" } },
        temperature: 0.3,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
        return parsed as AIAnalysis;
      }
    } else {
      console.error("AI classification error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("AI classification failed:", e);
  }
  return null;
}

/* ── Main Sync Logic ── */

async function syncUserLinkedIn(userId: string, adminClient: any) {
  const { data: conn } = await adminClient
    .from("linkedin_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!conn) {
    return { success: false, error: "No active LinkedIn connection" };
  }

  const accessToken = conn.access_token;
  const linkedinId = conn.linkedin_id;

  // Parallel fetch: profile, posts, followers
  const [profileData, rawPosts, realFollowers] = await Promise.all([
    fetchLinkedInProfile(accessToken),
    fetchLinkedInPosts(accessToken, linkedinId),
    fetchFollowerCount(accessToken, linkedinId),
  ]);

  // Extract post data and fetch engagement metrics (batch, max 20 at a time)
  const postDataList = rawPosts.map(p => extractPostData(p));
  const postTexts = postDataList.filter(p => p.text).map(p => p.text);
  const formatBreakdown = analyzeFormats(rawPosts);
  const topFormat = Object.entries(formatBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Fetch engagement for each post (limited to 20 to avoid rate limits)
  const engagementPromises = postDataList.slice(0, 20).map(async (pd) => {
    if (!pd.postUrn) return { likes: 0, comments: 0, reposts: 0 };
    return fetchPostEngagement(accessToken, pd.postUrn);
  });
  const engagements = await Promise.all(engagementPromises);

  // Previous snapshot for growth calculation
  const { data: prevSnapshot } = await adminClient
    .from("influence_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // AI classification
  const aiAnalysis = await classifyWithAI(postTexts, formatBreakdown, prevSnapshot);

  // Store individual post records
  const now = new Date().toISOString();
  const postRecords = postDataList.slice(0, 50).map((pd, i) => {
    const engagement = engagements[i] || { likes: 0, comments: 0, reposts: 0 };
    const totalEngagement = engagement.likes + engagement.comments + engagement.reposts;
    const classification = aiAnalysis?.postClassifications?.find(c => c.postIndex === i + 1);

    return {
      user_id: userId,
      linkedin_post_id: pd.postUrn || `post-${i}-${Date.now()}`,
      post_text: pd.text.slice(0, 5000) || null,
      published_at: pd.publishedAt || null,
      like_count: engagement.likes,
      comment_count: engagement.comments,
      repost_count: engagement.reposts,
      engagement_score: totalEngagement,
      media_type: pd.mediaType,
      theme: classification?.theme || null,
      tone: classification?.tone || null,
      format_type: classification?.format || null,
      synced_at: now,
    };
  });

  // Upsert post records (on conflict: user_id + linkedin_post_id)
  if (postRecords.length > 0) {
    const { error: postsErr } = await adminClient
      .from("linkedin_posts")
      .upsert(postRecords, { onConflict: "user_id,linkedin_post_id" });
    if (postsErr) console.error("Post upsert error:", postsErr);
  }

  // Calculate engagement rate from real data
  const totalEngagementSum = engagements.reduce((s, e) => s + e.likes + e.comments + e.reposts, 0);
  const realEngagementRate = engagements.length > 0 && realFollowers
    ? Number(((totalEngagementSum / engagements.length / Math.max(realFollowers, 1)) * 100).toFixed(2))
    : aiAnalysis?.engagementEstimate || 0;

  // Determine follower count
  const currentFollowers = realFollowers ?? prevSnapshot?.followers ?? 0;
  const prevFollowers = prevSnapshot?.followers ?? 0;
  const followerGrowth = currentFollowers - prevFollowers;

  // Build theme distribution from post classifications
  const themeDistribution: Record<string, number> = {};
  const toneDistribution: Record<string, number> = {};
  if (aiAnalysis?.postClassifications) {
    for (const c of aiAnalysis.postClassifications) {
      if (c.theme) themeDistribution[c.theme] = (themeDistribution[c.theme] || 0) + 1;
      if (c.tone) toneDistribution[c.tone] = (toneDistribution[c.tone] || 0) + 1;
    }
  }

  const snapshot = {
    user_id: userId,
    snapshot_date: new Date().toISOString().split("T")[0],
    followers: currentFollowers,
    follower_growth: followerGrowth,
    engagement_rate: realEngagementRate,
    top_topic: aiAnalysis?.topTopic || null,
    top_format: topFormat,
    authority_themes: aiAnalysis?.themes || [],
    audience_breakdown: {},
    recommendations: [
      ...(aiAnalysis?.recommendations || []),
      ...(aiAnalysis?.writeNextSuggestions || []).map((s: string) => `📝 Write next: ${s}`),
    ],
    tone_analysis: aiAnalysis?.tones || [],
    format_breakdown: formatBreakdown,
    post_count: rawPosts.length,
    authority_trajectory: aiAnalysis?.authorityTrajectory || null,
  };

  const { data: newSnapshot, error: snapErr } = await adminClient
    .from("influence_snapshots")
    .insert(snapshot)
    .select()
    .single();

  if (snapErr) console.error("Snapshot insert error:", snapErr);

  await adminClient
    .from("linkedin_connections")
    .update({ last_synced_at: now })
    .eq("id", conn.id);

  const themes = aiAnalysis?.themes || [];

  return {
    success: true,
    snapshot: newSnapshot,
    summary: {
      postsAnalyzed: rawPosts.length,
      postsStored: postRecords.length,
      themesDetected: themes.length,
      tonesDetected: (aiAnalysis?.tones || []).length,
      hasAIAnalysis: !!aiAnalysis,
      topTopic: aiAnalysis?.topTopic,
      topFormat,
      followers: currentFollowers,
      followerGrowth,
      engagementRate: realEngagementRate,
      hasRealFollowerCount: realFollowers !== null,
      themeDistribution,
      toneDistribution,
    },
    profile: { name: profileData.name || conn.display_name, linkedin_id: conn.linkedin_id },
    note: rawPosts.length > 0
      ? `Synced ${rawPosts.length} posts · ${postRecords.length} stored · ${themes.length} themes · ${(aiAnalysis?.tones || []).length} tones classified.`
      : "Profile synced. Post analytics require LinkedIn Community Management API approval for full access.",
  };
}

/* ── HTTP Handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const isScheduled = body?.scheduled === true;

    if (isScheduled) {
      const { data: allConns } = await adminClient
        .from("linkedin_connections")
        .select("user_id")
        .eq("status", "active");

      if (!allConns || allConns.length === 0) {
        return new Response(JSON.stringify({ success: true, note: "No active connections to sync" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];
      for (const c of allConns) {
        try {
          const result = await syncUserLinkedIn(c.user_id, adminClient);
          results.push({ user_id: c.user_id, ...result });
        } catch (e: any) {
          results.push({ user_id: c.user_id, error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, scheduled: true, synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manual: authenticate user
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

    const result = await syncUserLinkedIn(user.id, adminClient);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("LinkedIn sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
