/**
 * ONE VOCABULARY — every label word the opportunity engine shows a member.
 *
 * No function may hold its own label map, and no model may write a label word:
 * a model writes sentences, this table writes labels. One switch in
 * public.oe_vocabulary moves the whole platform, in both languages.
 *
 * Fetched once per invocation and cached in module scope.
 */

export type VocabLang = "en" | "ar";

let cache: Record<string, { en: string; ar: string }> | null = null;

/** Loads the table once. Never throws — a missing row falls back to its key. */
export async function loadVocab(admin: any): Promise<(key: string, lang: VocabLang) => string> {
  if (!cache) {
    try {
      const { data, error } = await admin.from("oe_vocabulary").select("key, en, ar");
      if (error) throw new Error(error.message);
      const map: Record<string, { en: string; ar: string }> = {};
      for (const row of data ?? []) map[String(row.key)] = { en: String(row.en), ar: String(row.ar) };
      cache = map;
    } catch (e) {
      console.error("oeVocab load failed:", (e as Error)?.message);
      cache = {};
    }
  }
  const map = cache;
  return (key: string, lang: VocabLang) => map[key]?.[lang] ?? key;
}

/** The vocabulary key for a chair type. */
export const chairKey = (chairType?: string | null): string => `chair_${String(chairType ?? "").trim()}`;

/** The vocabulary key for a fit band. */
export const bandKey = (band?: string | null): string => `fit_${String(band ?? "stretch").trim()}`;
