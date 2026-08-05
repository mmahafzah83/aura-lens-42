/**
 * Provenance guard: a member must never be handed a number the system cannot
 * source.
 *
 * After generation the draft is scanned for claim-shaped figures — percentages,
 * currency amounts, large counts, magnitudes and dates. Any figure that does
 * not appear in the evidence that drove the generation is removed from the
 * draft and counted, so `unsourced_numbers_removed` records exactly what was
 * taken out. Structural numbers (list markers, small bare counts like
 * "three steps") are left alone: they are not claims.
 */
import { toWesternDigits } from "./voiceStyle.ts";

const MAGNITUDE = /(million|billion|trillion|thousand|مليون|مليار|تريليون|ألف|[kmb]\b|bn\b)/i;
const CURRENCY = /([$€£¥]|SAR|AED|USD|EUR|GBP|riyals?|ريال|dollars?|دولار|درهم|يورو|ر\.?س)/i;
const PERCENT = /(%|٪|percent|per cent|بالمئة|في المئة|بالمائة)/i;

/** Every numeric token in a text, normalised to a comparable string. */
export function numericTokens(text: string): Set<string> {
  const out = new Set<string>();
  const src = toWesternDigits(String(text ?? ""));
  for (const m of src.matchAll(/\d[\d,.\s]*/g)) {
    const raw = m[0].replace(/[\s,]/g, "").replace(/\.$/, "");
    if (!raw) continue;
    out.add(raw);
    // A figure written as 4.5 is the same claim as 45 or 4,500 in prose.
    out.add(raw.replace(/\./g, ""));
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) out.add(String(asNum));
  }
  return out;
}

/** Claim-shaped numeric mentions: the figure plus the unit attached to it. */
const CLAIM_RE =
  /(?:[$€£¥]\s*)?[0-9٠-٩۰-۹][0-9٠-٩۰-۹,.]*\s*(?:%|٪|percent|per cent|بالمئة|في المئة|بالمائة|million|billion|trillion|thousand|مليون|مليار|تريليون|ألف|x|×|أضعاف|SAR|AED|USD|EUR|GBP|riyals?|ريال|dollars?|دولار|درهم|يورو)?/gi;

function isClaimFigure(match: string, index: number, text: string): boolean {
  const value = Number(toWesternDigits(match).replace(/[^\d.]/g, "").replace(/\.$/, ""));
  const hasUnit = PERCENT.test(match) || CURRENCY.test(match) || MAGNITUDE.test(match) ||
    /x|×|أضعاف/i.test(match);
  if (hasUnit) return true;
  // A line-leading "1." or "2)" is a list marker, not a claim.
  const lineStart = text.lastIndexOf("\n", index) + 1;
  if (!text.slice(lineStart, index).trim() && /^[0-9٠-٩]{1,2}\s*[.)-]/.test(text.slice(index))) return false;
  if (!Number.isFinite(value)) return false;
  // Years read as dates; anything three digits or more reads as a statistic.
  if (value >= 1900 && value <= 2100) return true;
  return value >= 100;
}

export interface GuardResult {
  text: string;
  removed: number;
  removed_values: string[];
}

/**
 * Remove every figure in `draft` that cannot be traced to `evidenceText`.
 * The surrounding sentence is kept — only the unsourced figure and its unit
 * come out — and a sentence left with nothing to say is dropped.
 */
export function stripUnsourcedNumbers(draft: string, evidenceText: string): GuardResult {
  const text = String(draft ?? "");
  if (!text.trim()) return { text, removed: 0, removed_values: [] };
  const sourced = numericTokens(evidenceText || "");
  const removedValues: string[] = [];

  const cleaned = text.replace(CLAIM_RE, (match, index: number) => {
    if (!/[0-9٠-٩۰-۹]/.test(match)) return match;
    if (!isClaimFigure(match, index, text)) return match;
    const tokens = numericTokens(match);
    for (const t of tokens) if (sourced.has(t)) return match;
    removedValues.push(match.trim());
    return "";
  });

  const tidied = cleaned
    .split("\n")
    .map((line) =>
      line
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.،؛;:%])/g, "$1")
        .replace(/(^|[.!?؟]\s*)[\s,،-]+/g, "$1")
        .trimEnd(),
    )
    // A line that lost its only content is noise, not a post.
    .filter((line, i, all) => line.trim().length > 0 || (i > 0 && all[i - 1].trim().length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: tidied, removed: removedValues.length, removed_values: removedValues };
}
