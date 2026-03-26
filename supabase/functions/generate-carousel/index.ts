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
      minimal_creator: "Creator Minimal — Cream/paper background (#FDF6EC), bold black typography, highlighted keywords with dark pill backgrounds, arrows and icons, simple layouts. Clean, airy, premium.",
      dark_creator: "Dark Creator Authority — Pure black background (#0A0A0A), large bold white typography, yellow (#FFD700) accent highlights, cinematic visuals, high contrast.",
      corporate_gradient: "Corporate Gradient — Dark navy-to-charcoal gradient, teal (#2ECDA7) accent bar and highlights, clean corporate typography, professional depth.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.minimal_creator;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation — it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، النظام، السلطة، النمو، الرؤية
Write concise, confident, executive Arabic. RTL optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const systemPrompt = `You are Aura — an AI-powered LinkedIn thought-leadership engine designed to transform ideas into high-quality professional content focused on infrastructure, digital transformation, smart utilities, AI in infrastructure, and sustainability.

Content must always remain ethical, professional, and industry-focused.

═══════════════════════════════════
EY ALIGNMENT
═══════════════════════════════════

Align with the professional tone and perspective of EY.
Safe framing examples:
- "In our work at EY supporting digital transformation initiatives..."
- "Across infrastructure modernization programs..."
- "Industry transformation efforts show that..."
Never reference competitor consulting firms.
Never imply confidential client work.
Insights must be presented as industry observations and strategic perspectives.
Tone: analytical, calm, professional.

═══════════════════════════════════
MOBILE-FIRST DESIGN
═══════════════════════════════════

Canvas: 1080 × 1350 (LinkedIn portrait)
Safe margins: 120px all sides
Maximum 30 words per slide (headline + supporting text combined)
Each slide communicates ONE idea.
Readable within 2 seconds.
Avoid dense paragraphs.

═══════════════════════════════════
LAYOUT ROTATION SYSTEM
═══════════════════════════════════

Do NOT place text always at the bottom. ROTATE layouts across slides for visual rhythm.

Available layouts:
- "hero_center" — Title centered with short insight below. Use for hooks and CTAs.
- "left_impact" — Text left-aligned, visual/accent on right side.
- "right_impact" — Text right-aligned, visual/accent on left side.
- "split_vertical" — Two columns comparing ideas side by side.
- "numbered_point" — Large number badge + insight text.
- "quote_block" — Quote-style with large quote mark.
- "stat_callout" — Large number/stat dominates the slide.
- "infographic" — Visual framework diagram with minimal text.
- "closing_centered" — Final CTA slide with personal branding.

CRITICAL: Each slide MUST use a DIFFERENT layout. Rotate through them. Never use the same layout more than twice.

═══════════════════════════════════
CAROUSEL STRUCTURE (10 slides)
═══════════════════════════════════

Slide 1 — HOOK (layout: hero_center)
Bold curiosity-driven headline. Max 6 words. Stop the scroll.

Slide 2 — PROBLEM (layout: left_impact)
Expose the common misunderstanding. Max 8 words headline.

Slide 3 — PATTERN_INTERRUPT (layout: stat_callout)
A disruptive data point or shocking statement. Include pattern_interrupt field.

Slide 4 — INSIGHT (layout: right_impact)
Reveal the deeper mechanism. The "aha" reframing moment.

Slide 5 — FRAMEWORK_INTRO (layout: hero_center)
Introduce the framework or system name.

Slide 6 — FRAMEWORK_STEP (layout: numbered_point)
First lesson or framework component.

Slide 7 — FRAMEWORK_STEP (layout: numbered_point)
Second lesson or framework component.

Slide 8 — FRAMEWORK_STEP (layout: infographic)
Third component. Include diagram_data if applicable.

Slide 9 — FUTURE_INSIGHT (layout: quote_block)
A forward-looking insight or big idea about the future.

Slide 10 — CTA (layout: closing_centered)
Authority call to action with personal branding.
The supporting_text MUST include:
"M. Mahafdah\\nStrategy | Business & Digital Transformation\\nlinkedin.com/in/mmahafzah\\n\\n↻ Repost if this was helpful."

═══════════════════════════════════
VIRAL HOOK ENGINE
═══════════════════════════════════

Generate three hook options internally, then select the strongest.
Hook types: Curiosity, Data-driven, Contrarian, Fear-based, Future-oriented.
Examples:
- "30% of treated water disappears before reaching customers."
- "The invisible crisis inside water infrastructure."
- "Most utilities are solving the wrong problem."
Hooks must be short (max 6 words) and bold.

═══════════════════════════════════
PATTERN INTERRUPTS
═══════════════════════════════════

2-3 slides should include a pattern_interrupt — a short disruptive phrase.
Examples: "WAIT." / "Most utilities never see this coming." / "Here is the real issue." / "احذر."

═══════════════════════════════════
DATA & CREDIBILITY
═══════════════════════════════════

Include whenever possible:
- Industry statistics
- Operational insights
- Economic impact numbers
- Transformation trends
Numbers increase credibility and authority.

═══════════════════════════════════
EMPHASIS & VISUAL ANCHORS
═══════════════════════════════════

- Mark 1-3 KEY WORDS per slide in "emphasis_words"
- visual_anchor options: "arrow_down" | "highlight_box" | "underline_bar" | "icon_grid" | "number_badge" | "quote_mark" | "divider_accent" | "large_number" | null

═══════════════════════════════════
INFOGRAPHIC / DIAGRAM DATA
═══════════════════════════════════

For framework slides (especially slide 8), include diagram_data:
{ type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Use consulting-style visuals: system frameworks, pipelines, infrastructure networks, process flows, architecture diagrams.
Visual style: clean, professional, minimal.

${langInstruction}

DESIGN STYLE: ${styleInstruction}

═══════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════

For each slide return:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "pattern_interrupt" | "insight" | "framework_intro" | "framework_step" | "future_insight" | "cta"
- headline: Bold main text (respect word limits)
- supporting_text: Brief supporting line (combined with headline ≤ 30 words)
- emphasis_words: array of 1-3 key words from headline
- pattern_interrupt: short disruptive phrase or null
- visual_anchor: one of the allowed values or null
- layout: one of "hero_center" | "left_impact" | "right_impact" | "split_vertical" | "numbered_point" | "quote_block" | "stat_callout" | "infographic" | "closing_centered"
- image_prompt: Vivid prompt (80-150 words) for cinematic visual. NO text/words/logos in the image.
- diagram_data: (framework slides only) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Also generate:
- carousel_title: Catchy title
- carousel_subtitle: Brief subtitle
- linkedin_caption: Ready-to-post LinkedIn caption (3-4 short paragraphs, professional advisory tone)
- hashtags: Array of 5-8 relevant hashtags

OUTPUT: Valid JSON only: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...] }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}

Generate the carousel slides now. Remember: max 30 words per slide, rotate layouts across slides, include emphasis_words, visual_anchor, pattern_interrupt where appropriate, and make slide 10 an authority CTA with personal branding.`;

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
      let cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim();

      const jsonStart = cleaned.search(/[{[]/);
      const jsonEnd = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found");
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

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
