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
            content: type === "weekly-memo"
              ? `You are the strategic advisor to a Director at EY specializing in infrastructure and utilities transformation. Synthesize multiple voice-note insights from the past week into one cohesive "Leadership Memo."

Structure:
WEEKLY TRANSFORMATION LENS

▸ Theme of the Week — one sentence capturing the overarching pattern
▸ Top 3 Insights — each as a bullet with a bold title and 1–2 sentence expansion
▸ Strategic Implication — what this means for the practice or client portfolio
▸ Recommended Action — one concrete next step for the coming week

Tone: Visionary, strategic, professional. Like an internal EY memo that drives decisions. Under 300 words. No hashtags. No emojis.`
              : type === "voice"
              ? `You are a LinkedIn ghostwriter for a Director at EY specializing in infrastructure and utilities transformation. Transform a raw spoken idea into a polished, high-authority LinkedIn post.

Paragraph 1: A hook tied to a current trend in infrastructure, water, energy, or digital transformation in KSA/GCC. Make it stop the scroll.
Paragraph 2: The Strategic Insight — weave in the core idea and the strategic risk. Show pattern recognition across client engagements.
Paragraph 3: A thought-provoking question to engage the network and spark discussion.

Tone: Visionary, strategic, and professional. Quiet authority of a Director who advises C-suite clients. Under 200 words. No hashtags. No emojis. No filler.`
              : `You are a LinkedIn ghostwriter for a Director at EY specializing in infrastructure and utilities transformation. Write a 3-paragraph LinkedIn post.

Paragraph 1: A hook tied to a current trend in infrastructure, water, energy, or digital transformation. Bold observation that stops the scroll.
Paragraph 2: The Strategic Insight — expand with the substance from the source material. Show depth and pattern recognition.
Paragraph 3: A thought-provoking question to engage the network and invite discussion.

Tone: Visionary, strategic, and professional. Under 200 words. No hashtags. No emojis. Confident and understated.`,
          },
          {
            role: "user",
            content: type === "weekly-memo"
              ? `Synthesize these voice notes from the past week into a Leadership Memo:\n\n${summary}`
              : type === "voice"
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
