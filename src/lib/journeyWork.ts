/**
 * ONE ARITHMETIC FOR THE JOURNEY BAR.
 *
 * The screen weights, the total, and the three beat shares are computed here
 * and nowhere else. `Onboarding.tsx` and `JourneyShell.tsx` both draw the same
 * bar, and both used to carry their own copy of the total — 54 in one file and
 * 53.5 in the other. A weight added to a screen now propagates to both by
 * construction, because there is only one place to add it.
 */

/* The screens whose numbers are not integers, named once. */
export const MANUAL_SCREEN = 15;
export const TRUST_SLIDERS_SCREEN = 8.5;
export const CV_SCREEN = 3.5;
export const SHARE_SCREEN = 13.5;
export const SEAT_SCREEN = 14.5;

export type Beat = 1 | 2 | 3;

/**
 * The read is beat 1 — it is the read, so it cannot be labelled evidence.
 * Evidence starts where evidence actually starts (the CV, the capture, the
 * strengths, the questions) and the position is the last four screens.
 */
export const beatOf = (screen: number): Beat =>
  screen >= 12 ? 3 : screen <= 1 || screen === MANUAL_SCREEN ? 1 : 2;

/**
 * THE WORK EACH SCREEN REALLY CARRIES, in arbitrary units. Eight sliders and
 * nine questions are the bulk of the journey and therefore own the bulk of the
 * bar; the old arithmetic gave 85% of the work 7% of the fill.
 */
export const SCREEN_WORK: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2],
  [CV_SCREEN, 2], [5, 3], [6, 1], [7, 2], [8, 1], [TRUST_SLIDERS_SCREEN, 1], [9, 16], [10, 1], [11, 18],
  [12, 2], [13, 2], [SHARE_SCREEN, 1], [14, 0.5], [SEAT_SCREEN, 0.5],
] as const;

export const JOURNEY_WORK_TOTAL = SCREEN_WORK.reduce((a, [, w]) => a + w, 0);

const beatTotal = (beat: Beat): number =>
  SCREEN_WORK.reduce((a, [s, w]) => (beatOf(s) === beat ? a + w : a), 0);

/** The measured share of the journey's work each beat carries. Sums to 1. */
export const BEAT_WEIGHTS: [number, number, number] = [
  beatTotal(1) / JOURNEY_WORK_TOTAL,
  beatTotal(2) / JOURNEY_WORK_TOTAL,
  beatTotal(3) / JOURNEY_WORK_TOTAL,
];

/** Cumulative boundaries: [0, end of beat 1, end of beat 2, 1]. */
export const BEAT_BOUNDS: [number, number, number, number] = [
  0,
  BEAT_WEIGHTS[0],
  BEAT_WEIGHTS[0] + BEAT_WEIGHTS[1],
  1,
];

/** Global 0–1 fill for a screen, plus however far through that screen we are. */
export const journeyFraction = (screen: number, sub?: number): number => {
  const key = screen === MANUAL_SCREEN ? 1 : screen;
  let before = 0;
  let mine = 0;
  for (const [s, w] of SCREEN_WORK) {
    if (s < key) before += w;
    else if (s === key) mine = w;
  }
  const inner = typeof sub === "number" ? Math.max(0, Math.min(1, sub)) : 0;
  return Math.max(0, Math.min(1, (before + mine * inner) / JOURNEY_WORK_TOTAL));
};

/**
 * THE READ, in the same units the rest of the journey is measured in.
 * `/assessment` owns the read and `/onboarding` owns everything after it, but
 * they draw ONE bar, so the hand-off is continuous.
 */
export const readStageFraction = (phase: "address" | "reading" | "held"): number =>
  ({ address: 0.3, reading: 0.6, held: 1 }[phase] * 1) / JOURNEY_WORK_TOTAL;
