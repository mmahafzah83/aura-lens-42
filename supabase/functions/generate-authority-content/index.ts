import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action, ...params } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Load voice profile
    const { data: voiceProfile } = await supabase
      .from("authority_voice_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Load identity intelligence for authority themes
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("identity_intelligence, brand_pillars, core_practice, sector_focus, north_star_goal")
      .eq("user_id", user.id)
      .maybeSingle();

    const voiceContext = voiceProfile ? `
VOICE PROFILE:
- Tone: ${voiceProfile.tone || "analytical, calm authority"}
- Preferred Structures: ${JSON.stringify(voiceProfile.preferred_structures || [])}
- Storytelling Patterns: ${JSON.stringify(voiceProfile.storytelling_patterns || [])}
- Example Posts: ${(voiceProfile.example_posts as any[] || []).map((p: any) => p.content?.substring(0, 200)).join("\n---\n")}
- Admired Posts: ${(voiceProfile.admired_posts as any[] || []).map((p: any) => p.content?.substring(0, 200)).join("\n---\n")}
` : "No voice profile set — use analytical, calm authority tone.";

    const identityContext = profile ? `
IDENTITY:
- Practice: ${profile.core_practice || "strategy"}
- Sector: ${profile.sector_focus || "general"}
- North Star: ${profile.north_star_goal || "thought leadership"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
` : "";

    if (action === "generate_content") {
      const { content_type, topic, context, language } = params;

      const formatInstructions: Record<string, string> = {
        post: `Write a LinkedIn post (scroll-stopping hook → insight → framework/key points → closing question). Short paragraphs, spaced lines. Mobile-readable.`,
        essay: `Write a strategic essay (800-1200 words). Introduction → context → analysis → framework → implications → conclusion.`,
        framework_summary: `Write a concise framework summary: problem it solves, when to use it, the steps, and strategic value. Under 500 words.`,
      };

      const langInstructions = language === "ar"
        ? `Write in natural executive Arabic. Use rhetorical patterns like contrast (ليس...بل...), reframing (المشكلة ليست في...بل في...), insight ladders, and strategic warnings. Use business vocabulary: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة. Do NOT translate from English — write natively in Arabic.`
        : `Write in English.`;

      const systemPrompt = `You are a world-class thought leadership ghostwriter for senior strategy consultants.

${voiceContext}
${identityContext}

${formatInstructions[content_type] || formatInstructions.post}
${langInstructions}

Write with conviction. No generic statements. Every line should demonstrate strategic depth.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Topic: ${topic}\n\nContext: ${context || "Use your knowledge of the user's expertise and stored insights."}` },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("AI error:", response.status, t);
        throw new Error(`AI error: ${response.status}`);
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    if (action === "generate_narrative_plan") {
      // Gather recent signals and insights
      const [signalsRes, insightsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, explanation, theme_tags, content_opportunity, framework_opportunity").eq("status", "active").order("confidence", { ascending: false }).limit(10),
        supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars, tags").order("created_at", { ascending: false }).limit(15),
      ]);

      const signalsSummary = (signalsRes.data || []).map(s => `- ${s.signal_title}: ${s.explanation?.substring(0, 150)}`).join("\n");
      const insightsSummary = (insightsRes.data || []).map(i => `- ${i.title} (${i.intelligence_type})`).join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are a strategic content advisor for an executive thought leader. Analyze their signals and insights to suggest publishing topics. Return structured suggestions via the tool.

${voiceContext}
${identityContext}

SIGNALS:
${signalsSummary}

INSIGHTS:
${insightsSummary}`
            },
            { role: "user", content: "Generate 5 narrative suggestions for topics I should publish about. Consider my voice, authority themes, and detected signals." }
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_narratives",
              description: "Return narrative publishing suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string" },
                        angle: { type: "string", description: "Narrative angle or framing" },
                        recommended_format: { type: "string", enum: ["post", "carousel", "essay", "framework_summary"] },
                        reason: { type: "string", description: "Why this topic and format" },
                      },
                      required: ["topic", "angle", "recommended_format", "reason"],
                    }
                  }
                },
                required: ["suggestions"],
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "suggest_narratives" } },
        }),
      });

      if (!response.ok) throw new Error("AI error");
      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call");

      const { suggestions } = JSON.parse(toolCall.function.arguments);

      // Save suggestions
      const rows = suggestions.map((s: any) => ({
        user_id: user.id,
        topic: s.topic,
        angle: s.angle,
        recommended_format: s.recommended_format,
        reason: s.reason,
        status: "suggested",
      }));

      await supabase.from("narrative_suggestions").insert(rows);

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("Authority content error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
