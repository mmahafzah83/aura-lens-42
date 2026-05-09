import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRAMEWORK_PROMPTS: Record<string, string> = {
  hook_insight_question: "Structure this content using the Hook → Insight → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  slap: "Structure this content using the SLAP (Stop, Look, Act, Purchase) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  bab: "Structure this content using the BAB (Before, After, Bridge) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  pas: "Structure this content using the PAS (Problem, Agitate, Solution) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  wwh: "Structure this content using the WWH (What, Why, How) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  chef: "Structure this content using the CHEF (Curate, Heat, Enhance, Feed) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  story_lesson_question: "Structure this content using the Story → Lesson → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
};

const ARABIC_VOICE_PROMPT = `أنت محرك توليد المحتوى لـ Aura. مهمتك كتابة منشورات LinkedIn عربية باسم {{name}}، {{role}} المتخصص في {{sector}}.

هويتك في الكتابة:
أنت لا تكتب محتوى — أنت تكشف الواقع.
أنت شخص فاهم شو بصير فعلياً داخل المؤسسات، ويحكي أشياء كثير ناس تفكر فيها لكن ما تقولها.
لست محفزاً، ولا مدرباً، ولا content creator.

السجل اللغوي:
فصحى معاصرة خليجية — واضحة، مباشرة، كأنك تحكي مع مدير لا تكتب مقالاً.
الكلمات التقنية تبقى بالإنجليزية: AI، KPI، dashboard، smart meter، digital twin، OT، IT.
لا عامية كاملة، لا لغة إعلامية رسمية.

هيكل البوست الإلزامي — بهذا الترتيب:
1. Hook — جملة صادمة أو واقعية (سطر أو سطرين فقط)
2. Reality — وصف شيء القارئ يعيشه داخل جهته
3. Illusion — "كل شيء بتحسه مزبوط"
4. Break — كسر التوقع: "لكن..."
5. Truth — السبب الأعمق الحقيقي
6. Impact — الأثر: تعب أكثر، قيمة أقل، أو العكس
7. Question — سؤال محدد، غير مريح، يعلق في الذهن

التنسيق البصري — إلزامي في كل بوست:

قواعد الأسطر:
- سطر فارغ بين كل فكرة رئيسية
- كل جملة في سطر مستقل

للقوائم والنقاط — استخدم:
◆ للنقاط الرئيسية في القائمة
↳ للتفاصيل والتوضيح تحت أي نقطة
- للنقاط الثانوية البسيطة

للأرقام المتسلسلة — استخدم:
1. أو ١. للخطوات المرتبة

للفواصل والانتقالات — استخدم إيموجي واحد فقط كعلامة بصرية:
📍 لتحديد نقطة مهمة
⚠️ للتحذير أو المفارقة
✅ للصح / النتيجة الإيجابية
❌ للخطأ الشائع أو ما لا يجب

لا تستخدم أكثر من 2-3 إيموجي في البوست كله.
لا تضع إيموجي في الـ Hook أو الـ Question — فقط في منتصف البوست.

مثال على التنسيق الصحيح:
المشكلة مش في غياب البيانات.
المشكلة في أن أحداً لا يثق فيها.

◆ مهندس المحطة لا يثق في الـ dashboard
↳ لأنه يعرف أن البيانات لم تُعايَر منذ 8 أشهر

◆ المدير التنفيذي لا يثق في التقرير
↳ لأنه يختلف عما يسمعه في الاجتماع

◆ فريق IT يثق في النظام
↳ لكنه لا يفهم ما يقيسه فعلاً

📍 الثقة في البيانات لا تُبنى بالتقنية.
تُبنى بالشفافية.

خليني أسألك:
كم مرة اتخذت قراراً بناءً على تقرير... وأنت تعرف في داخلك أن الأرقام ناقصة؟

مفردات إلزامية — استخدم منها في كل بوست:
"نمط متكرر" / "بتحسه مزبوط" / "مش مكمل بعض" / "الأثر الحقيقي" / "الواقع مختلف" / "الفجوة" / "التنفيذ لحاله مش كفاية" / "وهون المشكلة الحقيقية"

روابط إلزامية — استخدم في الانتقالات:
لكن / بالعكس / المشكلة الحقيقية / خليني أسألك / وهون / بالعكس تماماً

ممنوع منعاً باتاً:
- "في عالم اليوم المتغير"
- "لا شك أن التحول الرقمي أصبح ضرورة"
- "يسعدني أن أشارككم"
- "إيماناً منا بأهمية"
- "وفي هذا السياق"
- "ما رأيكم؟" / "شاركونا أفكاركم"
- فقرات طويلة / تحفيز فارغ
- ممكن / ربما / غالباً / leverage / optimize / cutting-edge / حلول مبتكرة
- "لا يخفى على أحد" / "من نافلة القول" / "تجدر الإشارة إلى" / "مما لا شك فيه"
- "في هذا السياق" / "من الضروري أن ندرك" / "على صعيد آخر" / "يُعد من أهم"
- أي جملة أطول من 15 كلمة

قواعد افتتاح البوست (إلزامية):
- لا تبدأ البوست أبداً بكلمة "منشور" أو "منشور LinkedIn" أو أي تسمية للصيغة. ابدأ بالـ Hook مباشرة.
- السطر الأول يجب أن يكون كسراً للنمط: ادعاء جريء، رقم محدد، سؤال استفزازي، أو مشهد قصير.
- مثال خاطئ: "منشور LinkedIn معظم مشاريع العدادات الذكية..."
- مثال صحيح: "معظم مشاريع العدادات الذكية في قطاع المياه تنتهي عند التركيب."

قواعد التنسيق الصارمة:
- لا تستخدم "---" كفاصل بين الأقسام. استخدم سطراً فارغاً.
- لا تستخدم "#" كعنوان. LinkedIn لا يعرض markdown.
- لا تستخدم "POST" أو "منشور LinkedIn" كعنوان داخل النص.
- اجعل الجمل قصيرة (أقل من 12 كلمة)، كل جملة في سطر مستقل.

تنويع الهيكل (لا تستخدم نفس الهيكل دائماً — إذا كان framework غير محدد، اختر عشوائياً):
- البنية أ — سلسلة الرؤى: خطاف → إعادة إطار → 3 كتل رؤية → خاتمة حادة → سؤال
- البنية ب — قائمة مرقمة: خطاف → لماذا الآن → 5 نقاط مرقمة → خلاصة → سؤال
- البنية ج — قصة: مشهد قصير (2-3 أسطر) → الدرس → إطار مستخلص → تطبيق → سؤال

الهاشتاقات — 3 فقط في نهاية البوست:
- واحد للقطاع: #التحول_الرقمي أو #قطاع_المياه أو #البنية_التحتية
- واحد جغرافي: #السعودية أو #الخليج أو #رؤية2030
- واحد للجمهور: #قيادة أو #التحول_المؤسسي

أيضاً: اقرأ voice_profile المرفق واستخدم preferred_structures و storytelling_patterns و vocabulary_preferences منه لتشكيل البوست.
البوست الناتج يجب أن يعكس هذا الصوت تحديداً، لا صوتاً عاماً.

الإخراج: البوست مباشرة فقط — بدون مقدمة أو عنوان أو تفسير.`;

