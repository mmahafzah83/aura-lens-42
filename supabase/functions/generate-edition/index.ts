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

6. MIXED-LANGUAGE SENTENCES (STRICT): English tokens sit at a clause BOUNDARY — start of line, end of line, or immediately after "..". NEVER mid-clause. When an English company/product name would open a sentence, frame it: "شركة Accenture" / "منصة SCADA". Never let an Arabic sentence end in a dangling English token followed by "…".
7. HUMAN VOICE: Write like a Director talking to a peer over coffee — "خليني أسألك.." / "من خبرتي.." openers are good. One rhetorical question per my_read is welcome. Every field ends with a COMPLETE thought — no "..." endings, no unfinished comparisons.
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

// -------- Deterministic budget enforcement (server-side, never truncated in renderer) --------
function trimField(s: string, max: number): string {
  const t = (s || "").toString();
  if (t.length <= max) return t;
  const terminators = [".", "؟", "!", "۔"];
  const slice = t.slice(0, max);
  let cutIdx = -1;
  for (let i = slice.length - 1; i >= Math.floor(max * 0.55); i--) {
    if (terminators.includes(slice[i])) { cutIdx = i; break; }
  }
  if (cutIdx > 0) return slice.slice(0, cutIdx + 1).trim();
  // Fall back to last word boundary.
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > max * 0.4) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

function trimSourceLine(s: string, max = 84, isArabic = false): string {
  const t = (s || "").toString().trim();
  if (t.length <= max) return t;
  // "{prefix} — {names} · {suffix}"   AR: "المصدر — {names} · قراءات الأسبوع"
  const dashIdx = t.indexOf("—");
  if (dashIdx < 0) return trimField(t, max);
  const prefix = t.slice(0, dashIdx + 1).trim();
  const rest = t.slice(dashIdx + 1).trim();
  // Split rest at the LAST "·" so we keep the suffix intact.
  const lastDot = rest.lastIndexOf("·");
  let names = rest;
  let suffix = "";
  if (lastDot > 0) {
    names = rest.slice(0, lastDot).trim();
    suffix = rest.slice(lastDot).trim(); // includes leading ·
  }
  const nameParts = names.split("·").map((n) => n.trim()).filter(Boolean);
  const compose = (parts: string[]) =>
    `${prefix} ${parts.join(" · ")}${suffix ? " " + suffix : ""}`.trim();
  let line = compose(nameParts);
  while (line.length > max && nameParts.length > 1) {
    nameParts.pop(); // drop the LAST name whole
    line = compose(nameParts);
  }
  // Silence unused isArabic (kept for future language-specific rules).
  void isArabic;
  return line;
}

function enforceBudgets(parsed: any, isArabic: boolean): void {
  if (!parsed || typeof parsed !== "object") return;
  const capField = (obj: any, key: string, max: number, path: string) => {
    if (!obj || typeof obj[key] !== "string") return;
    const before = obj[key].length;
    if (before <= max) return;
    const after = trimField(obj[key], max);
    console.log(`[enforceBudgets] ${path}.${key}: ${before} → ${after.length} (cap ${max})`);
    obj[key] = after;
  };
  const pages: any[] = Array.isArray(parsed.pages) ? parsed.pages : [];
  pages.forEach((pg, idx) => {
    if (!pg || typeof pg !== "object") return;
    const path = `pages[${idx}]:${pg.page_type}`;
    switch (pg.page_type) {
      case "FRONT": {
        capField(pg, "lead_headline", isArabic ? 52 : 60, path);
        capField(pg, "lead_accent", isArabic ? 50 : 58, path);
        if (pg.fig && typeof pg.fig === "object") capField(pg.fig, "label", 34, `${path}.fig`);
        if (Array.isArray(pg.toc)) {
          pg.toc.forEach((row: any, i: number) => capField(row, "title", 44, `${path}.toc[${i}]`));
        }
        break;
      }
      case "ARTICLE": {
        capField(pg, "headline", isArabic ? 64 : 78, path);
        capField(pg, "kicker", 40, path);
        capField(pg, "body", 210, path);
        capField(pg, "my_read", 200, path);
        if (pg.fig && typeof pg.fig === "object") capField(pg.fig, "label", 34, `${path}.fig`);
        if (typeof pg.source_line === "string") {
          const before = pg.source_line.length;
          const after = trimSourceLine(pg.source_line, 84, isArabic);
          if (after.length !== before) {
            console.log(`[enforceBudgets] ${path}.source_line: ${before} → ${after.length} (cap 84, source-safe)`);
            pg.source_line = after;
          }
        }
        break;
      }
      case "DIGEST": {
        if (Array.isArray(pg.items)) {
          pg.items.forEach((it: any, i: number) => {
            capField(it, "claim", 42, `${path}.items[${i}]`);
            capField(it, "takeaway", 130, `${path}.items[${i}]`);
            capField(it, "source", 46, `${path}.items[${i}]`);
          });
        }
        break;
      }
      case "QA": {
        capField(pg, "question", 110, path);
        capField(pg, "answer", 300, path);
        break;
      }
      case "BACK": {
        capField(pg, "headline", 64, path);
        capField(pg, "promise", 130, path);
        break;
      }
    }
  });
}

