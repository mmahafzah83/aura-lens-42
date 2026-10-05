// Fixed text, dates and Arabic styling for the downloadable paper.
// The paper's language follows the language the report was WRITTEN in,
// never the screen language — so this reads the locale files directly.
import type { CSSProperties } from "react";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

export type PaperLang = "en" | "ar";

const EN = en as Record<string, string>;
const AR = ar as Record<string, string>;

export function pt(lang: PaperLang, key: string, vars?: Record<string, string | number>): string {
  let s = (lang === "ar" ? AR[key] : undefined) ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v));
  return s;
}

const AR_START = /^[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Saved `lang` first; otherwise Arabic when the archetype or market read opens in Arabic script. */
export function detectPaperLang(bp: {
  lang?: string | null; primary_archetype?: string | null; market_read?: string | null;
} | null | undefined): PaperLang {
  if (bp?.lang === "ar" || bp?.lang === "en") return bp.lang;
  const starts = (v?: string | null) => !!v && AR_START.test(v.trim());
  return starts(bp?.primary_archetype) || starts(bp?.market_read) ? "ar" : "en";
}

export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** «4 أكتوبر 2026» — Western digits, fixed month list. */
export function arabicDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const AR_FONT = "'CairoAR', 'Cairo', sans-serif";

/**
 * Arabic overrides for one inline style: Cairo, no letter-spacing, no
 * uppercase, no italics, and enough line-height for joined letters.
 * html2canvas breaks joined Arabic letters when letter-spacing is set.
 * English returns the style untouched.
 */
export function arStyle(lang: PaperLang, s: CSSProperties, opts?: { mono?: boolean }): CSSProperties {
  if (lang !== "ar") return s;
  const size = typeof s.fontSize === "number" ? s.fontSize : 0;
  const floor = size >= 28 ? 1.35 : 1.7;
  const lh = typeof s.lineHeight === "number" ? Math.max(s.lineHeight, floor) : floor;
  return {
    ...s,
    fontFamily: opts?.mono ? s.fontFamily : AR_FONT,
    letterSpacing: 0,
    textTransform: "none",
    fontStyle: "normal",
    lineHeight: lh,
  };
}

/** Curly quotes in English, guillemets in Arabic. */
export const quote = (lang: PaperLang, v: string) => (lang === "ar" ? `«${v}»` : `“${v}”`);

/**
 * The Strategic Identity Report's language: the saved brand paper language,
 * else Arabic when the positioning statement opens in Arabic script.
 * Never the screen language.
 */
export function reportLang(data: {
  lang?: string | null;
  brand_paper?: { lang?: string | null } | null;
  positioning?: { statement?: string | null; title?: string | null } | null;
} | null | undefined): PaperLang {
  const saved = data?.brand_paper?.lang ?? data?.lang;
  if (saved === "ar" || saved === "en") return saved;
  const s = (data?.positioning?.statement || data?.positioning?.title || "").trim();
  return AR_START.test(s) ? "ar" : "en";
}

/** Splits text into whole sentences; «.» «؟» «!» «?» end a sentence. */
export function sentences(s: string): string[] {
  return s.split(/(?<=[.؟!?])\s+/u).map((x) => x.trim()).filter(Boolean);
}
