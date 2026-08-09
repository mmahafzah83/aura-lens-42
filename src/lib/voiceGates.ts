/**
 * The repetition gates. One definition, every surface.
 *
 * Three files used to hold their own copy of these numbers and two of them
 * disagreed. Anything that judges opener variety reads them from here.
 */
export const REPETITION_GATES = {
  /** Opener diversity at or above this is healthy. */
  diversityFloor: 60,
  /** A single opener at or below this share of the window is healthy. */
  topShareCeiling: 35,
  /** Above this share, repetition is the binding problem and leads the advice. */
  topShareBinding: 40,
  /** Below this many classified posts, variety cannot be judged at all. */
  minClassified: 8,
} as const;

export type RepetitionGates = typeof REPETITION_GATES;
