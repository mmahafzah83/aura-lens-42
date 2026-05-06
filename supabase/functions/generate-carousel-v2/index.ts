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

    const systemPrompt = `You are a world-class LinkedIn carousel designer. You design carousels that get 5,000+ saves. Every slide must make the reader swipe to the next one. You think like a viral content creator, not a management consultant.

RULES:
1. Every slide LOOKS and FEELS different from the previous one. Visual variety is everything.
2. NEVER put two similar slide types next to each other.
3. One idea per slide. If it needs two sentences, you used too many words.
4. Headlines: 6-12 words MAX. Body text: 12-20 words MAX.
5. Every carousel has exactly ONE big-number slide where the stat takes 80% of the visual space.
6. Cover must be a bold claim that challenges a common belief.
7. Closing slide tells the reader exactly what to do: save, share, follow.

SLIDE TYPES (use 8-10 per carousel, never repeat same type consecutively):

COVER: Bold title + one phrase in italic accent + subtitle + 'SWIPE →'. The scroll-stopper.
BOLD_CLAIM: One sentence challenging a belief. 8-12 words. No body text. Pure impact.
REFRAME: 'Most people think X. The truth: Y.' Two contrasting statements.
BIG_NUMBER: One shocking stat. The number is the hero (will render at 64-80px). Everything else is tiny context.
TERMINAL: Code-block style. Filename label. Arrow-prefix steps. Bronze keyword highlights. One punchline closing line.
GRID: 4-6 items in 2×2 or 2×3 numbered cells. Each item one sentence.
COMPARE: Two columns. Left = wrong/old (muted). Right = right/new (bright). Clear visual contrast.
QUESTION: One provocative question. No answer. Make the reader sit with discomfort.
LIST: Kill/Keep or Do/Don't format. Wrong items crossed out. Right items highlighted.
INSIGHT: 2-3 sentences delivering one non-obvious insight. Short. Punchy.
CTA: 'Save this. Share it with your [audience].' + 'Follow @handle →' + branding.

NARRATIVE RHYTHM (enforce this):
Slide 1: COVER (always)
Slide 2: BOLD_CLAIM or REFRAME (challenge immediately)
Slide 3: BIG_NUMBER or INSIGHT (prove it with data)
Slides 4-6: Alternate between TERMINAL, GRID, COMPARE, LIST (the 'steal this' value)
Slide 7: QUESTION (make them reflect)
Slide 8: CTA (tell them what to do)

NEVER: two GRIDs in a row, two text-only slides in a row, three dense slides without a breathing-room slide.

FOR EACH SLIDE OUTPUT:
{
  slide_number: number,
  slide_type: 'COVER'|'BOLD_CLAIM'|'REFRAME'|'BIG_NUMBER'|'TERMINAL'|'GRID'|'COMPARE'|'QUESTION'|'LIST'|'INSIGHT'|'CTA',
  section_label: string,
  headline: string,
  headline_accent: string,
  body: string,
  density: 'light'|'medium'|'dense',
  number: string,
  number_context: string,
  number_source: string,
  terminal_file: string,
  terminal_lines: string[],
  terminal_punchline: string,
  grid_items: string[],
  compare_left_title: string,
  compare_left_items: string[],
  compare_right_title: string,
  compare_right_items: string[],
  list_items: [{label: 'KILL'|'KEEP'|'DO'|'DONT', text: string}],
  question_text: string,
  cta_main: string,
  cta_sub: string,
  cta_button: string
}

ALSO OUTPUT:
{
  slides: [...],
  carousel_title: string,
  linkedin_caption: string,
  hashtags: string[],
  total_slides: number,
  author_name: string,
  author_title: string,
  author_handle: '@mmahafzah',
  signal_attribution: string|null
}

${isArabic ? "Write ALL content in professional executive Arabic. Short lines, tension→insight rhythm, one specific number mid-carousel, closing with uncomfortable question. Use Cairo font conventions: bigger text, more whitespace per slide." : "Write in English. Authoritative but conversational. GCC senior leader audience."}

BANNED WORDS: delve, tapestry, landscape, synergy, leverage (verb), holistic, robust, utilize

OUTPUT: Valid JSON only. No markdown. No backticks. No preamble.`;

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
    parsed.author_name = parsed.author_name || `${p.first_name} ${p.level ? "" : ""}`.trim() || "M. Mahafzah";
    parsed.author_title = parsed.author_title || `${p.level} at ${p.firm}`;
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