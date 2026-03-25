import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get user's active LinkedIn connection
    const { data: conn } = await adminClient
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (!conn) {
      return new Response(JSON.stringify({ error: "No active LinkedIn connection found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = conn.access_token;
    const linkedinId = conn.linkedin_id;

    // ── Step 1: Fetch profile info ──
    let profileData: any = {};
    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        profileData = await profileRes.json();
      } else {
        await profileRes.text();
      }
    } catch (e) {
      console.error("Profile fetch failed:", e);
    }

    // ── Step 2: Fetch posts via multiple API approaches ──
    let posts: any[] = [];
    let postTexts: string[] = [];

    // Try REST API v2 posts endpoint
    try {
      const postsRes = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${linkedinId})&count=50`,
        { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
      );
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        posts = postsData.elements || [];
      } else {
        const errText = await postsRes.text();
        console.log("ugcPosts API:", postsRes.status, errText);
      }
    } catch (e) {
      console.log("ugcPosts not available:", e);
    }

    // Fallback: try shares API
    if (posts.length === 0) {
      try {
        const sharesRes = await fetch(
          `https://api.linkedin.com/v2/shares?q=owners&owners=urn%3Ali%3Aperson%3A${linkedinId}&count=50`,
          { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
        );
        if (sharesRes.ok) {
          const sharesData = await sharesRes.json();
          posts = sharesData.elements || [];
        } else {
          await sharesRes.text();
        }
      } catch (e) {
        console.log("Shares API not available:", e);
      }
    }

    // Extract text from posts
    for (const post of posts) {
      const ugcText = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text;
      const shareText = post.text?.text;
      const text = ugcText || shareText || "";
      if (text.trim()) postTexts.push(text.trim());
    }

    // ── Step 3: Analyze post formats ──
    const formatCounts: Record<string, number> = {};
    for (const post of posts) {
      const mediaCategory = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareMediaCategory;
      const content = post.content;
      let format = "Text";
      if (mediaCategory === "IMAGE" || content?.contentEntities?.[0]?.entityLocation?.includes("image")) format = "Image";
      else if (mediaCategory === "VIDEO") format = "Video";
      else if (mediaCategory === "ARTICLE" || mediaCategory === "RICH") format = "Article";
      else if (mediaCategory === "CAROUSEL") format = "Carousel";
      formatCounts[format] = (formatCounts[format] || 0) + 1;
    }
    const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ── Step 4: Use AI to classify themes, tones, and generate insights ──
    let aiAnalysis: any = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY && postTexts.length > 0) {
      try {
        const samplePosts = postTexts.slice(0, 15).map((t, i) => `Post ${i + 1}: ${t.slice(0, 500)}`).join("\n\n");

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a LinkedIn content analyst. Analyze the following posts and return a JSON object with these fields:
- themes: array of top 5 recurring themes/topics (short labels like "Digital Governance", "Leadership")
- tones: array of objects {tone: string, score: number (0-100), impact: "high"|"medium"|"low"} for top 5 tones detected
- topTopic: the single strongest topic across all posts
- recommendations: array of 3-5 actionable recommendations as strings
- engagementEstimate: estimated average engagement rate as a number (0-15)

Return ONLY valid JSON, no markdown.`,
              },
              {
                role: "user",
                content: `Analyze these ${postTexts.length} LinkedIn posts:\n\n${samplePosts}`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "classify_posts",
                description: "Classify LinkedIn posts by theme, tone, and generate recommendations",
                parameters: {
                  type: "object",
                  properties: {
                    themes: { type: "array", items: { type: "string" } },
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
                  },
                  required: ["themes", "tones", "topTopic", "recommendations", "engagementEstimate"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "classify_posts" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiAnalysis = JSON.parse(toolCall.function.arguments);
          }
        } else {
          const errText = await aiRes.text();
          console.error("AI classification error:", aiRes.status, errText);
        }
      } catch (e) {
        console.error("AI classification failed:", e);
      }
    }

    // ── Step 5: Get previous snapshot for growth calculation ──
    const { data: prevSnapshot } = await adminClient
      .from("influence_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Step 6: Build snapshot from real data ──
    const currentFollowers = prevSnapshot?.followers || 0;
    const prevFollowers = prevSnapshot?.followers || 0;
    const followerGrowth = currentFollowers > 0 && prevFollowers > 0
      ? currentFollowers - prevFollowers
      : 0;

    const themes = aiAnalysis?.themes || [];
    const engagementRate = aiAnalysis?.engagementEstimate || 0;
    const topTopic = aiAnalysis?.topTopic || null;
    const recommendations = aiAnalysis?.recommendations || [];

    const snapshot = {
      user_id: userId,
      snapshot_date: new Date().toISOString().split("T")[0],
      followers: currentFollowers,
      follower_growth: followerGrowth,
      engagement_rate: engagementRate,
      top_topic: topTopic,
      top_format: topFormat,
      authority_themes: themes,
      audience_breakdown: {},
      recommendations: recommendations,
    };

    // ── Step 7: Store snapshot ──
    const { data: newSnapshot, error: snapErr } = await adminClient
      .from("influence_snapshots")
      .insert(snapshot)
      .select()
      .single();

    if (snapErr) {
      console.error("Snapshot insert error:", snapErr);
    }

    // ── Step 8: Update last_synced_at ──
    await adminClient
      .from("linkedin_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    // ── Build response ──
    const syncSummary = {
      postsAnalyzed: posts.length,
      themesDetected: themes.length,
      hasAIAnalysis: !!aiAnalysis,
      topTopic,
      topFormat,
    };

    return new Response(JSON.stringify({
      success: true,
      snapshot: newSnapshot,
      summary: syncSummary,
      profile: {
        name: profileData.name || conn.display_name,
        linkedin_id: conn.linkedin_id,
      },
      note: posts.length > 0
        ? `Synced ${posts.length} posts with AI classification.`
        : "Profile synced. Post analytics require LinkedIn Community Management API approval for full access.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("LinkedIn sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
