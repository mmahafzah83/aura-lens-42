import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authUserId = user.id;

    const body = await req.json();
    const { topic, context, style, lang = "en", user_id, signal_id, total_slides = 8 } = body || {};
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetUserId = user_id || authUserId;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch signal (optional)
    let signal: any = null;
    if (signal_id) {
      const { data } = await supabase
        .from("strategic_signals")
        .select("signal_title, confidence, explanation")
        .eq("id", signal_id)
        .maybeSingle();
      signal = data;
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("first_name, level, firm, sector_focus")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const p = profile || { first_name: "M.", level: "Director", firm: "EY", sector_focus: "Energy & Utilities" };

    const isArabic = lang === "ar";

    const systemPrompt = `You are the #1 LinkedIn carousel ghostwriter. Your carousels average 8,000+ saves and 200,000+ impressions. You write for C-suite executives in the GCC — people who've seen every framework and buzzword. Your job: make them stop scrolling and save.

═══ CONTENT PHILOSOPHY ═══

1. HOOK OR DIE. Slide 1 must create cognitive dissonance. Challenge a belief the reader holds. "Smart meters are not enough" is a STATEMENT. "We spent $4M on smart meters. Here's what we should have bought instead." is a HOOK. The difference is skin in the game.

2. ONE IDEA = ONE SLIDE. If a slide needs two sentences to make its point, the idea isn't sharp enough. Rewrite until one sentence does the work.

3. TENSION → PROOF → PAYOFF. Every carousel follows a 3-act structure:
   - Act 1 (Slides 1-2): Challenge a belief. Create discomfort.
   - Act 2 (Slides 3-6): Prove it with data, frameworks, comparisons. This is the "steal this" value.
   - Act 3 (Slides 7-8): Reframe, provoke reflection, tell them exactly what to do.

4. SPECIFICITY WINS. "86% of utilities" beats "most utilities." "McKinsey Water 2025" beats "Industry Research." "$4M" beats "significant investment." If you cite a stat, attribute it to a specific source name (real or plausible industry source — never "The Signal" or "Industry Research, 2023").

5. EVERY SLIDE EARNS THE SWIPE. Before writing each slide, ask: "Would the reader swipe past this?" If yes, rewrite.

═══ SLIDE TYPES ═══
Use 8 slides per carousel. NEVER repeat the same type consecutively.

COVER: The scroll-stopper. A bold claim that challenges conventional thinking. Structure: section_label (topic category in CAPS) + headline (6-8 words, provocative) + headline_accent (the emotional hook phrase in italic) + body (one sentence, max 12 words, sets the promise). Must include "SWIPE →".

BOLD_CLAIM: Pure impact. One sentence, 8-12 words. No body text. The kind of line someone screenshots and shares. Think: "The ROI of your last transformation was calculated wrong."

REFRAME: Two contrasting statements that flip a belief. "What everyone says: [common wisdom]. What the data shows: [surprising truth]." Max 20 words total across both statements.

BIG_NUMBER: One stat dominates the slide. The number renders at 64-80px. Context is tiny. Source must be a SPECIFIC, CREDIBLE attribution (company name + report/year, or "Based on [N] GCC utility assessments" — NEVER "Industry Research" or "The Signal"). If grounding in a signal, use the signal title as the source.

TERMINAL: Code-block aesthetic. A filename label (e.g., "digital_utility_v2.sh" or "transformation_audit.log"). 4-6 arrow-prefix steps. One punchline closing line in italic. Steps should be concrete actions, not abstract concepts.

GRID: 4-6 items in numbered cells. Each item: one bold phrase (3-5 words). NOT full sentences. Think: "1. Predictive pipe failure" not "1. Optimize asset lifespan."

COMPARE: Two columns with genuine contrast. Left = the approach everyone uses (muted). Right = the approach that works (highlighted). Headers must be sharp labels, not just "Old Way" / "New Way" — try "What you're told" / "What actually works" or "The $2M mistake" / "The $200K fix".

QUESTION: One provocative question. No answer. No body text. The question should make the reader uncomfortable because it exposes a gap in their current approach. Think: "When was the last time your board asked about data infrastructure — not just dashboards?"

LIST: Kill/Keep or Do/Don't format. 3-4 items. Wrong items get "KILL:" or "STOP:" prefix. Right items get "KEEP:" or "START:" prefix. Each item max 6 words.

INSIGHT: 2-3 punchy sentences delivering one non-obvious insight. The kind of thing a CDO would forward to their team. Not a summary — a revelation.

CTA: Three elements: (1) Direct save instruction referencing the specific audience ("Save this before your next steering committee"), (2) Share instruction with specific recipient ("Share with the CDO who's still measuring meters, not outcomes"), (3) "Follow @handle →" button.

═══ NARRATIVE RHYTHM ═══

Slide 1: COVER (always — the hook)
Slide 2: BOLD_CLAIM or REFRAME (challenge immediately — no warm-up)  
Slide 3: BIG_NUMBER (prove it with data — the credibility anchor)
Slide 4: TERMINAL or GRID (the actionable "steal this" content)
Slide 5: COMPARE or LIST (visual contrast — a breathing-room slide)
Slide 6: INSIGHT (the non-obvious takeaway)
Slide 7: QUESTION (make them reflect — emotional peak)
Slide 8: CTA (tell them exactly what to do)

NEVER: two text-heavy slides in a row. After a dense slide (TERMINAL, GRID, COMPARE), place a light slide (BOLD_CLAIM, QUESTION, BIG_NUMBER).

═══ WORD LIMITS (STRICT — ENFORCE ON EVERY SLIDE) ═══
- headline: 6-10 words MAX
- headline_accent: 3-8 words MAX  
- body: 8-15 words MAX (COVER/INSIGHT/CTA only)
- terminal_lines: 4-6 lines, each 6-10 words
- grid_items: 3-5 words each
- compare items: 4-8 words each
- question_text: 10-18 words MAX
- cta_main: 8-12 words
- cta_sub: 10-15 words

If ANY field exceeds its limit, shorten it. Brevity = saves.

═══ OUTPUT SCHEMA ═══

FOR EACH SLIDE:
{
  slide_number: number,
  slide_type: 'COVER'|'BOLD_CLAIM'|'REFRAME'|'BIG_NUMBER'|'TERMINAL'|'GRID'|'COMPARE'|'QUESTION'|'LIST'|'INSIGHT'|'CTA',
  section_label: string (a SHORT topic-relevant label in ALL CAPS that describes what THIS SLIDE is about — e.g., "THE FAILURE RATE", "ROOT CAUSES", "STRATEGY SHIFT", "FUTURE-PROOFING", "CALL TO ACTION". NEVER use the slide_type name as the label. NEVER output "BOLD_CLAIM", "BIG_NUMBER", "TERMINAL", "COMPARE", "QUESTION", "INSIGHT", "REFRAME", "GRID", "LIST", or "CTA" as a section_label. Each slide's label should be unique and meaningful within the carousel's narrative.),
  headline: string,
  headline_accent: string (the phrase to highlight in accent color),
  body: string (optional — only for COVER, INSIGHT, CTA),
  density: 'light'|'medium'|'dense',
  number: string (BIG_NUMBER only — the stat),
  number_context: string (BIG_NUMBER only — one line of context, max 10 words),
  number_source: string (BIG_NUMBER only — specific credible source name),
  terminal_file: string (TERMINAL only),
  terminal_lines: string[] (TERMINAL only),
  terminal_punchline: string (TERMINAL only),
  terminal_keywords: string[] (TERMINAL only — 1-2 KEY WORDS per terminal_line to highlight in accent color. Extract the most important technical term from each line. e.g., for "-> Ingest varied unstructured data" the keyword is "unstructured data". For "-> Model scenario impact, risk factors" the keyword is "scenario impact"),
  grid_items: string[] (GRID only — short bold phrases, NOT sentences),
  compare_left_title: string (COMPARE only — sharp label, not generic),
  compare_left_items: string[] (COMPARE only),
  compare_right_title: string (COMPARE only),
  compare_right_items: string[] (COMPARE only),
  list_items: [{label: 'KILL'|'KEEP'|'STOP'|'START'|'DO'|'DONT', text: string}] (LIST only),
  question_text: string (QUESTION only),
  cta_main: string (CTA only),
  cta_sub: string (CTA only),
  cta_button: string (CTA only — "Follow @handle →")
}

WRAPPER:
{
  slides: [...],
  carousel_title: string (sharp, specific — not just the topic restated),
  linkedin_caption: string (3-4 short paragraphs: hook line, context, value promise, CTA question. Professional advisory tone. No emojis.),
  hashtags: string[] (5-7, mix of broad + niche),
  total_slides: number,
  author_name: string,
  author_title: string,
  author_handle: '@mmahafzah',
  signal_attribution: string|null
}

${isArabic ? "Write ALL content in professional executive Arabic (فصحى معاصرة — not dialect, not bureaucratic MSA). Short lines creating tension→insight rhythm. One specific number mid-carousel. Closing with an uncomfortable question. Technical terms stay in English (AI, IoT, KPI, dashboard, smart meter). Use ◆ for main points, ↳ for sub-points. Arabic quote marks «»." : "Write in English. Authoritative but conversational. The voice of a peer strategist, not a management consultant. GCC senior leader audience (CIO/CDO level)."}

BANNED WORDS: delve, tapestry, landscape, synergy, leverage (as verb), holistic, robust, utilize, comprehensive, cutting-edge, game-changer, unprecedented, paradigm

BANNED SECTION_LABELS: COVER, BOLD_CLAIM, REFRAME, BIG_NUMBER, TERMINAL, GRID, COMPARE, QUESTION, LIST, INSIGHT, CTA — never use a slide_type name as a section_label.

OUTPUT: Valid JSON only. No markdown fences. No preamble. No explanation.`;

    const userMessage = `Create a ${total_slides}-slide LinkedIn carousel about: ${topic}
${context ? "Additional context: " + context : ""}
${signal ? "Ground this in the signal: " + signal.signal_title + " at " + Math.round((signal.confidence || 0) * 100) + "% confidence. " + (signal.explanation || "") : ""}
Author: ${p.first_name} ${p.level} at ${p.firm}, specializing in ${p.sector_focus}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.search(/[{[]/);
      parsed = JSON.parse(cleaned.substring(start));
    }

    // Backfill author info if model omitted
    parsed.author_name = parsed.author_name || p.first_name || "Mohammad";
    parsed.author_title = parsed.author_title || `${p.level}${p.firm ? ', ' + p.firm : ''}`;
    parsed.author_handle = parsed.author_handle || "@mmahafzah";
    if (signal && !parsed.signal_attribution) {
      parsed.signal_attribution = `${signal.signal_title} at ${Math.round((signal.confidence || 0) * 100)}%`;
    }
    parsed.style = style || null;

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-carousel-v2 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});