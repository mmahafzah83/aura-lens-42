/**
 * DESK HONESTY — the server copy of the claim guard, and the language rules
 * for a requested draft.
 *
 * The client held these rules (src/components/desk/deskMoves.ts) and the
 * client alone, which is exactly how "I've saved that to your drafts" survived
 * a dry run: the evaluation harness calls the function directly, so nothing
 * the browser does applied. Anything that protects the member belongs on the
 * server, where every caller passes through it.
 */

/**
 * Language that asserts work happened. Only a real row id — or, for a screen,
 * a route change the client has already observed — earns it.
 *
 * T1: "opened" used to require the word "it". "Opened your library." slipped
 * through, and the member watched the app stay exactly where it was.
 */
const CLAIM =
  /\b(saved|i(?:'ve| have) saved|stored|added it|scheduled|reminder (?:is )?set|set a reminder|drafted it|created the draft|put it in your drafts|opened (?:it|your|the|up)|i(?:'ve| have)? opened|i(?:'m| am) opening|taking you (?:to|there)|navigated)\b/i;
const CLAIM_AR = /(حفظت|تم الحفظ|تم الحفظ في مسوداتك|ضبطت تذكير|تم ضبط التذكير|أنشأت المسودة|فتحت لك|تم الفتح|فتحتُ)/;

/** Capabilities the Desk does not have, in any language. */
const IMPOSSIBLE =
  /\b(pause|pausing|hold off on|put .{0,20}on hold|reschedul\w*|cancel\w*|postpon\w*|notify\b|notification\b|alert you\b|ping you\b|text you\b|email\b|message (?:your|the) team|manage your (?:calendar|schedule|inbox)|clear your (?:calendar|schedule)|handle everything|scale back your output)\b/i;
const SCHEDULE_OBJECT = /\b(schedule|cadence|posting|calendar|meeting|publishing|content|output)\b/i;

const SENTENCE_SPLIT = /(?<=[.!?؟…])\s+/;

function impossibleClaim(sentence: string): boolean {
  if (!/\b(i(?:'ll| will| have|'ve)?|we(?:'ll| will)?|let me)\b/i.test(sentence)) return false;
  if (!IMPOSSIBLE.test(sentence)) return false;
  // A promise to reach him off the screen is impossible whatever its object.
  return SCHEDULE_OBJECT.test(sentence) || /\b(notify|notification|alert you|ping you|text you|email)\b/i.test(sentence);
}

export interface ClaimVerdict { text: string; stripped: boolean }

/**
 * Remove any sentence claiming work was done when no verified write proves it,
 * and any sentence promising a capability that does not exist.
 * `provenWrite` is true only when a tool came back with a real row.
 */
export function guardClaimsServer(text: string, provenWrite: boolean): ClaimVerdict {
  const src = String(text ?? "");
  const claims = CLAIM.test(src) || CLAIM_AR.test(src);
  if (provenWrite && !IMPOSSIBLE.test(src)) return { text: src, stripped: false };
  if (!provenWrite && !claims && !IMPOSSIBLE.test(src)) return { text: src, stripped: false };

  let stripped = false;
  const lines = src.split("\n").map((line) => {
    if (/^§§/.test(line.trim())) return line;
    const kept = line.split(SENTENCE_SPLIT).filter((s) => {
      if (impossibleClaim(s)) { stripped = true; return false; }
      if (!provenWrite && (CLAIM.test(s) || CLAIM_AR.test(s))) { stripped = true; return false; }
      return true;
    });
    return kept.join(" ").trim();
  });
  const text2 = lines
    .filter((l, i, all) => l.trim().length > 0 || (i > 0 && all[i - 1].trim().length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: text2, stripped };
}

/**
 * O2 — the language of the requested OUTPUT is separate from the language of
 * the conversation. "Draft me something in Arabic" is an English message that
 * must produce an Arabic draft.
 */
export function requestedDraftLanguage(message: string): "Arabic" | "English" | null {
  const m = String(message ?? "");
  if (/\b(in|into)\s+arabic\b/i.test(m) || /\barabic\b[^.?!]{0,20}\b(draft|post|version)\b/i.test(m)) return "Arabic";
  if (/(بالعربية|بالعربي|باللغة العربية)/.test(m)) return "Arabic";
  if (/\b(in|into)\s+english\b/i.test(m) || /(بالإنجليزية|بالانجليزية|باللغة الإنجليزية)/.test(m)) return "English";
  return null;
}

export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(String(text ?? ""));
}

export function hasLatinProse(text: string): boolean {
  return (String(text ?? "").match(/[A-Za-z]/g) || []).length > 40;
}

/** Every fixed sentence the machine itself says, in both languages. */
export const SAY = {
  emptyMessage: (l: "Arabic" | "English") =>
    l === "Arabic" ? "قل ما تحتاجه وسألتقطه." : "Say what you need and I'll pick it up.",
  failure: (l: "Arabic" | "English") =>
    l === "Arabic" ? "حدث خطأ أثناء قراءة سجلّك. نحاول مرة أخرى؟" : "Something went wrong reading your vault. Try again?",
  draftLanguageFailed: (l: "Arabic" | "English") =>
    l === "Arabic"
      ? "لم أستطع كتابة هذه المسودة بالعربية. أحاول مرة أخرى؟"
      : "I could not produce that draft in Arabic, so I have not returned it. Want me to try again?",
  draftSaved: (l: "Arabic" | "English") => (l === "Arabic" ? "حُفظت المسودة" : "Draft saved"),
  saveFailed: (l: "Arabic" | "English") => (l === "Arabic" ? "تعذّر الحفظ" : "Couldn't save that"),
  openFailed: (l: "Arabic" | "English") => (l === "Arabic" ? "تعذّر الفتح" : "Couldn't open that"),
  openIt: (l: "Arabic" | "English") => (l === "Arabic" ? "افتحها" : "Open it"),
  /** Said ONLY after the client has seen the route actually change. */
  opened: (l: "Arabic" | "English", surfaceLabel: string) =>
    l === "Arabic" ? `فُتحت ${surfaceLabel}` : `Opened ${surfaceLabel}`,
  /** Said when the tap happened and the screen did not change. */
  didNotOpen: (l: "Arabic" | "English") =>
    l === "Arabic" ? "لم تُفتح. جرّب مرة أخرى؟" : "It didn't open. Try again?",
  reminderSet: (l: "Arabic" | "English", day: number, monthEn: string, monthAr: string) =>
    l === "Arabic" ? `تذكير في ${day} ${monthAr}` : `Reminder set for ${day} ${monthEn}`,
  dryRunDraft: (l: "Arabic" | "English") =>
    l === "Arabic" ? "حُفظت المسودة (تشغيل تجريبي — لم يُكتب شيء)" : "Saved to your drafts (dry run — nothing written)",
  dryRunReminder: (l: "Arabic" | "English") =>
    l === "Arabic" ? "ضُبط التذكير (تشغيل تجريبي — لم يُكتب شيء)" : "Reminder set (dry run — nothing written)",
};

export const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/* ── T1 — SURFACES: one table, and every entry resolves to a real route ──────
 *
 * The Desk used to emit a surface name and report success. Nothing checked the
 * name against the router, and nothing checked that the screen changed. Both
 * halves are fixed: the name is resolved here against the real tab values in
 * src/pages/Dashboard.tsx (NAV_ITEMS + TAB_ALIAS), and the confirmation is only
 * written by the client, after it has watched the tab change.
 */
export const SURFACE_ROUTES: Record<string, { path: string; en: string; ar: string }> = {
  home:         { path: "/dashboard?tab=home",         en: "your home",       ar: "الصفحة الرئيسية" },
  intelligence: { path: "/dashboard?tab=intelligence", en: "your signals",    ar: "إشاراتك" },
  library:      { path: "/dashboard?tab=library",      en: "your library",    ar: "مكتبتك" },
  drafts:       { path: "/dashboard?tab=drafts",       en: "your drafts",     ar: "مسوداتك" },
  overnight:    { path: "/dashboard?tab=overnight",    en: "the overnight",   ar: "ما وجدناه ليلًا" },
  authority:    { path: "/dashboard?tab=authority",    en: "the composer",    ar: "المحرّر" },
  influence:    { path: "/dashboard?tab=influence",    en: "where you stand", ar: "موقعك" },
  momentum:     { path: "/dashboard?tab=momentum",     en: "your momentum",   ar: "زخمك" },
  widgets:      { path: "/dashboard?tab=widgets",      en: "your widgets",    ar: "الأدوات" },
  identity:     { path: "/dashboard?tab=identity",     en: "your story",      ar: "قصتك" },
};

/** Every name the model might reach for, mapped onto a real tab value. */
const SURFACE_ALIASES: Record<string, string> = {
  signals: "intelligence", signal: "intelligence", strategy: "intelligence", intel: "intelligence",
  capture: "library", captures: "library", vault: "library", record: "library", sources: "library",
  draft: "drafts", "my drafts": "drafts",
  "where you stand": "influence", standing: "influence", score: "influence", analytics: "influence", impact: "influence",
  publish: "authority", composer: "authority", studio: "authority", write: "authority", writing: "authority",
  today: "home", "my story": "identity", "my-story": "identity", story: "identity", profile: "identity",
  "the overnight": "overnight", findings: "overnight",
};

/** A surface name the router will honour, or null. Never a guess. */
export function resolveSurface(raw: unknown): string | null {
  const key = String(raw ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!key) return null;
  const direct = key.replace(/\s+/g, "");
  if (SURFACE_ROUTES[direct]) return direct;
  const alias = SURFACE_ALIASES[key] ?? SURFACE_ALIASES[direct];
  return alias && SURFACE_ROUTES[alias] ? alias : null;
}

export function surfacePath(surface: string, subjectId?: string | null): string | null {
  const row = SURFACE_ROUTES[surface];
  if (!row) return null;
  return subjectId ? `${row.path}&signal=${subjectId}` : row.path;
}

export function surfaceLabel(surface: string, l: "Arabic" | "English"): string {
  const row = SURFACE_ROUTES[surface];
  if (!row) return l === "Arabic" ? "الصفحة" : "the page";
  return l === "Arabic" ? row.ar : row.en;
}

/**
 * T1 — the four-word cap applies to EVERY label a member reads, not only to
 * model moves. A tool that returns "View your 194 captures in the library."
 * gets the same treatment as a chip.
 */
export function fourWordLabel(raw: unknown, fallback: string): string {
  const t = String(raw ?? "").trim().replace(/^[-•*\s]+/, "").replace(/[.。؟?!]+$/, "");
  if (!t) return fallback;
  const words = t.split(/\s+/).filter(Boolean);
  const capped = words.slice(0, 4).join(" ");
  return capped || fallback;
}

/* ── T2 — BELIEVE HIM ───────────────────────────────────────────────────────
 * "The record disagrees" exists for a DATA dispute. It must never answer a
 * member who reports that something on his screen did not work. He can see the
 * screen; the Desk cannot.
 */
const BROKEN_REPORT =
  /\b(did ?n'?t (open|work|happen|save|load|change)|not open(ed)?|nothing (happened|opened|changed)|still (on|showing) (my )?(home|the same)|you opened my home|it stayed|no ?thing came up|doesn'?t work|isn'?t working|broken|took me nowhere|went nowhere|wrong (screen|page|tab))\b/i;
const BROKEN_REPORT_AR =
  /(ما ?فتح|لم ?يفتح|ما ?اشتغل|لم ?يعمل|ما ?صار ?شي|لم ?يحدث ?شيء|ما ?زلت ?في ?الرئيسية|الصفحة ?الخطأ|ما ?انفتح)/;

export function isBrokenActionReport(text: string): boolean {
  const t = String(text ?? "");
  return BROKEN_REPORT.test(t) || BROKEN_REPORT_AR.test(t);
}

/** The one sentence shape that may never answer a broken-action report. */
const DISPUTES =
  /(the record disagrees|my (?:logs?|records?) show|i called the tool|according to my (?:log|record)|السجل ?يخالف|سجلاتي ?تُظهر)/i;

/** Remove any sentence that argues with what he says he saw. */
export function stripSelfDefence(text: string): { text: string; stripped: boolean } {
  const src = String(text ?? "");
  if (!DISPUTES.test(src)) return { text: src, stripped: false };
  let stripped = false;
  const out = src.split("\n").map((line) => {
    if (/^§§/.test(line.trim())) return line;
    return line.split(SENTENCE_SPLIT).filter((s) => {
      if (DISPUTES.test(s)) { stripped = true; return false; }
      return true;
    }).join(" ").trim();
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, stripped };
}

/* ── T3(d) — vary the surface, fix the structure ────────────────────────────
 * Consistency of shape reads as professionalism; identical phrasing reads as a
 * machine. The answer's structure never moves. Its first three words do.
 */
export type OpeningShape = "verdict" | "number" | "subject" | "condition" | "short_answer" | "recall";

const SHAPE_TESTS: { shape: OpeningShape; re: RegExp }[] = [
  { shape: "short_answer", re: /^\s*(yes|no|not yet|nope|لا|نعم|ليس ?بعد)\b/i },
  { shape: "number", re: /^\s*[^.\n]{0,12}\b\d/ },
  { shape: "condition", re: /^\s*(if|when|unless|إذا|عندما)\b/i },
  { shape: "recall", re: /^\s*(you (asked|said|mentioned|raised)|last (week|time)|سألت|ذكرت)\b/i },
  { shape: "verdict", re: /^\s*(it'?s|that'?s|this is|there'?s|hold|publish|don'?t|skip|wait)\b/i },
];

/** The shape of an answer's first sentence, for the "never twice" rule. */
export function openingShape(text: string): OpeningShape | null {
  const plain = String(text ?? "").replace(/^[\s\S]*?§§PLAIN\s*/i, "").trim();
  if (!plain) return null;
  const first = plain.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  if (!first) return null;
  for (const t of SHAPE_TESTS) if (t.re.test(first)) return t.shape;
  return "subject";
}

const SHAPE_HELP: Record<OpeningShape, string> = {
  verdict: 'a verdict ("It\'s the rework figure that carries this")',
  number: 'the figure first ("Three captures this week")',
  subject: "the subject named plainly first",
  condition: 'a condition ("If you only do one thing today…")',
  short_answer: 'a one-word answer ("Yes." / "Not yet.")',
  recall: 'a recall of something he already told you ("You asked about this on Tuesday too")',
};

/**
 * The instruction handed to the model for THIS turn: keep the structure, and do
 * not open the way you opened last time.
 */
export function openingDirective(previousAnswer: string | null): string {
  const prev = previousAnswer ? openingShape(previousAnswer) : null;
  const options = (Object.keys(SHAPE_HELP) as OpeningShape[]).filter((s) => s !== prev);
  const banned = prev
    ? `Your previous answer this session opened with ${SHAPE_HELP[prev]}. Do NOT open the same way twice in a row.`
    : "";
  return `OPENING (structure is fixed, surface is not):
${banned}
Open this answer with one of these, whichever fits the truth: ${options.map((s) => SHAPE_HELP[s]).join("; ")}.
Never open two consecutive answers with the same construction. The layers, the citation rules and the numbers do not change — only the first few words do.`;
}
