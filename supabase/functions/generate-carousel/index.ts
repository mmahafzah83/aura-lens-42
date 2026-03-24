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
      consulting: "Consulting Style: Clean strategic diagrams, structured layouts, executive color palette (navy, gold, white). Use numbered frameworks, matrix layouts, and strategic terminology.",
      thought_leadership: "Thought Leadership Style: Modern LinkedIn visuals optimized for engagement. Bold typography, high contrast, dynamic layouts. Use pull quotes and insight callouts.",
      minimal: "Minimal Strategic Style: Elegant typography, generous whitespace, minimal visual elements. Monochrome with one accent color. Let the words breathe.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.consulting;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation - it is original Arabic thought leadership.
Use rhetorical patterns: contrast ("ليس ... بل ..."), reframing ("المشكلة ليست في ... بل في ..."), insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية
Write concise, confident, executive Arabic. Right-to-left optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const systemPrompt = `You are an Elite LinkedIn Carousel Content Strategist.

Generate a LinkedIn carousel of exactly 10 slides following this storytelling structure:

Slide 1 - HOOK: Bold attention-grabbing statement. Short, punchy, creates curiosity.
Slide 2 - PROBLEM: The common misconception or challenge leaders face.
Slide 3 - INSIGHT: The key reframing or surprising truth.
Slides 4-7 - FRAMEWORK: Present the framework or key strategic ideas. One concept per slide with clear structure.
Slide 8 - STRATEGIC IMPLICATION: Why this matters for leaders and organizations.
Slide 9 - PRACTICAL TAKEAWAY: Actionable guidance leaders can apply immediately.
Slide 10 - CLOSING QUESTION: A thought-provoking leadership question that drives engagement.

${langInstruction}

DESIGN STYLE: ${styleInstruction}

For each slide, return a JSON object with:
- slide_number (1-10)
- slide_type: "hook" | "problem" | "insight" | "framework" | "implication" | "takeaway" | "closing"
- headline: The main bold text (max 8 words)
- supporting_text: Supporting explanation (max 30 words)
- visual_type: What visual element to show (e.g., "bold text cover", "numbered list", "comparison", "diagram", "quote", "icon grid", "single stat")
- layout_style: "centered hero" | "left aligned" | "split layout" | "numbered list" | "quote block" | "stat callout"

OUTPUT: Valid JSON only. Return an object: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "..." }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Create a 10-slide LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}

Generate the carousel slides now.`;

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
