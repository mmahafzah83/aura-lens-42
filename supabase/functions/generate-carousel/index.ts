import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, context, style, lang, selected_framework } = await req.json();
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

    const styleInstruction = styleGuides[style] || styleGuides.corporate_gradient;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation — it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، النظام، السلطة، النمو، الرؤية
Write concise, confident, executive Arabic. RTL optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const frameworkContext = selected_framework
      ? `\n\nSELECTED FRAMEWORK TO USE:\nName: ${selected_framework.name}\nDescription: ${selected_framework.description}\nSteps: ${(selected_framework.steps || []).join(" → ")}\nDiagram Type: ${selected_framework.diagram_type || "sequential_flow"}\n\nYou MUST build the carousel around this specific framework. Use it for slides 5-8 (framework intro, step explanations, architecture diagram).`
      : "";

    const systemPrompt = buildSystemPrompt(langInstruction, styleInstruction, isArabic);

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}${frameworkContext}

Generate the carousel slides now. Remember: max 30 words per slide, rotate layouts across slides, include emphasis_words, visual_anchor, and make slide 10 an authority CTA with personal branding. Do NOT include system labels like "Hook", "Problem", "Insight" etc on the slides — these are internal only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 16384,
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
      parsed = extractAndParseJson(raw);
    } catch (parseErr) {
      console.error("Raw LLM response (first 500 chars):", raw.substring(0, 500));
      console.error("Raw LLM response (last 300 chars):", raw.substring(raw.length - 300));
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

function extractAndParseJson(raw: string): unknown {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();

  const jsonStart = cleaned.search(/[{[]/);
  if (jsonStart === -1) throw new Error("No JSON found");

  cleaned = cleaned.substring(jsonStart);

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // continue to repair
  }

  // Fix trailing commas
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  // Try again
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // continue to repair truncation
  }

  // Repair truncated JSON by closing unbalanced braces/brackets
  // First, remove any trailing incomplete string (e.g. `"some text that got cut`)
  cleaned = cleaned.replace(/,?\s*"[^"]*$/, "");
  // Remove trailing comma after last complete value
  cleaned = cleaned.replace(/,\s*$/, "");

  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }

  // Fix trailing commas again after repair
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  return JSON.parse(cleaned);
}

