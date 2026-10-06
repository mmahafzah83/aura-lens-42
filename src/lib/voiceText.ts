import EN_LOCALE from "@/i18n/locales/en.json";
/**
 * The Voice libs stay pure: English is written inline (unchanged), and when a
 * caller passes an Arabic translator the same branch returns a whole Arabic
 * sentence from a key with params. Display maps fall through on unknown values.
 */
export interface VoiceTr {
  lang: string;
  t: (key: string, vars?: Record<string, unknown>) => string;
}

export const isArTr = (tr?: VoiceTr | null): tr is VoiceTr => Boolean(tr && tr.lang === "ar");

/** "Cool / analytical" → "cool_analytical", "2,600 chars" → "2_600_chars". */
export const voiceSlug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function lookup(tr: VoiceTr, key: string, fallback: string): string {
  const v = tr.t(key);
  return v && v !== key ? v : fallback;
}

/** Trait names and poles (stored English) shown in the interface language. */
export function voiceWord(english: string, tr?: VoiceTr | null): string {
  if (!isArTr(tr) || !english) return english;
  return lookup(tr, `vo.dict.${voiceSlug(english)}`, english);
}

export function hookWord(key: string, tr: VoiceTr): string {
  return lookup(tr, `vo.hook.${key}`, key);
}

export function endingWord(key: string, tr: VoiceTr): string {
  return lookup(tr, `vo.ending.${key}`, key);
}

/** A Western-digit number, grouped, isolated left-to-right inside Arabic. */
export const isoNum = (n: number | string): string =>
  `\u2066${typeof n === "number" ? n.toLocaleString("en-US") : n}\u2069`;

/** A raw trait key ("evidence_density") shown by its trait name. */
export function traitWord(key: string, tr?: VoiceTr | null): string {
  const english = key.replace(/_/g, " ");
  return voiceWord(english, tr);
}

const MODE_KEYS = ["default", "executive", "thought_leadership", "educational", "personal", "contrarian"];

/**
 * A stored scope — "all modes", "all", "default", a preset key, or an English
 * mode label — shown in the interface language. The stored value never changes.
 */
export function scopeWord(scope: string | null | undefined, tr?: VoiceTr | null): string {
  const s = String(scope ?? "");
  if (!isArTr(tr) || !s) return s;
  const low = s.trim().toLowerCase();
  if (low === "all modes" || low === "all") return lookup(tr, "vo.scope.all", s);
  if (low === "your default voice") return lookup(tr, "vo.mode.default.label", s);
  const slug = voiceSlug(s);
  if (MODE_KEYS.includes(slug)) return lookup(tr, `vo.mode.${slug}.label`, s);
  for (const k of MODE_KEYS) {
    const en = (EN_LOCALE as Record<string, string>)[`vo.mode.${k}.label`];
    if (en && en.toLowerCase() === low) return lookup(tr, `vo.mode.${k}.label`, s);
  }
  return voiceWord(s, tr);
}

/** A stored corpus label (source or set-aside reason) for display. */
export function corpusWord(stored: string | null | undefined, tr?: VoiceTr | null): string {
  const s = String(stored ?? "");
  if (!s) return s;
  const key = `vo.cl.${voiceSlug(s)}`;
  if (isArTr(tr)) return lookup(tr, key, s);
  if (s === "Written by Aura") return "Written by KnownBy";
  if (s === "Aura wrote this") return "KnownBy wrote this";
  return s;
}
