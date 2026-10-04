/** Every figure in a paste-ready line must already be in the member's own material. Pure. */
const AR_DIGITS = /[\u0660-\u0669]/g;
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(WORDS).join("|")})(?![A-Za-z])`, "gi");
/** Arabic-Indic digits and whole-word English number words become digits. Arabic number words are not converted. */
const toWestern = (t: string) =>
  t.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660)).replace(WORD_RE, (w) => String(WORDS[w.toLowerCase()]));

const NUM_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const YEARS_AFTER = /^\s*(?:years?|yrs|سنة|سنوات|عامًا|عاما|عام|أعوام)(?![A-Za-z])/i;

const norm = (raw: string) => raw.replace(/,/g, "");

/** Normalised numeric tokens: "1,200"→"1200", "14m"→"14", "4.1%"→"4.1". */
export function numbersIn(text: string): string[] {
  const t = toWestern(String(text ?? ""));
  return [...t.matchAll(NUM_RE)].map((m) => norm(m[0]));
}

export function sourceNumbers(source: string): Set<string> {
  return new Set(numbersIn(source));
}

/** Numbers in `text` not found in the source; a 1–60 whole number followed by a years word is allowed. */
export function unsupportedNumbers(text: string, source: Set<string>): string[] {
  const t = toWestern(String(text ?? ""));
  const out: string[] = [];
  for (const m of t.matchAll(NUM_RE)) {
    const n = norm(m[0]);
    if (source.has(n)) continue;
    const after = t.slice((m.index ?? 0) + m[0].length);
    if (/^\d+$/.test(n) && +n >= 1 && +n <= 60 && YEARS_AFTER.test(after)) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}
