import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function extractPostTexts(posts: any[]): string[] {
  const texts: string[] = [];
  for (const post of posts) {
    const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text
      || post.text?.text || "";
    if (text.trim()) texts.push(text.trim());
  }
  return texts;
}

function analyzeFormats(posts: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    const mc = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareMediaCategory;
    const content = post.content;
    let format = "Text";
    if (mc === "IMAGE" || content?.contentEntities?.[0]?.entityLocation?.includes("image")) format = "Image";
    else if (mc === "VIDEO") format = "Video";
    else if (mc === "ARTICLE" || mc === "RICH") format = "Article";
    else if (mc === "CAROUSEL") format = "Carousel";
    counts[format] = (counts[format] || 0) + 1;
  }
  return counts;
}

async function fetchFollowerCount(accessToken: string, linkedinId: string): Promise<number | null> {
  // Try the networkSize endpoint (available with basic profile scope)
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/networkSizes/urn:li:person:${linkedinId}?edgeType=CompanyFollowedByMember`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (typeof data.firstDegreeSize === "number") return data.firstDegreeSize;
    }
  } catch (e) {
    console.log("networkSizes not available:", e);
  }

  // Try follower statistics (requires Community Management API)
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/networkSizes/urn:li:person:${linkedinId}?edgeType=FOLLOW`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (typeof data.firstDegreeSize === "number") return data.firstDegreeSize;
    }
  } catch (e) {
    console.log("Follower count not available:", e);
  }

  return null;
}

interface AIAnalysis {
  themes: string[];
  tones: { tone: string; score: number; impact: string }[];
  topTopic: string;
  recommendations: string[];
  engagementEstimate: number;
  authorityTrajectory: string;
  writeNextSuggestions: string[];
}

async function classifyWithAI(postTexts: string[], formatBreakdown: Record<string, number>, prevSnapshot: any): Promise<AIAnalysis | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || postTexts.length === 0) return null;

  try {
    const samplePosts = postTexts.slice(0, 15).map((t, i) => `Post ${i + 1}: ${t.slice(0, 500)}`).join("\n\n");

    const contextInfo = prevSnapshot
      ? `Previous snapshot: ${prevSnapshot.followers} followers, engagement ${prevSnapshot.engagement_rate}%, themes: ${JSON.stringify(prevSnapshot.authority_themes)}`
      : "No previous snapshot data.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a LinkedIn content analyst for a senior professional. Analyze their posts and provide strategic intelligence. Context: ${contextInfo}. Format breakdown: ${JSON.stringify(formatBreakdown)}.`
          },
          { role: "user", content: `Analyze these ${postTexts.length} LinkedIn posts:\n\n${samplePosts}` },
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
                      score: { type: "number", description: "0-100 how prominent this tone is" },
                      impact: { type: "string", enum: ["high", "medium", "low"], description: "Estimated engagement impact" },
                    },
                    required: ["tone", "score", "impact"],
                  },
                  description: "Tone analysis of posts",
                },
                topTopic: { type: "string", description: "Single strongest topic" },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 strategic recommendations for growing authority",
                },
                engagementEstimate: { type: "number", description: "Estimated engagement rate 0-15%" },
                authorityTrajectory: {
                  type: "string",
                  description: "2-3 sentence assessment of authority development trajectory based on post patterns, themes, and consistency",
                },
                writeNextSuggestions: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 specific post ideas the author should write next based on their strongest themes and gaps",
                },
              },
              required: ["themes", "tones", "topTopic", "recommendations", "engagementEstimate", "authorityTrajectory", "writeNextSuggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_posts" } },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        return JSON.parse(toolCall.function.arguments) as AIAnalysis;
      }
    } else {
      console.error("AI classification error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("AI classification failed:", e);
  }
  return null;
}

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
  const [profileData, posts, realFollowers] = await Promise.all([
    fetchLinkedInProfile(accessToken),
    fetchLinkedInPosts(accessToken, linkedinId),
    fetchFollowerCount(accessToken, linkedinId),
  ]);

  const postTexts = extractPostTexts(posts);
  const formatBreakdown = analyzeFormats(posts);
  const topFormat = Object.entries(formatBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

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

  // Determine follower count: real API > previous snapshot
  const currentFollowers = realFollowers ?? prevSnapshot?.followers ?? 0;
  const prevFollowers = prevSnapshot?.followers ?? 0;
  const followerGrowth = currentFollowers - prevFollowers;

  const snapshot = {
    user_id: userId,
    snapshot_date: new Date().toISOString().split("T")[0],
    followers: currentFollowers,
    follower_growth: followerGrowth,
    engagement_rate: aiAnalysis?.engagementEstimate || 0,
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
    post_count: posts.length,
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
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", conn.id);

  const themes = aiAnalysis?.themes || [];

  return {
    success: true,
    snapshot: newSnapshot,
    summary: {
      postsAnalyzed: posts.length,
      themesDetected: themes.length,
      tonesDetected: (aiAnalysis?.tones || []).length,
      hasAIAnalysis: !!aiAnalysis,
      topTopic: aiAnalysis?.topTopic,
      topFormat,
      followers: currentFollowers,
      followerGrowth,
      hasRealFollowerCount: realFollowers !== null,
    },
    profile: { name: profileData.name || conn.display_name, linkedin_id: conn.linkedin_id },
    note: posts.length > 0
      ? `Synced ${posts.length} posts · ${themes.length} themes · ${(aiAnalysis?.tones || []).length} tones classified.`
      : "Profile synced. Post analytics require LinkedIn Community Management API approval for full access.",
  };
}

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
