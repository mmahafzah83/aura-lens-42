/**
 * How far a member moved a draft away from what Aura generated.
 *
 * The single highest-value learning signal in the product is the edit itself:
 * the original stays immutable, the edited text is what ships, and the distance
 * between the two says how much of Aura's voice the member actually accepted.
 *
 * 0 = identical, 1 = completely rewritten.
 */

/** Levenshtein distance, iterative with a single row of state. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[b.length];
}

/**
 * Levenshtein distance divided by the longer of the two texts. Whitespace is
 * normalised first so a reflowed paragraph is not read as a rewrite.
 *
 * Very long texts are compared on a bounded window: the cost is quadratic and
 * a member must never wait on a metric.
 */
export function normalisedEditDistance(original: string, edited: string): number {
  const norm = (t: string) => String(t ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const MAX = 4000;
  const a = norm(original).slice(0, MAX);
  const b = norm(edited).slice(0, MAX);
  if (!a && !b) return 0;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return Math.min(1, levenshtein(a, b) / longest);
}

/**
 * The edit columns for a save. Written on every save where the text on screen
 * differs from the text as generated; `original_generated_text` is never part
 * of this payload, so no save can overwrite it.
 */
export function editFields(originalGenerated: string | null | undefined, current: string): {
  edited_at: string | null;
  edit_distance: number | null;
} {
  const original = String(originalGenerated ?? "");
  if (!original.trim()) return { edited_at: null, edit_distance: null };
  if (original.trim() === String(current ?? "").trim()) return { edited_at: null, edit_distance: null };
  return {
    edited_at: new Date().toISOString(),
    edit_distance: Number(normalisedEditDistance(original, current).toFixed(4)),
  };
}
