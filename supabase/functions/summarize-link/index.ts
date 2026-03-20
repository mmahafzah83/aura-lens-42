import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEW_PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

// Simple Arabic detection
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log("Fetching URL:", url);
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuraBot/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    if (!pageRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL (${pageRes.status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let pageText = await pageRes.text();
    const titleMatch = pageText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

    if (pageText.length > 12000) pageText = pageText.substring(0, 12000);
    pageText = pageText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    pageText = pageText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    pageText = pageText.replace(/<[^>]+>/g, " ");
    pageText = pageText.replace(/\s+/g, " ").trim();

    const isArabic = hasArabic(pageText);
    const bilingualInstruction = isArabic
      ? `\nIMPORTANT: The content is in Arabic. Provide the summary in BOTH Arabic and English. Format:\n[Arabic summary bullets]\n\n[English Translation]\n[English summary bullets]`
      : "";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [
          {
            type: "function",
            function: {
              name: "extract_intelligence",
              description: "Extract strategic intelligence from a web page",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "A clean, concise title for this page" },
                  summary: {
                    type: "string",
                    description: "Exactly 3 bullet points capturing strategic objectives, KPIs, and key takeaways. Format: • Bullet 1\\n• Bullet 2\\n• Bullet 3. If Arabic content, provide bilingual (Arabic then English).",
                  },
                  skill_pillar: {
                    type: "string",
                    enum: NEW_PILLARS,
                    description: "Which skill pillar this content most relates to",
                  },
                  has_strategic_insight: {
                    type: "boolean",
                    description: "true ONLY if the content contains a specific, named KPI or a clearly stated strategic objective.",
                  },
                },
                required: ["title", "summary", "skill_pillar", "has_strategic_insight"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_intelligence" } },
        messages: [
          {
            role: "system",
            content: `You are an executive intelligence analyst preparing briefing materials. Given web page content, extract:
1. A clean TITLE for the page
2. Exactly 3 bullet points focused on STRATEGIC OBJECTIVES and KPIs. Each bullet must be actionable intelligence.
3. Classify under one skill pillar: ${NEW_PILLARS.join(", ")}.
${bilingualInstruction}
Page title from HTML: "${rawTitle}"`,
          },
          {
            role: "user",
            content: `Analyze this page from ${url}:\n\n${pageText}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    let title = rawTitle || url;
    let summary = "";
    let skill_pillar = "C-Suite Advisory";
    let has_strategic_insight = false;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        title = args.title || title;
        summary = args.summary || "";
        skill_pillar = args.skill_pillar || "C-Suite Advisory";
        has_strategic_insight = args.has_strategic_insight === true;
      } catch { summary = aiData.choices?.[0]?.message?.content || ""; }
    } else {
      summary = aiData.choices?.[0]?.message?.content || "";
    }

    return new Response(JSON.stringify({ title, summary, skill_pillar, has_strategic_insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-link error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