function buildSystemPrompt(langInstruction: string, styleInstruction: string, isArabic: boolean): string {
  return `You are Aura — an AI-powered strategic content engine that produces consulting-quality LinkedIn carousels focused on infrastructure, utilities, AI, digital transformation, and sustainability.

Content must always remain ethical, professional, and industry-focused.

═══════════════════════════════════
PRE-GENERATION THINKING PROCESS
═══════════════════════════════════

Before generating slides, you MUST follow these 8 steps internally (do NOT output them — use them to structure your thinking):

STEP 1 — TOPIC ANALYSIS
Analyze the topic and identify: the core industry challenge, strategic insight, transformation opportunity, and possible frameworks.

STEP 2 — FRAMEWORK GENERATION
Generate 2–3 possible frameworks relevant to the topic. Frameworks should be simple and visually structured (e.g., SMART WATER TRANSFORMATION MODEL: 1. Data Foundations → 2. Connectivity & Sensors → 3. Analytics & AI → 4. Integrated Systems → 5. Intelligent Operations).

STEP 3 — FRAMEWORK SELECTION
Select the strongest framework for visualization and carousel storytelling.

STEP 4 — VISUAL PLANNING
Design the carousel structure ensuring it contains: a hook slide, a statistic slide, a framework slide, framework step slides, an architecture/system diagram slide, a strategic insight slide, and a CTA slide.

STEP 5 — IMAGE STRATEGY
For each slide, decide whether to use:
• Real-world industry photos for: water utilities, water infrastructure, control rooms, pipelines, treatment plants, sensor installations
• Generated infographic visuals for: frameworks, system architectures, digital twin models, data pipelines, flow diagrams
Include this decision in the image_prompt field — prefix with "PHOTO:" for real-world or "INFOGRAPHIC:" for generated visuals.

STEP 6 — VISUAL FRAMEWORK GENERATION
Framework slides must display structured diagrams (e.g., Sensors → Data Platform → AI → Operations, or layered: Sensors / SCADA / GIS / Billing → Unified Digital Platform).

STEP 7 — CAROUSEL GENERATION
Generate the 10-slide carousel following the structure below.

STEP 8 — CTA STRUCTURE
Final slide must include proper branding (see slide 10 spec below).

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
Headline: 6-10 words maximum.
Explanation text: 12-18 words.
Maximum 30 words per slide (headline + supporting text combined)
Each slide communicates ONE idea.
Readable within 2 seconds.
Avoid dense paragraphs.

═══════════════════════════════════
NO SYSTEM LABELS
═══════════════════════════════════

CRITICAL: Do NOT display internal labels on slides. The following labels are for internal structure only and must NEVER appear in the headline or supporting_text:
- Hook, Problem, Insight, Pattern Interrupt, Framework Intro, Framework Step, Future Insight, CTA, Save

The slide content must read naturally as standalone insight text without any structural labels.

═══════════════════════════════════
AUTHOR NAME
═══════════════════════════════════

Always display the author name "M. Mahafzah" clearly on slides.
The name must be readable on mobile — do not reduce font too much.
Place subtly but clearly.

═══════════════════════════════════
LAYOUT ROTATION SYSTEM
═══════════════════════════════════

Do NOT repeat identical layouts. ROTATE layouts across slides for visual rhythm.

Available layouts:
- "hero_center" — Title centered with short insight below.
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

Slide 1 — Opening hook (layout: hero_center)
Bold curiosity-driven headline. Max 6 words. Stop the scroll.

Slide 2 — Problem framing (layout: left_impact)
Expose a common misunderstanding or challenge.

Slide 3 — Data point (layout: stat_callout)
A compelling statistic or data-driven statement.

Slide 4 — Reframing insight (layout: right_impact)
The deeper mechanism or "aha" moment.

Slide 5 — Framework introduction (layout: infographic)
Introduce the framework visually with diagram_data.

Slide 6 — Framework component 1 (layout: numbered_point)
First lesson or component with real-world example.

Slide 7 — Framework component 2 (layout: split_vertical)
Second component comparing before/after or old/new approach.

Slide 8 — Architecture diagram (layout: infographic)
System architecture with diagram_data showing flow or layers.

Slide 9 — Forward-looking insight (layout: quote_block)
A big idea about the future.

Slide 10 — Authority CTA (layout: closing_centered)
The supporting_text MUST include:
"M. Mahafzah\\nStrategy | Digital & Business Transformation\\nFocus on Utilities & Power\\n\\nhttps://www.linkedin.com/in/mmahafzah/\\n\\n↻ Repost if this was helpful."

═══════════════════════════════════
EMPHASIS & VISUAL ANCHORS
═══════════════════════════════════

- Mark 1-3 KEY WORDS per slide in "emphasis_words"
- visual_anchor options: "arrow_down" | "highlight_box" | "underline_bar" | "icon_grid" | "number_badge" | "quote_mark" | "divider_accent" | "large_number" | null

═══════════════════════════════════
INFOGRAPHIC / DIAGRAM DATA
═══════════════════════════════════

For framework/architecture slides, include diagram_data:
{ type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Examples:
- Sensors → Data Platform → AI Analytics → Operational Action
- Data Foundations → Analytics & AI → Integrated Systems → Intelligent Operations
- Sensors / SCADA / GIS / Billing → Unified Digital Platform

Use consulting-style visuals: system frameworks, pipelines, infrastructure networks, process flows, architecture diagrams.

═══════════════════════════════════
IMAGE STRATEGY
═══════════════════════════════════

Each slide's image_prompt must specify the visual type:
- Prefix "PHOTO:" for real-world industry imagery (utilities, control rooms, pipelines, treatment plants, sensor fields, water infrastructure)
- Prefix "INFOGRAPHIC:" for generated visuals (frameworks, architectures, digital twins, data flows, system diagrams)

Real-world photo prompts should describe: cinematic lighting, professional photography, infrastructure settings, no text/logos.
Infographic prompts should describe: dark background, teal accents, clean lines, consulting-style diagram, minimal icons.

═══════════════════════════════════
VISUAL DESIGN
═══════════════════════════════════

Background: Dark gradient or clean modern background.
Accent: Teal/cyan (#2ECDA7) highlights for key words.
Visual elements: network lines, data flow graphics, minimal icons, infrastructure diagrams, abstract technology shapes.
Background visuals must remain subtle — text must dominate.

${langInstruction}

DESIGN STYLE: ${styleInstruction}

═══════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════

For each slide return:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "stat" | "insight" | "framework_intro" | "framework_step" | "architecture" | "future_insight" | "cta"
- headline: Bold main text (6-10 words, NO system labels)
- supporting_text: Brief explanation (12-18 words, NO system labels)
- emphasis_words: array of 1-3 key words from headline
- visual_anchor: one of the allowed values or null
- layout: one of "hero_center" | "left_impact" | "right_impact" | "split_vertical" | "numbered_point" | "quote_block" | "stat_callout" | "infographic" | "closing_centered"
- image_prompt: Vivid prompt (80-150 words) prefixed with "PHOTO:" or "INFOGRAPHIC:". NO text/words/logos in the image.
- diagram_data: (framework/architecture slides only) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Also generate:
- carousel_title: Catchy title
- carousel_subtitle: Brief subtitle
- linkedin_caption: Ready-to-post LinkedIn caption (3-4 short paragraphs, professional advisory tone)
- hashtags: Array of 5-8 relevant hashtags

OUTPUT: Valid JSON only: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...] }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;
}
