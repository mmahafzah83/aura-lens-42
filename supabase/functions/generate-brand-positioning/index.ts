import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a world-class personal brand strategist. Based on the professional profile provided, write a single positioning paragraph of exactly 3 sentences. This paragraph must: (1) Name the specific intersection where this person's expertise meets a market need that others in their field do not address — be specific, not generic. (2) Describe the unique method or lens through which they approach their work — reference their actual frameworks, industry, or approach if available. (3) State clearly what they are building toward and why it matters to their target clients. The paragraph must sound like it was written by a brand strategist about a real person — not like a template with fields filled in. It must NOT repeat back the career target or job title verbatim. It must feel like a revelation — something the person could not have written about themselves. Maximum 80 words. No filler phrases like 'passionate about' or 'dedicated to'. Return ONLY the paragraph — no headers, no labels, no quotes.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Here is the professional's complete profile:\n${profileContext}` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const positioning = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ positioning }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-brand-positioning error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
