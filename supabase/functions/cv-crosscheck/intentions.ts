/** Removes invented "what I want next / why I am leaving" sentences from paste-ready lines. Pure. */
export const INTENT_EN = [
  "i am looking for", "i'm looking for", "looking for a", "i am seeking", "i'm seeking", "seeking a", "seeking an",
  "i am open to", "open to roles", "open for", "now open", "my next role", "my next step", "next chapter",
  "i want to", "i would like to", "i am ready to", "ready for a", "i left because", "i am leaving",
  "reason for leaving", "i aim to", "my goal is", "i hope to",
];
export const INTENT_AR = [
  "أبحث عن", "أتطلع إلى", "أتطلّع إلى", "أسعى إلى", "أرغب في", "أريد أن", "هدفي",
  "خطوتي القادمة", "منصبي القادم", "تركت العمل", "سبب المغادرة", "سبب تركي", "منفتح على",
];
const PHRASES = [...INTENT_EN, ...INTENT_AR];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => String(s ?? "").replace(/[\u2018\u2019]/g, "'").toLowerCase();
const has = (text: string, phrase: string) =>
  new RegExp(`(?<![\\p{L}'])${esc(phrase)}(?![\\p{L}])`, "u").test(norm(text));

/** Sentences with their delimiters; a decimal point between digits does not split. */
export function splitSentences(text: string): string[] {
  return (String(text ?? "").match(/(?:\d\.\d|[^.!?؟\n])+(?:[.!?؟]+|\n+|$)|\n+/g) ?? []).filter((x) => x.length);
}

const isArabic = (w: string) => /[\u0600-\u06FF]/.test(w);
export function contentWords(text: string): string[] {
  return (norm(text).match(/\p{L}+/gu) ?? []).filter((w) => w.length >= (isArabic(w) ? 3 : 4));
}

export function intentPhrases(sentence: string): string[] {
  return PHRASES.filter((p) => has(sentence, p));
}

/** Kept only if the source has the same phrase and ≥60% of the sentence's content words. */
export function sentenceSupported(sentence: string, source: string, srcWords: Set<string>): boolean {
  const found = intentPhrases(sentence);
  if (!found.length) return true;
  if (!found.every((p) => has(source, p))) return false;
  const words = contentWords(sentence);
  if (!words.length) return true;
  return words.filter((w) => srcWords.has(w)).length / words.length >= 0.6;
}

export function stripIntentions(text: string, source: string): { text: string | null; removed: string[] } {
  const srcWords = new Set(contentWords(source));
  const removed: string[] = [];
  const kept = splitSentences(text).filter((s) => {
    if (sentenceSupported(s, source, srcWords)) return true;
    removed.push(s.trim());
    return false;
  });
  const out = kept.join("").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  return { text: out ? out : null, removed };
}
