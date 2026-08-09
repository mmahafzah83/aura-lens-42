/**
 * Voice trait measurement — the ONE implementation.
 *
 * `voice-compute-traits` (corpus -> stored traits) and `voice_fidelity`
 * (one sample -> inside/outside the member's range) both import this file.
 * There is deliberately no second copy: if the two ever disagreed, fidelity
 * would be measuring something the member's bands were never built from.
 *
 * Pure arithmetic. No Deno APIs, no imports — so the browser can use it too.
 */

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** Normalise a raw measurement onto 0–100 across an explicit window. */
export const norm = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100);

export const EMOJI_RE = /\p{Extended_Pictographic}/gu;
export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
export const LATIN_RE = /[A-Za-z]/g;
// Arabic-Indic digits count as figures too: a member writing in Arabic states
// numbers in ٠-٩ and those posts are evidence-dense, not evidence-free.
export const EVIDENCE_RE =
  /([\d٠-٩]+(?:[.,٫][\d٠-٩]+)*\s?[%٪]|[$€£]\s?[\d٠-٩]|\bSAR\b|\bAED\b|\bUSD\b|ريال|درهم|دولار|\b(?:19|20)\d{2}\b|[\d٠-٩]+(?:[.,٫][\d٠-٩]+)*)/g;

export const countOf = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** Sentence lengths in words. */
export function sentenceWordCounts(text: string): number[] {
  return text
    .split(/[.!?؟\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.split(/\s+/).length);
}

export const median = (nums: number[]) => quantile([...nums].sort((a, b) => a - b), 0.5);

export type Measured = { value: number; band_low: number | null; band_high: number | null; raw_value: number };

/** The computable traits, in registry order. */
export const COMPUTABLE_TRAITS = ["evidence_density", "pace", "length", "emoji", "language_mix"];

/** Per-post measurement for each computable trait. Null when the text carries no signal for it. */
export function perPost(trait: string, text: string): number | null {
  const chars = text.length;
  if (chars === 0) return null;
  switch (trait) {
    case "length":
      return chars;
    case "pace": {
      const sents = sentenceWordCounts(text);
      if (sents.length === 0) return null;
      const medWords = median(sents);
      const paras = text.split(/\n{2,}/).filter((p) => p.trim()).length;
      const parasPerK = (paras / chars) * 1000;
      // shorter sentences and more paragraph breaks = more clipped = higher
      return clamp(norm(30 - medWords, 0, 25) * 0.75 + norm(parasPerK, 0, 8) * 0.25);
    }
    case "emoji":
      return (countOf(text, EMOJI_RE) / chars) * 1000;
    case "language_mix": {
      const ar = countOf(text, ARABIC_RE);
      const la = countOf(text, LATIN_RE);
      if (ar + la === 0) return null;
      return (ar / (ar + la)) * 100;
    }
    case "evidence_density":
      return (countOf(text, EVIDENCE_RE) / chars) * 1000;
    default:
      return null;
  }
}

/** Map a raw per-post measurement onto the 0–100 trait scale. */
export function scale(trait: string, raw: number): number {
  switch (trait) {
    case "length":
      return norm(raw, 800, 2600);
    case "pace":
      return clamp(raw);
    case "emoji":
      return norm(raw, 0, 12);
    case "language_mix":
      return clamp(raw);
    case "evidence_density":
      return norm(raw, 0, 15);
    default:
      return clamp(raw);
  }
}

/** Measure one trait across a corpus: median value plus the Q1–Q3 band. */
export function measure(trait: string, texts: string[]): (Measured & { n: number }) | null {
  const raws: number[] = [];
  for (const t of texts) {
    const v = perPost(trait, t);
    if (v !== null && Number.isFinite(v)) raws.push(v);
  }
  if (raws.length === 0) return null; // absent, never zero-filled
  const sorted = [...raws].sort((a, b) => a - b);
  const rawMedian = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    value: Number(scale(trait, rawMedian).toFixed(2)),
    band_low: Number(scale(trait, q1).toFixed(2)),
    band_high: Number(scale(trait, q3).toFixed(2)),
    raw_value: Number(rawMedian.toFixed(2)),
    n: raws.length,
  };
}

/** Measure a single text on the 0–100 trait scale. Null when the text has no signal. */
export function measureOne(trait: string, text: string): { raw: number; scaled: number } | null {
  const raw = perPost(trait, text);
  if (raw === null || !Number.isFinite(raw)) return null;
  return { raw, scaled: scale(trait, raw) };
}
