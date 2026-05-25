import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const { sector_focus, core_practice, firm, level } = await req.json().catch(() => ({}));

    if (!sector_focus && !core_practice) {
      return json({ found: false, error: "At least sector_focus or core_practice required" }, 400);
    }

    const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_KEY) {
      return json({ found: false, error: "PERPLEXITY_API_KEY not configured" }, 500);
    }

    const searchQuery = [core_practice, sector_focus].filter(Boolean).join(" ") + " strategic implications executive briefing";

    try {
      const perpRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{
            role: "system",
            content: `Find ONE recent high-quality article about ${sector_focus || core_practice} from a trusted source (McKinsey, HBR, BCG, Deloitte, EY, Gartner, industry publications). Return a JSON object: {"title": "article title", "url": "direct article URL", "summary": "2-sentence strategic summary", "source": "publisher name"}. Only 2025-2026 content.`,
          }, {
            role: "user",
            content: searchQuery,
          }],
          search_recency_filter: "month",
        }),
      });

      if (perpRes.ok) {
        const perpData = await perpRes.json();
        const content = perpData?.choices?.[0]?.message?.content || "";
        const citations = perpData?.citations || [];
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const article = JSON.parse(jsonMatch[0]);
            return json({
              found: true,
              article: {
                url: article.url || citations[0] || "",
                title: article.title || "",
                summary: article.summary || "",
                source: article.source || "Market Intelligence",
              },
            });
          }
        } catch {
          // If JSON parse fails but we have citations, use first citation
          if (citations.length > 0) {
            return json({
              found: true,
              article: {
                url: citations[0],
                title: content.slice(0, 100),
                summary: content.slice(0, 200),
                source: new URL(citations[0]).hostname.replace(/^www\./, ""),
              },
            });
          }
        }
      }
    } catch (e) {
      console.warn("Perplexity search failed:", (e as Error).message);
    }

    return json({ found: false }, 200);
  } catch (e) {
    console.error("onboarding-find-article error:", e);
    return json({ found: false }, 200);
  }
});
