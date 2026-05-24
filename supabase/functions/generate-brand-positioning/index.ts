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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supa = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: claimsErr } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    if (claimsErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let profileContext: string | undefined;
    try {
      const body = await req.json();
      profileContext = body?.profileContext;
    } catch (_) { /* empty body is allowed */ }

    // Fallback: build profileContext from the user's diagnostic profile if not provided
    if (!profileContext || typeof profileContext !== "string" || profileContext.trim().length === 0) {
      const { data: prof } = await admin
        .from("diagnostic_profiles")
        .select("first_name,last_name,firm,level,core_practice,sector_focus,north_star_goal,years_experience,brand_pillars,primary_strength,leadership_style,brand_assessment_answers")
        .eq("user_id", userId)
        .maybeSingle();
      if (!prof) {
        console.warn("generate-brand-positioning: no profile found, skipping for", userId);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_profile" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const p: any = prof;
      profileContext = [
        `Name: ${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        p.firm ? `Firm: ${p.firm}` : null,
        p.level ? `Level: ${p.level}` : null,
        p.core_practice ? `Core practice: ${p.core_practice}` : null,
        p.sector_focus ? `Sector focus: ${p.sector_focus}` : null,
        p.years_experience ? `Years experience: ${p.years_experience}` : null,
        p.north_star_goal ? `North star goal: ${p.north_star_goal}` : null,
        p.primary_strength ? `Primary strength: ${p.primary_strength}` : null,
        p.leadership_style ? `Leadership style: ${p.leadership_style}` : null,
        p.brand_pillars?.length ? `Brand pillars: ${(p.brand_pillars as string[]).join(", ")}` : null,
        p.brand_assessment_answers && Object.keys(p.brand_assessment_answers).length
          ? `Assessment answers: ${JSON.stringify(p.brand_assessment_answers)}`
          : null,
      ].filter(Boolean).join("\n");
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const aiAbort = new AbortController();
    const aiTimer = setTimeout(() => aiAbort.abort(), 30000);
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
        messages: [{ role: "user", content: `Here is the professional's complete profile:\n${profileContext}` }],
      }),
      signal: aiAbort.signal,
    }).finally(() => clearTimeout(aiTimer));

    if (!response.ok) {
      const t = await response.text();
      console.error("generate-brand-positioning AI error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const positioning = ((data.content || []).map((c: any) => c.text || "").join("") || "").trim();

    // Persist positioning into diagnostic_profiles.brand_assessment_results.positioning_statement
    if (positioning) {
      const { data: existing } = await admin
        .from("diagnostic_profiles")
        .select("brand_assessment_results")
        .eq("user_id", userId)
        .maybeSingle();
      const prev = (existing as any)?.brand_assessment_results ?? {};
      const merged = { ...prev, positioning_statement: positioning, positioning_generated_at: new Date().toISOString() };
      const { error: updErr } = await admin
        .from("diagnostic_profiles")
        .update({ brand_assessment_results: merged })
        .eq("user_id", userId);
      if (updErr) console.error("generate-brand-positioning: persist failed", updErr);
    }

    return new Response(JSON.stringify({ positioning }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-brand-positioning error:", e instanceof Error ? e.stack || e.message : e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
