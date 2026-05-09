import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { linkedin_url } = await req.json();

    if (!linkedin_url || !String(linkedin_url).includes("linkedin.com/in/")) {
      return new Response(
        JSON.stringify({ error: "Valid LinkedIn profile URL required (linkedin.com/in/...)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
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

    const scrapeData = await scrapeRes.json().catch(() => null);

    if (!scrapeRes.ok || !scrapeData) {
      console.error("Firecrawl scrape failed:", scrapeRes.status, scrapeData);
      return new Response(
        JSON.stringify({
          error: "Could not read this LinkedIn profile. It may be private or the URL format is incorrect.",
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const markdown = scrapeData?.data?.markdown ?? scrapeData?.markdown ?? "";

    if (!markdown || markdown.length < 50) {
      return new Response(
        JSON.stringify({
          error: "LinkedIn profile content was too short to extract. The profile may be private.",
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const extractionPrompt = `You are extracting structured professional data from a LinkedIn profile page.

From the following LinkedIn profile content, extract these fields. If a field is not clearly present, return null for that field. Do NOT guess or fabricate — only extract what's explicitly stated.

Return ONLY valid JSON with this exact structure:
{
  "first_name": "string or null",
  "firm": "string or null — current company/employer",
  "level": "string or null — current job title/level (e.g., Director, Senior Manager, VP)",
  "core_practice": "string or null — their main professional discipline (e.g., Digital Transformation, Strategy Consulting, Data Analytics)",
  "sector_focus": "string or null — primary industry they work in",
  "headline": "string or null — their LinkedIn headline verbatim",
  "about_summary": "string or null — first 2 sentences of their About section",
  "experience_years": "number or null",
  "avatar_url": "string or null",
  "location": "string or null",
  "skills": ["array of up to 5 key skills mentioned"]
}

RULES:
- For "firm": use the company name from their CURRENT (topmost/first listed) role only
- For "level": extract the title from their CURRENT role only
- For "core_practice": synthesize from their headline + current role + about section
- For "sector_focus": map to one of: Energy & Utilities, Financial Services, Government, Healthcare, Technology, Consulting, Manufacturing, Real Estate, Telecommunications, Education, Other
- For "skills": max 5
- Return ONLY the JSON object — no markdown backticks, no explanation`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `LinkedIn profile content:\n\n${markdown.slice(0, 8000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI extraction failed:", aiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Could not process profile data", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    let extractedText = aiData.choices?.[0]?.message?.content || "";
    extractedText = extractedText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let profile;
    try {
      profile = JSON.parse(extractedText);
    } catch (parseErr) {
      console.error("JSON parse failed:", extractedText.slice(0, 200));
      return new Response(
        JSON.stringify({ error: "Could not parse profile data", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, profile, source: "linkedin" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("onboarding-linkedin-prefill error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", fallback: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
