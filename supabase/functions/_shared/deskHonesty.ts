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

/** Language that asserts a write happened. Only a real row id earns it. */
const CLAIM =
  /\b(saved|i(?:'ve| have) saved|stored|added it|scheduled|reminder (?:is )?set|set a reminder|drafted it|created the draft|put it in your drafts|opened it)\b/i;
const CLAIM_AR = /(حفظت|تم الحفظ|تم الحفظ في مسوداتك|ضبطت تذكير|تم ضبط التذكير|أنشأت المسودة)/;

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
  openIt: (l: "Arabic" | "English") => (l === "Arabic" ? "افتحها في أورا" : "Open it in Aura"),
  reminderSet: (l: "Arabic" | "English", day: number, monthEn: string, monthAr: string) =>
    l === "Arabic" ? `تذكير في ${day} ${monthAr}` : `Reminder set for ${day} ${monthEn}`,
  dryRunDraft: (l: "Arabic" | "English") =>
    l === "Arabic" ? "حُفظت المسودة (تشغيل تجريبي — لم يُكتب شيء)" : "Saved to your drafts (dry run — nothing written)",
  dryRunReminder: (l: "Arabic" | "English") =>
    l === "Arabic" ? "ضُبط التذكير (تشغيل تجريبي — لم يُكتب شيء)" : "Reminder set (dry run — nothing written)",
};

export const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
