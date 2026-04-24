import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: claimsData, error: claimsErr } = await supa.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { image_base64, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_image",
              description: "Analyze a screenshot or image for executive intelligence",
              parameters: {
                type: "object",
                properties: {
                  transcribed_text: {
                    type: "string",
                    description: "All readable text extracted from the image via OCR. Include everything visible.",
                  },
                  title: {
                    type: "string",
                    description: "A concise title for this capture (max 10 words).",
                  },
                  summary: {
                    type: "string",
                    description: "A 2-3 sentence executive summary of the framework, key insight, or strategic takeaway from the image. If Arabic text is present, provide bilingual summary (Arabic then English).",
                  },
                  skill_pillar: {
                    type: "string",
                    enum: PILLARS,
                    description: "Which skill pillar this image content best maps to.",
                  },
                  has_strategic_insight: {
                    type: "boolean",
                    description: "Whether this image contains a genuine strategic insight worth flagging.",
                  },
                },
                required: ["transcribed_text", "title", "summary", "skill_pillar", "has_strategic_insight"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_image" } },
        messages: [
          {
            role: "system",
            content: `You are a Senior Executive Coach analyzing screenshots and images for a Director at EY who is building a "Transformation Architect" brand. 

Extract ALL text from the image. Then analyze the content for strategic frameworks, key insights, or actionable intelligence. Categorize into the appropriate skill pillar. If Arabic text is present, provide a bilingual summary.

Tone: Sophisticated, challenging, neutral.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime_type || "image/png"};base64,${image_base64}`,
                },
              },
              {
                type: "text",
                text: "Analyze this image. Extract all text, summarize the key framework or insight, and categorize it.",
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let result = {
      transcribed_text: "",
      title: "Screenshot Capture",
      summary: "",
      skill_pillar: "Strategic Architecture",
      has_strategic_insight: false,
    };

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        result = { ...result, ...args };
      } catch { console.error("Failed to parse image analysis"); }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
