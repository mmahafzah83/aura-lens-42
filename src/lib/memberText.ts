/**
 * MEMBER TEXT — one place for anything the member wrote or Aura scraped.
 *
 * Their words are theirs: never re-punctuated, never truncated mid-word, and
 * always rendered with `dir="auto"` so Arabic reads the right way round.
 */
import { isArabicText } from "@/lib/utils";

/** No integer in the product is ever printed unformatted. */
export const num = (n: number | string | null | undefined): string => {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return Number(v).toLocaleString();
};

/**
 * A LinkedIn headline is often four pipe-separated lines with decoration in
 * them. Only the first segment is shown; the full string stays in the data.
 */
export const cleanHeadline = (raw: string | null | undefined): string => {
  const first = String(raw ?? "").split(/[|·•]/)[0] ?? "";
  return first
    .replace(/[✦✧★☆✨➤►▶◆❯»]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Trims to the last complete sentence that fits. Three cards ending in "This…"
 * reads as a bug, so a clamp is never used on member-facing prose.
 */
export const trimToSentence = (raw: string | null | undefined, max = 180): string => {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const cut = Math.max(window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?"));
  if (cut > 40) return window.slice(0, cut + 1).trim();
  const space = window.lastIndexOf(" ");
  return `${window.slice(0, space > 40 ? space : max).trim()}…`;
};

/** Props for any element rendering member-supplied or scraped text. */
export const memberText = (text?: string | null): { dir: "auto"; style?: React.CSSProperties } =>
  isArabicText(String(text ?? ""))
    ? { dir: "auto", style: { fontFamily: "'Cairo', 'Inter', system-ui, sans-serif", lineHeight: 1.9 } }
    : { dir: "auto" };
