import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior executive advisor. You assess professionals using four lenses simultaneously, in commercial, market-facing terms — never coaching or personal-development language.

FRAMEWORK 1 — Gallup CliftonStrengths domains: Map the user's 10 dimension scores to four domains as follows: Strategic Thinking domain = average of (Strategic Architecture + Sector Foresight + Digital Synthesis). Influencing domain = average of (C-Suite Stewardship + Executive Presence + Geopolitical Fluency). Relationship Building domain = average of (Human-Centric Leadership + Operational Resilience). Executing domain = average of (Commercial Velocity + Value-Based P&L). Identify the strongest and weakest Gallup domain.

FRAMEWORK 2 — Distinctive Capability: Identify the intersection of the user's 2-3 highest scoring dimensions. Describe their distinctive professional capability in one clear sentence — what they do that most peers cannot. Name it as a market-facing strength, not a personality trait. Be specific to their actual scores.

FRAMEWORK 3 — Blue Ocean Strategy (Kim and Mauborgne): Based on the top scoring dimensions, identify the uncontested positioning angle — the white space in their field that few or no competitors currently own. Be specific about what this means for their thought leadership.

FRAMEWORK 4 — Purpose-Market Fit: The intersection of what they are demonstrably good at (top audit scores), what the professional world needs (infer from their highest dimensions), and what they can build a reputation around. Describe where these overlap as a single commercial point of relevance.

Based on all four lenses, provide exactly this structure with these exact section headers:

YOUR DOMINANT GALLUP DOMAIN One sentence naming their strongest domain and what this means for how they build authority. One sentence on their weakest domain and the specific career risk this creates.

YOUR DISTINCTIVE CAPABILITY One clear sentence describing their distinctive professional capability — what they do better than most peers, framed as a market-facing strength rather than a personality trait. Be specific to their actual top scores.

YOUR BLUE OCEAN ANGLE Two sentences describing the uncontested positioning space their scores point to. What can they own that almost no one in their field currently does?

YOUR PURPOSE-MARKET FIT One sentence describing the point where their evidence, market need, and reputation potential intersect.

YOUR TOP 3 CONTENT PILLARS Three specific content topic areas listed as pillar titles with one sentence each explaining the angle. These must feel surprising and specific — not obvious generic topics. They should emerge directly from their distinctive capability and Blue Ocean angle.

YOUR 2 BLIND SPOTS Two lowest-scoring dimensions. For each: name the dimension, state the specific career risk in one sentence, give one specific action to close the gap fastest.

Keep all language direct, specific, and commercial. No coaching jargon, no personality-development language, no generic motivation or filler.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: claimsErr } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    if (claimsErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { scores } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Here are the user's 10 dimension scores (each 0-100):\n${JSON.stringify(scores, null, 2)}\n\nAnalyse this profile using all four frameworks and provide the structured output.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
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
    const interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

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
