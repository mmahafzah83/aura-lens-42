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
    const body = await req.json().catch(() => ({}));
    const linkedin_text: string = (body?.linkedin_text || body?.linkedin_url || "").toString();

    if (!linkedin_text || linkedin_text.trim().length < 10) {
      return json({ error: "Tell us a bit more — paste your headline or describe your role" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("Missing LOVABLE_API_KEY");
      return json({ error: "Service not configured", fallback: true }, 200);
    }

    let pasted = linkedin_text.trim();
    if (pasted.length > 12000) pasted = pasted.substring(0, 12000);

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
                "The text below is pasted by the user from their LinkedIn profile. It may include their headline, about section, or a free-text description of their role. Extract what you can. Return ONLY valid JSON with fields: first_name, last_name, firm, level, core_practice, sector_focus, headline, about_summary, location, skills (array of up to 5). For sector_focus, map to one of: Energy & Utilities, Financial Services, Government, Healthcare, Technology, Consulting, Manufacturing, Real Estate, Telecommunications, Education, Other. If a field is not found, return null. No markdown backticks.",
            },
            {
              role: "user",
              content: `User-pasted profile text:\n${pasted}`,
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
