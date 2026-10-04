/**
 * The Arabic gate for a Mirror read. Pure: no Deno, no network — the unit
 * tests import this file directly.
 */

export const ARABIC_BANNED = [
  "تم", "يتم", "رائد فكر", "قائد فكر", "العلامة الشخصية", "علامتك الشخصية",
  "رحلة", "رحلتك", "مشهد", "يُبحر", "تسخير", "تمكين", "الارتقاء", "سلس", "متين",
  "في عالم", "في ظل", "لا شك أن", "من الجدير بالذكر", "يلعب دورًا", "على حد سواء",
];

export type ArabicGateFailure =
  | { check: "latin_heavy"; field: string }
  | { check: "arabic_indic_digits"; field: string }
  | { check: "banned_word"; field: string; word: string }
  | { check: "english_archetype"; field: "archetype" };

export function arabicShare(text: string): number {
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const la = (text.match(/[A-Za-z]/g) ?? []).length;
  if (ar + la === 0) return 0;
  return ar / (ar + la);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole word: not touching another Arabic or Latin letter on either side. */
function hasWholeWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\u0600-\\u06FFA-Za-z])${esc(word)}($|[^\\u0600-\\u06FFA-Za-z])`, "u").test(text);
}

function valuesOf(read: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(read)) {
    if (k === "raw") continue;
    if (typeof v === "string") out.push([k, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === "string" && out.push([`${k}[${i}]`, x]));
  }
  return out;
}

/** null = usable. Otherwise the first failed check. */
export function arabicGate(read: Record<string, unknown>): ArabicGateFailure | null {
  const archetype = typeof read.archetype === "string" ? read.archetype : "";
  if (/^\s*The\s/.test(archetype)) return { check: "english_archetype", field: "archetype" };

  for (const f of ["market_read", "honest_gap", "uncontested_space", "archetype"]) {
    const v = typeof read[f] === "string" ? (read[f] as string) : "";
    if (arabicShare(v) < 0.6) return { check: "latin_heavy", field: f };
  }
  const values = valuesOf(read);
  for (const [k, v] of values) {
    if (/[\u0660-\u0669]/.test(v)) return { check: "arabic_indic_digits", field: k };
  }
  for (const [k, v] of values) {
    if (k === "own_words_quote") continue;
    for (const w of ARABIC_BANNED) {
      if (hasWholeWord(v, w)) return { check: "banned_word", field: k, word: w };
    }
  }
  return null;
}

export function arabicCorrection(f: ArabicGateFailure): string {
  const what =
    f.check === "latin_heavy" ? `The value of "${f.field}" is not written in Arabic. Write it in Arabic.`
    : f.check === "arabic_indic_digits" ? `"${f.field}" uses Arabic-Indic digits. Use Western digits (0-9) only.`
    : f.check === "banned_word" ? `"${f.field}" uses the banned word «${f.word}». Remove it and every other banned word.`
    : `The archetype is in English. Write it in Arabic as a definite noun followed by a definite adjective.`;
  return `That was not usable. ${what} Return ONLY the JSON object with the same seven keys (keys in English, values in Arabic, own_words_quote verbatim), no markdown fences, no commentary.`;
}
