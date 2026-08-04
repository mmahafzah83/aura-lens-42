/**
 * THE PIECE STATE — the single source of truth for the studio journey.
 *
 * Nothing else in the studio may decide whether a step is done, and no step
 * tick may ever be derived from "the highest step visited". If a control
 * disagrees with this file, the control is wrong.
 */

export type Format = "post" | "slides";

export interface PieceState {
  /** A signal picked, a topic typed, or words pasted. */
  subjectChosen: boolean;
  wordsReady: boolean;
  /** EXPLICIT member choice only. A default is never a decision. */
  format: Format | null;
  slidesMade: boolean;
  published: boolean;
  linkSaved: boolean;
}

export type StepDone = Record<1 | 2 | 3 | 4, boolean>;

/**
 * STEP COMPLETION — no other rule may set a tick.
 *
 * Invariant: step N may not show done while step N−1 is not done. If that ever
 * happens the state is wrong, so the tick is clamped off and, in development,
 * the violation is written to the console rather than shown to a member.
 */
export function deriveDone(s: PieceState): StepDone {
  const raw: StepDone = {
    1: s.subjectChosen,
    2: s.wordsReady,
    3: s.format !== null && (s.format === "post" || s.slidesMade),
    4: s.published || s.linkSaved,
  };

  const done: StepDone = { 1: raw[1], 2: raw[2], 3: raw[3], 4: raw[4] };
  for (const n of [2, 3, 4] as const) {
    const prev = (n - 1) as 1 | 2 | 3;
    if (done[n] && !done[prev]) {
      done[n] = false;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          `[studio] journey invariant violated: step ${n} was done while step ${prev} was not. Clamped.`,
          { raw, state: s },
        );
      }
    }
  }
  return done;
}

/** A link the member could plausibly have copied out of LinkedIn. */
export function plausibleLinkedInUrl(value: string): boolean {
  const url = value.trim();
  if (url.length < 12) return false;
  return /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/\S+$/i.test(url);
}
