import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, context, style, lang } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isArabic = lang === "ar";

    const styleGuides: Record<string, string> = {
      minimal_creator: "Minimal Creator Style: Warm cream/off-white background (#FDF6EC), bold black typography, subtle tan accents. Clean, airy, premium feel. Think top LinkedIn creators.",
      dark_creator: "Dark Creator Style: Pure black background (#0A0A0A), bright yellow (#FFD700) highlights and accents, white text. High contrast, bold, dramatic. Electric energy.",
      corporate_gradient: "Corporate Gradient Style: Dark navy-to-charcoal gradient background, accent color line (teal or gold). Professional depth, subtle texture. Executive authority.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.minimal_creator;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation - it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية
Write concise, confident, executive Arabic. Right-to-left optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const systemPrompt = `You are Aura's Elite LinkedIn Carousel Design Engine. You generate carousels optimized for mobile consumption that follow top-creator design principles.

CANVAS: 1080 × 1350 (LinkedIn portrait carousel format).
SAFE MARGIN: 120px on all sides.

CONTENT STRUCTURE — exactly 10 slides following this narrative arc:

Slide 1 — HOOK
Bold, curiosity-driven statement that stops the scroll. Maximum 6 words headline.
Purpose: Create irresistible curiosity.

Slide 2 — PROBLEM_1
Explain the problem part 1. Maximum 8 words headline.
Purpose: Surface the pain or misconception.

Slide 3 — PROBLEM_2
Explain the problem part 2 or deepen it. Maximum 8 words headline.
Purpose: Build tension and relevance.

Slide 4 — INSIGHT_1
Reveal the key insight. Maximum 8 words headline.
Purpose: The "aha" reframing moment.

Slide 5 — INSIGHT_2
Expand or sharpen the insight. Maximum 8 words headline.
Purpose: Lock in the new mental model.

Slide 6 — FRAMEWORK_1
First lesson or framework component. Maximum 6 words headline.
Purpose: Deliver actionable value.

Slide 7 — FRAMEWORK_2
Second lesson or framework component. Maximum 6 words headline.
Purpose: Continue building the system.

Slide 8 — FRAMEWORK_3
Third lesson or framework component. Maximum 6 words headline.
Purpose: Complete the framework.

Slide 9 — SUMMARY
Summarize the key takeaway. Maximum 10 words headline.
Purpose: Crystallize everything into one truth.

Slide 10 — CTA
Call to action. Maximum 8 words headline.
Purpose: Drive engagement (follow, share, comment, save).

TEXT RULES:
- Maximum 30 words per slide TOTAL (headline + supporting text combined).
- Headline font weight must DOMINATE the slide.
- Use emphasis words: algorithm, authority, growth, visibility, strategy, clients, system.
- Mark 1-3 KEY WORDS per slide in the "emphasis_words" array — these get visually highlighted.
- Each slide communicates ONE idea only.
- Readability in under 2 seconds on mobile.

VISUAL STORYTELLING — use metaphors when useful:
chess, icebergs, maps, architecture, movies, technology, bridges, compasses, puzzles.
Each metaphor should strengthen the message.

${langInstruction}

DESIGN STYLE: ${styleInstruction}

For each slide, return a JSON object with:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "insight" | "framework" | "summary" | "cta"
- headline: Bold main text (respect word limits above)
- supporting_text: Brief supporting line (combined with headline must stay under 30 words total)
- emphasis_words: array of 1-3 key words from the headline to visually highlight
- visual_anchor: One of: "arrow_down" | "highlight_box" | "underline_bar" | "icon_grid" | "number_badge" | "quote_mark" | "divider_accent" | null
- layout: "hero_center" | "left_impact" | "split_vertical" | "numbered_point" | "quote_block" | "stat_callout" | "closing_centered"
- image_prompt: A HIGHLY SPECIFIC and vivid prompt (80-150 words) for generating a cinematic visual. Include:
  1. Specific scene/object composition
  2. Visual style (cinematic, minimalistic, editorial)
  3. Color palette matching the chosen style
  4. Atmosphere/mood
  5. NO text/words/letters/logos in the image
- diagram_data: (only for framework slides if a diagram helps) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Also generate:
- carousel_title: A catchy title
- carousel_subtitle: A brief subtitle
- linkedin_caption: A ready-to-post LinkedIn caption (3-4 short paragraphs: hook, insight, CTA)
- hashtags: Array of 5-8 relevant hashtags

OUTPUT: Valid JSON only. Return: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...] }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}

Generate the carousel slides now. Remember: max 30 words per slide, emphasis_words array, visual_anchor for each slide.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
      parsed = JSON.parse(jsonMatch);
    } catch {
      throw new Error("Failed to parse carousel response");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429 || e?.status === 402) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-carousel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
