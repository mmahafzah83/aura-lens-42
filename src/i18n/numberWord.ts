import i18n from "i18next";

/**
 * English writes some numbers as words ("ninety seconds", "STEP ONE"). The
 * translation keys take the NUMBER; this turns it into the English word only
 * when the rendered language is English. Every other language gets digits.
 */
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const englishWord = (n: number): string | null => {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 20) return ONES[n];
  return n % 10 === 0 ? TENS[n / 10] : `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}`;
};

/**
 * @param max  the largest number English spells out at this call site; above it, digits.
 * @param cases "lower" (default), "cap" (Ninety) or "upper" (ONE).
 */
export function numberWord(
  n: number,
  opts: { max?: number; cases?: "lower" | "cap" | "upper"; lang?: string } = {},
): string {
  const lang = opts.lang ?? i18n.language ?? "en";
  const max = opts.max ?? 99;
  const w = lang === "en" && n <= max ? englishWord(n) : null;
  if (!w) return String(n);
  if (opts.cases === "upper") return w.toUpperCase();
  if (opts.cases === "cap") return w.charAt(0).toUpperCase() + w.slice(1);
  return w;
}
