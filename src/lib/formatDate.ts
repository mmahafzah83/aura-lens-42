import { arabicDaysAgo, displayDate } from "@/lib/arDisplay";

/**
 * Relative time formatter — used consistently across the app.
 *  - <1 min   → "just now"
 *  - <1 hr    → "X minutes ago"
 *  - <24 hrs  → "X hours ago"
 *  - <7 days  → "X days ago"
 *  - older    → "MMM D" (e.g. "Apr 11")
 * Arabic (lang "ar"): «الآن», «قبل دقيقة/دقيقتين/n دقائق/n دقيقة», same for hours,
 * days through the shared time-ago helper, older dates «11 أبريل». English unchanged.
 */
export function arabicMinutesAgo(n: number): string {
  if (n === 1) return "قبل دقيقة";
  if (n === 2) return "قبل دقيقتين";
  if (n <= 10) return `قبل ${n} دقائق`;
  return `قبل ${n} دقيقة`;
}

export function arabicHoursAgo(n: number): string {
  if (n === 1) return "قبل ساعة";
  if (n === 2) return "قبل ساعتين";
  if (n <= 10) return `قبل ${n} ساعات`;
  return `قبل ${n} ساعة`;
}

export function formatSmartDate(dateStr: string, lang: string = "en", now: Date = new Date()): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (lang === "ar") {
    if (diffMin < 1) return "الآن";
    if (diffMin < 60) return arabicMinutesAgo(diffMin);
    if (diffHr < 24) return arabicHoursAgo(diffHr);
    if (diffDay < 7) return arabicDaysAgo(diffDay);
    return displayDate(date, "ar", { year: false });
  }

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
