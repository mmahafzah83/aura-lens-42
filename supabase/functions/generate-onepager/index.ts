import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BANNED_WORDS_NOTE = `BANNED WORDS (never use, in any language including as translations): authority (as a noun), trajectory, personal brand, thought leader, delve, tapestry, landscape, synergy, leverage (as verb), holistic, robust, utilize, comprehensive, cutting-edge, game-changer, unprecedented, paradigm.`;

const ARABIC_DNA = `═══ ARABIC WRITING DNA (NON-NEGOTIABLE) ═══

You are writing for a senior GCC executive. Your Arabic is not translated English — it's the language of a confident Director who speaks to peers over coffee. Sharp. Direct. Rhythmic.

1. SINGLE-LINE BREATHING: One idea per line. Max 8 Arabic words per line. The whitespace IS the design.

2. THE ".." PAUSE: Use ".." between thoughts to create a contemplative rhythm — a beat before the insight.
   ✅ "البيانات موجودة.. القرار غائب."
   ✗ "البيانات موجودة. القرار غائب."

3. ENGLISH TERMS STAY ENGLISH — but follow these BiDi rules:
   - NEVER attach an Arabic preposition directly to an English word
     ✗ "بـ AI"   ✅ "باستخدام AI"
   - Place English terms at line start or after ".." pause — never mid-sentence
   - First mention: Arabic explanation + English term in parentheses. After: English alone is fine.
   - Keep as English WITHOUT translation: AI, SCADA, GIS, KPI, dashboard, IoT, AMI, NRW, SLA, CIS, ERP, ROI, API, LinkedIn.
   - Numbers, percentages, and years render LTR-isolated inside Arabic sentences (e.g., "73%" stays as digits, do not spell out).

4. TONE = عامية مهنية (professional-colloquial), NOT فصحى textbook.
   ✅ "من يفهم أولاً.. يفوز"
   ✗ "المنافس الذي يفهم السوق أولاً يفوز"

5. REFRAME HOOKS: Use "السؤال ليس... بل..." patterns when it fits.

═══ ARABIC BANNED PATTERNS (AI-tells) ═══
NEVER generate:
- "في عالم اليوم المتغير" / "في عالمنا الرقمي"
- "لا يخفى على أحد" / "مما لا شك فيه"
- "في ظل التحديات" / "في هذا السياق"
- "يُعد من أهم" / "تجدر الإشارة إلى"
- "من نافلة القول" / "على صعيد آخر"
- "من الضروري أن ندرك" / "يسعدنا أن نقدم"
- "هذا المنشور يغطي" / "يتناول هذا المنشور"
- "الجزر الرقمية" / "الصوامع الرقمية"
- "بذكاء" at the start of a sentence
- Any sentence longer than 12 Arabic words (break with ".." into two lines)
`;

