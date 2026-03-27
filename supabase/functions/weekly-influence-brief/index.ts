import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Gather data from last 7 days + previous 7 days for comparison
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];

    const [postsRes, snapshotsRes, prevSnapshotsRes, authScoreRes] = await Promise.all([
      supabase
        .from("linkedin_posts")
        .select("hook, title, post_text, theme, topic_label, framework_type, format_type, content_type, visual_style, engagement_score, like_count, comment_count, repost_count, published_at")
        .eq("user_id", user.id)
        .gte("published_at", weekAgo)
        .order("published_at", { ascending: false })
        .limit(50),
      supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
        .eq("user_id", user.id)
        .gte("snapshot_date", weekAgo)
        .order("snapshot_date", { ascending: true }),
      supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, engagement_rate")
        .eq("user_id", user.id)
        .gte("snapshot_date", twoWeeksAgo)
        .lt("snapshot_date", weekAgo)
        .order("snapshot_date", { ascending: true }),
      supabase
        .from("authority_scores")
        .select("authority_score, momentum_score, consistency_score, engagement_score, strategic_resonance_score, snapshot_date")
        .eq("user_id", user.id)
        .order("snapshot_date", { ascending: false })
        .limit(2),
    ]);

    const posts = postsRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const prevSnapshots = prevSnapshotsRes.data || [];
    const authScores = authScoreRes.data || [];

    // Build context for AI
    const thisWeekFollowers = snapshots.length > 0 ? snapshots[snapshots.length - 1].followers : 0;
    const lastWeekFollowers = prevSnapshots.length > 0 ? prevSnapshots[prevSnapshots.length - 1].followers : thisWeekFollowers;
    const followerDelta = thisWeekFollowers - lastWeekFollowers;

    const thisWeekEngRate = snapshots.length > 0
      ? snapshots.reduce((s: number, snap: any) => s + Number(snap.engagement_rate || 0), 0) / snapshots.length
      : 0;
    const prevWeekEngRate = prevSnapshots.length > 0
      ? prevSnapshots.reduce((s: number, snap: any) => s + Number(snap.engagement_rate || 0), 0) / prevSnapshots.length
      : 0;

    // Theme counts
    const themeCounts: Record<string, { count: number; totalEng: number }> = {};
    const formatCounts: Record<string, { count: number; totalEng: number }> = {};
    posts.forEach((p: any) => {
      const theme = p.theme || p.topic_label;
      const format = p.framework_type || p.format_type || p.content_type;
      if (theme) {
        if (!themeCounts[theme]) themeCounts[theme] = { count: 0, totalEng: 0 };
        themeCounts[theme].count++;
        themeCounts[theme].totalEng += Number(p.engagement_score || 0);
      }
      if (format) {
        if (!formatCounts[format]) formatCounts[format] = { count: 0, totalEng: 0 };
        formatCounts[format].count++;
        formatCounts[format].totalEng += Number(p.engagement_score || 0);
      }
    });

    const topTheme = Object.entries(themeCounts).sort((a, b) => b[1].totalEng - a[1].totalEng)[0];
    const topFormat = Object.entries(formatCounts).sort((a, b) => b[1].totalEng - a[1].totalEng)[0];
    const topPost = posts.length > 0
      ? [...posts].sort((a: any, b: any) => Number(b.engagement_score || 0) - Number(a.engagement_score || 0))[0]
      : null;

    const dataContext = `
WEEKLY INFLUENCE DATA (${weekAgo} to today):

Followers: ${thisWeekFollowers} (${followerDelta >= 0 ? "+" : ""}${followerDelta} vs last week)
Posts published this week: ${posts.length}
Avg engagement rate this week: ${thisWeekEngRate.toFixed(2)}% (vs ${prevWeekEngRate.toFixed(2)}% last week)
${authScores.length > 0 ? `Authority score: ${Math.round(Number(authScores[0].authority_score))}` : ""}
${authScores.length > 0 ? `Strategic resonance: ${Math.round(Number(authScores[0].strategic_resonance_score))}` : ""}

Top theme: ${topTheme ? `"${topTheme[0]}" (${topTheme[1].count} posts, ${(topTheme[1].totalEng / topTheme[1].count).toFixed(1)}% avg eng)` : "No theme data"}
Top format: ${topFormat ? `"${topFormat[0]}" (${topFormat[1].count} posts, ${(topFormat[1].totalEng / topFormat[1].count).toFixed(1)}% avg eng)` : "No format data"}
Best performing post: ${topPost ? `"${topPost.hook || topPost.title || topPost.post_text?.slice(0, 80) || "—"}" (${Number(topPost.engagement_score || 0).toFixed(1)}% eng, ${topPost.like_count} reactions, ${topPost.comment_count} comments)` : "None"}

All posts this week:
${posts.map((p: any, i: number) => `${i + 1}. "${p.hook || p.title || p.post_text?.slice(0, 60) || "—"}" | theme: ${p.theme || "—"} | format: ${p.framework_type || p.format_type || "—"} | eng: ${Number(p.engagement_score || 0).toFixed(1)}% | reactions: ${p.like_count} | comments: ${p.comment_count}`).join("\n")}
`.trim();

    const systemPrompt = `You are Aura, a chief strategy advisor for executive thought leaders. You produce weekly influence briefs that feel like calm, authoritative advisory memos — not growth hacking tips.

Your brief MUST follow this exact JSON structure with these 5 sections:

{
  "summary": "One sentence describing the week's authority trajectory.",
  "what_changed": [
    { "signal": "Brief factual observation", "direction": "up|down|stable", "magnitude": "strong|moderate|subtle" }
  ],
  "strategic_implication": "2-3 sentences explaining what the pattern means for the user's authority-building. Distinguish between attention, trust, authority, and compounding strategic resonance. Never give shallow advice.",
  "recommended_move": {
    "action": "One specific publishable content asset to create next",
    "reasoning": "Why this move compounds authority based on evidence",
    "format_suggestion": "carousel|article|framework|pov_post|infographic",
    "theme_suggestion": "The topic to focus on"
  },
  "confidence": 0.0 to 1.0
}

Rules:
- Never optimize for vanity metrics. Prefer authority-building over reach.
- Every recommendation must be grounded in evidence from the data.
- Use calm, composed language. Sound like a strategy partner, not a social media coach.
- "what_changed" should have 2-4 items maximum.
- If data is sparse, say so honestly and lower confidence.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate my weekly influence brief based on this data:\n\n${dataContext}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_weekly_brief",
              description: "Generate a structured weekly influence brief",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  what_changed: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        signal: { type: "string" },
                        direction: { type: "string", enum: ["up", "down", "stable"] },
                        magnitude: { type: "string", enum: ["strong", "moderate", "subtle"] },
                      },
                      required: ["signal", "direction", "magnitude"],
                    },
                  },
                  strategic_implication: { type: "string" },
                  recommended_move: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      reasoning: { type: "string" },
                      format_suggestion: { type: "string" },
                      theme_suggestion: { type: "string" },
                    },
                    required: ["action", "reasoning", "format_suggestion", "theme_suggestion"],
                  },
                  confidence: { type: "number" },
                },
                required: ["summary", "what_changed", "strategic_implication", "recommended_move", "confidence"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_weekly_brief" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let brief;
    if (toolCall?.function?.arguments) {
      brief = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      throw new Error("No structured output from AI");
    }

    // Add metadata
    brief.generated_at = new Date().toISOString();
    brief.period_start = weekAgo;
    brief.period_end = now.toISOString().split("T")[0];
    brief.posts_analyzed = posts.length;
    brief.follower_delta = followerDelta;
    brief.current_followers = thisWeekFollowers;

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-influence-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
