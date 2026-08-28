/**
 * MARKER STYLE — what glyphs this member actually types, per language.
 *
 * Voice profile decides the words and the tone.
 * The slide decides what a slide can physically hold.
 *
 * Nothing here is invented. A symbol only enters the profile because the
 * member used it, repeatedly, in their own writing. With no evidence the
 * answer is "no symbols", marked `assumed`, which is exactly the behaviour
 * every deck had before this field existed.
 */

export interface MarkerStyle {
  uses_symbols: boolean;
  symbols: string[];
  uses_emoji: boolean;
  emoji: string[];
  confidence: "observed" | "assumed";
}

export const EMPTY_MARKER_STYLE: MarkerStyle = {
  uses_symbols: false,
  symbols: [],
  uses_emoji: false,
  emoji: [],
  confidence: "assumed",
};

/** Pictographs — emoji proper. */
const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?/gu;
/** Non-pictographic symbol glyphs: arrows, geometric shapes, dingbats. */
const SYMBOL_RE = /[\u2190-\u21FF\u2200-\u22FF\u25A0-\u25FF\u2B00-\u2BFF\u2700-\u27BF]/gu;

/** A glyph must appear in at least this many separate posts to count as habit. */
const MIN_POSTS = 2;
/** And at least this many times in total. */
const MIN_HITS = 3;
/** No profile carries more than this many of either kind. */
const CAP = 4;

function tally(texts: string[], re: RegExp): Array<[string, number, number]> {
  const hits = new Map<string, number>();
  const posts = new Map<string, number>();
  for (const raw of texts) {
    const text = String(raw ?? "");
    if (!text.trim()) continue;
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      const g = m[0];
      hits.set(g, (hits.get(g) ?? 0) + 1);
      seen.add(g);
    }
    for (const g of seen) posts.set(g, (posts.get(g) ?? 0) + 1);
  }
  return [...hits.entries()]
    .map(([g, n]) => [g, n, posts.get(g) ?? 0] as [string, number, number])
    .filter(([, n, p]) => n >= MIN_HITS && p >= MIN_POSTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CAP);
}

/**
 * Read the member's marker habits out of their own writing.
 * `texts` are the plain bodies of their example posts and admired posts for
 * ONE language row — Arabic and English habits differ and are scanned apart.
 */
export function deriveMarkerStyle(texts: string[]): MarkerStyle {
  const bodies = (texts ?? []).map((t) => String(t ?? "")).filter((t) => t.trim().length > 0);
  if (bodies.length < MIN_POSTS) return { ...EMPTY_MARKER_STYLE };

  const symbols = tally(bodies, SYMBOL_RE).map(([g]) => g);
  const emoji = tally(bodies, EMOJI_RE).map(([g]) => g);
  if (!symbols.length && !emoji.length) return { ...EMPTY_MARKER_STYLE };

  return {
    uses_symbols: symbols.length > 0,
    symbols,
    uses_emoji: emoji.length > 0,
    emoji,
    confidence: "observed",
  };
}

/** Whatever is in the column, turned into a shape the rest of the code trusts. */
export function normaliseMarkerStyle(raw: unknown): MarkerStyle {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, CAP);
  const symbols = list(o.symbols);
  const emoji = list(o.emoji);
  const uses_symbols = o.uses_symbols === true && symbols.length > 0;
  const uses_emoji = o.uses_emoji === true && emoji.length > 0;
  return {
    uses_symbols,
    symbols: uses_symbols ? symbols : [],
    uses_emoji,
    emoji: uses_emoji ? emoji : [],
    confidence: o.confidence === "observed" ? "observed" : "assumed",
  };
}