function buildExplainerPrompt(isArabic: boolean, voiceBlock: string) {
  return `You are the ghostwriter behind the highest-saved editorial explainer one-pagers on LinkedIn. Every asset is printed like a broadsheet page: a single, quiet, high-signal artifact a reader screenshots and forwards.

═══ READER-FACING LAW (ABSOLUTE) ═══
Every line serves the person scrolling. The author appears only as curator + point of view. NEVER print internal metrics: no confidence percentages, no Imprint number, no score, no engine tag. News and definitions stay neutral. Opinion lives in clearly-authored phrases ("the one line the official definition won't say…", "what most decks get wrong…").

═══ OUTPUT SCHEMA — ExplainerDoc (STRICT JSON) ═══
{
  "term_headline": string,   // 3-6 words. The concept itself.
  "headline_accent": string, // the sharp reframing clause; short, quotable. Rendered in accent color.
  "kicker": string,          // ALL CAPS. Frames READER value with foresight. Patterns:
                             //   "TERMS YOUR NEXT {venue} WILL USE"
                             //   "NUMBERS YOUR BOARD READS WRONG"
                             //   "WHAT THE VENDOR SLIDE LEAVES OUT"
                             //   Adapt the pattern; keep it forward-looking, not descriptive.
  "sections": [
    { "label": "WHAT IT IS",         "body": string, "fig_kind": FigKind, "fig_label": string },
    { "label": "HOW IT'S MEASURED",  "body": string, "fig_kind": FigKind, "fig_label": string }
  ],
  "next_title": "WHERE YOU'LL SEE IT NEXT",
  "next_items": [string, string, string, string]  // 4 concrete venues (2-4 words each), specific to the reader's world
}

SECTIONS RULES:
- Exactly TWO sections. Labels default to "WHAT IT IS" and "HOW IT'S MEASURED". Substitute a domain-correct equivalent only when the concept genuinely demands it (e.g. for a metric: "WHAT IT IS" + "WHAT MOVES IT"; for a technique: "WHAT IT IS" + "WHEN TO USE IT").
- Each body: 35–55 words. Contains ONE expert edge — a line the official definition would not say (a caveat, a common misread, a boundary condition, a source-of-truth note).
- fig_kind MUST be one of: line_signal | dual_curve | step_bars | s_curve | flow | capacity_bars | decay.
  Choose the one that GENUINELY matches the concept — do not repeat the same fig_kind across both sections unless the concept truly requires it. Rough guide:
    line_signal   — a single trace over time
    dual_curve    — two series compared (signal vs noise, target vs actual)
    step_bars     — discrete weekly / periodic buckets
    s_curve       — adoption / diffusion / maturation
    flow          — process or pipeline stages
    capacity_bars — filled bars vs cap; utilization
    decay         — half-life, drop-off, cooling
- fig_label: 4-6 words, sentence case, prefixed "FIG. A · " / "FIG. B · " (or Arabic "شكل أ · " / "شكل ب · ").

NEXT_ITEMS RULES:
- Exactly 4. Each 2-4 words. Concrete venues in the reader's world where the term will surface next (a specific meeting, doc, product line, KPI, forum). NOT abstract concepts.

KICKER — FORESIGHT, NOT DESCRIPTION:
✅ "TERMS YOUR NEXT BOARD PACK WILL USE"
✅ "NUMBERS YOUR CFO READS WRONG"
✗ "AN INTRODUCTION TO SIGNAL DENSITY"
✗ "GLOSSARY · STRATEGIC INTELLIGENCE"  (too generic — must promise value)

${BANNED_WORDS_NOTE}
${isArabic ? ARABIC_DNA + `

All fields Arabic. Kicker in Arabic ALL-CAPS-equivalent (Arabic doesn't have case — use bolder framing e.g. "المصطلحات التي سيستخدمها مجلسك القادم"). Labels e.g. "ما هي" + "كيف تُقاس" (or domain equivalent). next_title e.g. "أين ستراها بعد ذلك". Retain technical terms in English.
` : ""}
${voiceBlock}

OUTPUT: Valid JSON only. No markdown fences. No preamble.`;
}

function buildQAPrompt(isArabic: boolean, voiceBlock: string) {
  return `You are the ghostwriter behind the highest-saved editorial Q&A sheets on LinkedIn. Every asset is a broadsheet page — a single quiet artifact readers save and forward.

═══ READER-FACING LAW (ABSOLUTE) ═══
Every line serves the person scrolling. The author appears only as curator + point of view. NEVER print internal metrics (no confidence %, no Imprint score, no engine tag). Opinion is welcome in the answers — but as a named perspective, not as institutional prose.

═══ OUTPUT SCHEMA — QASheetDoc (STRICT JSON) ═══
{
  "topic_headline": string,   // Pattern (EN): "Five questions I keep getting about {topic}"
                              // Pattern (AR): "خمسة أسئلة تصلني عن {topic}"
  "headline_accent": string,  // The topic itself — the phrase inside the pattern that renders in accent color.
  "source_line": string,      // ALL CAPS kicker, e.g. "FROM MY INBOX · WEEK 27" or Arabic equivalent.
  "items": [                  // EXACTLY 5 items.
    { "q": string, "a": string },
    ...
  ],
  "invite": string            // Ends with a promise. EN: "— I answer every one."  AR: "..أجيب على كل سؤال"
}

ITEMS RULES:
- EXACTLY 5. No more, no fewer.
- q: A question practitioners actually ask each other. ≤ 14 words. No throat-clearing ("What do you think about…"). Get to the pain.
- a: Opens with a verdict — one of: "No." / "Yes." / "Both." / "Only if…" / "Rarely." / "Almost never." — then the reason. 25–45 words. Contains ONE quotable clause a reader would screenshot (a short, self-contained line of insight).
- Arabic verdicts: "لا." / "نعم." / "الاثنان." / "فقط إذا…" / "نادراً." / "أبداً تقريباً."

INVITE RULES:
- One or two short lines. Must end with the promise clause.
  EN example: "Send me the question you're too tired to google — I answer every one."
  AR example: "أرسل لي سؤالك الذي تعبت من البحث عنه.. أجيب على كل سؤال."

${BANNED_WORDS_NOTE}
${isArabic ? ARABIC_DNA + `
All fields Arabic (except retained technical terms). Numbers and percentages stay as digits (LTR-isolated inside Arabic). source_line in Arabic (e.g. "من صندوق البريد · الأسبوع 27" — the week number stays as digits).
` : ""}
${voiceBlock}

OUTPUT: Valid JSON only. No markdown fences. No preamble.`;
}

// ---- JSON repair (same as generate-carousel-v2) ----
function safeParseJSON(raw: string): any {
  try { return JSON.parse(raw); } catch {}
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start > 0) cleaned = cleaned.substring(start);
  try { return JSON.parse(cleaned); } catch {}
  const tryRepair = (input: string): string => {
    let inStr = false, esc = false;
    let lastSafe = -1;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "}" || c === "]") lastSafe = i;
    }
    let s = input;
    if (inStr && lastSafe > 0) s = input.substring(0, lastSafe + 1);
    const stk: string[] = [];
    let inS = false, es = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (es) { es = false; continue; }
      if (c === "\\") { es = true; continue; }
      if (c === '"') { inS = !inS; continue; }
      if (inS) continue;
      if (c === "{") stk.push("}");
      else if (c === "[") stk.push("]");
      else if (c === "}" || c === "]") stk.pop();
    }
    s = s.replace(/[,\s]+$/, "");
    while (stk.length) s += stk.pop();
    return s;
  };
  return JSON.parse(tryRepair(cleaned));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authUserId = user.id;

    const body = await req.json();
    const { type, topic, signal_id, lang = "en", user_id } = body || {};
    if (type !== "explainer" && type !== "qa") {
      return new Response(JSON.stringify({ error: "type must be 'explainer' or 'qa'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetUserId = user_id || authUserId;
    const isArabic = lang === "ar";
    const dbContentType = type === "explainer" ? "explainer" : "qa_sheet";

    // Compute series_no server-side
    const { count: existingCount } = await supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("content_type", dbContentType);
    const seriesNo = (existingCount || 0) + 1;

    // Signal (optional)
    let signal: any = null;
    if (signal_id) {
      const { data } = await supabase
        .from("strategic_signals")
        .select("signal_title, explanation")
        .eq("id", signal_id)
        .maybeSingle();
      signal = data;
    }

    // Profile
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("first_name, last_name, level, firm, sector_focus")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const p: any = profile || {};
    const authorFullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Author";
    const authorTitle = [p.level, p.firm].filter(Boolean).join(" · ").trim();

    // Voice profile
    const { data: voiceProfile } = await supabase
      .from("authority_voice_profiles")
      .select("tone, preferred_structures, storytelling_patterns, vocabulary_preferences, example_posts")
      .eq("user_id", targetUserId)
      .eq("language", lang)
      .maybeSingle();

    const voiceBlock = `
═══ USER VOICE PROFILE (adapt tone only — never structure) ═══
${voiceProfile ? `Voice tone: ${voiceProfile.tone || "analytical, calm confidence"}
Preferred structures: ${JSON.stringify(voiceProfile.preferred_structures || [])}
Storytelling patterns: ${JSON.stringify(voiceProfile.storytelling_patterns || [])}
${voiceProfile.vocabulary_preferences ? `Vocabulary notes: ${typeof voiceProfile.vocabulary_preferences === "object" ? JSON.stringify(voiceProfile.vocabulary_preferences) : voiceProfile.vocabulary_preferences}` : ""}
${Array.isArray(voiceProfile.example_posts) ? `Reference posts (match this voice):
${voiceProfile.example_posts.slice(0, 3).map((pp: any) => (pp.content || "").substring(0, 300)).filter(Boolean).join("\n---\n")}` : ""}

Adapt tone, rhythm, and vocabulary to match this user. The voice profile OVERRIDES generic tone instructions but NEVER overrides schema, word limits, BiDi rules, or banned phrases — those are structural.` : "No voice profile — use confident, direct executive tone."}
`;

    const systemPrompt = type === "explainer"
      ? buildExplainerPrompt(isArabic, voiceBlock)
      : buildQAPrompt(isArabic, voiceBlock);

    const signalLine = signal
      ? (isArabic
          ? `اربط المحتوى بهذه الإشارة (لا تطبع أي نسبة ثقة): ${signal.signal_title}${signal.explanation ? " — " + signal.explanation : ""}`
          : `Ground the content in this signal (do NOT print any confidence value): ${signal.signal_title}${signal.explanation ? " — " + signal.explanation : ""}`)
      : "";

    const authorLine = isArabic
      ? `المؤلف (للسياق فقط، لا تُدرج الاسم): ${authorFullName}${authorTitle ? `، ${authorTitle}` : ""}${p.sector_focus ? `، القطاع: ${p.sector_focus}` : ""}`
      : `Author context (for tone only — do not print the name): ${authorFullName}${authorTitle ? `, ${authorTitle}` : ""}${p.sector_focus ? `, sector: ${p.sector_focus}` : ""}`;

    const userMessage = type === "explainer"
      ? (isArabic
          ? `أنشئ صفحة تعريفية editorial حول: ${topic}\n${signalLine}\n${authorLine}\nرقم الحلقة في السلسلة: ${seriesNo}`
          : `Create an editorial ExplainerDoc for: ${topic}\n${signalLine}\n${authorLine}\nSeries number: ${seriesNo}`)
      : (isArabic
          ? `أنشئ ورقة أسئلة وأجوبة editorial حول: ${topic}\n${signalLine}\n${authorLine}\nرقم الحلقة: ${seriesNo}\nيجب أن يكون العنوان بنمط "خمسة أسئلة تصلني عن ${topic}" مع ${topic} في headline_accent.`
          : `Create an editorial QASheetDoc for: ${topic}\n${signalLine}\n${authorLine}\nSeries number: ${seriesNo}\nThe topic_headline MUST follow the pattern "Five questions I keep getting about ${topic}" with "${topic}" placed in headline_accent.`);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Also ask for caption + hashtags in a single call: append to user message.
    const captionSpec = isArabic
      ? `\n\nAlso return "linkedin_caption" (≤120 كلمة، تبدأ بخطاف، لا تصف الأصل نفسه) و "hashtags" (5 هاشتاقات مزيج عربي/إنجليزي) في نفس الـ JSON على المستوى الأعلى.`
      : `\n\nAlso include, at the top level of the SAME JSON: "linkedin_caption" (≤120 words, hook-first, never describes the asset itself) and "hashtags" (array of exactly 5, mix of broad + niche).`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage + captionSpec }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Aura is busy — try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = (aiData.content || []).map((c: any) => c.text || "").join("") || "{}";

    let parsed: any;
    try {
      parsed = safeParseJSON(raw);
    } catch (e) {
      console.error("JSON parse failed. Raw first 500:", raw.substring(0, 500));
      throw new Error("AI returned malformed JSON. Try regenerating.");
    }

    // Normalize + enforce shape
    parsed.lang = lang;
    parsed.series_no = seriesNo;
    if (!Array.isArray(parsed.hashtags)) parsed.hashtags = [];
    parsed.hashtags = parsed.hashtags.slice(0, 5);
    if (typeof parsed.linkedin_caption !== "string") parsed.linkedin_caption = "";

    if (type === "qa") {
      if (!Array.isArray(parsed.items)) parsed.items = [];
      // Trim / pad to exactly 5 items when the model overshoots
      if (parsed.items.length > 5) parsed.items = parsed.items.slice(0, 5);
    } else {
      if (!Array.isArray(parsed.sections)) parsed.sections = [];
      parsed.sections = parsed.sections.slice(0, 2);
      if (!Array.isArray(parsed.next_items)) parsed.next_items = [];
      parsed.next_items = parsed.next_items.slice(0, 4);
      if (!parsed.next_title) parsed.next_title = isArabic ? "أين ستراها بعد ذلك" : "WHERE YOU'LL SEE IT NEXT";
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-onepager error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});