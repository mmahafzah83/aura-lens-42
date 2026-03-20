/**
 * Smart date formatter: shows time-only for today, otherwise short date.
 */
export function formatSmartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
