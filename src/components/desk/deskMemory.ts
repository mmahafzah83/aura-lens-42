/**
 * deskMemory — the filter that stops broken rows reaching a member.
 *
 * Session summaries are written by a model, and some of them arrive as a lone
 * full stop or as a fragment that starts mid-sentence. A fragment is not a
 * memory, so it is dropped rather than displayed. Nothing is repaired here
 * beyond trimming: a row is either good enough to show, or it is not shown.
 */

export interface RawMemoryRow {
  id: string;
  session_date: string;
  summary: string | null;
  actions_committed?: unknown;
}

export interface CleanMemoryRow extends RawMemoryRow {
  text: string;
}

export type DropReason = "empty" | "starts with punctuation" | "shorter than 25 characters";

const LEADING_JUNK = /^[\s.,;:!?…'"“”‘’\-–—•*)\]}]+/;
/** A summary that opens on punctuation is a fragment of a longer sentence. */
const OPENS_ON_PUNCTUATION = /^[\s]*[.,;:!?…\-–—•*)\]}]/;

export function memoryDropReason(summary: string | null | undefined): DropReason | null {
  const raw = String(summary ?? "");
  if (!raw.trim()) return "empty";
  if (OPENS_ON_PUNCTUATION.test(raw)) return "starts with punctuation";
  if (raw.trim().replace(LEADING_JUNK, "").length < 25) return "shorter than 25 characters";
  return null;
}

/** At most two survivors, trimmed, newest first — the order they arrive in. */
export function cleanMemory(rows: RawMemoryRow[], limit = 2): CleanMemoryRow[] {
  const out: CleanMemoryRow[] = [];
  for (const r of rows) {
    if (memoryDropReason(r.summary)) continue;
    out.push({ ...r, text: String(r.summary).trim().replace(LEADING_JUNK, "").trim() });
    if (out.length === limit) break;
  }
  return out;
}
