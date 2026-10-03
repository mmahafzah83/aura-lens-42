/**
 * Display text for the assessment items (questions, options, slider dimensions).
 *
 * Arabic lives beside the English in the same row (`prompt_ar`, `name_ar`…)
 * and inside each option as `label_ar`. These helpers only choose what is
 * SHOWN. Anything stored or sent to a model keeps using the English field.
 * A missing Arabic value falls back to English for that one string only.
 */
export type ItemLang = "en" | "ar";

const filled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function itemText<R extends Record<string, any>>(row: R, field: string, lang: ItemLang): string {
  if (lang === "ar") {
    const ar = row?.[`${field}_ar`];
    if (filled(ar)) return ar;
  }
  const en = row?.[field];
  return typeof en === "string" ? en : en == null ? "" : String(en);
}

export function optionLabel(option: { label: string; label_ar?: string | null }, lang: ItemLang): string {
  if (lang === "ar" && filled(option?.label_ar)) return option.label_ar;
  return option?.label ?? "";
}

/** Slider scores are keyed by the English dimension name, whatever is displayed. */
export const sliderKey = (dim: { name: string }): string => dim.name;

/** `?items=ar` on /onboarding: preview Arabic items only. */
export function itemsPreviewFromSearch(search: string): boolean {
  try { return new URLSearchParams(search).get("items") === "ar"; } catch { return false; }
}
