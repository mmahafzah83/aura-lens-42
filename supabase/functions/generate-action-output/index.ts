import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw { status: 429, message: "Rate limit exceeded. Try again shortly." };
    if (res.status === 402) throw { status: 402, message: "AI credits exhausted." };
    throw new Error("AI gateway error: " + res.status);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

const SYSTEM_PROMPTS: Record<string, string> = {
  executive_memo: `You are a senior executive advisor writing an internal leadership memo for a Director-level executive at EY.

Structure the memo as:
EXECUTIVE MEMO
Date: [today]
Re: [topic]

SITUATION — 2-3 sentences on context
KEY INSIGHT — The strategic takeaway in 1-2 sentences
IMPLICATIONS — 3 bullet points on what this means
RECOMMENDED ACTION — 1 concrete next step with timeline
RISK IF DELAYED — 1 sentence on cost of inaction

Tone: Concise, authoritative, no filler. Under 200 words. No emojis.`,

  meeting_prep: `You are an executive briefing advisor preparing meeting preparation notes for a Director at EY.

Structure as:
MEETING PREPARATION BRIEF
Topic: [topic]

OBJECTIVE — What to achieve in this meeting (1 sentence)
KEY TALKING POINTS — 4-5 bullet points, each with a bold header and 1-line expansion
DATA TO REFERENCE — 2-3 specific metrics or facts to cite
POTENTIAL PUSHBACK — 2 objections to anticipate and how to counter them
CLOSING ASK — The specific commitment to request at the end

Tone: Strategic, prepared, action-oriented. Under 250 words.`,

  strategy_brief: `You are a senior strategy consultant writing a one-page strategy brief for an EY Director.

Structure as:
STRATEGY BRIEF
[Topic Title]

THE CHALLENGE — 2 sentences defining the problem
STRATEGIC CONTEXT — 3 bullet points on market/industry dynamics
THE APPROACH — A numbered 3-step framework for addressing this
EXPECTED OUTCOMES — 2-3 measurable results
NEXT STEPS — 2 immediate actions with owners and deadlines

Tone: Consulting-grade, structured, evidence-oriented. Under 300 words.`,

  presentation_slide: `You are a strategy presentation specialist creating a single slide script for an EY Director.

Structure as:
SLIDE CONTENT
Title: [Bold, 6-word max headline]

HEADLINE STATEMENT — 1 sentence that captures the strategic insight
KEY VISUAL — Describe what the visual should be (chart type, diagram, or icon layout)
3 SUPPORTING POINTS — Each as a bold label + 1-line description
SPEAKER NOTES — 3-4 sentences on what to say when presenting this slide
SOURCE LINE — A credible attribution or data reference

Format this so it can be directly used to build a presentation slide. Under 200 words.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, rationale, output_type } = await req.json();

    if (!action || !output_type) {
      return new Response(JSON.stringify({ error: "action and output_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = SYSTEM_PROMPTS[output_type];
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown output_type: ${output_type}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `Generate this output based on the following recommended action:

Action: ${action}
Rationale: ${rationale || "N/A"}

Apply this to the context of infrastructure, water, energy, or digital transformation in KSA/GCC.`;

    const content = await callAI(LOVABLE_API_KEY, systemPrompt, userPrompt);

    return new Response(JSON.stringify({ content, output_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429 || e?.status === 402) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-action-output error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
