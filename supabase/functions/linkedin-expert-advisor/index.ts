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

    // Fetch all data sources in parallel
    const [snapshotsRes, postsRes, entriesRes, docsRes, frameworksRes, intelligenceRes, profileRes] = await Promise.all([
      adminClient.from("influence_snapshots").select("*").eq("user_id", user.id).order("snapshot_date", { ascending: false }).limit(30),
      adminClient.from("linkedin_posts").select("post_text, theme, tone, format_type, like_count, comment_count, repost_count, engagement_score, published_at").eq("user_id", user.id).order("published_at", { ascending: false }).limit(50),
      adminClient.from("entries").select("type, content, skill_pillar, framework_tag, created_at, title, summary").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      adminClient.from("documents").select("filename, summary, file_type, created_at").eq("user_id", user.id).eq("status", "processed").limit(20),
      adminClient.from("master_frameworks").select("title, summary, tags, created_at").eq("user_id", user.id).limit(20),
      adminClient.from("learned_intelligence").select("title, intelligence_type, skill_pillars, tags, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      adminClient.from("diagnostic_profiles").select("core_practice, sector_focus, brand_pillars, level, leadership_style, north_star_goal").eq("user_id", user.id).maybeSingle(),
    ]);

    const snapshots = snapshotsRes.data || [];
    const posts = postsRes.data || [];
    const entries = entriesRes.data || [];
    const docs = docsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const intelligence = intelligenceRes.data || [];
    const profile = profileRes.data;

    const hasSnapshots = snapshots.length > 0;

    // Build snapshot analytics
    const allThemes: Record<string, number> = {};
    const allTones: Record<string, { totalScore: number; count: number }> = {};
    const allFormats: Record<string, number> = {};
    let totalPosts = 0;

    for (const snap of snapshots) {
      const themes = snap.authority_themes as string[] || [];
      themes.forEach((t: string) => { allThemes[t] = (allThemes[t] || 0) + 1; });

      const tones = snap.tone_analysis as { tone: string; score: number }[] || [];
      tones.forEach((t) => {
        if (!allTones[t.tone]) allTones[t.tone] = { totalScore: 0, count: 0 };
        allTones[t.tone].totalScore += t.score;
        allTones[t.tone].count += 1;
      });

      const formats = snap.format_breakdown as Record<string, number> || {};
      Object.entries(formats).forEach(([f, c]) => { allFormats[f] = (allFormats[f] || 0) + (c as number); });

      totalPosts += snap.post_count || 0;
    }

    // Authority evolution: compare first half vs second half of snapshots
    const mid = Math.floor(snapshots.length / 2);
    const recentSnaps = snapshots.slice(0, Math.max(mid, 1));
    const olderSnaps = snapshots.slice(mid);

    const countThemesIn = (snaps: any[]) => {
      const c: Record<string, number> = {};
      snaps.forEach(s => {
        (s.authority_themes as string[] || []).forEach((t: string) => { c[t] = (c[t] || 0) + 1; });
      });
      return c;
    };
    const recentThemes = countThemesIn(recentSnaps);
    const olderThemes = countThemesIn(olderSnaps);

    const themeEvolution = Object.keys({ ...recentThemes, ...olderThemes }).map(theme => ({
      theme,
      recent: recentThemes[theme] || 0,
      older: olderThemes[theme] || 0,
      trend: (recentThemes[theme] || 0) > (olderThemes[theme] || 0) ? "strengthening" : (recentThemes[theme] || 0) < (olderThemes[theme] || 0) ? "declining" : "stable",
    }));

    // Cross-source evidence
    const entryTopics = entries.map(e => e.skill_pillar).filter(Boolean);
    const entryTypes = entries.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const frameworkTopics = frameworks.flatMap(f => f.tags || []);
    const intelligenceTopics = intelligence.flatMap(i => i.skill_pillars || []);

    // Engagement trends from posts
    const postEngagement = posts.slice(0, 20).map(p => ({
      theme: p.theme,
      tone: p.tone,
      format: p.format_type,
      engagement: p.engagement_score,
      likes: p.like_count,
      comments: p.comment_count,
    }));

    // Build data context for AI
    const dataContext = JSON.stringify({
      snapshotCount: snapshots.length,
      hasSnapshots,
      dateRange: hasSnapshots ? {
        from: snapshots[snapshots.length - 1].snapshot_date,
        to: snapshots[0].snapshot_date,
      } : null,
      currentFollowers: hasSnapshots ? snapshots[0].followers : null,
      totalGrowth: hasSnapshots ? snapshots[0].followers - snapshots[snapshots.length - 1].followers : null,
      latestEngagement: hasSnapshots ? snapshots[0].engagement_rate : null,
      totalPostsAnalyzed: totalPosts,
      themes: Object.entries(allThemes).sort((a, b) => b[1] - a[1]).slice(0, 10),
      themeEvolution,
      tones: Object.entries(allTones).map(([tone, d]) => ({ tone, avgScore: Math.round(d.totalScore / d.count), appearances: d.count })).sort((a, b) => b.avgScore - a.avgScore),
      formats: Object.entries(allFormats).sort((a, b) => b[1] - a[1]),
      postEngagement,
      latestTrajectory: hasSnapshots ? snapshots[0].authority_trajectory : null,
      crossSourceSignals: {
        entryCount: entries.length,
        entryTypes,
        topEntryTopics: Object.entries(entryTopics.reduce((acc, t) => { acc[t as string] = (acc[t as string] || 0) + 1; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 5),
        documentCount: docs.length,
        documentSummaries: docs.slice(0, 5).map(d => d.summary).filter(Boolean),
        frameworkCount: frameworks.length,
        frameworkTopics: [...new Set(frameworkTopics)].slice(0, 10),
        intelligenceCount: intelligence.length,
        intelligenceTopics: [...new Set(intelligenceTopics)].slice(0, 10),
      },
      profile: profile ? {
        practice: profile.core_practice,
        sector: profile.sector_focus,
        pillars: profile.brand_pillars,
        level: profile.level,
        style: profile.leadership_style,
        northStar: profile.north_star_goal,
      } : null,
    });

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: `You are an elite LinkedIn Expert Agent and Strategic Authority Advisor. You analyze the user's complete knowledge ecosystem — LinkedIn analytics, captures, documents, frameworks, and learned intelligence — to produce a continuous strategic advisory.

Your role is to:
1. Detect authority evolution trends across all sources
2. Identify strategic opportunities and gaps
3. Generate evidence-backed recommendations
4. Track influence trajectory and momentum

Be specific, cite actual data points, and write in a confident advisory tone. Every insight must be grounded in real data — never fabricate. If LinkedIn snapshots are unavailable, focus on cross-source authority signals from captures, documents, and frameworks.`,
        messages: [
          {
            role: "user",
            content: `Analyze this complete knowledge ecosystem and produce a strategic advisory:\n\n${dataContext}`,
          },
        ],
        tools: [{
          name: "generate_expert_advisory",
          description: "Generate a comprehensive strategic advisory from cross-source authority analysis",
          input_schema: {
              type: "object",
              properties: {
                becomingKnownFor: {
                  type: "object",
                  properties: {
                    headline: { type: "string", description: "What they are becoming known for" },
                    evidence: { type: "array", items: { type: "string" }, description: "2-4 supporting evidence points citing specific sources" },
                  },
                  required: ["headline", "evidence"],
                  additionalProperties: false,
                },
                strongestThemes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      theme: { type: "string" },
                      strength: { type: "string", enum: ["dominant", "emerging", "nascent"] },
                      insight: { type: "string" },
                      evidenceSources: {
                        type: "object",
                        properties: {
                          linkedinPosts: { type: "number" },
                          captures: { type: "number" },
                          documents: { type: "number" },
                          frameworks: { type: "number" },
                        },
                        required: ["linkedinPosts", "captures", "documents", "frameworks"],
                        additionalProperties: false,
                      },
                      trend: { type: "string", enum: ["strengthening", "stable", "declining"] },
                    },
                    required: ["theme", "strength", "insight", "evidenceSources", "trend"],
                    additionalProperties: false,
                  },
                },
                tonePerformance: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tone: { type: "string" },
                      effectiveness: { type: "string", enum: ["high", "medium", "low"] },
                      recommendation: { type: "string" },
                      usagePercent: { type: "number", description: "Estimated usage percentage across posts" },
                    },
                    required: ["tone", "effectiveness", "recommendation", "usagePercent"],
                    additionalProperties: false,
                  },
                },
                bestFormats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      format: { type: "string" },
                      postCount: { type: "number" },
                      verdict: { type: "string" },
                    },
                    required: ["format", "postCount", "verdict"],
                    additionalProperties: false,
                  },
                },
                authorityEvolution: {
                  type: "object",
                  properties: {
                    trajectory: { type: "string", enum: ["accelerating", "steady", "emerging", "pivoting"] },
                    summary: { type: "string", description: "2-3 sentence summary of how authority is evolving" },
                    themeTrends: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          theme: { type: "string" },
                          trend: { type: "string", enum: ["strengthening", "stable", "declining", "emerging"] },
                          signalDelta: { type: "string", description: "e.g. '+4 signals in last 30 days'" },
                        },
                        required: ["theme", "trend", "signalDelta"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["trajectory", "summary", "themeTrends"],
                  additionalProperties: false,
                },
                strategicOpportunities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["emerging_theme", "declining_topic", "underutilized_expertise", "high_engagement_format", "tone_gap"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      evidence: { type: "string", description: "Specific data point supporting this opportunity" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      action: { type: "string", description: "Specific recommended action" },
                    },
                    required: ["type", "title", "description", "evidence", "priority", "action"],
                    additionalProperties: false,
                  },
                  description: "3-5 strategic opportunities detected from cross-source analysis",
                },
                priorityMove: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    format: { type: "string" },
                    tone: { type: "string" },
                    reason: { type: "string", description: "Why this is the highest-impact next move" },
                    themeReinforced: { type: "string", description: "Which authority theme this reinforces" },
                  },
                  required: ["topic", "format", "tone", "reason", "themeReinforced"],
                  additionalProperties: false,
                },
                writeNext: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      topic: { type: "string" },
                      angle: { type: "string" },
                      format: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["topic", "angle", "format", "reason"],
                    additionalProperties: false,
                  },
                  description: "3-5 additional content recommendations",
                },
                weeklyBrief: {
                  type: "string",
                  description: "3-5 sentence strategic brief summarizing current authority position, momentum, and top priority. Written in second person.",
                },
              },
              required: ["becomingKnownFor", "strongestThemes", "tonePerformance", "bestFormats", "authorityEvolution", "strategicOpportunities", "priorityMove", "writeNext", "weeklyBrief"],
              additionalProperties: false,
          },
        }],
        tool_choice: { type: "tool", name: "generate_expert_advisory" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("AI gateway error:", res.status, errText);
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const toolUse = (data.content || []).find((c: any) => c.type === "tool_use");
    if (!toolUse?.input) {
      return new Response(JSON.stringify({ error: "AI returned no advisory" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const advisory = toolUse.input;

    return new Response(JSON.stringify({
      success: true,
      advisory,
      meta: {
        snapshotsUsed: snapshots.length,
        totalPostsAnalyzed: totalPosts,
        entriesAnalyzed: entries.length,
        documentsAnalyzed: docs.length,
        frameworksAnalyzed: frameworks.length,
        dateRange: hasSnapshots ? { from: snapshots[snapshots.length - 1].snapshot_date, to: snapshots[0].snapshot_date } : null,
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
