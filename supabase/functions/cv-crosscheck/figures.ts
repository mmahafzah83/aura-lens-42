/** Every figure in a paste-ready line must already be in the member's own material. Pure. */
const AR_DIGITS = /[\u0660-\u0669]/g;
const toWestern = (t: string) => t.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));

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