// -------- Dateline helpers (date-only, no week prefix) --------
function formatDatelineEN(d: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function formatDatelineAR(d: Date): string {
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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
  "linkedin_caption": string,  // See "CAPTION LAW" block below.
  "hashtags": string[],        // 5-7 tags, mix broad + niche
  "pages": [ ... ordered ... ]
}
(The server injects nameplate, edition_no, dateline, lang after generation — do not worry about those three.)

─── PAGE 1: FRONT ───
{
  "page_type": "FRONT",
  "kicker": "THIS WEEK'S LEAD",         // AR: "افتتاحية الأسبوع"
  "lead_headline": string,              // Newspaper editor's hook: a named actor or concrete number + the tension, 8–12 words. Make the reader NEED page 2.
  "lead_accent": string,                // NEVER a repeat or fragment of the headline (zero shared significant words). Adds a SECOND piece of information: either the sharpest tension from a DIFFERENT story in this edition (e.g. "Inside: why 80% of pilots never graduate") or the why-now stakes in one line. 6–10 words. Rendered in accent color.
  "deck": string,                       // The mandated line above, with correct count.
  "fig": { "kind": "line_signal"|"dual_curve"|"step_bars"|"s_curve"|"flow"|"capacity_bars"|"decay"|"bars_compare"|"gap_wedge"|"steps", "label": string },
  // FIG SELECTION (STRICT — the schematic must visualize THIS story's dynamic):
  //   s_curve        → adoption, scaling, maturation stories
  //   decay          → failure rates, attrition, pilots dying, value erosion
  //   dual_curve     → two forces crossing (old model vs new, cost vs value)
  //   flow           → process/pipeline/stage stories
  //   capacity_bars  → utilization, budget allocation, capacity stories
  //   step_bars      → discrete periods, week-by-week, cohort stories
  //   bars_compare   → magnitude comparison across 3–4 things
  //   gap_wedge      → a widening gap between two paths
  //   steps          → threshold / regime shift
  //   line_signal    → a single rising/falling trend or one anomaly (only when none above fits)
  // LABEL RULE: fig.label must name THIS story's tension using a noun from its own headline
  // (e.g. "retraining velocity vs exits", "pilot → production gap") — ≤6 words,
  // NEVER a generic label, NEVER reused across pages in the same edition.
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
  // FIG SELECTION (STRICT — the schematic must visualize THIS story's dynamic):
  //   s_curve        → adoption, scaling, maturation stories
  //   decay          → failure rates, attrition, pilots dying, value erosion
  //   dual_curve     → two forces crossing (old model vs new, cost vs value)
  //   flow           → process/pipeline/stage stories
  //   capacity_bars  → utilization, budget allocation, capacity stories
  //   step_bars      → discrete periods, week-by-week, cohort stories
  //   bars_compare   → magnitude comparison across 3–4 things
  //   gap_wedge      → a widening gap between two paths
  //   steps          → threshold / regime shift
  //   line_signal    → a single rising/falling trend or one anomaly (only when none above fits)
  // LABEL RULE: fig.label must name THIS story's tension using a noun from its own headline
  // (e.g. "retraining velocity vs exits", "pilot → production gap") — ≤6 words,
  // NEVER a generic label, NEVER reused across pages in the same edition.
  "body": string,              // THE NEWS. Neutral, EXACTLY 2 complete sentences, 22–30 words total. No opinion. Factual clause + implication clause.
  "my_read": string,           // POINT OF VIEW. 2 sentences, 25–32 words total. First person ("I…"/"في رأيي.."). MUST end on a complete sentence — never a trailing clause. Rework the signal's what_it_means_for_you into the author's voice. THIS is where the voice profile carries the most weight.
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
      "takeaway": string /* ≤20 words EN / ≤16 words AR — MUST end on a complete sentence, never cut mid-thought */,
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
  "answer": string,                   // Verdict-first ("No." / "Only if…" / "Both."), 40–48 words, complete final sentence, contains ONE quotable clause.
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

═══ CAPTION LAW — write like a newsletter operator ═══
The linkedin_caption is a newsletter announcement, NOT a description of the asset.
STRUCTURE (blank line between blocks, ≤110 words total, no URLs):
  1. HOOK (1–2 lines) — the edition's sharpest number or tension. NEVER open with "three stories", "هذا الإصدار", "this edition", "في هذا العدد", "today we cover", or any asset-descriptor.
  2. LEAD STORY TEASED (2–3 lines) — the itch, not the resolution. Name the actor and the stake; hold the answer for page 2.
  3. OTHER ANGLES (ONE line) — the remaining stories as angles, not numbered summaries. Example: "القيادة، الهوامش، وتكلفة كل token".
  4. RITUAL LINE (1 line) — ${isArabic
    ? `"الإصدار رقم ${editionNo} من نشرتي الأسبوعية. كل ${weekday}: أسبوع من القراءة، إصدار واحد."`
    : `"Edition Nº ${editionNo} of my weekly publication. Every ${weekday}: one week of reading, one edition."`}
  5. CLOSING QUESTION (1 line) — one practitioner question tied to the LEAD story (not a generic prompt).
Hashtags: 5–7 total. ${isArabic ? "AR editions MUST include #التحول_الرقمي plus one Arabic audience tag (e.g. #قادة_المستقبل, #الإدارة_التنفيذية)." : "Mix broad + niche executive tags."}

═══ EDITORIAL VOLTAGE (applies to every field, both languages) ═══
HEADLINES: carry a stake — actor + what changed + what's at risk. A topic label ("نماذج مالية جديدة", "AI in finance") is a FAILURE. A tension ("الشركات تدفع مليارات لتطرد من لا يتحول", "Firms pay billions to fire those who won't retrain") passes.
THE NEWS (body): sentence 1 = the fact with its number; sentence 2 = the consequence. No sentence may be pure description.
MY READ: contains ONE first-person witnessed moment ("شفت بعيني..", "I've sat in..") and ONE falsifiable claim. NEVER restates THE NEWS.
DIGEST takeaways: consequences ("بدون X، رح تحرق Y" / "Without X, you burn Y"), never descriptions.
QA answer: opens with the verdict inside the first five words ("No.", "Only if…", "Both.", "لا.", "فقط إذا..").
HUMANIZER BANS (append to banned list):
  - Rule-of-three parallel structures ("faster, cheaper, better" / "أسرع، أرخص، أفضل").
  - "not just X — it's Y" / "ليس فقط.. بل" negative-parallelism constructions.
  - More than ONE dash per field.
  - Vague attribution ("خبراء يؤكدون", "experts say", "analysts believe").
  - Filler openers ("في عالم اليوم", "في ظل التحولات المتسارعة", "In today's fast-changing world").
FIG SELECTION (shape-matched — MUST match the story's actual dynamic):
  bars_compare  → magnitude comparison across 3–4 things
  gap_wedge     → a widening gap between two paths
  steps         → threshold / regime shift
  s_curve       → adoption
  decay         → decline / erosion
  line_signal   → a single trend or anomaly
  dots (flow)   → staged milestones / pipeline
fig.label is ALWAYS a "from → to" tension (e.g. "pilots → production", "خبرة → حضور"). Never a generic noun.

═══ COMPLETENESS RULE (BOTH LANGUAGES) ═══
Every text field must be a complete, self-contained statement. Never end any field with an ellipsis or unfinished clause.

═══ COMPLETENESS LAW ═══
The reader receives NO links and NO sources to follow. Every field must be fully self-contained: name the actor, state the finding (with its number when one exists), and land the implication. A field that requires outside context to make sense is a failure. Never end any field mid-thought.

═══ RENDER BUDGETS — HARD CHARACTER CAPS (count spaces; CHARACTERS not words) ═══
If a field would exceed its cap, REWRITE it shorter — the renderer must NEVER truncate.
  FRONT   · lead_headline ≤60 EN / ≤52 AR · lead_accent ≤58 / ≤50 · fig.label ≤34
  ARTICLE · headline ≤78 / ≤64 · kicker ≤40 · fig.label ≤34
          · body ≤210 chars (keep the 2-sentence rule) · my_read ≤200 chars
          · source_line ≤84 chars AND at most TWO source names (pick the two strongest — NEVER a cut-off name)
  toc title ≤44
  DIGEST  · claim ≤42 · takeaway ≤130 · source ≤46
  QA      · question ≤110 · answer ≤300
  BACK    · headline ≤64 · promise ≤130

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

    // Deterministic budget enforcement — the renderer must NEVER truncate.
    enforceBudgets(parsed, isArabic);

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