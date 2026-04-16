/**
 * Relative time formatter — used consistently across the app.
 *  - <1 min   → "just now"
 *  - <1 hr    → "X minutes ago"
 *  - <24 hrs  → "X hours ago"
 *  - <7 days  → "X days ago"
 *  - older    → "MMM D" (e.g. "Apr 11")
 */
export function formatSmartDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
