/**
 * ONE public definition of an overnight "night".
 *
 * A night counts when it produced a draft — i.e. a ghost draft row exists
 * with that night's date. Used by the Overnight page AND Home's instrument
 * tile so both surfaces show the identical figure and wording.
 */

export const NIGHTS_WINDOW = 7;

export function nightKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Night keys (UTC dates) inside the last 7 days that produced a draft. */
export function draftNightKeys(rows: Array<{ created_at: string }>): Set<string> {
  const cutoff = Date.now() - NIGHTS_WINDOW * 86400_000;
  const out = new Set<string>();
  for (const r of rows) {
    if (new Date(r.created_at).getTime() >= cutoff) out.add(nightKey(r.created_at));
  }
  return out;
}

/** "{d} of 7 nights produced a draft" — the only public wording. */
export function nightsLine(d: number): string {
  return `${d} of ${NIGHTS_WINDOW} nights produced a draft`;
}

export async function loadGhostDrafts(
  supabase: any,
  userId: string,
  limit = 40,
): Promise<Array<{ id: string; post_text: string; created_at: string; source_metadata: any }>> {
  const since = new Date(Date.now() - NIGHTS_WINDOW * 86400_000).toISOString();
  const res = await supabase.from("linkedin_posts")
    .select("id, post_text, created_at, source_metadata")
    .eq("user_id", userId).eq("tracking_status", "draft")
    .eq("source_metadata->>ghost_draft", "true")
    .gte("created_at", since)
    .order("created_at", { ascending: false }).limit(limit);
  return (res?.data as any[]) || [];
}
