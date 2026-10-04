/** Span arithmetic for the CV comparison: a stated span stands only when the years it cites produce it. */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

export function spanIsWrong(sentence: string): boolean {
  let claimed: number | undefined;
  const span = sentence.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[-\s]year\b/i);
  if (span) {
    claimed = /^\d+$/.test(span[1]) ? Number(span[1]) : WORD_NUMBERS[span[1].toLowerCase()];
  } else {
    // Arabic: digits followed by سنة / سنوات / عام / عامًا / أعوام.
    const ar = sentence.match(/(?:^|[^0-9])(\d{1,2})\s*(?:سنوات|سنة|عامًا|عاماً|عاما|عام|أعوام)(?![\u0621-\u064A])/u);
    if (ar) claimed = Number(ar[1]);
  }
  if (!claimed && claimed !== 0) return false;
  const years = (sentence.match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/g) ?? []).map((m) => Number(m.replace(/[^0-9]/g, "")));
  if (years.length < 2) return false;
  const actual = Math.max(...years) - Math.min(...years);
  return actual !== claimed;
}

/** Sentence split used by the span repair and the gate (Arabic question mark included). */
export const SENTENCE_SPLIT = /(?<=[.!?؟])\s+/;
