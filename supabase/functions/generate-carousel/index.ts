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
      consulting: "Consulting Style: Navy, gold, white palette. Clean strategic diagrams, numbered frameworks, matrix layouts.",
      thought_leadership: "Thought Leadership Style: Dark dramatic backgrounds, bold accents (coral/red), high contrast, dynamic layouts.",
      minimal: "Minimal Strategic Style: Light backgrounds, monochrome with one teal accent, generous whitespace, elegant typography.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.consulting;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation - it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية
Write concise, confident, executive Arabic. Right-to-left optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const systemPrompt = `You are an Elite LinkedIn Carousel Content Strategist who creates viral thought leadership carousels with VISUAL-FIRST design.

Generate a LinkedIn carousel of exactly 10 slides following this storytelling structure:

Slide 1 - HOOK: Bold scroll-stopping statement. Maximum 6 words headline. Create curiosity.
  Visual: Bold conceptual AI image representing the topic (futuristic, dramatic, symbolic).
Slide 2 - PROBLEM: The common misconception or challenge. Maximum 8 words headline.
  Visual: Conceptual illustration showing fragmentation, complexity, or chaos.
Slide 3 - INSIGHT: The key reframing or surprising truth. Maximum 8 words headline.
  Visual: Symbolic illustration representing the strategic insight (bridge, unlock, connection).
Slide 4 - FRAMEWORK_INTRO: Introduce the strategic model name. Maximum 6 words headline. Include a brief model overview.
  Visual: Structured framework diagram introducing the model.
Slide 5 - FRAMEWORK_STEP: First core component. Maximum 6 words headline. One key idea only.
  Visual: Component diagram or infographic block for this element.
Slide 6 - FRAMEWORK_STEP: Second core component. Maximum 6 words headline. One key idea only.
  Visual: Component diagram or infographic block for this element.
Slide 7 - FRAMEWORK_VISUAL: Display the framework visually. Maximum 6 words headline. Include diagram_data with nodes and connections.
  Visual: Full strategic diagram showing the complete model.
Slide 8 - IMPLICATION: Why this matters for leaders. Maximum 8 words headline.
  Visual: Strategic impact illustration (growth, ripple effect, leadership).
Slide 9 - TAKEAWAY: Clear actionable guidance. Maximum 8 words headline.
  Visual: Action-oriented conceptual illustration (roadmap, checklist, compass).
Slide 10 - CLOSING: Thought-provoking leadership question. Maximum 10 words headline.
  Visual: Reflective conceptual image (horizon, summit, crossroads).

${langInstruction}

DESIGN STYLE: ${styleInstruction}

CRITICAL RULES:
- Headlines: MAXIMUM 8 words. Short. Punchy. Bold.
- Supporting text: MAXIMUM 20 words. One or two short sentences only.
- Each slide communicates ONE single idea.
- NO long paragraphs. NO dense text.
- Think mobile readability first.
- EVERY slide MUST have an image_prompt field describing the visual to generate.

For each slide, return a JSON object with:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "insight" | "framework_intro" | "framework_step" | "framework_visual" | "implication" | "takeaway" | "closing"
- headline: The main bold text (MAXIMUM 8 words)
- supporting_text: Supporting explanation (MAXIMUM 20 words)
- visual_type: The category of visual for this slide. One of: "conceptual_image" | "conceptual_illustration" | "strategic_diagram" | "framework_visualization" | "infographic" | "sketch_drawing" | "icon_illustration" | "data_visualization" | "process_flow"
- layout: "hero_center" | "left_impact" | "split_insight" | "numbered_point" | "diagram" | "quote_block" | "stat_callout" | "closing_question"
- accent_element: optional visual cue ("number_badge" | "quote_mark" | "arrow_flow" | "divider_line" | "icon_grid" | null)
- image_prompt: A HIGHLY SPECIFIC and vivid prompt for generating a visual for this slide. This is CRITICAL. Each prompt must describe a CONCRETE SCENE, not abstract concepts. Include:
  1. A specific scene or object composition (e.g. "futuristic control room overlooking a smart power grid" NOT "an image about digital transformation")
  2. Visual style (e.g. "cinematic lighting, minimalistic style" or "minimal corporate illustration style" or "clean architectural diagram style")
  3. Color palette direction (e.g. "deep blue and gold palette" or "dark navy with amber accents")
  4. Atmosphere/mood (e.g. "strategic technology atmosphere" or "sense of urgency and fragmentation")
  5. Specific objects or elements to include (e.g. "large digital interfaces, holographic dashboards, data streams")

  Examples of GOOD image prompts:
  - "Futuristic control room overlooking a smart power grid, large digital interfaces, cinematic lighting, minimalistic style, deep blue palette, strategic technology atmosphere."
  - "Fragmented infrastructure systems floating disconnected in space, pipelines, servers, power stations not connected together, minimal corporate illustration style."
  - "A grand bridge connecting two illuminated towers, one labeled Strategy the other Execution, dramatic perspective, golden light rays, architectural blueprint aesthetic."
  - "Layered transparent architectural floors showing governance, technology, and operations layers, isometric view, clean lines, teal and navy color scheme."

  Examples of BAD image prompts (too vague):
  - "An image representing digital transformation"
  - "A visual showing the framework concept"
  - "An illustration about leadership"

  80-150 words per prompt. NO text/words/letters/logos in the generated image. The visual must stand alone without text.
- diagram_data: (only for framework_visual slides) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[], connections?: string[] }

Also generate:
- carousel_title: A catchy title for the carousel
- carousel_subtitle: A brief subtitle
- linkedin_caption: A ready-to-post LinkedIn caption (3-4 short paragraphs with hook, insight, CTA)
- hashtags: Array of 5-8 relevant hashtags

OUTPUT: Valid JSON only. Return: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...] }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}

Generate the carousel slides now. Remember: every slide MUST have an image_prompt field.`;

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
