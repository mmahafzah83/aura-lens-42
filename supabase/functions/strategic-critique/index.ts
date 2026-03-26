import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Not authenticated");

    // Gather intelligence from all layers
    const [signalsRes, insightsRes, frameworksRes, contentRes, snapshotRes, profileRes, entriesRes] = await Promise.all([
      supabase.from("strategic_signals").select("signal_title, explanation, confidence, supporting_evidence_ids, theme_tags, strategic_implications").eq("status", "active").order("confidence", { ascending: false }).limit(10),
      supabase.from("learned_intelligence").select("title, content, intelligence_type, skill_pillars, tags, created_at").order("created_at", { ascending: false }).limit(15),
      supabase.from("master_frameworks").select("title, summary, tags, created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("framework_activations").select("title, output_type, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("influence_snapshots").select("followers, engagement_rate, top_topic, authority_themes, recommendations, follower_growth").order("snapshot_date", { ascending: false }).limit(2),
      supabase.from("diagnostic_profiles").select("brand_pillars, north_star_goal, sector_focus, core_practice, identity_intelligence").eq("user_id", user.id).maybeSingle(),
      supabase.from("entries").select("title, type, skill_pillar, created_at").order("created_at", { ascending: false }).limit(20),
    ]);

    const signals = signalsRes.data || [];
    const insights = insightsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const content = contentRes.data || [];
    const snapshots = snapshotRes.data || [];
    const profile = profileRes.data;
    const entries = entriesRes.data || [];

    if (signals.length === 0 && insights.length === 0 && entries.length < 3) {
      return new Response(JSON.stringify({
        critique: null,
        reason: "Insufficient data for strategic critique"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build comprehensive context
    const parts: string[] = [];

    if (profile) {
      const identity = (profile.identity_intelligence || {}) as any;
      parts.push(`USER IDENTITY: Goal: ${profile.north_star_goal || "N/A"}, Sector: ${profile.sector_focus || "N/A"}, Practice: ${profile.core_practice || "N/A"}, Brand Pillars: ${(profile.brand_pillars || []).join(", ")}, Authority Themes: ${(identity.authority_themes || []).map((t: any) => t.theme || t).join(", ")}`);
    }

    if (signals.length > 0) {
      parts.push(`ACTIVE SIGNALS (${signals.length}):\n${signals.map((s: any, i: number) => `${i + 1}. "${s.signal_title}" (${Math.round(s.confidence * 100)}% confidence)\n   Explanation: ${s.explanation?.slice(0, 200)}\n   Themes: ${(s.theme_tags || []).join(", ")}\n   Implications: ${s.strategic_implications?.slice(0, 200)}`).join("\n")}`);
    }

    if (insights.length > 0) {
      parts.push(`INSIGHTS (${insights.length}):\n${insights.slice(0, 8).map((ins: any, i: number) => `${i + 1}. "${ins.title}" [${ins.intelligence_type}] — ${ins.content?.slice(0, 150)}`).join("\n")}`);
    }

    if (frameworks.length > 0) {
      parts.push(`FRAMEWORKS (${frameworks.length}):\n${frameworks.map((f: any) => `- "${f.title}": ${f.summary?.slice(0, 120) || "No summary"}`).join("\n")}`);
    }

    if (content.length > 0) {
      parts.push(`AUTHORITY CONTENT (${content.length} pieces):\n${content.map((c: any) => `- "${c.title}" [${c.output_type}] ${c.created_at?.slice(0, 10)}`).join("\n")}`);
    }

    if (snapshots.length > 0) {
      const s = snapshots[0] as any;
      parts.push(`AUDIENCE: ${s.followers} followers, ${s.engagement_rate}% engagement, Growth: ${s.follower_growth}, Top topic: ${s.top_topic || "N/A"}`);
    }

    // Recent capture themes for drift detection
    if (entries.length > 0) {
      const recentPillars = entries.slice(0, 10).map((e: any) => e.skill_pillar).filter(Boolean);
      const pillarCounts: Record<string, number> = {};
      recentPillars.forEach((p: string) => { pillarCounts[p] = (pillarCounts[p] || 0) + 1; });
      parts.push(`RECENT CAPTURE THEMES: ${Object.entries(pillarCounts).map(([k, v]) => `${k}(${v})`).join(", ")}`);
    }

    const contextStr = parts.join("\n\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are Aura, a senior strategic advisor and thinking companion for an executive building thought leadership authority. You observe patterns across signals, insights, frameworks, content, and audience data.

Your role is to provide a Strategic Critique — a thoughtful, analytical review of the user's strategic positioning and thinking.

You should behave like a trusted consulting partner reviewing ideas — analytical, curious, challenging but respectful, strategically thoughtful. Avoid generic AI language. Be specific, referencing actual signals and data.

NEVER use exclamation marks. Sound measured and authoritative.`
          },
          {
            role: "user",
            content: `Analyze the following intelligence data and produce a Strategic Critique with exactly 4 components, plus detect any alerts.

Intelligence data:
${contextStr}

Return structured output using the tool provided.`
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "strategic_critique_output",
              description: "Return a structured strategic critique with observation, synthesis, challenge, recommendation, and alerts",
              parameters: {
                type: "object",
                properties: {
                  observation: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "Pattern summary across signals and knowledge (2-3 sentences)" },
                      key_themes: { type: "array", items: { type: "string" }, description: "Top 2-3 themes detected" },
                      signal_count: { type: "integer" },
                    },
                    required: ["summary", "key_themes"],
                  },
                  synthesis: {
                    type: "object",
                    properties: {
                      insight: { type: "string", description: "Deeper strategic meaning behind the patterns (2-3 sentences)" },
                      emerging_thesis: { type: "string", description: "One-sentence thesis statement emerging from the data" },
                    },
                    required: ["insight", "emerging_thesis"],
                  },
                  challenge: {
                    type: "object",
                    properties: {
                      assumption_gap: { type: "string", description: "What assumption might the user be missing or overweighting (1-2 sentences)" },
                      question: { type: "string", description: "A thought-provoking strategic question for the user" },
                    },
                    required: ["assumption_gap", "question"],
                  },
                  recommendation: {
                    type: "object",
                    properties: {
                      action: { type: "string", description: "The single highest leverage next step" },
                      reason: { type: "string", description: "Why this is the highest leverage action" },
                      action_type: { type: "string", enum: ["develop_insight", "build_framework", "draft_content", "refine_positioning", "explore_signal"] },
                    },
                    required: ["action", "reason", "action_type"],
                  },
                  alerts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["strategic_opportunity", "idea_maturity", "pattern_detection", "authority_momentum", "strategic_drift"] },
                        title: { type: "string" },
                        message: { type: "string", description: "Short alert message (1-2 sentences)" },
                        urgency: { type: "string", enum: ["low", "medium", "high"] },
                      },
                      required: ["type", "title", "message", "urgency"],
                    },
                    description: "0-3 strategic alerts. Only generate when genuinely meaningful.",
                  },
                },
                required: ["observation", "synthesis", "challenge", "recommendation", "alerts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "strategic_critique_output" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI critique error:", aiResponse.status, errText);
      throw new Error("AI critique generation failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let critique;
    if (toolCall?.function?.arguments) {
      critique = JSON.parse(toolCall.function.arguments);
    } else {
      const raw = aiData.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      critique = JSON.parse(cleaned);
    }

    // Store high-urgency alerts as notifications
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const highAlerts = (critique.alerts || []).filter((a: any) => a.urgency === "high");
    if (highAlerts.length > 0) {
      const alertTypeMap: Record<string, string> = {
        strategic_opportunity: "opportunity",
        idea_maturity: "insight_ready",
        pattern_detection: "pattern",
        authority_momentum: "momentum",
        strategic_drift: "drift",
      };

      for (const alert of highAlerts) {
        // Check if similar notification exists in last 24h to avoid duplicates
        const { count } = await adminClient
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", alertTypeMap[alert.type] || "strategic")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if ((count || 0) === 0) {
          await adminClient.from("notifications").insert({
            user_id: user.id,
            title: alert.title,
            body: alert.message,
            type: alertTypeMap[alert.type] || "strategic",
            metadata: { alert_type: alert.type, urgency: alert.urgency },
          });
        }
      }
    }

    return new Response(JSON.stringify({ critique }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("strategic-critique error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
