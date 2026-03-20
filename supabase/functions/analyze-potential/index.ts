import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to fetch master frameworks for the user
async function fetchFrameworks(token: string | null): Promise<string> {
  if (!token) return "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return "";

    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, framework_steps, summary, tags")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!frameworks || frameworks.length === 0) return "";

    const digest = frameworks.map((f: any) => {
      const steps = (f.framework_steps || [])
        .map((s: any) => `  ${s.step_number}. ${s.step_title}: ${s.step_description}`)
        .join("\n");
      return `Framework: ${f.title}\nSummary: ${f.summary}\nSteps:\n${steps}`;
    }).join("\n\n---\n\n");

    return `\n\n=== EXPERT FRAMEWORKS (from user's vault) ===\nUse these frameworks to identify gaps, contradictions, and opportunities in the executive's brand positioning. Reference specific framework steps in your analysis.\n\n${digest}`;
  } catch (e) {
    console.error("Framework fetch error:", e);
    return "";
  }
}

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

    // Fetch frameworks
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || null;
    const frameworkContext = await fetchFrameworks(token);

    const digest = entries
      .slice(0, 10)
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
              name: "analyze_mirror",
              description: "Brand Mirror analysis of the executive's last 10 captures",
              parameters: {
                type: "object",
                properties: {
                  outsider_perception: {
                    type: "string",
                    description: "2-3 sentences on how this person sounds to an outsider reading their captures. What image do they project? What would a stranger infer about their expertise, seniority, and focus? Be honest and specific — cite patterns.",
                  },
                  contradiction: {
                    type: "string",
                    description: "One clear contradiction or tension in the executive's thinking across captures. E.g. 'You advocate for digital-first transformation but your captures skew heavily toward traditional advisory frameworks.' Be direct, cite evidence.",
                  },
                  neglected_topic: {
                    type: "string",
                    description: "One topic the executive is NOT talking about but SHOULD be for LinkedIn visibility as a Transformation Architect. Explain why this gap matters and what they risk by ignoring it.",
                  },
                  brand_alignment: {
                    type: "number",
                    description: "Score 1-10: how much these captures support the 'Transformation Architect' brand. 1 = off-brand, 10 = perfectly aligned.",
                  },
                  brand_rationale: {
                    type: "string",
                    description: "One sentence explaining the brand alignment score.",
                  },
                },
                required: ["outsider_perception", "contradiction", "neglected_topic", "brand_alignment", "brand_rationale"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_mirror" } },
        messages: [
          {
            role: "system",
            content: `You are a Senior Executive Coach and Brand Strategist, working as a peer to a Director at EY who aspires to be known as a "Transformation Architect." You are sophisticated, challenging, and neutral. You don't coddle — you clarify. You don't praise easily — you push toward potential.

Given the executive's last 10 captures (thoughts, links, voice notes), provide a Brand Mirror:

1. OUTSIDER PERCEPTION — How does this person sound to someone who doesn't know them? What brand are they actually projecting vs. what they intend? Be brutally honest.
2. CONTRADICTION — Find one tension or inconsistency in their thinking. Where do their words and focus diverge? This isn't about being wrong — it's about blind spots in narrative coherence.
3. NEGLECTED TOPIC — What should they be talking about on LinkedIn that they're completely ignoring? Think about what a Transformation Architect MUST be seen discussing: AI strategy, C-suite dynamics, industry disruption, cross-sector patterns, etc.

Also score brand alignment (1-10) against the "Transformation Architect" identity.

Tone: Sophisticated. Challenging. Neutral. You are a mirror, not a cheerleader.${frameworkContext}`,
          },
          {
            role: "user",
            content: `Analyze these last 10 captures:\n\n${digest}`,
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
    let outsider_perception = "";
    let contradiction = "";
    let neglected_topic = "";
    let brand_alignment = 0;
    let brand_rationale = "";

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        outsider_perception = args.outsider_perception || "";
        contradiction = args.contradiction || "";
        neglected_topic = args.neglected_topic || "";
        brand_alignment = args.brand_alignment || 0;
        brand_rationale = args.brand_rationale || "";
      } catch { console.error("Failed to parse mirror analysis"); }
    }

    return new Response(JSON.stringify({ outsider_perception, contradiction, neglected_topic, brand_alignment, brand_rationale }), {
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
