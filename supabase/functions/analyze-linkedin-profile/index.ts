import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, profileText: userProvidedText } = await req.json();
    if (!url || !url.includes("linkedin.com/in/")) {
      return new Response(
        JSON.stringify({ error: "A valid LinkedIn profile URL is required (e.g. https://www.linkedin.com/in/username)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let pageText = userProvidedText?.trim() || "";
    let structuredData = "";

    // Only attempt fetch if user didn't provide text
    if (!pageText) {
      let profileUrl = url.trim();
      if (!profileUrl.startsWith("http")) profileUrl = `https://${profileUrl}`;
      if (!profileUrl.endsWith("/")) profileUrl += "/";

      const fetchWithTimeout = async (targetUrl: string, timeoutMs = 12000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetchWithTimeout(profileUrl, attempt === 0 ? 10000 : 15000);
          if (res.ok) {
            const rawHtml = await res.text();
            let cleanHtml = rawHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
            cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
            const jsonLdMatches = rawHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
            if (jsonLdMatches) {
              structuredData = jsonLdMatches.map(m => m.replace(/<\/?script[^>]*>/gi, "")).join("\n");
            }
            cleanHtml = cleanHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (cleanHtml.length > 15000) cleanHtml = cleanHtml.substring(0, 15000);
            if (structuredData.length > 5000) structuredData = structuredData.substring(0, 5000);
            pageText = cleanHtml;
            break;
          } else {
            console.warn(`Profile fetch attempt ${attempt + 1}: HTTP ${res.status}`);
            await res.text(); // consume body
          }
        } catch (e) {
          console.warn(`Profile fetch attempt ${attempt + 1} failed:`, (e as Error).message);
        }
      }
      // If fetch failed, proceed with URL-only analysis (no error returned)
    }

    // pageText and structuredData already prepared above

    const isArabic = hasArabic(pageText || url);

    const contentContext = pageText
      ? `Page content:\n${pageText}\n\n${structuredData ? `Structured data:\n${structuredData}` : ""}`
      : "No page content was available (LinkedIn blocked the request). Analyze based on the URL username and your knowledge. Provide your best strategic analysis based on the LinkedIn username visible in the URL. If you cannot infer enough, provide general authority-building recommendations for a professional at this URL.";

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
              name: "analyze_profile",
              description: "Analyze a LinkedIn profile and extract strategic authority intelligence",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Person's name" },
                  headline: { type: "string", description: "Their LinkedIn headline" },
                  strategic_positioning: {
                    type: "string",
                    description: "A strategic authority positioning statement. Example: 'You are positioning yourself as a strategic authority at the intersection of Digital Transformation and Energy Infrastructure.'",
                  },
                  authority_themes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        theme: { type: "string" },
                        evidence_signals: {
                          type: "array",
                          items: { type: "string" },
                          description: "Where this theme appears: headline, about, experience, posts",
                        },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        stage: { type: "string", enum: ["dominant", "emerging", "nascent"] },
                      },
                      required: ["theme", "evidence_signals", "confidence", "stage"],
                      additionalProperties: false,
                    },
                    description: "3-6 authority themes detected from the profile",
                  },
                  tone_profile: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tone: { type: "string", enum: ["Visionary", "Analytical", "Educational", "Operational", "Opinion-driven"] },
                        strength: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["tone", "strength"],
                      additionalProperties: false,
                    },
                    description: "Tone patterns detected in the profile writing",
                  },
                  content_formats: {
                    type: "array",
                    items: { type: "string" },
                    description: "Content formats detected if posts are visible (e.g. insight post, framework breakdown, industry commentary)",
                  },
                  influence_signals: {
                    type: "object",
                    properties: {
                      posting_frequency: { type: "string", description: "Estimated posting frequency" },
                      topic_consistency: { type: "string", enum: ["high", "medium", "low"] },
                      industry_positioning: { type: "string", description: "How they position in their industry" },
                    },
                    required: ["posting_frequency", "topic_consistency", "industry_positioning"],
                    additionalProperties: false,
                  },
                  industries: {
                    type: "array",
                    items: { type: "string" },
                    description: "Industries mentioned or implied",
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "3 strategic recommendations for strengthening authority positioning",
                  },
                },
                required: [
                  "name", "headline", "strategic_positioning", "authority_themes",
                  "tone_profile", "content_formats", "influence_signals", "industries", "recommendations",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_profile" } },
        messages: [
          {
            role: "system",
            content: `You are a Senior Executive Authority Strategist. Analyze the LinkedIn profile content and extract strategic intelligence about this person's authority positioning.

Focus on:
1. What authority themes emerge from their headline, about section, experience, and any visible posts
2. Their strategic positioning — what intersection of expertise are they building authority at
3. Tone patterns in their writing
4. Content formats if posts are visible
5. Influence signals — consistency, frequency, industry positioning

Be specific, evidence-based, and strategic. Every insight should cite where you found the evidence (headline, about, experience, posts).
${isArabic ? "\nProvide the strategic_positioning in both Arabic and English." : ""}`,
          },
          {
            role: "user",
            content: `Analyze this LinkedIn profile from ${url}:\n\n${contentContext}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured analysis");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-linkedin-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
