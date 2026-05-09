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
    const { linkedin_url } = await req.json().catch(() => ({}));

    if (!linkedin_url || typeof linkedin_url !== "string" || !linkedin_url.includes("linkedin.com/in/")) {
      return json({ error: "Valid LinkedIn profile URL required" }, 400);
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY || !LOVABLE_API_KEY) {
      console.error("Missing FIRECRAWL_API_KEY or LOVABLE_API_KEY");
      return json({ error: "Service not configured", fallback: true }, 200);
    }

    // 1) Scrape with Firecrawl
    let markdown = "";
    try {
      const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: linkedin_url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        console.error("Firecrawl error:", fcRes.status, errText);
        return json(
          { error: "Could not read this LinkedIn profile. It may be private.", fallback: true },
          200
        );
      }

      const fcData = await fcRes.json();
      markdown = fcData?.data?.markdown || fcData?.markdown || "";
      if (!markdown.trim()) {
        return json(
          { error: "Could not read this LinkedIn profile. It may be private.", fallback: true },
          200
        );
      }
    } catch (e) {
      console.error("Firecrawl fetch failed:", e);
      return json(
        { error: "Could not read this LinkedIn profile. It may be private.", fallback: true },
        200
      );
    }

    // Truncate to keep prompt reasonable
    if (markdown.length > 12000) markdown = markdown.substring(0, 12000);

    // 2) AI structured extraction
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Extract structured profile data from this LinkedIn page. Return ONLY valid JSON with fields: first_name, firm, level, core_practice, sector_focus, headline, about_summary, location, skills (array of up to 5). For sector_focus, map to one of: Energy & Utilities, Financial Services, Government, Healthcare, Technology, Consulting, Manufacturing, Real Estate, Telecommunications, Education, Other. If a field is not found, return null. No markdown backticks.",
            },
            {
              role: "user",
              content: `LinkedIn URL: ${linkedin_url}\n\nProfile content:\n${markdown}`,
            },
          ],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("AI gateway error:", aiRes.status, errText);
        return json({ error: "Could not process profile data", fallback: true }, 200);
      }

      const aiData = await aiRes.json();
      const content: string = aiData?.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

      let profile: Record<string, unknown>;
      try {
        profile = JSON.parse(cleaned);
      } catch (e) {
        console.error("AI response not valid JSON:", content);
        return json({ error: "Could not process profile data", fallback: true }, 200);
      }

      return json({ success: true, profile }, 200);
    } catch (e) {
      console.error("AI extraction failed:", e);
      return json({ error: "Could not process profile data", fallback: true }, 200);
    }
  } catch (e) {
    console.error("onboarding-linkedin-prefill error:", e);
    return json({ error: "Could not process profile data", fallback: true }, 200);
  }
});
