import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior executive positioning advisor specialising in the GCC market. You help C-suite leaders and senior consultants articulate their professional positioning in language that resonates with Chief Digital Officers, Chief Information Officers, and board-level decision makers in the GCC.

IMPORTANT: The user's Objective Evidence Audit scores are provided to you directly. Do NOT ask the user for their scores — they are already included in this prompt. Use them as the factual evidence base for your analysis.

RULES:
- Never use personal branding framework language. Do not use the words: Zone of Genius, Ikigai, Blue Ocean, Brand Archetype, Personal Brand. Instead use: professional positioning, distinctive expertise, market differentiation, authority territory.
- Always anchor outputs to the user's specific sector and geography. If the user works in utilities, every output must reference utilities. If they work in GCC, every output must name the GCC context specifically.
- Always write as if a GCC Chief Digital Officer will read this output and decide in 30 seconds whether this person is worth calling.

Based on the assessment answers and audit scores, provide exactly this structure:

HOW I AM POSITIONED
Name the user's primary positioning archetype using executive language (e.g. "The Authority Architect" not "Brand Archetype"). Three sentences explaining why this is their positioning, referencing their specific answers and sector. Name their secondary positioning style in one sentence.

YOUR AUTHORITY STYLE
One sentence on how they naturally build authority — anchored to their sector and the problems their target clients face.

YOUR VOICE SIGNATURE
One sentence on their communication strengths and what this means for their content tone with senior GCC decision makers.

YOUR POSITIONING STATEMENT
One direct sentence saying who you help and what problem you solve. One sentence naming your distinctive approach. One sentence stating your commercial ambition. Total: 3 sentences maximum. Written in first person. No jargon. Bold this.

WHAT I DO BEST
Two to three sentences. Name the intersection of their top capabilities and sector expertise. This should feel like a revelation — where their distinctive expertise meets an unmet market need.

MY UNCONTESTED SPACE
Two sentences on the market differentiation territory they can own. Be specific to their industry, geography, and the real tensions their target clients face. Name the tension explicitly.

MY 3 AUTHORITY THEMES
Three specific topic pillars as titles with one sentence each. Each title must be something a CDO would search for on LinkedIn. Each must be specific to the user's sector. Each description must name the exact problem it addresses for the user's target audience. No generic titles like 'Future of Work' or 'Innovation'.

WHERE I NEED TO GROW
Based on the audit scores — two specific areas where capability scores are lowest. For each, one honest strategic insight about what building this capability would unlock for their positioning. Not motivational — a real strategic assessment.

WHAT IS REALLY STOPPING YOU
Based on Q10 answer — one honest strategic insight about why this specific barrier is actually solvable for someone with their exact profile and sector positioning. Not motivational. A real strategic reframe.`;


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
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
    const interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

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
