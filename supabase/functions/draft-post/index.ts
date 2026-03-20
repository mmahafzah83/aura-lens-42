import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

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

    const inputText = `${title || ""} ${summary || ""} ${content || ""}`;
    const isArabic = hasArabic(inputText);
    const bilingualNote = isArabic
      ? "\n\nIMPORTANT: The source material contains Arabic. Write the output in BOTH Arabic and English. First the Arabic version, then '---', then the English version."
      : "";

    const COACH_TONE = `Tone: Visionary but grounded. Quiet authority. You are a peer — not a cheerleader.

BANNED WORDS: Never use "delve," "tapestry," "landscape," "synergy," "leverage" (as verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal). These sound like AI wrote it.

EXECUTIVE SCANNABILITY FORMAT (mandatory):
1. THE HOOK — One bold, standalone sentence about a strategic shift. This is the scroll-stopper. No preamble.
2. WHITESPACE — Every sentence gets its own line. Max 2 lines per paragraph. Let the reader breathe.
3. THE 'SO WHAT?' — Exactly 3 bullet points using ◈ or ➔ symbols. Each bullet is one sharp insight (max 15 words).
4. THE CTA — End with a single thought-provoking question to the industry. Not engagement bait — a real question that challenges assumptions.

No hashtags. No emojis except ◈ and ➔. Under 150 words total.`;

    const systemPrompts: Record<string, string> = {
      "weekly-memo": `You are a Senior Executive Coach and peer to a Director at EY who aspires to be a "Transformation Architect." Synthesize multiple voice-note insights from the past week into one cohesive Leadership Memo.

Structure:
WEEKLY TRANSFORMATION LENS

▸ Theme of the Week — one sentence capturing the overarching pattern
▸ Top 3 Insights — each as a bullet with a bold title and 1–2 sentence expansion
▸ Strategic Implication — what this means for the practice or client portfolio
▸ Recommended Action — one concrete next step for the coming week

▸ THE COACH'S CHALLENGE
Look at the weaknesses and blind spots from this week's thinking. Identify where the executive is avoiding discomfort, over-indexing on strengths, or missing the C-suite lens. Then ask ONE difficult, specific question that would prepare them for their next client meeting. The question should sting slightly — it should be the question a trusted peer would ask over a late-night drink, not in a boardroom.

${COACH_TONE}${bilingualNote}`,

      "voice": `You are a Senior Executive Coach and LinkedIn ghostwriter for a Director at EY who aspires to be a "Transformation Architect." Transform a raw spoken idea into a polished, high-authority LinkedIn post.

${COACH_TONE}

Context focus: infrastructure, water, energy, or digital transformation in KSA/GCC.${bilingualNote}`,

      "default": `You are a Senior Executive Coach and LinkedIn ghostwriter for a Director at EY who aspires to be a "Transformation Architect." Write a LinkedIn post from the source material.

${COACH_TONE}

Context focus: infrastructure, water, energy, or digital transformation.${bilingualNote}`,

      "arabic-executive": `أنت مستشار تنفيذي أول وكاتب محتوى لينكدإن لمدير في EY يُعرف بلقب "مهندس التحول."

اكتب منشور لينكدإن باللغة العربية الفصحى الراقية بأسلوب "التنفيذي السعودي":

القواعد:
- اللغة: عربية فصحى رسمية، رؤيوية، تتماشى مع مصطلحات رؤية السعودية 2030
- استخدم مصطلحات مثل: التحول الرقمي، الاستدامة، تمكين القطاع الخاص، رأس المال البشري، الحوكمة، التميز المؤسسي
- لا تستخدم لغة عامية أو مبالغة عاطفية

الهيكل:
1. الافتتاحية — جملة واحدة جريئة عن تحول استراتيجي
2. فراغات — كل جملة في سطر مستقل
3. الرؤية — ٣ نقاط باستخدام ◈ أو ➔ (كل نقة بحد أقصى ١٥ كلمة)
4. السؤال — سؤال واحد يتحدى الافتراضات السائدة في القطاع

بدون هاشتاقات. بدون إيموجي إلا ◈ و ➔. أقل من ١٥٠ كلمة.`,

      "translate-executive-ar": `أنت مترجم تنفيذي محترف. ترجم المحتوى التالي إلى العربية الفصحى الراقية بأسلوب يليق بالمستوى التنفيذي.

القواعد:
- استخدم مصطلحات رؤية السعودية 2030 حيثما كان ذلك مناسباً
- حافظ على النبرة الاستراتيجية والمهنية
- لا تترجم حرفياً — أعد صياغة المعنى بأسلوب عربي أصيل وراقٍ
- إذا كان المحتوى يتضمن أُطر عمل أو نماذج، حافظ على مصطلحاتها الإنجليزية بين قوسين
- اعرض الترجمة بتنسيق واضح مع عناوين فرعية`,
    };

    const userPrompts: Record<string, string> = {
      "weekly-memo": `Synthesize these voice notes from the past week into a Leadership Memo with a Coach's Challenge:\n\n${summary}`,
      "voice": `Turn this raw voice note into a polished LinkedIn brand post:\n\nTranscript: ${content || "N/A"}\nSenior Partner Analysis: ${summary || "N/A"}`,
      "arabic-executive": `اكتب منشور لينكدإن عربي بأسلوب التنفيذي السعودي من هذا المحتوى:\n\nالعنوان: ${title || "N/A"}\nالملخص: ${summary || "N/A"}\nالمصدر: ${content || "N/A"}`,
      "translate-executive-ar": `ترجم المحتوى التالي إلى العربية التنفيذية:\n\nالعنوان: ${title || "N/A"}\nالملخص: ${summary || "N/A"}\nالمحتوى: ${content || "N/A"}`,
      "default": `Draft a LinkedIn post based on this:\n\nTitle: ${title || "N/A"}\nSummary: ${summary || "N/A"}\nSource: ${content || "N/A"}`,
    };

    const sysPrompt = systemPrompts[type as string] || systemPrompts["default"];
    const userPrompt = userPrompts[type as string] || userPrompts["default"];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
