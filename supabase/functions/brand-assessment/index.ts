import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a world-class personal brand strategist. You use six frameworks simultaneously to analyse and position senior professionals.

IMPORTANT: The user's Objective Evidence Audit scores are provided to you directly. Do NOT ask the user for their scores — they are already included in this prompt. Use them as the factual evidence base for your analysis.

FRAMEWORK 1 — Jungian Brand Archetypes (12 archetypes): The Expert/Sage (wisdom, depth, rigour — builds authority through knowledge), The Challenger/Rebel (disruption, contrarian thinking — builds authority by questioning norms), The Guide/Caregiver (empathy, service — builds authority by developing others), The Visionary/Magician (transformation, seeing what others cannot), The Hero (courage, overcoming challenges — builds authority through achievement), The Explorer (discovery, new frontiers), The Connector (relationships, community), The Ruler (authority, control, institutional leadership). Identify PRIMARY and SECONDARY archetypes from Q1, Q3, Q4, and Q9 answers combined with audit scores. Explain specifically why — reference the user's exact answers.

FRAMEWORK 2 — Gallup CliftonStrengths domains: Using audit scores provided, identify which of the four domains (Strategic Thinking, Influencing, Relationship Building, Executing) is dominant. Explain what this means for how the user naturally builds authority.

FRAMEWORK 3 — Dorie Clark Positioning Methodology: Generate a positioning statement in this exact format: I help [specific target client from Q5 and audit scores] achieve [specific outcome from Q2 and Q9] through [unique method from Q6 and Q8 and Zone of Genius]. Make it specific — built from their actual answers, not a template.

FRAMEWORK 4 — Zone of Genius (Gay Hendricks): Where their top 2-3 audit dimensions meet their Q3 (what feels natural) and Q2 (desired reputation). The effortless excellence space. Name this intersection in a memorable, specific way.

FRAMEWORK 5 — Blue Ocean Strategy: Based on Q6 (contrarian belief) and Q8 (market gap) combined with top audit scores — identify the uncontested positioning space. What can they own that no competitor currently does? Be specific to their field.

FRAMEWORK 6 — VIA Character Strengths: Map Q4 (communication style) and Q1 (client perception) to VIA virtue categories: Wisdom (curiosity, judgement, perspective), Courage (bravery, honesty, perseverance), Humanity (kindness, social intelligence), Justice (fairness, leadership), Temperance (prudence, self-regulation), Transcendence (meaning, hope). Identify top 2 VIA virtues and what they mean for content voice.

Based on all six frameworks, provide exactly this structure:

PRIMARY BRAND ARCHETYPE
Name the archetype. Three sentences explaining why this is their primary archetype, referencing their specific answers. Name their secondary archetype in one sentence.

YOUR GALLUP AUTHORITY STYLE
One sentence on their dominant Gallup domain and what this means for how they build authority most naturally.

YOUR VIA VOICE SIGNATURE
One sentence on their top 2 VIA virtues and what this means for their content tone.

YOUR POSITIONING STATEMENT
The complete positioning statement from Dorie Clark's methodology. Bold this.

YOUR ZONE OF GENIUS
Two to three sentences. Name the intersection memorably. This should feel like a revelation.

YOUR BLUE OCEAN TERRITORY
Two sentences on the uncontested space they can own. Be specific to their industry and field from their answers.

YOUR TOP 3 CONTENT PILLARS
Three specific topic pillars as titles with one sentence each. Must be surprising and specific — not generic. Emerge from Zone of Genius and Blue Ocean territory.

WHAT IS REALLY STOPPING YOU
Based on Q10 answer — one honest strategic insight about why this specific barrier is actually solvable for someone with their exact profile. Not motivational. A real strategic reframe.

Reference the framework name behind each insight in brackets so the user understands the basis.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { answers, auditScores } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build audit scores context for the AI
    const auditContext = typeof auditScores === "string"
      ? auditScores
      : `The user's Objective Evidence Audit scores are: ${JSON.stringify(auditScores, null, 2)}`;

    const userPrompt = `${auditContext}

Here are the user's Brand Assessment answers:
${JSON.stringify(answers, null, 2)}

Analyse this professional using all six frameworks and provide the complete brand positioning output. Use the audit scores as factual evidence — do not ask the user for them.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const interpretation = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ interpretation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brand-assessment error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
