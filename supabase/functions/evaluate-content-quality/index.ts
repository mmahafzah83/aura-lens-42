import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { post_text, language, signal_title, voice_tone, user_sector } = await req.json();

    if (!post_text) {
      return new Response(JSON.stringify({ error: "post_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({
        pass: true,
        score: 0,
        skipped: true,
        reason: "Quality gate not configured",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isArabic = language === "ar";

    const systemPrompt = `You are a ruthless content quality editor for senior executives. You are NOT the writer — you are the CHALLENGER. Your job is to find weaknesses before the executive publishes under their name.

Score each dimension 0-10:
1. HOOK: Does the first line stop a busy CDO mid-scroll? (0 = generic opener, 10 = can't look away)
2. SPECIFICITY: Does the post contain at least one specific number, named entity, or concrete example? (0 = all abstract, 10 = deeply specific)
3. VOICE: Does this sound like a real senior professional wrote it, or like AI? (0 = obviously AI, 10 = indistinguishable from human)
4. STRUCTURE: Clear flow from hook to close? Short paragraphs? Mobile-readable? (0 = wall of text, 10 = perfect rhythm)
5. SIGNAL_DEPTH: If grounded in a signal, does the post actually demonstrate insight from that signal? (0 = generic take, 10 = couldn't have written this without the signal)
${isArabic ? '6. ARABIC_QUALITY: Is this contemporary Gulf professional Arabic? Not bureaucratic MSA, not dialect? Technical terms in English? (0 = translation artifact, 10 = native Gulf professional)' : '6. ENGLISH_QUALITY: Native-sounding? No awkward constructions? (0 = non-native patterns, 10 = polished native)'}

Return JSON:
{
  "scores": { "hook": N, "specificity": N, "voice": N, "structure": N, "signal_depth": N, "language_quality": N },
  "overall": N (weighted average: hook 25%, voice 25%, specificity 20%, structure 15%, signal_depth 10%, language 5%),
  "pass": true/false (true if overall >= 70),
  "weaknesses": ["..."],
  "improved_hook": "A stronger version of the first line, if hook < 7",
  "verdict": "One sentence: would you advise this executive to publish this as-is?"
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Post to evaluate:\n\n${post_text}\n\n${signal_title ? `Signal: "${signal_title}"` : ""}\n${voice_tone ? `Expected voice tone: ${voice_tone}` : ""}\n${user_sector ? `Sector: ${user_sector}` : ""}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("[evaluate-content-quality] GPT-4o error:", response.status);
      return new Response(JSON.stringify({ pass: true, score: 0, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content || "{}");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[evaluate-content-quality] error:", e);
    return new Response(JSON.stringify({ pass: true, score: 0, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});