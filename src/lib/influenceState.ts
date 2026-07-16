/**
 * Shared influence-state helpers.
 * Rule: raw 0/null follower values mean "still collecting" — never displayed as 0.
 */
export interface TimelineRow {
  snapshot_date?: string | null;
  followers?: number | null;
  [k: string]: any;
}

/** Newest row's followers where followers > 0, else null. */
export function latestRealFollowers(timeline: TimelineRow[] | null | undefined): number | null {
  if (!timeline || timeline.length === 0) return null;
  // Assume caller may pass either order; find the row with the newest snapshot_date that has followers > 0.
  const sorted = [...timeline].sort((a, b) => {
    const da = a.snapshot_date || "";
    const db = b.snapshot_date || "";
    return db.localeCompare(da);
  });
  for (const row of sorted) {
    const f = Number(row.followers);
    if (Number.isFinite(f) && f > 0) return f;
  }
  return null;
}

/** Chronological (oldest → newest) points where followers > 0. */
export function realFollowerSeries(
  timeline: TimelineRow[] | null | undefined
): { date: string; followers: number }[] {
  if (!timeline || timeline.length === 0) return [];
  return [...timeline]
    .filter((r) => {
      const f = Number(r.followers);
      return Number.isFinite(f) && f > 0;
    })
    .sort((a, b) => (a.snapshot_date || "").localeCompare(b.snapshot_date || ""))
    .map((r) => ({
      date: (r.snapshot_date || "").slice(5),
      followers: Number(r.followers),
    }));
}