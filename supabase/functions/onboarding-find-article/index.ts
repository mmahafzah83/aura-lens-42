import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TRUSTED_DOMAINS = [
  "mckinsey.com", "hbr.org", "bcg.com", "bain.com", "deloitte.com",
  "pwc.com", "ey.com", "accenture.com", "gartner.com", "forrester.com",
  "weforum.org", "reuters.com", "bloomberg.com", "ft.com",
  "thenationalnews.com", "arabnews.com", "zawya.com",
  "sloanreview.mit.edu", "strategy-business.com",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sector_focus, core_practice, firm, level } = await req.json();

    if (!sector_focus && !core_practice) {
      return new Response(
        JSON.stringify({ error: "At least sector_focus or core_practice required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
    if (!EXA_API_KEY) throw new Error("EXA_API_KEY not configured");

    const queryParts: string[] = [];
    if (core_practice) queryParts.push(core_practice);
    if (sector_focus && sector_focus !== "Other") queryParts.push(sector_focus);
    queryParts.push("strategic implications executive briefing");
    const query = queryParts.join(" ");

    const startPublishedDate = new Date(Date.now() - 30 * 86400_000).toISOString();

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
        startPublishedDate,
        includeDomains: TRUSTED_DOMAINS,
        contents: {
          text: false,
          summary: { query: "Key strategic insight from this article" },
        },
      }),
    });

    const exaData = await exaRes.json().catch(() => null);

    const safeHost = (u: string) => {
      try { return new URL(u).hostname.replace("www.", ""); } catch { return ""; }
    };

    if (!exaRes.ok || !exaData?.results?.length) {
      console.error("Exa primary search empty:", exaRes.status, exaData);

      const fallbackRes = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "x-api-key": EXA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `${core_practice || sector_focus} latest trends analysis`,
          numResults: 3,
          type: "neural",
          useAutoprompt: true,
          contents: { text: false, summary: { query: "Key insight" } },
        }),
      });

      const fallbackData = await fallbackRes.json().catch(() => null);

      if (!fallbackRes.ok || !fallbackData?.results?.length) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const best = fallbackData.results[0];
      return new Response(
        JSON.stringify({
          found: true,
          article: {
            url: best.url,
            title: best.title || "Relevant article for your sector",
            summary: best.summary || null,
            source: safeHost(best.url),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sorted = [...exaData.results].sort((a: any, b: any) => {
      const aT = TRUSTED_DOMAINS.some((d) => safeHost(a.url).includes(d)) ? 1 : 0;
      const bT = TRUSTED_DOMAINS.some((d) => safeHost(b.url).includes(d)) ? 1 : 0;
      return bT - aT;
    });
    const best = sorted[0];

    return new Response(
      JSON.stringify({
        found: true,
        article: {
          url: best.url,
          title: best.title || "Relevant article for your sector",
          summary: best.summary || null,
          source: safeHost(best.url),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("onboarding-find-article error:", e);
    return new Response(
      JSON.stringify({ found: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