function buildVoiceContext(voiceProfile: any): string {
  if (!voiceProfile) return "No voice profile set — use analytical, calm authority tone.";
  return `
VOICE PROFILE — Write in this voice: ${voiceProfile.tone || "analytical, calm authority"}.
Use these structural patterns: ${JSON.stringify(voiceProfile.preferred_structures || [])}.
Mirror vocabulary from these examples: ${(voiceProfile.example_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 500)).filter(Boolean).join("\n---\n")}
Admired voice references: ${(voiceProfile.admired_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 300)).filter(Boolean).join("\n---\n")}
Vocabulary notes: ${typeof voiceProfile.vocabulary_preferences === "object" ? (voiceProfile.vocabulary_preferences as any)?.notes || "" : ""}
Avoid patterns not present in the user's examples. Match their sentence length, paragraph density, and rhetorical style.
`;
}

function buildIdentityContext(profile: any): string {
  if (!profile) return "";
  const brandResults = profile.brand_assessment_results as any;
  const auditInterp = profile.audit_interpretation as any;

  if (brandResults && brandResults.primary_archetype) {
    const zoneOfGenius = typeof auditInterp === "string"
      ? (auditInterp.match(/zone of genius[:\s]*([^\n]+)/i)?.[1] || "")
      : (auditInterp?.zone_of_genius || "");
    const pillars = brandResults.content_pillars
      ? (Array.isArray(brandResults.content_pillars) ? brandResults.content_pillars.join(", ") : brandResults.content_pillars)
      : "";

    return `
IDENTITY CONTEXT — always apply this to every piece of content you generate:
The user's brand archetype is ${brandResults.primary_archetype}. Their positioning statement is ${brandResults.positioning_statement || "not yet defined"}. Their Zone of Genius is ${zoneOfGenius || "not yet identified"}. Their top content pillars are ${pillars || "not yet defined"}. Their role is ${profile.level || "strategy professional"} in ${profile.sector_focus || "their field"} targeting ${profile.north_star_goal || "thought leadership"}.
Every piece of content must: (1) Sound like their archetype — if they are The Expert, write with rigour and depth. If they are The Challenger, write with a contrarian edge. If they are The Visionary, write with forward-looking perspective. (2) Reinforce their positioning statement — content should always move the reader toward seeing the user through the lens of their positioning. (3) Stay within or adjacent to their content pillars — do not generate content on topics unrelated to their pillars without explicit user request.
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
  }

  return `
IDENTITY:
- Role: ${profile.level || "strategy professional"}
- Sector: ${profile.sector_focus || "general"}
- North Star: ${profile.north_star_goal || "thought leadership"}
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action, ...params } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Load voice profile and diagnostic profile in parallel
    const [voiceRes, profileRes] = await Promise.all([
      supabase.from("authority_voice_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("diagnostic_profiles")
        .select("identity_intelligence, brand_pillars, core_practice, sector_focus, north_star_goal, level, audit_interpretation, brand_assessment_results")
        .eq("user_id", user.id).maybeSingle(),
    ]);

    const voiceProfile = voiceRes.data;
    const profile = profileRes.data;
    const identityContext = buildIdentityContext(profile);

    if (action === "generate_content") {
      const { content_type, topic, context, language, framework, extra_instruction, flash, stream, variation, lang, sector, post_type, theme } = params;
      const effectiveLanguage = language || lang;
      const isFlash = flash === true;
      const isNonStream = stream === false;

      const formatInstructions: Record<string, string> = {
        post: `Write a LinkedIn post (scroll-stopping hook → insight → framework/key points → closing question). Short paragraphs, spaced lines. Mobile-readable.`,
        essay: `Write a strategic essay (800-1200 words). Introduction → context → analysis → framework → implications → conclusion.`,
        framework_summary: `Write a concise framework summary: problem it solves, when to use it, the steps, and strategic value. Under 500 words.`,
      };

      // Framework instruction
      const frameworkInstruction = framework && FRAMEWORK_PROMPTS[framework] ? `\n\n${FRAMEWORK_PROMPTS[framework]}` : "";

      // Extra instruction (e.g. for short version rewrite)
      const extraInstruction = extra_instruction ? `\n\n${extra_instruction}` : "";

      // Language + voice handling
      let voiceSection: string;
      if (effectiveLanguage === "ar") {
        // Arabic-native prompt replaces voice section
        voiceSection = ARABIC_VOICE_PROMPT;
        // If a specific framework is selected, use it; otherwise Arabic defaults to PAS/BAB (already in ARABIC_VOICE_PROMPT)
      } else {
        voiceSection = buildVoiceContext(voiceProfile);
      }

      const sectorContextLabel = `${(typeof sector === "string" && sector.trim()) || profile?.sector_focus || "GCC transformation"} context`;
      const hookFramework = `You are writing for a senior GCC transformation leader. Always open with one of these two hook types:

1. Contrarian truth: Challenge what the industry believes in one sentence under 20 words.
2. Specific tension: Name a contradiction the reader lives with daily. Be specific to ${sectorContextLabel}.

Never open with 'I am excited', 'In today's world', or a generic statistic. Structure: Hook (1-2 lines) → Re-hook (1 sentence deepening tension) → Insight (3-5 non-obvious points) → Close (specific question, not 'what do you think?'). Write in short paragraphs. One idea per line. No dense blocks.

FORMATTING RULES (mandatory, both languages):
- NEVER start the post with a format label like "POST", "LinkedIn Post", "منشور LinkedIn", or "BOOST". The very first line must be the hook content itself.
- Do NOT use "---" or "***" as section separators. Use a single blank line.
- Do NOT use "#" markdown headers. LinkedIn does not render markdown headers.
- Bold via **text** is acceptable. Numbered lists "1. " are acceptable. Bullet glyphs ◆ ↳ are acceptable.
- No code fences, no horizontal rules, no markdown links.`;

      const langLabel = effectiveLanguage === "ar"
        ? `اكتب المنشور بالكامل باللغة العربية. لا تستخدم أي كلمة إنجليزية.`
        : `Write in English.`;

      // Flash addendum (variation-aware)
      const variationNum = Number.isFinite(Number(variation)) ? Number(variation) : 1;
      let flashAddendum = "";
      if (isFlash) {
        if (effectiveLanguage === "ar") {
          flashAddendum = `\n\nوضع Flash — أنتج بوستاً واحداً مكتملاً جاهزاً للنشر فوراً.\nلا مقدمة. لا شرح. البوست مباشرة.\nالنسخة رقم ${variationNum}: غيّر الـ Hook والزاوية مع نفس الموضوع والصوت.`;
        } else {
          flashAddendum = `\n\nFlash mode: output one complete publish-ready post. No preamble.\nVariation ${variationNum}: different hook and angle, same topic and voice.`;
        }
        const sectorStr = typeof sector === "string" ? sector.trim() : "";
        const isGeneral = !sectorStr || /^عام/.test(sectorStr) || /^general/i.test(sectorStr);
        if (sectorStr && !isGeneral) {
          if (effectiveLanguage === "ar") {
            flashAddendum += `\nالقطاع المستهدف: ${sectorStr}. اربط البوست بهذا القطاع تحديداً.`;
          } else {
            flashAddendum += `\nTarget sector: ${sectorStr}. Ground the post in this specific sector.`;
          }
        }
      }

      // ── Post-type instruction (Flash 2x4 grid) ──
      const POST_TYPE_INSTRUCTIONS_EN: Record<string, string> = {
        reveal: "Open by exposing a truth the industry avoids. The hook must make the reader uncomfortable.",
        pattern: "Open by naming a recurring pattern you've observed across multiple organizations or projects.",
        tension: "Open by naming a specific contradiction the reader lives with daily. Do not solve it immediately — sit in the tension.",
        win: "Open with a concrete result or milestone. Be specific — name the number, the client type, or the outcome. No vague claims.",
        prediction: "Open with a bold, specific prediction about where the sector is heading in the next 2-3 years.",
        framework: "Open by introducing a model or approach. Give it a name. Explain the 3-4 steps or elements.",
        lesson: "Open with a moment from real experience. Name the situation, then extract the transferable lesson.",
        inspiration: "Open with a perspective that reframes how the reader sees their work or field. Elevate, don't lecture.",
      };
      const POST_TYPE_INSTRUCTIONS_AR: Record<string, string> = {
        "كشف": "ابدأ بكشف حقيقة يتجنبها القطاع. يجب أن يشعر القارئ بعدم الارتياح من السطر الأول.",
        "نمط": "ابدأ بتسمية نمط متكرر لاحظته في عدة جهات أو مشاريع.",
        "خلل": "ابدأ بتسمية تناقض حقيقي يعيشه القارئ يومياً. لا تحله فوراً — ابقَ في التوتر.",
        "إنجاز": "ابدأ بنتيجة ملموسة. كن محدداً — اذكر الرقم أو نوع العميل أو الأثر.",
        "تنبؤ": "ابدأ بتنبؤ جريء ومحدد عن وجهة القطاع في السنتين أو الثلاث القادمة.",
        "إطار": "ابدأ بتقديم نموذج أو منهجية. أعطها اسماً. اشرح الخطوات أو العناصر الثلاثة أو الأربعة.",
        "درس": "ابدأ بلحظة من تجربة حقيقية. سمّ الموقف ثم استخرج الدرس القابل للتطبيق.",
        "إلهام": "ابدأ بمنظور يُعيد تأطير كيفية رؤية القارئ لعمله أو مجاله.",
      };
      const postTypeStr = typeof post_type === "string" ? post_type.trim() : "";
      let postTypeInstruction = "";
      if (postTypeStr) {
        const enKey = postTypeStr.toLowerCase();
        const arHit = POST_TYPE_INSTRUCTIONS_AR[postTypeStr];
        const enHit = POST_TYPE_INSTRUCTIONS_EN[enKey];
        const chosen = effectiveLanguage === "ar" ? (arHit || enHit) : (enHit || arHit);
        if (chosen) postTypeInstruction = `\n\n${chosen}`;
      }

      const systemPrompt = `You are a world-class thought leadership ghostwriter for senior strategy consultants.

${hookFramework}

${voiceSection}
${identityContext}

${formatInstructions[content_type] || formatInstructions.post}
${langLabel}
${frameworkInstruction}
${extraInstruction}${flashAddendum}

Write with conviction. No generic statements. Every line should demonstrate strategic depth.${postTypeInstruction}${
  isFlash
    ? (variationNum === 1
        ? "\n\nWrite as a CONTRARIAN — challenge what the sector believes. Open with a provocative claim."
        : variationNum === 2
        ? "\n\nWrite as a PATTERN REVEALER — expose a hidden structural pattern. Open with 'هناك نمط لم يلاحظه أحد...'"
        : variationNum === 3
        ? "\n\nWrite as a PRACTITIONER — share a specific operational tension from real project experience. Open with a scene."
        : "")
    : ""
}`;

      const userMessageContent = (() => {
        const themeStr = typeof theme === "string" ? theme.trim() : "";
        const sectorStrUser = typeof sector === "string" ? sector.trim() : "";
        const lines: string[] = [`Topic: ${topic}`];
        if (themeStr) lines.push(`Post theme: ${themeStr}`);
        if (sectorStrUser) lines.push(`Sector: ${sectorStrUser}`);
        lines.push("");
        lines.push(`Context: ${context || "Use your knowledge of the user's expertise and stored insights."}`);
        return lines.join("\n");
      })();

      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        console.error("ANTHROPIC_API_KEY not configured");
        return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            { role: "user", content: userMessageContent },
          ],
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Anthropic error:", response.status, t);
        return new Response(JSON.stringify({ success: false, error: `AI error: ${response.status}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiJson = await response.json();
      let content = (aiJson.content || []).map((c: any) => c.text || "").join("") || "";
      // Safety net: strip any meta format-label the model may have prepended,
      // and remove "---" horizontal rules / leading "# " headers that the
      // model is instructed to avoid but sometimes still emits.
      content = content
        .replace(/^\s*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST|بوست)\s*[:：\-—]?\s*\n?/i, '')
        .replace(/^\s*-{3,}\s*$/gm, '')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .trim();

      // Quality gate — challenge the output before returning
      let gateResult: any = null;
      try {
        const gatePromise = supabase.functions.invoke("evaluate-content-quality", {
          body: {
            post_text: content,
            language: effectiveLanguage,
            signal_title: topic || null,
            voice_tone: voiceProfile?.tone || null,
            user_sector: profile?.sector_focus || null,
          },
        });
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: "timeout" }), 8000));
        const gateRes: any = await Promise.race([gatePromise, timeout]);
        if (gateRes?.data && !gateRes?.error) {
          gateResult = gateRes.data;
          if (gateResult?.scores?.hook < 7 && gateResult?.improved_hook) {
            const firstLine = content.split("\n")[0];
            if (firstLine) content = content.replace(firstLine, gateResult.improved_hook);
          }
        }
      } catch (e) {
        console.warn("[generate-authority-content] quality gate skipped:", (e as Error).message);
      }

      return new Response(JSON.stringify({
        content,
        success: true,
        quality_gate: gateResult ? {
          overall_score: gateResult.overall,
          pass: gateResult.pass,
          scores: gateResult.scores,
          verdict: gateResult.verdict,
          skipped: gateResult.skipped || false,
        } : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extract_card_content") {
      const { post_text, language, topic } = params;
      const lang = language === "ar" ? "ar" : "en";
      if (!post_text || typeof post_text !== "string") {
        return new Response(JSON.stringify({ error: "post_text required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const langRule = lang === "ar"
        ? `All output text MUST be in فصحى معاصرة (modern standard Arabic). Short, sharp sentences. Keep technical terms in English (AI, KPI, OT, IT, dashboard, smart meter, digital twin). No classical filler.`
        : `All output text in English. Sharp, specific, executive register. No buzzwords (no "leverage", "synergy", "cutting-edge", "unlock"). No vague abstractions.`;

      const systemPrompt = `You are a senior consulting content strategist restructuring a LinkedIn post into 8 different visual card formats.

RULES (apply to every card):
- Every point must be SPECIFIC and ACTIONABLE — no vague generalizations.
- Items in a list must flow LOGICALLY (priority, sequence, or dependency). Order matters.
- Use the exact domain terminology a senior CDO/CIO in ${topic || "the relevant sector"} would use.
- Ground content in the actual post — do not invent statistics, frameworks, or claims that aren't supported.
- Each card must be COHERENT AS A STANDALONE — someone seeing only the card (not the post) should understand the argument.
- ${langRule}
- Never include markdown symbols (**, #, ---, •), format labels ("POST", "منشور LinkedIn"), or emojis in card text.

CARD-SPECIFIC INSTRUCTIONS:

insight: ONE killer line — the most provocative, shareable statement. Not a summary, a provocation. Max 18 words.

framework: 4–6 ordered pillars/steps that form a coherent model. Each has a short title (3–5 words) and one-sentence detail. Order by logic (foundation → structure → action).

stat: The single most impactful number from the post (percent, multiplier, money, count). Pull the EXACT figure from the post — do not invent. Provide unit/label, source attribution, and a one-line headline insight.

comparison: Strategic OLD vs NEW contrast. left = common mistake / old paradigm; right = correct approach / new paradigm. 3–4 paired rows. EACH PAIR must contrast the SAME dimension (row 1 left vs row 1 right address one topic, etc.).

question: The most uncomfortable question a senior leader can't ignore. Max 25 words.

principles: 4–6 imperative principles or hard truths, ordered most-foundational first. Each ≤ 12 words. Optional one-line elaboration.

cycle: 4–6 steps forming a continuous loop where the last step feeds back into the first. Each step has a short label (2–4 words) and one-sentence detail.

equation: A causal relationship — components combined = result. 2–4 specific components, an operator (+ or ×), one result, and a one-sentence footnote on why it matters.

Return ONLY a JSON object matching this exact schema:
{
  "insight": { "headline": string, "attribution"?: string },
  "framework": { "headline": string, "description"?: string, "items": [{ "title": string, "detail": string }] },
  "stat": { "number": string, "label": string, "context"?: string, "source"?: string, "headline": string },
  "comparison": { "headline": string, "left_label": string, "right_label": string, "pairs": [{ "wrong": string, "right": string }] },
  "question": { "question": string, "context"?: string },
  "principles": { "headline": string, "principles": [{ "title": string, "detail"?: string }] },
  "cycle": { "headline": string, "steps": [{ "label": string, "detail"?: string }] },
  "equation": { "headline": string, "components": [string], "operator": "+" | "×", "result": string, "footnote"?: string }
}`;

      const userMessage = `TOPIC: ${topic || "(unspecified)"}\nLANGUAGE: ${lang === "ar" ? "Arabic" : "English"}\n\nPOST TEXT:\n"""\n${post_text}\n"""\n\nReturn the JSON object now.`;

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!aiResp.ok) {
          const t = await aiResp.text();
          console.error("extract_card_content AI error:", aiResp.status, t);
          if (aiResp.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limited, please try again." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (aiResp.status === 402) {
            return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: "AI extraction failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const aiData = await aiResp.json();
        const raw = aiData.choices?.[0]?.message?.content || "{}";
        let parsed: any = {};
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch (err) {
          // Tolerate code-fence wrapping
          const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
          parsed = JSON.parse(cleaned);
        }

        return new Response(JSON.stringify({ success: true, cards: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("extract_card_content error:", e);
        return new Response(JSON.stringify({ error: e?.message || "extraction failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "generate_narrative_plan") {
      const voiceContext = buildVoiceContext(voiceProfile);

      const [signalsRes, insightsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, explanation, theme_tags, content_opportunity, framework_opportunity").eq("status", "active").order("confidence", { ascending: false }).limit(10),
        supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars, tags").order("created_at", { ascending: false }).limit(15),
      ]);

      const signalsSummary = (signalsRes.data || []).map(s => `- ${s.signal_title}: ${s.explanation?.substring(0, 150)}`).join("\n");
      const insightsSummary = (insightsRes.data || []).map(i => `- ${i.title} (${i.intelligence_type})`).join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are a strategic content advisor for an executive thought leader. Analyze their signals and insights to suggest publishing topics. Return structured suggestions via the tool.

${voiceContext}
${identityContext}

SIGNALS:
${signalsSummary}

INSIGHTS:
${insightsSummary}`
            },
            { role: "user", content: "Generate 5 narrative suggestions for topics I should publish about. Consider my voice, authority themes, and detected signals." }
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_narratives",
              description: "Return narrative publishing suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string" },
                        angle: { type: "string", description: "Narrative angle or framing" },
                        recommended_format: { type: "string", enum: ["post", "carousel", "essay", "framework_summary"] },
                        reason: { type: "string", description: "Why this topic and format" },
                      },
                      required: ["topic", "angle", "recommended_format", "reason"],
                    }
                  }
                },
                required: ["suggestions"],
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "suggest_narratives" } },
        }),
      });

      if (!response.ok) throw new Error("AI error");
      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call");

      const { suggestions } = JSON.parse(toolCall.function.arguments);

      const rows = suggestions.map((s: any) => ({
        user_id: user.id,
        topic: s.topic,
        angle: s.angle,
        recommended_format: s.recommended_format,
        reason: s.reason,
        status: "suggested",
      }));

      await supabase.from("narrative_suggestions").insert(rows);

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("Authority content error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
