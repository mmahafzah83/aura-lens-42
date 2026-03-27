import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, context, lang } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isArabic = lang === "ar";

    const systemPrompt = `You are Aura — a strategic content engine for infrastructure, utilities, AI, and digital transformation thought leadership.

Your task is to analyze a topic and generate strategic frameworks suitable for LinkedIn carousel storytelling.

STEP 1 — TOPIC ANALYSIS
Analyze the topic and extract:
- core_challenge: The primary industry challenge (1-2 sentences)
- strategic_insight: The deeper strategic insight (1-2 sentences)
- transformation_theme: The transformation opportunity (1-2 sentences)
- target_audience: Who benefits most from this content

STEP 2 — FRAMEWORK GENERATION
Generate exactly 3 strategic frameworks related to the topic. Each framework must:
- Have a clear, memorable name (e.g., "Smart Water Transformation Model", "Utility Digital Architecture", "AI Operations Stack")
- Include 4-6 structured steps/components
- Be visually representable as a diagram (sequential flow, layered, circular, or grid)
- Include a brief description of why this framework matters

STEP 3 — VISUAL STRATEGY
For each framework, suggest:
- diagram_type: "sequential_flow" | "layered" | "circular" | "grid_2x2"
- key_visuals: Array of 3-4 visual concepts that would complement this framework in a carousel
- image_types: For each visual, whether it should be "PHOTO" (real-world infrastructure) or "INFOGRAPHIC" (generated diagram)

${isArabic ? `Write ALL content in professional executive Arabic used by strategy leaders in the GCC.
Use terms like: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية` : `Write ALL content in English. Use authoritative consulting tone.`}

EY ALIGNMENT:
- Safe framing: "In our work supporting digital transformation initiatives..."
- Never reference competitor consulting firms
- Insights as industry observations and strategic perspectives
- Tone: analytical, calm, professional

OUTPUT: Valid JSON only with this structure:
{
  "topic_analysis": {
    "core_challenge": "...",
    "strategic_insight": "...",
    "transformation_theme": "...",
    "target_audience": "..."
  },
  "frameworks": [
    {
      "id": "fw_1",
      "name": "Framework Name",
      "description": "Why this framework matters (1-2 sentences)",
      "steps": ["Step 1 Name", "Step 2 Name", "Step 3 Name", "Step 4 Name"],
      "diagram_type": "sequential_flow",
      "key_visuals": [
        { "concept": "Visual description", "type": "PHOTO" },
        { "concept": "Visual description", "type": "INFOGRAPHIC" }
      ]
    }
  ]
}

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;

    const userPrompt = `Analyze this topic and generate 3 strategic frameworks:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}`;

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
      parsed = extractAndParseJson(raw);
    } catch {
      console.error("Raw response:", raw.substring(0, 500));
      throw new Error("Failed to parse framework response");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-frameworks error:", e);
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
