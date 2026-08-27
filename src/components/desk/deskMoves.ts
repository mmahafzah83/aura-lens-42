/**
 * deskMoves — nothing internal reaches the member, and nothing is claimed
 * unless it provably happened.
 *
 * Two jobs:
 *  1. Move chips: internal tool names are mapped to plain instructions, labels
 *     are capped at four words, and anything still machine-shaped is dropped.
 *  2. Claim guard: a sentence that says work was done is removed unless a
 *     verified action line proves it. Aura never reports its own work.
 */

/**
 * Internal name → the words a member would actually say, in his language.
 *
 * O3: an Arabic answer used to arrive with English chips under it, because the
 * mapping below only ever spoke English. The chips follow the answer.
 */
const TOOL_LABELS: Record<string, { en: string; ar: string }> = {
  save_draft: { en: "Save this draft", ar: "احفظ هذه المسودة" },
  open_drafts: { en: "Open my drafts", ar: "افتح مسوداتي" },
  open_surface: { en: "Open my drafts", ar: "افتح مسوداتي" },
  set_reminder: { en: "Remind me tomorrow", ar: "ذكّرني غدًا" },
  search_my_graph: { en: "Search my vault", ar: "ابحث في سجلي" },
  search_vault: { en: "Search my vault", ar: "ابحث في سجلي" },
};

/** Machine-shaped: snake_case, camelCase run-ons, or a bare function call. */
const MACHINE = /^[a-z0-9]+(_[a-z0-9]+)+(\(\))?$/;

function fourWords(label: string): string {
  const words = label.trim().split(/\s+/);
  return words.length <= 4 ? words.join(" ") : words.slice(0, 4).join(" ");
}

/** At most three chips, plain words only, never a tool name. */
export function cleanMoves(raw: string[], lang: "ar" | "en" = "en"): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = String(r ?? "").trim().replace(/^[-•*\s]+/, "");
    if (!t) continue;
    const key = t.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const mapped = TOOL_LABELS[key];
    if (mapped) {
      const label = lang === "ar" ? mapped.ar : mapped.en;
      if (!out.includes(label)) out.push(label);
    } else {
      if (MACHINE.test(t.toLowerCase())) continue; // malformed: dropped silently
      const label = fourWords(t);
      if (!out.includes(label)) out.push(label);
    }
    if (out.length === 3) break;
  }
  return out;
}


/** Language that asserts a write happened. Only a row id may earn it. */
const CLAIM =
  /\b(saved|i(?:'ve| have) saved|stored|added it|scheduled|reminder (?:is )?set|set a reminder|drafted it|created the draft|put it in your drafts|opened)\b/i;

/**
 * Capabilities Aura does not have. It can save a draft, set a reminder, open a
 * page and search the record — nothing else. A sentence promising to pause,
 * hold, cancel or manage anything is removed whatever the tools returned.
 */
const IMPOSSIBLE =
  /\b(pause|pausing|hold off on|put .{0,20}on hold|reschedul\w*|cancel\w*|postpon\w*|notify\b|email\b|message (?:your|the) team|manage your (?:calendar|schedule|inbox)|clear your (?:calendar|schedule)|handle everything)\b/i;
const SCHEDULE_OBJECT =
  /\b(schedule|cadence|posting|calendar|meeting|publishing|content)\b/i;


export interface ClaimVerdict {
  /** The answer with unproven claims removed. */
  text: string;
  /** True when a claim was removed, so the honest line is shown instead. */
  stripped: boolean;
}

/** A promise to do something Aura cannot do at all. Never earned by a tool. */
function impossibleClaim(sentence: string): boolean {
  if (!/\b(i(?:'ll| will| have|'ve)?|we(?:'ll| will)?|let me)\b/i.test(sentence)) return false;
  if (!IMPOSSIBLE.test(sentence)) return false;
  return SCHEDULE_OBJECT.test(sentence) || /\bnotify|email\b/i.test(sentence);
}

/**
 * Remove any sentence claiming work was done when no verified action proves it,
 * and any sentence promising a capability Aura does not have.
 * `verified` is the set of tools that came back ok with a real row.
 */
export function guardClaims(text: string, verified: string[]): ClaimVerdict {
  const src = String(text ?? "");
  const proven = verified.length > 0;
  if (proven && !IMPOSSIBLE.test(src)) return { text: src, stripped: false };
  if (!proven && !CLAIM.test(src) && !IMPOSSIBLE.test(src)) return { text: src, stripped: false };
  let stripped = false;
  const kept = src
    .split(/(?<=[.!?])\s+/)
    .filter(s => {
      if (impossibleClaim(s)) { stripped = true; return false; }
      if (!proven && CLAIM.test(s)) { stripped = true; return false; }
      return true;
    })
    .join(" ")
    .trim();
  return { text: kept, stripped };
}


/** What the member is told when the write did not happen — in his language. */
export const honestFailure = (lang: "ar" | "en" = "en"): string =>
  lang === "ar"
    ? "تعذّر عليّ حفظ ذلك. المسودة ما زالت هنا — أجرّب مرة أخرى؟"
    : "I could not save that. The draft is still here — try again?";
export const HONEST_FAILURE = honestFailure("en");

/** Arabic if the answer itself is written in Arabic. Chips follow the answer. */
export function answerLang(text: string): "ar" | "en" {
  const ar = (String(text ?? "").match(/[\u0600-\u06FF]/g) || []).length;
  const la = (String(text ?? "").match(/[A-Za-z]/g) || []).length;
  return ar + la > 0 && ar / (ar + la) > 0.2 ? "ar" : "en";
}

/**
 * Unbold any bolded phrase that names nothing in the member's own record.
 *
 * Bold in an Aura answer reads as "this is a system term" — a pillar, a
 * capability, a signal. When the model invents one, the bold makes the
 * invention look official. `grounded` is every name that genuinely exists for
 * this member; a bolded phrase that matches none of them keeps its words and
 * loses its weight. Phrases that are plainly not names (numbers, long clauses,
 * ordinary emphasis) are left alone.
 */
export function groundBold(text: string, grounded: string[]): string {
  const src = String(text ?? "");
  if (!src.includes("**")) return src;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const allowed = new Set(grounded.map(norm).filter(Boolean));
  return src.replace(/\*\*([^*\n]{1,80})\*\*/g, (whole, inner: string) => {
    const phrase = String(inner).trim();
    const key = norm(phrase);
    if (!key) return whole;
    // Not a name: no capital letter to claim, or a whole clause. Leave emphasis.
    const words = key.split(" ");
    if (words.length > 5) return whole;
    if (!/\p{Lu}/u.test(phrase)) return whole;
    if (allowed.has(key)) return whole;
    for (const a of allowed) if (a.includes(key) || key.includes(a)) return whole;
    return phrase;
  });
}
