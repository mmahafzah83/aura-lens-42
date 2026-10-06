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
