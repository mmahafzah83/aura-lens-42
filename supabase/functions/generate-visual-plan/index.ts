import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, context, framework, lang, slide_count } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isArabic = lang === "ar";
    const targetSlides = slide_count || 10;

    const systemPrompt = `You are Aura — a visual strategy architect for consulting-grade LinkedIn carousels.

Given a topic and a selected framework, create a detailed visual plan for a ${targetSlides}-slide carousel.

CANVAS: 1080 × 1350 (LinkedIn portrait, mobile-first)

For EACH slide, define:
1. slide_number: Sequential number
2. slide_purpose: What this slide communicates (1 sentence)
3. layout_type: One of: "hero_center" | "left_impact" | "right_impact" | "split_vertical" | "stat_callout" | "quote_block" | "numbered_point" | "infographic" | "closing_centered"
4. text_position: One of: "top" | "middle_left" | "center" | "lower_middle" | "split_title_body"
5. visual_type: One of: "text_only" | "split_text_image" | "infographic" | "framework_visual" | "stat_slide" | "architecture_diagram" | "conceptual_visual" | "cta_slide"
6. image_decision: "real_image" | "generated_diagram" | "none"
7. density_level: "light" (few words, big impact) | "medium" (balanced) | "dense" (detailed content)
8. image_category: If image_decision is "real_image", specify: "utilities" | "power" | "water" | "infrastructure" | "plants" | "pipelines" | "field_operations" | "control_rooms" | null
9. diagram_category: If image_decision is "generated_diagram", specify: "framework" | "maturity_model" | "operating_model" | "architecture" | "abstract_strategic" | null

RULES:
- Do NOT repeat the same layout on every slide — vary layouts
- Slide 1 should be a hook (hero_center, light density)
- Last slide must be CTA (closing_centered, cta_slide)
- Include at least 1 stat slide, 1 framework visual, 1 real image slide
- No system labels (Hook, Problem, Insight) on slides
- Explanation text: 12-18 words per slide
- Strong spacing, clear hierarchy
- Mix visual types across the carousel

IMAGE RULES:
- Use real images for: utilities, power, water, infrastructure, plants, pipelines, field operations, control rooms
- Use generated visuals for: frameworks, maturity models, operating models, diagrams, architecture, abstract strategic concepts

${isArabic ? "Write all content in professional executive Arabic." : "Write all content in English."}

OUTPUT: Valid JSON only:
{
  "visual_plan": [
    {
      "slide_number": 1,
      "slide_purpose": "Hook the reader with a provocative question",
      "layout_type": "hero_center",
      "text_position": "center",
      "visual_type": "split_text_image",
      "image_decision": "real_image",
      "density_level": "light",
      "image_category": "infrastructure",
      "diagram_category": null
    }
  ],
  "plan_summary": "Brief description of the visual strategy (2-3 sentences)"
}`;

    const frameworkContext = framework
      ? `\nSelected Framework: ${framework.name}\nSteps: ${framework.steps.join(" → ")}\nType: ${framework.framework_type || framework.diagram_type}`
      : "";

    const userPrompt = `Create a visual plan for a ${targetSlides}-slide LinkedIn carousel:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Context: ${context}` : ""}${frameworkContext}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 4096,
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
    } catch {
      console.error("Raw response:", raw.substring(0, 500));
      throw new Error("Failed to parse visual plan response");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-visual-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: e?.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  cleaned = cleaned.replace(/,?\s*"[^"]*$/, "").replace(/,\s*$/, "");
  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++; if (char === "}") braces--;
    if (char === "[") brackets++; if (char === "]") brackets--;
  }
  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  return JSON.parse(cleaned);
}
