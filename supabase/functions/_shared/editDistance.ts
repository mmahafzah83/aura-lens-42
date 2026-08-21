/**
 * The single edit-distance helper for edge functions.
 *
 * Extracted from linkedin-publish's draft_edits telemetry so that anything else
 * asking "is this the same text?" measures it exactly the same way. There is no
 * second copy of this in the functions tree.
 */

export const DIFF_CAP = 4000;

/** Levenshtein distance, iterative with a single row of state. Bounded. */
export function levenshtein(a: string, b: string): number {
  const s = String(a ?? "").slice(0, DIFF_CAP);
  const t = String(b ?? "").slice(0, DIFF_CAP);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[t.length];
}

/** 1 = identical, 0 = nothing in common. The same ratio stored in draft_edits. */
export function similarityRatio(a: string, b: string): number {
  const s = String(a ?? "").slice(0, DIFF_CAP);
  const t = String(b ?? "").slice(0, DIFF_CAP);
  const longest = Math.max(s.length, t.length) || 1;
  return Number((1 - levenshtein(s, t) / longest).toFixed(4));
}
