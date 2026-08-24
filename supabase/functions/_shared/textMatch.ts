/**
 * One shared text layer. Every place Aura compares member text to member text
 * goes through here — the matcher on "How you appear", the applied_at check in
 * linkedin-fetch-profile, and anything added next.
 *
 * Pure functions. No network, no Deno APIs, no imports: the browser client
 * imports this file directly, exactly as it already imports _shared/voiceCorpus.
 *
 * Two rules govern every change here:
 *  - Under-matching makes Aura look blind to work the member actually did.
 *  - Over-matching makes Aura claim something false. That is worse.
 * The stemmer is therefore deliberately small, and aliases live in data.
 */

/** Words that carry no subject. "it" is here, which is why `information
 *  technology ↔ it` can never be seeded — see isSafeAlias. */
export const STOPWORDS = new Set([
  "of", "the", "and", "for", "in", "to", "a", "an", "on", "with",
  "it", "is", "at", "by", "as", "or", "from", "that", "this", "be",
]);

const ARABIC = /[\u0600-\u06FF]/;

/** Tatweel and harakat out; alef and yaa and taa-marbuta folded. */
export function normaliseArabic(s: string): string {
  return String(s ?? "")
    .replace(/\u0640/g, "")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647");
}

/** Lowercase, strip punctuation, collapse whitespace. Unicode-aware. */
export function normaliseText(s: string): string {
  let t = String(s ?? "").toLowerCase();
  if (ARABIC.test(t)) t = normaliseArabic(t);
  return t.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Conservative English stemming. Plurals and possessives only — no -ing, no
 * -ed, no -ment. Anything shorter than 4 characters, or not plain Latin, is
 * returned untouched: over-stemming is how false positives get in.
 */
export function stemToken(t: string): string {
  const token = String(t ?? "");
  if (token.length < 4) return token;
  if (!/^[a-z0-9]+$/.test(token)) return token;
  if (token.endsWith("'s") || token.endsWith("\u2019s")) return token.slice(0, -2);
  if (token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (/(?:s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  /* "analysis", "status", "access" keep their s — stripping it invents words. */
  if (/(?:ss|us|is)$/.test(token)) return token;
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export interface Tokens {
  /** Significant tokens, normalised but unstemmed. */
  raw: string[];
  /** The same tokens, stemmed — the form everything compares on. */
  stems: string[];
}

/** Normalise, split, drop stopwords, stem. Falls back to the full token list
 *  when a phrase is nothing but stopwords, so it can still be reasoned about. */
export function tokenise(s: string): Tokens {
  const all = normaliseText(s).split(" ").filter(Boolean);
  const significant = all.filter((t) => !STOPWORDS.has(t));
  const raw = significant.length ? significant : all;
  return { raw, stems: raw.map(stemToken) };
}

/** Set membership on stemmed forms. Tokens are whole units, so "ai" can never
 *  be found inside "airport" — there is no substring test anywhere. */
export function hasToken(haystackTokens: Set<string>, token: string): boolean {
  if (!token) return false;
  return haystackTokens.has(stemToken(normaliseText(token)));
}

/* ------------------------------------------------------------------ aliases */

export interface AliasPair {
  canonical: string;
  alias: string;
  locale?: string;
}

/**
 * An alias whose short form is a stopword would fire on nearly every profile
 * ever written (`information technology ↔ it` is the standing example). One
 * that fires on everything is worse than no alias at all, so it is rejected
 * here as well as in the seed migration.
 */
export function isSafeAlias(pair: AliasPair): boolean {
  const alias = normaliseText(pair.alias);
  const canonical = normaliseText(pair.canonical);
  if (!alias || !canonical) return false;
  if (alias === canonical) return false;
  const aliasTokens = alias.split(" ").filter(Boolean);
  if (aliasTokens.every((t) => STOPWORDS.has(t))) return false;
  return true;
}

interface AliasSide { stems: string[] }
export interface AliasIndex { pairs: { a: AliasSide; b: AliasSide }[] }

export const EMPTY_ALIASES: AliasIndex = { pairs: [] };

export function buildAliasIndex(rows: AliasPair[] | null | undefined): AliasIndex {
  const pairs: { a: AliasSide; b: AliasSide }[] = [];
  for (const row of rows ?? []) {
    if (!row || !isSafeAlias(row)) continue;
    const a = tokenise(row.canonical).stems;
    const b = tokenise(row.alias).stems;
    if (!a.length || !b.length) continue;
    pairs.push({ a: { stems: a }, b: { stems: b } });
  }
  return { pairs };
}

/**
 * Expand a stem set with its aliases, in both directions, ONE HOP ONLY.
 * Every pair is tested against the ORIGINAL set, never the growing one, so the
 * expansion cannot chain and always terminates.
 */
export function expandWithAliases(stems: Set<string>, index: AliasIndex): Set<string> {
  if (!index || index.pairs.length === 0) return stems;
  const out = new Set(stems);
  for (const p of index.pairs) {
    if (p.a.stems.every((s) => stems.has(s))) for (const s of p.b.stems) out.add(s);
    if (p.b.stems.every((s) => stems.has(s))) for (const s of p.a.stems) out.add(s);
  }
  return out;
}

/** Whole-text comparison key — the one normaliser for similarity checks. */
export function compareKey(s: string): string {
  return normaliseText(s);
}
