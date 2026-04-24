import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior executive positioning advisor specialising in the GCC market. Based on the professional profile provided, write a positioning statement of exactly 3 sentences following this exact structure:

Sentence 1 — Name the specific problem the user's clients face. Not the solution. The problem. Make it specific enough that a CDO reading it thinks 'that is my exact situation right now.' Include a concrete consequence — time, money, or credibility lost.

RULE FOR CONSEQUENCES: Consequences must be hard and commercial, not soft. Never use "eroding stakeholder trust" or "loss of confidence" as consequences. Always use measurable business consequences: delayed program timelines, ROI at risk, board credibility, Vision 2030 commitments at stake, budget overruns. The consequence must be something a CDO reports upward to their board.

Sentence 2 — State the user's distinctive approach in one concrete sentence. The approach must be something another consultant could not claim. It must reference the user's proprietary frameworks, sector experience, or specific methodology if they have one.

RULE FOR SENTENCE 2 OUTCOME: The outcome in sentence 2 must be concrete and operational, not abstract. Never end sentence 2 with "transformation" or "change" alone. Always finish with what the organisation looks like after the work is done. Example endings: "moving from fragmented pilots to integrated operational platforms", "closing the gap between boardroom vision and control room reality", "turning technology investment into measurable operational performance."

Sentence 3 — State the commercial ambition or proof point. A specific number, a specific title, or a specific market position. Never use vague terms like 'leading advisor' without a qualifier.

RULE FOR VERB USAGE: Never use the phrase "I leverage." Replace with direct action verbs: "I deploy", "I use", "My approach is built on", "I apply". Scan the entire output for the word "leverage" and replace every instance with a direct action verb before returning it.

Example of correct output for a GCC utility transformation advisor: 'GCC utility leaders are spending $40M+ on digital platforms and getting pilot purgatory — technology that works in demos and fails in the control room. I build the governance architecture that closes that gap, using the IT4B framework and Roman Riding model I developed specifically for the GCC infrastructure context — moving from fragmented pilots to integrated operational platforms. My goal is to build the $10M EY utility practice that makes this methodology the standard across the region.'

This example shows the structure — do not copy the content. Generate fresh content from the user's actual profile and assessment answers every time.

Written in first person. No jargon. No filler phrases like 'passionate about' or 'dedicated to'. Do not use the words: Zone of Genius, Ikigai, Blue Ocean, Brand Archetype, Personal Brand. Write as if a GCC Chief Digital Officer will read this and decide in 30 seconds whether this person is worth calling. Maximum 80 words. Return ONLY the paragraph — no headers, no labels, no quotes.`;

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
    const { data: claimsData, error: claimsErr } = await supa.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { profileContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
          { role: "user", content: `Here is the professional's complete profile:\n${profileContext}` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const positioning = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ positioning }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-brand-positioning error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
