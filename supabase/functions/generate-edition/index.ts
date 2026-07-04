import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BANNED_WORDS_NOTE = `BANNED WORDS (any language, including as translations): authority (noun), trajectory, personal brand, thought leader, delve, tapestry, landscape, synergy, leverage (verb), holistic, robust, utilize, comprehensive, cutting-edge, game-changer, unprecedented, paradigm.`;

const ARABIC_DNA = `═══ ARABIC WRITING DNA (NON-NEGOTIABLE) ═══
You are compiling a weekly publication for a senior GCC executive. Arabic that reads like a confident Director speaking to peers — not translated English.

1. SINGLE-LINE BREATHING: One idea per line. Max 8 Arabic words per visual line. Whitespace IS the design.
2. THE ".." PAUSE: Use ".." between thoughts for rhythm. ✅ "البيانات موجودة.. القرار غائب."
3. ENGLISH TERMS STAY ENGLISH — BiDi rules:
   - Never attach Arabic preposition to English word (✗ "بـ AI"  ✅ "باستخدام AI").
   - Place English terms at line start or after ".." pause.
   - First mention: Arabic + (English in parentheses). After: English alone is fine.
   - Keep in English: AI, SCADA, GIS, KPI, dashboard, IoT, AMI, NRW, SLA, CIS, ERP, ROI, API, LinkedIn.
   - Numerals (73%, 2.4×, 287d) stay Western digits, LTR-isolated inside Arabic sentences.
4. TONE = عامية مهنية, NOT فصحى textbook.
5. Sentences longer than 12 Arabic words must break into two lines with "..".

═══ ARABIC BANNED PATTERNS (AI-tells) ═══
NEVER: "في عالم اليوم المتغير", "لا يخفى على أحد", "مما لا شك فيه", "في ظل التحديات", "في هذا السياق", "يُعد من أهم", "تجدر الإشارة إلى", "من نافلة القول", "على صعيد آخر", "من الضروري أن ندرك", "يسعدنا أن نقدم", "يتناول هذا المنشور", "الجزر الرقمية", "الصوامع الرقمية", "بذكاء" as a sentence opener.
`;

// -------- JSON repair (mirror of generate-carousel-v2) --------
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

