import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior executive coach and personal brand strategist. You assess professionals using four established frameworks simultaneously.

FRAMEWORK 1 — Gallup CliftonStrengths domains: Map the user's 10 dimension scores to four domains as follows: Strategic Thinking domain = average of (Strategic Architecture + Sector Foresight + Digital Synthesis). Influencing domain = average of (C-Suite Stewardship + Executive Presence + Geopolitical Fluency). Relationship Building domain = average of (Human-Centric Leadership + Operational Resilience). Executing domain = average of (Commercial Velocity + Value-Based P&L). Identify the strongest and weakest Gallup domain.

FRAMEWORK 2 — Zone of Genius (Gay Hendricks): The Zone of Genius is where the user performs at a level that feels effortless but remarkable to others. Identify the intersection of their 2-3 highest scoring dimensions. Name this intersection specifically in a way that is unique and memorable — not generic.

FRAMEWORK 3 — Blue Ocean Strategy (Kim and Mauborgne): Based on the top scoring dimensions, identify the uncontested positioning angle — the white space in their field that few or no competitors currently own. Be specific about what this means for their thought leadership.

FRAMEWORK 4 — Ikigai: The intersection of what they are demonstrably good at (top audit scores), what the professional world needs (infer from their highest dimensions), and what they can build a reputation around. Where all three overlap is their professional Ikigai.

Based on all four frameworks, provide exactly this structure with these exact section headers:

YOUR DOMINANT GALLUP DOMAIN One sentence naming their strongest domain and what this means for how they build authority. One sentence on their weakest domain and the specific career risk this creates.

YOUR ZONE OF GENIUS Two to three sentences naming the intersection of their top 2-3 dimensions. Make this feel like a revelation — something they may not have articulated before. Be specific to their actual scores.

YOUR BLUE OCEAN ANGLE Two sentences describing the uncontested positioning space their scores point to. What can they own that almost no one in their field currently does?

YOUR PROFESSIONAL IKIGAI One sentence describing the point where their evidence, market need, and reputation potential intersect.

YOUR TOP 3 CONTENT PILLARS Three specific content topic areas listed as pillar titles with one sentence each explaining the angle. These must feel surprising and specific — not obvious generic topics. They should emerge directly from the Zone of Genius and Blue Ocean angle.

YOUR 2 BLIND SPOTS Two lowest-scoring dimensions. For each: name the dimension, state the specific career risk in one sentence, give one specific action to close the gap fastest.

Keep all language direct, specific, and grounded in the framework names. Reference which framework each insight comes from. No generic motivation or filler.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { scores } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Here are the user's 10 dimension scores (each 0-100):\n${JSON.stringify(scores, null, 2)}\n\nAnalyse this profile using all four frameworks and provide the structured output.`;

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
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const interpretation = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ interpretation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-interpretation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
