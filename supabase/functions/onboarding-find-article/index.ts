import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { sector_focus, core_practice, firm, level } = await req.json().catch(() => ({}));

    if (!sector_focus && !core_practice) {
      return json({ found: false, error: "At least sector_focus or core_practice required" }, 400);
    }

    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
    if (!EXA_API_KEY) {
      return json({ found: false, error: "EXA_API_KEY not configured" }, 500);
    }

    // Build search query
    const parts = [core_practice, sector_focus].filter(Boolean);
    const query = `${parts.join(" ")} strategic implications executive briefing`.trim();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    // Trusted consulting / news domains
    const includeDomains = [
      "mckinsey.com",
      "hbr.org",
      "bcg.com",
      "bain.com",
      "deloitte.com",
      "pwc.com",
      "ey.com",
      "accenture.com",
      "gartner.com",
      "forrester.com",
      "weforum.org",
      "reuters.com",
      "bloomberg.com",
      "ft.com",
      "thenationalnews.com",
      "arabnews.com",
      "zawya.com",
      "sloanreview.mit.edu",
      "strategy-business.com",
    ];

    // 1) Primary search with domain restrictions
    let results: any[] = [];
    try {
      const exaRes = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "x-api-key": EXA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          numResults: 5,
          type: "neural",
          useAutoprompt: true,
          startPublishedDate: thirtyDaysAgo,
          includeDomains,
          contents: { text: false, summary: { query: "Key strategic insight from this article" } },
        }),
      });

      if (exaRes.ok) {
        const exaData = await exaRes.json();
        results = exaData.results || [];
      } else {
        console.warn("Exa primary search non-OK:", exaRes.status);
      }
    } catch (e) {
      console.warn("Exa primary search failed:", (e as Error).message);
    }

    // Pick first result if any
    if (results.length > 0) {
      const first = results[0];
      return json({
        found: true,
        article: {
          url: first.url || "",
          title: first.title || "",
          summary: first.text || first.summary || "",
          source: new URL(first.url || "https://example.com").hostname.replace(/^www\./, ""),
        },
      }, 200);
    }

    // 2) Fallback search without domain restrictions
    const fallbackQuery = `${core_practice || sector_focus} latest trends analysis`.trim();
    try {
      const fallbackRes = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "x-api-key": EXA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: fallbackQuery,
          numResults: 3,
          type: "neural",
          category: "research report",
          contents: { text: false, summary: { query: "Key strategic insight from this article" } },
        }),
      });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const fallbackResults = fallbackData.results || [];
        if (fallbackResults.length > 0) {
          const first = fallbackResults[0];
          return json({
            found: true,
            article: {
              url: first.url || "",
              title: first.title || "",
              summary: first.text || first.summary || "",
              source: new URL(first.url || "https://example.com").hostname.replace(/^www\./, ""),
            },
          }, 200);
        }
      } else {
        console.warn("Exa fallback search non-OK:", fallbackRes.status);
      }
    } catch (e) {
      console.warn("Exa fallback search failed:", (e as Error).message);
    }

    // Nothing found
    return json({ found: false }, 200);
  } catch (e) {
    console.error("onboarding-find-article error:", e);
    return json({ found: false }, 200);
  }
});
