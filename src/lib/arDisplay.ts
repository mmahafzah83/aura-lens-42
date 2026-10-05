/**
 * Language-aware display helpers for dates, numbers, time-ago and lists.
 * English output is exactly what the screens printed before (en-GB dates).
 * Arabic: Gregorian months, Western digits, no plural agreement assembled.
 */
import type { CSSProperties } from "react";
import { AR_MONTHS } from "@/components/report/paperText";

const isAr = (lang: string | null | undefined) => lang === "ar";

/** "10 Aug" / "10 Aug 2026" in English; «10 أغسطس» / «10 أغسطس 2026» in Arabic. */
export function displayDate(iso: string | number | Date, lang: string, opts: { year?: boolean } = {}): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const withYear = opts.year !== false;
  if (isAr(lang)) return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
  return d.toLocaleDateString("en-GB", withYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" });
}

/** Western digits always, grouped with commas. */
export const displayNumber = (n: number): string => n.toLocaleString("en-US");

/** Arabic time-ago from whole days. */
export function arabicDaysAgo(days: number): string {
  if (days < 1) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "قبل يومين";
  if (days <= 6) return `قبل ${days} أيام`;
  if (days <= 13) return "قبل أسبوع";
  if (days <= 20) return "قبل أسبوعين";
  const weeks = Math.floor(days / 7);
  if (weeks <= 10) return `قبل ${weeks} أسابيع`;
  return `قبل ${weeks} أسبوعاً`;
}

/** «العنوان، النبذة والمهارات». */
export function arabicList(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join("، ")} و${xs[xs.length - 1]}`;
}

/** Arabic text rules: Cairo, open line-height, no tracking, capitals or italics. */
export const AR_TEXT: CSSProperties = {
  fontFamily: "var(--font-arabic)", lineHeight: 1.7, letterSpacing: 0, textTransform: "none", fontStyle: "normal",
};
export const arStyle = (lang: string, s: CSSProperties = {}): CSSProperties => (isAr(lang) ? { ...s, ...AR_TEXT } : s);

/** Wraps each Latin run (KnownBy, LinkedIn, provider names, the email address) in
 *  left-to-right isolate marks so it keeps its order inside an Arabic sentence.
 *  A trailing full stop or comma stays outside the run. */
export function isolateLatin(s: string): string {
  return s.replace(/[A-Za-z][\w@.\-&/]*(?:[ ]+[A-Za-z0-9][\w@.\-&/]*)*(?: \([\w\- ]+\))?/g, (m) => {
    const core = m.replace(/[.\-/]+$/, "");
    return `\u2066${core}\u2069${m.slice(core.length)}`;
  });
}
