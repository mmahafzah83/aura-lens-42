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
              description: "Analyze strengths and weaknesses from capture history",
              parameters: {
                type: "object",
                properties: {
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 areas where the executive leads, with evidence from the captures",
                  },
                  weaknesses: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 areas where the executive struggles or has blind spots, based on capture patterns",
                  },
                  unlock_action: {
                    type: "string",
                    description: "One high-impact action that bridges the gap between strengths and weaknesses",
                  },
                },
                required: ["strengths", "weaknesses", "unlock_action"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_potential" } },
        messages: [
          {
            role: "system",
            content: `You are a world-class executive coach analyzing an EY Director's captured thoughts, links, and voice notes. Based on patterns in their captures, identify:

1. STRENGTHS — Where do they lead? What themes recur with confidence and depth?
2. WEAKNESSES — Where are the blind spots? Which pillars are neglected or show shallow engagement?
3. UNLOCK ACTION — One high-impact action to bridge the gap.

Be specific, cite capture themes, and be brutally honest yet constructive. Think like a coach who charges $50K/session.`,
          },
          {
            role: "user",
            content: `Analyze these recent captures for strengths and weaknesses:\n\n${digest}`,
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
    let weaknesses: string[] = [];
    let unlock_action = "";

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        strengths = args.strengths || [];
        weaknesses = args.weaknesses || [];
        unlock_action = args.unlock_action || "";
      } catch { console.error("Failed to parse potential analysis"); }
    }

    return new Response(JSON.stringify({ strengths, weaknesses, unlock_action }), {
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
