/**
 * Outcome arithmetic — the ONE implementation.
 *
 * `voice-compute-outcomes` (posts -> outcome rows), `voice-learn-from-outcomes`
 * (outcome rows -> proposals) and the "What worked" card all import this file,
 * so the sentence the member reads and the shift Aura proposes are produced by
 * the same code. Pure arithmetic, no Deno APIs, so the browser can use it too.
 *
 * Engagement is noisy and confounded. Everything here is written to make the
 * loop refuse to act far more often than it acts.
 */
import { quantile } from "./voiceMeasure.ts";

export const OUTCOME_RULES = {
  /** Engagement has not settled before this. */
  settleDays: 7,
  /** Below this, reach is noise, not signal. */
  minImpressions: 100,
  /** The baseline moves with the account: the last N published posts, not lifetime. */
  trailingWindow: 20,
  /** No performance_index at all until the member has this much history. */
  minPriorPosts: 8,
  /** The learning step refuses to run below this. */
  minOutcomesToLearn: 12,
  /** A run may never move a trait further than this. */
  maxShiftPoints: 5,
  /** A single viral post is clipped back to the member's own 5th/95th. */
  winsorLow: 0.05,
  winsorHigh: 0.95,
  /** Each third must hold at least this many posts before a gap counts. */
  minGroup: 4,
  /** The gap between the two groups must exceed the spread inside them. */
  minEffect: 1,
  /** ...and be worth saying out loud. */
  minGapPoints: 3,
  /** A hook style needs this many posts before its ratio means anything. */
  minStylePosts: 3,
  /** ...and must be this far from the member's own typical post. */
  styleRatioHigh: 1.3,
  styleRatioLow: 0.75,
} as const;

export const median = (nums: number[]) =>
  nums.length === 0 ? null : quantile([...nums].sort((a, b) => a - b), 0.5);

/** Median engagement rate over the member's previous `trailingWindow` posts. */
export function trailingBaseline(priorRates: number[]): number | null {
  if (priorRates.length < OUTCOME_RULES.minPriorPosts) return null;
  const window = priorRates.slice(-OUTCOME_RULES.trailingWindow);
  const m = median(window);
  return m === null || m <= 0 ? null : m;
}

/** Clip a member's own distribution at its 5th and 95th percentile. */
export function winsorise(values: number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 3) return (v) => v;
  const lo = quantile(sorted, OUTCOME_RULES.winsorLow);
  const hi = quantile(sorted, OUTCOME_RULES.winsorHigh);
  return (v) => Math.max(lo, Math.min(hi, v));
}

const iqr = (nums: number[]) => {
  const s = [...nums].sort((a, b) => a - b);
  return quantile(s, 0.75) - quantile(s, 0.25);
};

export interface OutcomeRow {
  post_id: string;
  performance_index: number | null;
  sample_traits: Record<string, number> | null;
  hook_style: string | null;
  ending_type: string | null;
  published_at: string | null;
}

export interface TraitFinding {
  kind: "trait";
  trait_key: string;
  /** true when the better-performing third writes HIGHER on this trait */
  raise: boolean;
  topN: number;
  bottomN: number;
  topTraitMedian: number;
  bottomTraitMedian: number;
  topPerfMedian: number;
  bottomPerfMedian: number;
  ratio: number;
  effect: number;
  gap: number;
}

export interface StyleFinding {
  kind: "hook" | "ending";
  style: string;
  n: number;
  ratio: number;
}

/**
 * Split the member's outcomes into best and worst thirds and ask whether the
 * trait differs by more than it varies inside each third. Returns null — which
 * is the correct answer most of the time — whenever it does not.
 */
export function analyseTrait(rows: OutcomeRow[], traitKey: string): TraitFinding | null {
  const usable = rows
    .filter((r) => r.performance_index !== null && typeof r.sample_traits?.[traitKey] === "number")
    .map((r) => ({ perf: r.performance_index as number, val: (r.sample_traits as Record<string, number>)[traitKey] }))
    .sort((a, b) => a.perf - b.perf);
  if (usable.length < OUTCOME_RULES.minOutcomesToLearn) return null;

  const third = Math.floor(usable.length / 3);
  if (third < OUTCOME_RULES.minGroup) return null;
  const bottom = usable.slice(0, third);
  const top = usable.slice(-third);

  const topTraitMedian = median(top.map((r) => r.val)) as number;
  const bottomTraitMedian = median(bottom.map((r) => r.val)) as number;
  const topPerfMedian = median(top.map((r) => r.perf)) as number;
  const bottomPerfMedian = median(bottom.map((r) => r.perf)) as number;

  const gap = Math.abs(topTraitMedian - bottomTraitMedian);
  const spread = (iqr(top.map((r) => r.val)) + iqr(bottom.map((r) => r.val))) / 2;
  const effect = gap / Math.max(spread, 0.5);
  if (gap < OUTCOME_RULES.minGapPoints) return null;
  if (effect < OUTCOME_RULES.minEffect) return null;

  return {
    kind: "trait",
    trait_key: traitKey,
    raise: topTraitMedian > bottomTraitMedian,
    topN: top.length,
    bottomN: bottom.length,
    topTraitMedian: Number(topTraitMedian.toFixed(1)),
    bottomTraitMedian: Number(bottomTraitMedian.toFixed(1)),
    topPerfMedian: Number(topPerfMedian.toFixed(2)),
    bottomPerfMedian: Number(bottomPerfMedian.toFixed(2)),
    ratio: Number((topPerfMedian / Math.max(bottomPerfMedian, 0.01)).toFixed(2)),
    effect: Number(effect.toFixed(2)),
    gap: Number(gap.toFixed(1)),
  };
}

/** Which openers or endings actually earn attention for THIS member. */
export function analyseStyles(rows: OutcomeRow[], field: "hook_style" | "ending_type"): StyleFinding[] {
  const byStyle = new Map<string, number[]>();
  for (const r of rows) {
    const k = r[field];
    if (!k || r.performance_index === null) continue;
    if (!byStyle.has(k)) byStyle.set(k, []);
    byStyle.get(k)!.push(r.performance_index);
  }
  const out: StyleFinding[] = [];
  for (const [style, perfs] of byStyle) {
    if (perfs.length < OUTCOME_RULES.minStylePosts) continue;
    const m = median(perfs) as number;
    if (m >= OUTCOME_RULES.styleRatioHigh || m <= OUTCOME_RULES.styleRatioLow) {
      out.push({ kind: field === "hook_style" ? "hook" : "ending", style, n: perfs.length, ratio: Number(m.toFixed(2)) });
    }
  }
  return out.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
}

/**
 * The proposed move: capped at ±5 points a run and never outside the band the
 * member's own writing proves. Returns null when the cap leaves nothing to do.
 */
export function proposedValue(
  current: number, raise: boolean, gap: number, bandLow: number | null, bandHigh: number | null,
): number | null {
  const step = Math.min(OUTCOME_RULES.maxShiftPoints, Math.max(1, Math.round(gap / 2)));
  const target = raise ? current + step : current - step;
  const lo = bandLow ?? 0;
  const hi = bandHigh ?? 100;
  const clamped = Math.max(lo, Math.min(hi, target));
  if (Math.abs(clamped - current) < 0.5) return null;
  return Number(clamped.toFixed(2));
}
