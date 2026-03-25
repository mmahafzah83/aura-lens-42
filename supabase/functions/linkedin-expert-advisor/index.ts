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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate
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

    // Fetch all snapshots (up to 30)
    const { data: snapshots } = await adminClient
      .from("influence_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .order("snapshot_date", { ascending: false })
      .limit(30);

    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({ error: "No snapshots available. Sync LinkedIn first." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch diagnostic profile for context
    const { data: profile } = await adminClient
      .from("diagnostic_profiles")
      .select("core_practice, sector_focus, brand_pillars, level, leadership_style")
      .eq("user_id", user.id)
      .maybeSingle();

    // Build comprehensive data summary for AI
    const latest = snapshots[0];
    const oldest = snapshots[snapshots.length - 1];

    const allThemes: Record<string, number> = {};
    const allTones: Record<string, { totalScore: number; count: number; impacts: string[] }> = {};
    const allFormats: Record<string, number> = {};
    let totalPosts = 0;

    for (const snap of snapshots) {
      // Themes
      const themes = snap.authority_themes as string[] || [];
      themes.forEach((t: string) => { allThemes[t] = (allThemes[t] || 0) + 1; });

      // Tones
      const tones = snap.tone_analysis as { tone: string; score: number; impact: string }[] || [];
      tones.forEach((t) => {
        if (!allTones[t.tone]) allTones[t.tone] = { totalScore: 0, count: 0, impacts: [] };
        allTones[t.tone].totalScore += t.score;
        allTones[t.tone].count += 1;
        allTones[t.tone].impacts.push(t.impact);
      });

      // Formats
      const formats = snap.format_breakdown as Record<string, number> || {};
      Object.entries(formats).forEach(([f, c]) => { allFormats[f] = (allFormats[f] || 0) + (c as number); });

      totalPosts += snap.post_count || 0;
    }

    const sortedThemes = Object.entries(allThemes).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sortedTones = Object.entries(allTones)
      .map(([tone, d]) => ({
        tone,
        avgScore: Math.round(d.totalScore / d.count),
        appearances: d.count,
        dominantImpact: d.impacts.sort((a, b) =>
          d.impacts.filter(x => x === b).length - d.impacts.filter(x => x === a).length
        )[0],
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
    const sortedFormats = Object.entries(allFormats).sort((a, b) => b[1] - a[1]);

    const followerTrend = snapshots.map(s => ({ date: s.snapshot_date, followers: s.followers, growth: s.follower_growth })).reverse();
    const totalGrowth = latest.followers - oldest.followers;

    const dataContext = JSON.stringify({
      snapshotCount: snapshots.length,
      dateRange: { from: oldest.snapshot_date, to: latest.snapshot_date },
      currentFollowers: latest.followers,
      totalGrowth,
      latestEngagement: latest.engagement_rate,
      totalPostsAnalyzed: totalPosts,
      themes: sortedThemes,
      tones: sortedTones,
      formats: sortedFormats,
      latestTrajectory: latest.authority_trajectory,
      latestRecommendations: latest.recommendations,
      profile: profile ? {
        practice: profile.core_practice,
        sector: profile.sector_focus,
        pillars: profile.brand_pillars,
        level: profile.level,
        style: profile.leadership_style,
      } : null,
    });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an elite LinkedIn Expert Advisor for a senior professional. You analyze their real LinkedIn analytics data across multiple snapshots to produce strategic intelligence. Be specific, cite actual data points, and write in a confident advisory tone. Every insight must be grounded in the real data provided — never fabricate or estimate beyond what the data shows.`
          },
          {
            role: "user",
            content: `Analyze this LinkedIn analytics data and produce a comprehensive expert advisory:\n\n${dataContext}`
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_expert_advisory",
            description: "Generate a comprehensive LinkedIn Expert Advisory from real analytics data",
            parameters: {
              type: "object",
              properties: {
                becomingKnownFor: {
                  type: "object",
                  properties: {
                    headline: { type: "string", description: "One sentence summary of what they are becoming known for, e.g. 'Your authority is consolidating around digital transformation in utilities.'" },
                    evidence: { type: "array", items: { type: "string" }, description: "2-3 supporting evidence points from the data" },
                  },
                  required: ["headline", "evidence"],
                },
                strongestThemes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      theme: { type: "string" },
                      strength: { type: "string", enum: ["dominant", "emerging", "nascent"] },
                      insight: { type: "string", description: "One sentence strategic insight about this theme" },
                    },
                    required: ["theme", "strength", "insight"],
                  },
                  description: "Top 5 authority themes ranked by strength",
                },
                tonePerformance: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tone: { type: "string" },
                      effectiveness: { type: "string", enum: ["high", "medium", "low"] },
                      recommendation: { type: "string", description: "Brief advice on using this tone" },
                    },
                    required: ["tone", "effectiveness", "recommendation"],
                  },
                  description: "Tone analysis with performance assessment",
                },
                bestFormats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      format: { type: "string" },
                      postCount: { type: "number" },
                      verdict: { type: "string", description: "One line assessment, e.g. 'Framework-led analytical posts outperform commentary'" },
                    },
                    required: ["format", "postCount", "verdict"],
                  },
                  description: "Format performance analysis",
                },
                growthOpportunities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      opportunity: { type: "string", description: "Specific growth opportunity" },
                      rationale: { type: "string", description: "Why this matters based on the data" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["opportunity", "rationale", "priority"],
                  },
                  description: "3-5 growth opportunities",
                },
                writeNext: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      topic: { type: "string", description: "Specific topic to write about" },
                      angle: { type: "string", description: "Suggested angle or framing" },
                      format: { type: "string", description: "Recommended format (e.g. framework post, carousel, long-form)" },
                      reason: { type: "string", description: "Why this is a high-impact next post" },
                    },
                    required: ["topic", "angle", "format", "reason"],
                  },
                  description: "3-5 specific next post recommendations",
                },
                weeklyBrief: {
                  type: "string",
                  description: "A 3-5 sentence weekly LinkedIn brief summarizing current position, momentum, and top priority action. Written in second person.",
                },
              },
              required: ["becomingKnownFor", "strongestThemes", "tonePerformance", "bestFormats", "growthOpportunities", "writeNext", "weeklyBrief"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_expert_advisory" } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("AI gateway error:", res.status, errText);
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no advisory" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const advisory = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      success: true,
      advisory,
      meta: {
        snapshotsUsed: snapshots.length,
        totalPostsAnalyzed: totalPosts,
        dateRange: { from: oldest.snapshot_date, to: latest.snapshot_date },
        generatedAt: new Date().toISOString(),
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Expert advisor error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
