import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEW_PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller before doing any work.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: authData, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authedUser = authData.user;

    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow https URLs to mitigate SSRF / internal-host probing.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (parsedUrl.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "Only https:// URLs are allowed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Load profile for dynamic persona
    let persona = "Senior professional building their digital presence";
    try {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: p } = await admin.from("diagnostic_profiles")
        .select("level, firm, sector_focus, core_practice")
        .eq("user_id", authedUser.id).maybeSingle();
      if (p) persona = `${(p as any).level || "Senior professional"} at ${(p as any).firm || "a leading organization"} working in ${(p as any).sector_focus || (p as any).core_practice || "their field"}`;
    } catch (_) { /* ignore */ }

    let pageRes: Response | null = null;
    const fetchWithTimeout = async (targetUrl: string, timeoutMs = 10000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    // Try fetching with retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        pageRes = await fetchWithTimeout(url, attempt === 0 ? 8000 : 12000);
        if (pageRes.ok) break;
      } catch (e) {
        console.warn(`Fetch attempt ${attempt + 1} failed:`, (e as Error).message);
        if (attempt === 1) {
          return new Response(
            JSON.stringify({ error: "Could not reach this URL. The site may be blocking automated requests. Try a different source." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!pageRes || !pageRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL (${pageRes?.status || "timeout"})` }),
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
                    description: "Exactly 3 bullet points: strategic objectives, blind spots, and actionable intelligence. If Arabic content, provide bilingual (Arabic then English).",
                  },
                  skill_pillar: {
                    type: "string",
                    enum: NEW_PILLARS,
                    description: "Which skill pillar this content most relates to",
                  },
                  has_strategic_insight: {
                    type: "boolean",
                    description: "true ONLY if the content contains a specific KPI or clearly stated strategic objective.",
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
            content: `You are a Senior Executive Coach analyzing web content for a ${persona}. You are sophisticated, challenging, and neutral.

Given web page content, extract:
1. A clean TITLE
2. Exactly 3 bullet points: focus on what matters strategically — not what's interesting, but what's actionable. Name the risk. Name the opportunity. Be direct.
3. Classify under: ${NEW_PILLARS.join(", ")}.
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
