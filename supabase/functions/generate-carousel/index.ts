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
      minimal_creator: "Creator Minimal — Cream/paper background (#FDF6EC), bold black typography, highlighted keywords with dark pill backgrounds, arrows and icons, simple layouts. Clean, airy, premium. Think top LinkedIn creators.",
      dark_creator: "Dark Creator Authority — Pure black background (#0A0A0A), large bold white typography, yellow (#FFD700) accent highlights, cinematic visuals, high contrast. Electric, dramatic energy.",
      corporate_gradient: "Corporate Gradient — Dark navy-to-charcoal gradient, teal (#2ECDA7) accent bar and highlights, clean corporate typography, professional depth, executive authority.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.minimal_creator;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation — it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، النظام، السلطة، النمو، الرؤية
Write concise, confident, executive Arabic. RTL optimized. Maintain strong readability on mobile.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const systemPrompt = `You are Aura — an elite LinkedIn carousel creation engine.

Your role is to convert ideas into high-performing LinkedIn carousels designed for mobile-first consumption.
Your outputs follow the same visual and storytelling principles used by the best LinkedIn creators and modern consulting brands.

CORE OBJECTIVE:
Create carousels that stop scrolling, educate quickly, deliver clear insights, and encourage saving and sharing.

═══════════════════════════════════
MOBILE-FIRST DESIGN SYSTEM
═══════════════════════════════════

Canvas: 1080 × 1350 (LinkedIn portrait format)
Safe margins: 120px minimum on all sides
Headlines must be large and dominant
Slides must be readable within 2 seconds
Maximum 30 words per slide (headline + supporting text combined)
No dense paragraphs. No small text.
Each slide communicates ONE idea.

═══════════════════════════════════
CAROUSEL STORYTELLING STRUCTURE
═══════════════════════════════════

Slide 1 — HOOK
Bold curiosity-driven headline. Max 6 words. Stop the scroll.
Triggers: curiosity, tension, or surprise.
Hook patterns: "Most LinkedIn content fails for one reason" / "90% of creators misunderstand the algorithm" / "The real reason your content doesn't grow"

Slide 2 — PROBLEM
Expose the common misunderstanding. Max 8 words headline.

Slide 3 — PROBLEM_DEEP
Why most people get this wrong. Max 8 words headline. Build tension and relevance.

Slide 4 — INSIGHT
Reveal the deeper mechanism. Max 8 words headline. The "aha" reframing moment.

Slide 5 — FRAMEWORK_INTRO
Introduce the framework or system. Max 8 words headline. Lock in the new mental model.

Slide 6 — FRAMEWORK_STEP
First lesson or framework component. Max 6 words headline.

Slide 7 — FRAMEWORK_STEP
Second lesson or framework component. Max 6 words headline.

Slide 8 — FRAMEWORK_STEP
Third lesson or framework component. Max 6 words headline.

Slide 9 — SUMMARY
Summarize the key takeaway. Max 10 words headline. Crystallize everything into one truth.

Slide 10 — CTA
Call to action. Max 8 words headline. Drive engagement: follow, share, comment, save.
Examples: "Follow for more insights" / "Save this carousel" / "Share with someone building content"

Every slide must move the narrative forward.

═══════════════════════════════════
PATTERN INTERRUPTS
═══════════════════════════════════

Some slides (2-3 max) should include a pattern interrupt — a short disruptive phrase that breaks reading rhythm and re-captures attention.
Examples: "WAIT." / "Most LinkedIn advice is outdated." / "This changes everything." / "Here's the truth."
Include these as the "pattern_interrupt" field when appropriate (null otherwise).

═══════════════════════════════════
DATA SLIDES
═══════════════════════════════════

When possible, include 1-2 data-driven statements.
Examples: "Only 2% of LinkedIn creators do this consistently." / "78% of content fails because it lacks positioning."
Numbers increase trust and attention. Use them in headlines or supporting text.

═══════════════════════════════════
TEXT & EMPHASIS RULES
═══════════════════════════════════

- Headline font weight must DOMINATE the slide
- Mark 1-3 KEY WORDS per slide in "emphasis_words" — these get visually highlighted with pill backgrounds
- Use power words: algorithm, authority, growth, visibility, strategy, clients, system, framework, positioning
- Use emphasis sparingly but effectively

═══════════════════════════════════
VISUAL STORYTELLING
═══════════════════════════════════

Use visual metaphors when useful: chess, icebergs, maps, architecture, movies, technology, bridges, compasses, puzzles.
Each metaphor should strengthen the message. Avoid clutter.
Slides must feel cinematic, modern, and premium.

Creative enhancements: cinematic lighting, depth shadows, subtle gradients, editorial-style typography, pattern-breaking slides.

═══════════════════════════════════
VISUAL HIERARCHY (every slide)
═══════════════════════════════════

1. HEADLINE (dominates)
2. Visual anchor (arrow, icon, number, underline)
3. Insight text (supporting)
4. Accent element (subtle)

${langInstruction}

DESIGN STYLE: ${styleInstruction}

═══════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════

For each slide return:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "insight" | "framework" | "summary" | "cta"
- headline: Bold main text (respect word limits)
- supporting_text: Brief supporting line (combined with headline ≤ 30 words)
- emphasis_words: array of 1-3 key words from headline to visually highlight
- pattern_interrupt: short disruptive phrase or null
- visual_anchor: "arrow_down" | "highlight_box" | "underline_bar" | "icon_grid" | "number_badge" | "quote_mark" | "divider_accent" | "large_number" | null
- layout: "hero_center" | "left_impact" | "split_vertical" | "numbered_point" | "quote_block" | "stat_callout" | "closing_centered"
- image_prompt: Vivid prompt (80-150 words) for cinematic visual. Include composition, style, color palette, mood. NO text/words/logos in the image.
- diagram_data: (framework slides only, if helpful) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Also generate:
- carousel_title: Catchy title
- carousel_subtitle: Brief subtitle
- linkedin_caption: Ready-to-post LinkedIn caption (3-4 short paragraphs: hook, insight, CTA)
- hashtags: Array of 5-8 relevant hashtags

OUTPUT: Valid JSON only: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...] }

CONSISTENCY: All slides must maintain consistent typography, spacing, and visual rhythm. The carousel must feel like a cohesive professional design system.

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}

Generate the carousel slides now. Remember: max 30 words per slide, emphasis_words array, visual_anchor, and pattern_interrupt where appropriate.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      // Strip markdown fences and control chars
      let cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim();

      // Find JSON boundaries
      const jsonStart = cleaned.search(/[{[]/);
      const jsonEnd = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found");
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

      // Fix trailing commas
      cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Raw LLM response (first 500 chars):", raw.substring(0, 500));
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
