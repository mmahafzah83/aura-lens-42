import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRAMEWORK_PROMPTS: Record<string, string> = {
  hook_insight_question: "Structure this content using the Hook → Insight → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  slap: "Structure this content using the SLAP (Stop, Look, Act, Purchase) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  bab: "Structure this content using the BAB (Before, After, Bridge) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  pas: "Structure this content using the PAS (Problem, Agitate, Solution) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  wwh: "Structure this content using the WWH (What, Why, How) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  chef: "Structure this content using the CHEF (Curate, Heat, Enhance, Feed) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  story_lesson_question: "Structure this content using the Story → Lesson → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
};

const ARABIC_VOICE_PROMPT = `اكتب هذا المنشور باللغة العربية الفصحى المعاصرة كما يكتبها متخصص خليجي رفيع المستوى — وليس كترجمة من الإنجليزية.

القواعد:

جمل قصيرة. أحياناً جملة واحدة في كل سطر.

خاطب قارئاً واحداً مباشرة. استخدم 'أنت' و'نحن'.

ابدأ بتوتر يشعر به القارئ الآن — ليس بحقيقة مثيرة للجدل.

ضع أسئلة في منتصف المنشور وليس فقط في النهاية.

استخدم إطار BAB أو PAS ما لم يُحدد إطار آخر.

أنهِ بسؤال واحد قصير يجيب عليه زميل حقيقي.

لا تستخدم مصطلحات الشركات. لا تستخدم أسلوباً رسمياً أو بيروقراطياً.

اكتب كما تتكلم — بوضوح، ومباشرة، وبإنسانية.`;

function buildVoiceContext(voiceProfile: any): string {
  if (!voiceProfile) return "No voice profile set — use analytical, calm authority tone.";
  return `
VOICE PROFILE — Write in this voice: ${voiceProfile.tone || "analytical, calm authority"}.
Use these structural patterns: ${JSON.stringify(voiceProfile.preferred_structures || [])}.
Mirror vocabulary from these examples: ${(voiceProfile.example_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 500)).filter(Boolean).join("\n---\n")}
Admired voice references: ${(voiceProfile.admired_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 300)).filter(Boolean).join("\n---\n")}
Vocabulary notes: ${typeof voiceProfile.vocabulary_preferences === "object" ? (voiceProfile.vocabulary_preferences as any)?.notes || "" : ""}
Avoid patterns not present in the user's examples. Match their sentence length, paragraph density, and rhetorical style.
`;
}

function buildIdentityContext(profile: any): string {
  if (!profile) return "";
  const brandResults = profile.brand_assessment_results as any;
  const auditInterp = profile.audit_interpretation as any;

  if (brandResults && brandResults.primary_archetype) {
    const zoneOfGenius = typeof auditInterp === "string"
      ? (auditInterp.match(/zone of genius[:\s]*([^\n]+)/i)?.[1] || "")
      : (auditInterp?.zone_of_genius || "");
    const pillars = brandResults.content_pillars
      ? (Array.isArray(brandResults.content_pillars) ? brandResults.content_pillars.join(", ") : brandResults.content_pillars)
      : "";

    return `
IDENTITY CONTEXT — always apply this to every piece of content you generate:
The user's brand archetype is ${brandResults.primary_archetype}. Their positioning statement is ${brandResults.positioning_statement || "not yet defined"}. Their Zone of Genius is ${zoneOfGenius || "not yet identified"}. Their top content pillars are ${pillars || "not yet defined"}. Their role is ${profile.level || "strategy professional"} in ${profile.sector_focus || "their field"} targeting ${profile.north_star_goal || "thought leadership"}.
Every piece of content must: (1) Sound like their archetype — if they are The Expert, write with rigour and depth. If they are The Challenger, write with a contrarian edge. If they are The Visionary, write with forward-looking perspective. (2) Reinforce their positioning statement — content should always move the reader toward seeing the user through the lens of their positioning. (3) Stay within or adjacent to their content pillars — do not generate content on topics unrelated to their pillars without explicit user request.
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
  }

  return `
IDENTITY:
- Role: ${profile.level || "strategy professional"}
- Sector: ${profile.sector_focus || "general"}
- North Star: ${profile.north_star_goal || "thought leadership"}
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
}

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

    // Load voice profile and diagnostic profile in parallel
    const [voiceRes, profileRes] = await Promise.all([
      supabase.from("authority_voice_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("diagnostic_profiles")
        .select("identity_intelligence, brand_pillars, core_practice, sector_focus, north_star_goal, level, audit_interpretation, brand_assessment_results")
        .eq("user_id", user.id).maybeSingle(),
    ]);

    const voiceProfile = voiceRes.data;
    const profile = profileRes.data;
    const identityContext = buildIdentityContext(profile);

    if (action === "generate_content") {
      const { content_type, topic, context, language, framework, extra_instruction } = params;

      const formatInstructions: Record<string, string> = {
        post: `Write a LinkedIn post (scroll-stopping hook → insight → framework/key points → closing question). Short paragraphs, spaced lines. Mobile-readable.`,
        essay: `Write a strategic essay (800-1200 words). Introduction → context → analysis → framework → implications → conclusion.`,
        framework_summary: `Write a concise framework summary: problem it solves, when to use it, the steps, and strategic value. Under 500 words.`,
      };

      // Framework instruction
      const frameworkInstruction = framework && FRAMEWORK_PROMPTS[framework] ? `\n\n${FRAMEWORK_PROMPTS[framework]}` : "";

      // Extra instruction (e.g. for short version rewrite)
      const extraInstruction = extra_instruction ? `\n\n${extra_instruction}` : "";

      // Language + voice handling
      let voiceSection: string;
      if (language === "ar") {
        // Arabic-native prompt replaces voice section
        voiceSection = ARABIC_VOICE_PROMPT;
        // If a specific framework is selected, use it; otherwise Arabic defaults to PAS/BAB (already in ARABIC_VOICE_PROMPT)
      } else {
        voiceSection = buildVoiceContext(voiceProfile);
      }

      const hookFramework = `You are writing for a senior GCC transformation leader. Always open with one of these two hook types:

1. Contrarian truth: Challenge what the industry believes in one sentence under 20 words.
2. Specific tension: Name a contradiction the reader lives with daily. Be specific to GCC, utilities, or digital transformation context.

Never open with 'I am excited', 'In today's world', or a generic statistic. Structure: Hook (1-2 lines) → Re-hook (1 sentence deepening tension) → Insight (3-5 non-obvious points) → Close (specific question, not 'what do you think?'). Write in short paragraphs. One idea per line. No dense blocks.`;

      const langLabel = language === "ar"
        ? `اكتب المنشور بالكامل باللغة العربية. لا تستخدم أي كلمة إنجليزية.`
        : `Write in English.`;

      const systemPrompt = `You are a world-class thought leadership ghostwriter for senior strategy consultants.

${hookFramework}

${voiceSection}
${identityContext}

${formatInstructions[content_type] || formatInstructions.post}
${langLabel}
${frameworkInstruction}
${extraInstruction}

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
      const voiceContext = buildVoiceContext(voiceProfile);

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
