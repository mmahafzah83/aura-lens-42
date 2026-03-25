import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  // Fetch profile
  let profileData: any = {};
  try {
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) profileData = await profileRes.json();
    else await profileRes.text();
  } catch (e) {
    console.error("Profile fetch failed:", e);
  }

  // Fetch posts
  let posts: any[] = [];
  let postTexts: string[] = [];

  try {
    const postsRes = await fetch(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${linkedinId})&count=50`,
      { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
    );
    if (postsRes.ok) {
      posts = (await postsRes.json()).elements || [];
    } else {
      console.log("ugcPosts API:", postsRes.status, await postsRes.text());
    }
  } catch (e) {
    console.log("ugcPosts not available:", e);
  }

  if (posts.length === 0) {
    try {
      const sharesRes = await fetch(
        `https://api.linkedin.com/v2/shares?q=owners&owners=urn%3Ali%3Aperson%3A${linkedinId}&count=50`,
        { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
      );
      if (sharesRes.ok) posts = (await sharesRes.json()).elements || [];
      else await sharesRes.text();
    } catch (e) {
      console.log("Shares API not available:", e);
    }
  }

  for (const post of posts) {
    const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text
      || post.text?.text || "";
    if (text.trim()) postTexts.push(text.trim());
  }

  // Analyze formats
  const formatCounts: Record<string, number> = {};
  for (const post of posts) {
    const mc = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareMediaCategory;
    const content = post.content;
    let format = "Text";
    if (mc === "IMAGE" || content?.contentEntities?.[0]?.entityLocation?.includes("image")) format = "Image";
    else if (mc === "VIDEO") format = "Video";
    else if (mc === "ARTICLE" || mc === "RICH") format = "Article";
    else if (mc === "CAROUSEL") format = "Carousel";
    formatCounts[format] = (formatCounts[format] || 0) + 1;
  }
  const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // AI classification
  let aiAnalysis: any = null;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (LOVABLE_API_KEY && postTexts.length > 0) {
    try {
      const samplePosts = postTexts.slice(0, 15).map((t, i) => `Post ${i + 1}: ${t.slice(0, 500)}`).join("\n\n");
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: `You are a LinkedIn content analyst. Analyze the following posts and return a JSON object with: themes (top 5 labels), tones (array of {tone, score 0-100, impact high/medium/low}), topTopic (single strongest), recommendations (3-5 strings), engagementEstimate (0-15). Return ONLY valid JSON.` },
            { role: "user", content: `Analyze these ${postTexts.length} LinkedIn posts:\n\n${samplePosts}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "classify_posts",
              description: "Classify LinkedIn posts",
              parameters: {
                type: "object",
                properties: {
                  themes: { type: "array", items: { type: "string" } },
                  tones: { type: "array", items: { type: "object", properties: { tone: { type: "string" }, score: { type: "number" }, impact: { type: "string", enum: ["high", "medium", "low"] } }, required: ["tone", "score", "impact"] } },
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
        if (toolCall?.function?.arguments) aiAnalysis = JSON.parse(toolCall.function.arguments);
      } else {
        console.error("AI classification error:", aiRes.status, await aiRes.text());
      }
    } catch (e) {
      console.error("AI classification failed:", e);
    }
  }

  // Previous snapshot for growth
  const { data: prevSnapshot } = await adminClient
    .from("influence_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentFollowers = prevSnapshot?.followers || 0;
  const themes = aiAnalysis?.themes || [];

  const snapshot = {
    user_id: userId,
    snapshot_date: new Date().toISOString().split("T")[0],
    followers: currentFollowers,
    follower_growth: 0,
    engagement_rate: aiAnalysis?.engagementEstimate || 0,
    top_topic: aiAnalysis?.topTopic || null,
    top_format: topFormat,
    authority_themes: themes,
    audience_breakdown: {},
    recommendations: aiAnalysis?.recommendations || [],
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

  return {
    success: true,
    snapshot: newSnapshot,
    summary: { postsAnalyzed: posts.length, themesDetected: themes.length, hasAIAnalysis: !!aiAnalysis, topTopic: aiAnalysis?.topTopic, topFormat },
    profile: { name: profileData.name || conn.display_name, linkedin_id: conn.linkedin_id },
    note: posts.length > 0
      ? `Synced ${posts.length} posts with AI classification.`
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