// -------- ISO week helpers --------
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function formatDatelineEN(d: Date): string {
  const wk = isoWeek(d);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `Week ${wk} · ${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function formatDatelineAR(d: Date): string {
  const wk = isoWeek(d);
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `الأسبوع ${wk} · ${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function weekdayName(lang: string): string {
  const en = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const ar = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  const idx = new Date().getUTCDay();
  return lang === "ar" ? ar[idx] : en[idx];
}

function buildSystemPrompt(isArabic: boolean, voiceBlock: string, storyCount: number, editionNo: number, weekday: string, hasDigest: boolean) {
  const deckEN = `Three developments from this week's reading — compiled into one edition, for you.`;
  const deckAR = `ثلاثة تطورات من قراءتي هذا الأسبوع.. جمعتها في إصدار واحد، لأجلك.`;
  const deckLine = isArabic
    ? deckAR.replace(/ثلاثة/, storyCount === 3 ? "ثلاثة" : storyCount === 2 ? "اثنان" : "أربعة")
    : deckEN.replace(/^Three/, storyCount === 3 ? "Three" : storyCount === 2 ? "Two" : `${storyCount}`);
  return `You are the compiler behind a weekly personal LinkedIn publication called an EDITION. You transform the author's real strategic signals + reading captures from this week INTO a single broadsheet-style publication their network reads on Sunday.

═══ READER-FACING LAW (ABSOLUTE) ═══
Every line serves the reader. The author appears only as curator + point of view. NEVER print internal metrics: no confidence percentages, no scores, no capture counts, no engine tags. News lines are neutral. Opinion lives in the "my_read" block on each ARTICLE page — clearly authored, first-person.

═══ FRONT-PAGE DECK (MANDATORY EXACT SHAPE) ═══
The front page "deck" field must follow this line, adapted only for actual story count (${storyCount}):
${isArabic ? `AR: "${deckLine}"` : `EN: "${deckLine}"`}

═══ SECTION VOCABULARY ═══
Derive a SINGLE uppercase newspaper section tag per ARTICLE from the user's sector_focus + that signal's theme.
Examples:
  finance / capital markets → TREASURY | MARKETS | REGULATION | RATES | M&A
  water / infrastructure    → WATER | CYBER | DELIVERY | GRID | OPS
  health / life sciences    → CLINICAL | CAPACITY | PAYERS | ACCESS | REGULATION
  energy / utilities        → GRID | GENERATION | TARIFFS | STORAGE | CYBER
  tech / ai                 → MODELS | PLATFORMS | GOVERNANCE | RISK | INFRA
Rules:
- One WORD only, UPPERCASE.
- Newspaper-legible — a real section a paper could carry.
- NEVER a slide-type name (COVER, GRID, COMPARE…), NEVER a score or scale label.

═══ OUTPUT SCHEMA — Edition JSON (STRICT) ═══
{
  "sector_line": string,       // 2-3 domain words · region (e.g. "TREASURY · MARKETS · GCC")
  "linkedin_caption": string,  // ≤120 words, hook-first, never describes the asset. Ends with an invitation to open the edition.
  "hashtags": string[],        // 5-7 tags, mix broad + niche
  "pages": [ ... ordered ... ]
}
(The server injects nameplate, edition_no, dateline, lang after generation — do not worry about those three.)

─── PAGE 1: FRONT ───
{
  "page_type": "FRONT",
  "kicker": "THIS WEEK'S LEAD",         // AR: "افتتاحية الأسبوع"
  "lead_headline": string,              // ≤10 words. News-first. Name the actor + move.
  "lead_accent": string,                // The italic turn — the phrase the reader will screenshot. Rendered in accent color.
  "deck": string,                       // The mandated line above, with correct count.
  "fig": { "kind": "line_signal"|"dual_curve"|"step_bars"|"s_curve"|"flow"|"capacity_bars"|"decay", "label": string },
  "toc": [ { "title": string /* ≤8 words */, "section": string /* the same UPPERCASE tag */, "page": number } ],
  "also_inside": [ "The Weekend Digest · P.{n}", "You Asked · P.{n}" ]  // AR: "الملخّص الأسبوعي · ص.{n}", "أنت سألت · ص.{n}"
}

─── ONE ARTICLE PAGE PER SIGNAL (there are ${storyCount}) ───
{
  "page_type": "ARTICLE",
  "section": string,           // one-word UPPERCASE section tag
  "story_no": "Story {x} of {y}",  // AR: "قصة {x} من {y}"
  "kicker": string,            // The story title, ≤8 words. Slightly editorial.
  "headline": string,          // The development itself, ≤12 words. News language.
  "headline_accent": string,   // The clause inside the headline that is rendered in accent color.
  "fig": { "kind": string, "label": string },
  "body": string,              // THE NEWS. Neutral, 30-45 words. No opinion. Factual clause + implication clause.
  "my_read": string,           // POINT OF VIEW. 2 sentences, 30-45 words total. First person ("I…"/"في رأيي.."). Rework the signal's what_it_means_for_you into the author's voice. THIS is where the voice profile carries the most weight.
  "source_line": string        // "Source — {names} · read this week" using ONLY the provided capture titles/account_names. Never invent a publication.
                               // AR: "المصدر — {names} · قراءات الأسبوع"
}

${hasDigest ? `─── DIGEST PAGE ───
{
  "page_type": "DIGEST",
  "kicker": "THE WEEKEND DIGEST",     // AR: "الملخّص الأسبوعي"
  "intro": string,                    // MANDATED — use EXACTLY: EN "No links to chase. No open tabs. Three numbers that reframe the week." · AR "لا روابط تطاردها.. لا تبويبات مفتوحة. ثلاثة أرقام تعيد قراءة الأسبوع."
  "items": [
    { "big_value": string /* "2.4×" | "287d" | "§7b" | "73%" — Western digits even in AR, LTR-isolated */,
      "claim": string /* ≤6 words — a COMPLETE phrase, never cut mid-thought (the renderer wraps 2 lines and truncates with "…") */,
      "takeaway": string /* ≤22 words — MUST end on a complete sentence, never cut mid-thought */,
      "source": string /* capture name — attribution, not destination URL */ },
    ... 3 items total
  ],
  "close": "If one number stays with you into Monday's first meeting — this page did its job."  // AR: "لو بقي رقم واحد معك حتى اجتماع الاثنين.. هذه الصفحة أدّت مهمتها."
}` : `─── DIGEST PAGE ───
OMIT the DIGEST page entirely — do not emit it. Skip straight from the last ARTICLE to the QA page.
On the FRONT page, "also_inside" MUST list only pages that actually exist: "You Asked · P.{n}" and (optionally) "Until Next {Weekday} · P.{n}". Do NOT reference a Weekend Digest.`}

─── QA PAGE ───
{
  "page_type": "QA",
  "kicker": "YOU ASKED",              // AR: "أنت سألت"
  "question": string,                 // ≤20 words. Use the provided qa_question verbatim if given; else write the sharpest practitioner objection to the lead story.
  "asked_by_role": string,            // Plausible role + region — e.g. "CFO · UAE". NEVER a personal name.
  "answer": string,                   // Verdict-first ("No." / "Only if…" / "Both."), 40-60 words, contains ONE quotable clause.
  "invite": string                    // "…the best question opens Edition Nº ${editionNo + 1}." — same in AR with Arabic prefix
}

─── BACK PAGE ───
{
  "page_type": "BACK",
  "kicker": "UNTIL NEXT ${weekday.toUpperCase()}",   // AR: "حتى ${weekday} القادم"
  "headline": string,                 // "If this saved you an hour…" spirit, ≤14 words.
  "headline_accent": string,          // The clause inside the headline rendered in accent color.
  "promise": string,                  // The send-it-to-one-person line — one specific instruction.
  "sign_name": string,                // First name only — the server may overwrite; still emit it.
  "sign_line": string,                // "{level} · {firm}"
  "follow_label": "Follow for Edition Nº ${editionNo + 1}",  // AR: "تابع للإصدار رقم ${editionNo + 1}"
  "follow_sub": "Every ${weekday}. One week of reading, one edition."  // AR equivalent
}

═══ PAGINATION ═══
FRONT is page 1. ARTICLE pages start at page 2 and are sequential. ${hasDigest ? "DIGEST, QA, BACK follow in that order." : "QA follows the last ARTICLE directly, then BACK. There is NO DIGEST page."} The FRONT toc entries MUST reference the correct page number of each ARTICLE.

═══ SOURCING DISCIPLINE ═══
- Source names in source_line and DIGEST items come ONLY from the provided captures (their title / account_name) or the provided signal titles. Do NOT invent a publication.
- Every number in an ARTICLE body or DIGEST item MUST be supported by the provided material — or omit the number.
- NEVER surface confidence values, scores, or how many captures fed the edition.

${BANNED_WORDS_NOTE}
${isArabic ? ARABIC_DNA : `Write in English. Voice: a peer strategist, not a management consultant. GCC senior leader audience.`}
${voiceBlock}

OUTPUT: Valid JSON only. No markdown fences. No preamble.`;
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

    const body = await req.json().catch(() => ({}));
    const { user_id, lang = "en", signal_ids, qa_question, current_edition_no } = body || {};
    const targetUserId = user_id || authUserId;
    const isArabic = lang === "ar";

    // ---- profile ----
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("first_name, last_name, level, firm, sector_focus, identity_intelligence")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const p: any = profile || {};
    const authorFullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Author";
    const authorTitle = [p.level, p.firm].filter(Boolean).join(" · ").trim();
    const firstName = p.first_name || (isArabic ? "الكاتب" : "Author");

    // nameplate
    const identityPub = p.identity_intelligence?.publication;
    const nameplate = identityPub && identityPub.name
      ? { name: identityPub.name, style: identityPub.style || (isArabic ? "arabic" : "classic"), monogram_char: identityPub.monogram_char }
      : { name: isArabic ? `نشرة ${firstName}` : `The ${firstName} Brief`, style: isArabic ? "arabic" : "classic" };

    // ---- edition_no ----
    let editionNo: number;
    if (typeof current_edition_no === "number" && current_edition_no > 0) {
      editionNo = current_edition_no;
    } else {
      const { count } = await supabase
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId)
        .eq("content_type", "edition");
      editionNo = (count || 0) + 1;
    }

    // ---- signals ----
    const signalCols = "id, signal_title, explanation, strategic_implications, what_it_means_for_you, theme_tags, created_at";
    let signals: any[] = [];
    if (Array.isArray(signal_ids) && signal_ids.length > 0) {
      const { data } = await supabase
        .from("strategic_signals")
        .select(signalCols)
        .eq("user_id", targetUserId)
        .in("id", signal_ids.slice(0, 4));
      signals = data || [];
    } else {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: fresh } = await supabase
        .from("strategic_signals")
        .select(signalCols)
        .eq("user_id", targetUserId)
        .eq("status", "active")
        .gte("created_at", sevenDaysAgo)
        .order("priority_score", { ascending: false })
        .limit(3);
      signals = fresh || [];
      if (signals.length < 3) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
        const { data: wider } = await supabase
          .from("strategic_signals")
          .select(signalCols)
          .eq("user_id", targetUserId)
          .eq("status", "active")
          .gte("created_at", fourteenDaysAgo)
          .order("priority_score", { ascending: false })
          .limit(3);
        signals = wider || [];
      }
    }

    if (signals.length < 2) {
      return new Response(
        JSON.stringify({ error: "not_enough_signals", found: signals.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- captures ----
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: captures } = await supabase
      .from("entries")
      .select("title, summary, account_name, created_at")
      .eq("user_id", targetUserId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(8);
    const hasDigest = (captures || []).length >= 2;

    // ---- voice profile ----
    const { data: voiceProfile } = await supabase
      .from("authority_voice_profiles")
      .select("tone, preferred_structures, storytelling_patterns, vocabulary_preferences, example_posts")
      .eq("user_id", targetUserId)
      .eq("language", lang)
      .maybeSingle();

    const voiceBlock = `
═══ USER VOICE PROFILE (drives my_read and caption tone — never structure) ═══
${voiceProfile ? `Tone: ${voiceProfile.tone || "analytical, calm confidence"}
Preferred structures: ${JSON.stringify(voiceProfile.preferred_structures || [])}
Storytelling patterns: ${JSON.stringify(voiceProfile.storytelling_patterns || [])}
${voiceProfile.vocabulary_preferences ? `Vocabulary notes: ${typeof voiceProfile.vocabulary_preferences === "object" ? JSON.stringify(voiceProfile.vocabulary_preferences) : voiceProfile.vocabulary_preferences}` : ""}
${Array.isArray(voiceProfile.example_posts) ? `Reference posts (match this voice for my_read + caption):
${voiceProfile.example_posts.slice(0, 3).map((pp: any) => (pp.content || "").substring(0, 300)).filter(Boolean).join("\n---\n")}` : ""}

Adapt tone, rhythm, and vocabulary to match this user. The voice profile OVERRIDES generic tone instructions but NEVER schema, word limits, BiDi rules, or banned phrases.` : "No voice profile — confident, direct executive tone."}
`;

    const now = new Date();
    const dateline = isArabic ? formatDatelineAR(now) : formatDatelineEN(now);
    const weekday = weekdayName(lang);
    const storyCount = signals.length;

    const systemPrompt = buildSystemPrompt(isArabic, voiceBlock, storyCount, editionNo, weekday, hasDigest);

    // ---- user message: hand the model the actual material ----
    const signalsBlock = signals.map((s, i) => `SIGNAL ${i + 1}:
  title: ${s.signal_title || ""}
  explanation: ${s.explanation || ""}
  strategic_implications: ${s.strategic_implications || ""}
  what_it_means_for_you: ${s.what_it_means_for_you || ""}
  theme_tags: ${JSON.stringify(s.theme_tags || [])}`).join("\n\n");

    const capturesBlock = (captures || []).map((c: any, i: number) => `CAPTURE ${i + 1}:
  title: ${c.title || ""}
  source: ${c.account_name || ""}
  summary: ${(c.summary || "").substring(0, 300)}`).join("\n\n") || "(no captures this week)";

    const authorLine = isArabic
      ? `المؤلف: ${authorFullName}${authorTitle ? `، ${authorTitle}` : ""}${p.sector_focus ? `، القطاع: ${p.sector_focus}` : ""}`
      : `Author: ${authorFullName}${authorTitle ? `, ${authorTitle}` : ""}${p.sector_focus ? `, sector: ${p.sector_focus}` : ""}`;

    const qaLine = qa_question
      ? (isArabic ? `سؤال محدد لصفحة "أنت سألت": ${qa_question}` : `Provided qa_question (use verbatim on the QA page): ${qa_question}`)
      : (isArabic ? `لا يوجد سؤال محدد — اكتب أقوى اعتراض عملي على قصة الغلاف.` : `No provided question — write the sharpest practitioner objection to the lead story.`);

    const userMessage = `${authorLine}
Story count: ${storyCount}
Edition Nº: ${editionNo}
Weekday token: ${weekday}

─── SIGNALS (one ARTICLE page each, in this order) ───
${signalsBlock}

─── CAPTURES (source pool for source_line + DIGEST items) ───
${capturesBlock}

─── QA ───
${qaLine}

Compile the Edition JSON now. Follow the schema exactly. All fields must be in ${isArabic ? "Arabic (technical terms may stay English)" : "English"}.`;

    // ---- Anthropic call ----
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
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
    } catch {
      console.error("JSON parse failed. First 500:", raw.substring(0, 500));
      throw new Error("AI returned malformed JSON. Try regenerating.");
    }

    // ---- server-side injection (overwrite whatever the model returned) ----
    parsed.nameplate = nameplate;
    parsed.edition_no = editionNo;
    parsed.dateline = dateline;
    parsed.lang = lang;
    if (!Array.isArray(parsed.hashtags)) parsed.hashtags = [];
    parsed.hashtags = parsed.hashtags.slice(0, 7);
    if (typeof parsed.linkedin_caption !== "string") parsed.linkedin_caption = "";
    if (!Array.isArray(parsed.pages)) parsed.pages = [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-edition error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});