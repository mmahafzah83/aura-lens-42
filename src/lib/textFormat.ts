import { isArabicText } from "@/lib/utils";

/** Strips light Markdown so what the member reads is what gets posted. */
export function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`(.+?)`/g, "$1");
}

/**
 * Flips directional glyphs so Arabic text reads the right way.
 * The sub-point arrows are left-to-right glyphs with no correct RTL form, so
 * Arabic gets a neutral dash marker instead of ↳ / ↲.
 */
export function fixArabicDirectionalSymbols(text: string, lang?: "en" | "ar"): string {
  if (!text) return text;
  if (!(lang === "ar" || isArabicText(text))) return text;
  return text
    .replace(/→/g, "←")
    .replace(/[↳↲]/g, "–")
    .replace(/->/g, "<-")
    .replace(/⟶/g, "⟵");
}
