import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { context } = await req.json().catch(() => ({ context: "full" }));

    // Gather intelligence from all layers
    const [signalsRes, insightsRes, frameworksRes, contentRes, snapshotRes, profileRes] = await Promise.all([
      supabase.from("strategic_signals").select("signal_title, explanation, confidence, supporting_evidence_ids, theme_tags, content_opportunity, framework_opportunity").eq("status", "active").order("confidence", { ascending: false }).limit(5),
      supabase.from("learned_intelligence").select("title, content, intelligence_type, skill_pillars, tags").order("created_at", { ascending: false }).limit(10),
      supabase.from("master_frameworks").select("title, summary, tags").order("created_at", { ascending: false }).limit(5),
      supabase.from("framework_activations").select("title, output_type, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("influence_snapshots").select("followers, engagement_rate, top_topic, authority_themes, recommendations").order("snapshot_date", { ascending: false }).limit(1),
      supabase.from("diagnostic_profiles").select("brand_pillars, north_star_goal, sector_focus, core_practice").eq("user_id", user.id).maybeSingle(),
    ]);

    const signals = signalsRes.data || [];
    const insights = insightsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const content = contentRes.data || [];
    const snapshot = snapshotRes.data?.[0];
    const profile = profileRes.data;

    // Build context summary for the AI
    const contextParts: string[] = [];

    if (profile) {
      contextParts.push(`USER PROFILE: Goal: ${profile.north_star_goal || "N/A"}, Sector: ${profile.sector_focus || "N/A"}, Practice: ${profile.core_practice || "N/A"}, Brand Pillars: ${(profile.brand_pillars || []).join(", ")}`);
    }

    if (signals.length > 0) {
      contextParts.push(`TOP SIGNALS (${signals.length}):\n${signals.map((s: any, i: number) => `${i + 1}. "${s.signal_title}" (${Math.round(s.confidence * 100)}% confidence, ${s.supporting_evidence_ids?.length || 0} sources)\n   ${s.explanation}`).join("\n")}`);
    }

    if (insights.length > 0) {
      contextParts.push(`RECENT INSIGHTS (${insights.length}):\n${insights.slice(0, 5).map((ins: any, i: number) => `${i + 1}. "${ins.title}" [${ins.intelligence_type}] — ${ins.content?.slice(0, 150)}`).join("\n")}`);
    }

    if (frameworks.length > 0) {
      contextParts.push(`FRAMEWORKS (${frameworks.length}):\n${frameworks.map((f: any, i: number) => `${i + 1}. "${f.title}" — ${f.summary?.slice(0, 100) || "No summary"}`).join("\n")}`);
    }

    if (content.length > 0) {
      contextParts.push(`RECENT CONTENT (${content.length}):\n${content.map((c: any) => `- "${c.title}" [${c.output_type}]`).join("\n")}`);
    }

    if (snapshot) {
      contextParts.push(`AUDIENCE: ${snapshot.followers} followers, ${snapshot.engagement_rate}% engagement, Top topic: ${snapshot.top_topic || "N/A"}`);
      const themes = (snapshot.authority_themes || []) as any[];
      if (themes.length > 0) {
        contextParts.push(`AUTHORITY THEMES: ${themes.slice(0, 5).map((t: any) => typeof t === "string" ? t : t.theme || t.name).join(", ")}`);
      }
    }

    const contextStr = contextParts.join("\n\n");

    let systemPrompt: string;

    if (context === "strategy") {
      systemPrompt = `You are a Strategic Advisor for an executive thought leadership platform. Focus on STRATEGY recommendations: which insights to develop, which frameworks to build. Be specific and actionable.`;
    } else if (context === "authority") {
      systemPrompt = `You are a Strategic Advisor for an executive thought leadership platform. Focus on CONTENT PUBLISHING recommendations: what to publish next, which topics to expand, which formats to use. Be specific and actionable.`;
    } else if (context === "influence") {
      systemPrompt = `You are a Strategic Advisor for an executive thought leadership platform. Focus on AUDIENCE GROWTH interpretation: which themes are gaining authority, which ideas resonate, how to strengthen influence. Be specific and actionable.`;
    } else {
      systemPrompt = `You are the AI Chief Strategy Officer for an executive thought leadership platform called Aura. Synthesize ALL available intelligence to provide strategic guidance.`;
    }

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
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Based on the following intelligence data, produce exactly 3 outputs:

1. PRIORITY SIGNAL: The single most important emerging signal. Include why it matters.
2. STRATEGIC INSIGHT: What this signal means strategically. Connect to frameworks or identity themes if relevant.
3. RECOMMENDED MOVE: One clear, specific action the user should take next. Include the reason.

Intelligence data:
${contextStr}

Respond using this exact JSON structure (no markdown, no code blocks):
{"priority_signal":{"title":"...","confidence":0.0,"evidence_count":0,"explanation":"..."},"strategic_insight":{"title":"...","interpretation":"...","linked_framework":"...or null"},"recommended_move":{"action":"...","reason":"...","action_type":"draft_content|build_framework|develop_insight|explore_signal|plan_narrative"}}`
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "strategic_advisor_output",
              description: "Return structured strategic advisor recommendations",
              parameters: {
                type: "object",
                properties: {
                  priority_signal: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      confidence: { type: "number" },
                      evidence_count: { type: "integer" },
                      explanation: { type: "string" },
                    },
                    required: ["title", "confidence", "explanation"],
                  },
                  strategic_insight: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      interpretation: { type: "string" },
                      linked_framework: { type: "string" },
                    },
                    required: ["title", "interpretation"],
                  },
                  recommended_move: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      reason: { type: "string" },
                      action_type: { type: "string", enum: ["draft_content", "build_framework", "develop_insight", "explore_signal", "plan_narrative"] },
                    },
                    required: ["action", "reason", "action_type"],
                  },
                },
                required: ["priority_signal", "strategic_insight", "recommended_move"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "strategic_advisor_output" } },
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
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing the content directly
      const content2 = aiData.choices?.[0]?.message?.content || "";
      const cleaned = content2.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      result = JSON.parse(cleaned);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("strategic-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
