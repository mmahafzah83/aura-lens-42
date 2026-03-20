import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, summary, content, type } = await req.json();
    if (!summary && !content) {
      return new Response(JSON.stringify({ error: "Content or summary is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: type === "voice"
              ? `You are a LinkedIn ghostwriter for a C-suite executive in infrastructure and utilities. Transform a raw spoken idea into a polished, high-authority LinkedIn post.

Paragraph 1: A commanding opening — state the insight as if you've seen it firsthand across 50 client engagements.
Paragraph 2: The substance — weave in the strategic risk and technical depth. Show pattern recognition. Reference real industry dynamics.
Paragraph 3: The forward-looking close — what leaders should be doing NOW. Confident, not preachy.

Tone: Quiet authority. Like a Senior Partner who doesn't need to prove anything. Under 200 words. No hashtags. No emojis. No filler.`
              : `You are a LinkedIn ghostwriter for a senior executive. Write a 3-paragraph LinkedIn post in a professional, visionary tone. 
Paragraph 1: Hook — a bold observation or insight that stops the scroll.
Paragraph 2: Substance — expand with data, context, or a personal take.
Paragraph 3: Call to action or forward-looking statement.
Keep it under 200 words. No hashtags. No emojis. Confident and understated.`,
          },
          {
            role: "user",
            content: type === "voice"
              ? `Turn this raw voice note into a polished LinkedIn brand post:\n\nTranscript: ${content || "N/A"}\nSenior Partner Analysis: ${summary || "N/A"}`
              : `Draft a LinkedIn post based on this:\n\nTitle: ${title || "N/A"}\nSummary: ${summary || "N/A"}\nSource: ${content || "N/A"}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const post = aiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ post }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("draft-post error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
