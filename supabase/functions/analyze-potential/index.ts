import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries } = await req.json();
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ error: "Entries are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const digest = entries
      .slice(0, 15)
      .map((e: any, i: number) => `[${i + 1}] Type: ${e.type} | Pillar: ${e.skill_pillar || "N/A"} | Summary: ${e.summary || e.content}`)
      .join("\n\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_potential",
              description: "Analyze strengths, blind spots, and brand alignment from capture history",
              parameters: {
                type: "object",
                properties: {
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 specific areas where the executive leads, with evidence from captures. Be precise — cite themes, not generalities.",
                  },
                  blind_spots: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 areas where the executive has blind spots or over-indexes. E.g. 'Focusing too much on technical details, losing the C-suite perspective.' Be direct and constructive.",
                  },
                  brand_alignment: {
                    type: "number",
                    description: "Score from 1-10: how much this week's captures support the goal of becoming a 'Transformation Architect' — someone who bridges strategy, technology, and industry to drive enterprise-scale change. 1 = off-brand, 10 = perfectly aligned.",
                  },
                  brand_rationale: {
                    type: "string",
                    description: "One sentence explaining the brand alignment score. Be honest and specific.",
                  },
                  unlock_action: {
                    type: "string",
                    description: "One high-impact action that bridges the gap between strengths and blind spots. Frame it as something a peer would challenge you to do this week.",
                  },
                },
                required: ["strengths", "blind_spots", "brand_alignment", "brand_rationale", "unlock_action"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_potential" } },
        messages: [
          {
            role: "system",
            content: `You are a Senior Executive Coach at a top-tier firm, working as a peer to a Director at EY who aspires to be known as a "Transformation Architect." You are sophisticated, challenging, and neutral. You don't coddle — you clarify. You don't praise easily — you push toward potential.

Given a series of captured thoughts, links, and voice notes, analyze:

1. STRENGTHS — Where does this person lead? What patterns show mastery? Be specific — cite the themes from captures.
2. BLIND SPOTS — Where are they over-indexing or missing the mark? Where is the thinking too narrow, too technical, or too tactical for someone aiming at the C-suite? Be direct.
3. BRAND ALIGNMENT — Score 1-10 against the "Transformation Architect" brand: someone who synthesizes strategy, technology, and industry foresight to drive enterprise-scale transformation. Explain your score.
4. UNLOCK ACTION — One concrete challenge for the coming week. Frame it as a peer would: "If I were you, I would..."

Tone: Sophisticated. Challenging. Neutral. You are not a cheerleader — you are a mirror.`,
          },
          {
            role: "user",
            content: `Analyze these recent captures:\n\n${digest}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let strengths: string[] = [];
    let blind_spots: string[] = [];
    let brand_alignment = 0;
    let brand_rationale = "";
    let unlock_action = "";

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        strengths = args.strengths || [];
        blind_spots = args.blind_spots || [];
        brand_alignment = args.brand_alignment || 0;
        brand_rationale = args.brand_rationale || "";
        unlock_action = args.unlock_action || "";
      } catch { console.error("Failed to parse potential analysis"); }
    }

    return new Response(JSON.stringify({ strengths, blind_spots, brand_alignment, brand_rationale, unlock_action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-potential error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
