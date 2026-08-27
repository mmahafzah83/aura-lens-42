/**
 * mirror — the weekly card, computed from his own rows and nothing else.
 *
 * THE RULE, ENFORCED IN CODE: every sentence of a Mirror card must carry a
 * count taken from a real row — a digit, or the word "None". A card that
 * cannot make a counted claim is not shown at all; the Desk falls through to
 * the ordinary opener. Silence beats a horoscope.
 *
 * Nothing here calls a model. Counts come from `entries` and from published
 * `linkedin_posts`, matched on whole words.
 */

export type MirrorFace = "apart" | "unsaid";

export interface MirrorClaim {
  face: MirrorFace;
  /** Stable across weeks; stored on "Not true" so it never returns. */
  signature: string;
  /** Two or three short sentences. Every one of them carries a count. */
  sentences: string[];
  /** The subject the primary action writes from. */
  term: string;
  actionLabel: string;
  /** The one line only he can fill. Carried into the draft as a marked hole. */
  gapLine: string;
}

/* Words that are grammar, or that describe the capture rather than the work. */
const STOP = new Set([
  "this", "that", "with", "from", "they", "them", "then", "than", "when", "what",
  "your", "yours", "have", "will", "into", "over", "such", "these", "those", "been",
  "were", "also", "more", "most", "some", "here", "there", "their", "which", "while",
  "about", "would", "could", "should", "because", "after", "before", "under", "across",
  "need", "needs", "make", "makes", "made", "much", "many", "well", "just", "like",
  "https", "http", "image", "article", "post", "posts", "page", "read", "note", "notes",
  "emphasizes", "highlights", "outlines", "relevant", "insights", "summary", "content",
  "says", "said", "shows", "show", "using", "used", "being", "very", "each", "other",
  "where", "whose", "does", "done", "both", "only", "even", "same", "still", "must",
]);

function docTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text || "").toLowerCase().replace(/[^\p{L} ]+/gu, " ").split(/\s+/)) {
    if (raw.length < 4) continue;
    if (STOP.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

/** Whole-word count of documents that mention a term. */
function docsMentioning(term: string, docs: string[]): number {
  const re = new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
  let n = 0;
  for (const d of docs) if (re.test(d)) n += 1;
  return n;
}

export interface MirrorInput {
  /** One string per capture. */
  entries: string[];
  /** One string per PUBLISHED post. Drafts are not speech. */
  posts: string[];
  /** Signatures he has already called untrue. */
  dismissed: string[];
  /** Chooses the face; pass the ISO week number. */
  week: number;
}

/** A sentence is only allowed out if it carries a count. */
export function hasCount(sentence: string): boolean {
  return /\d/.test(sentence) || /\bnone\b/i.test(sentence);
}

export function buildMirror(input: MirrorInput): MirrorClaim | null {
  const { entries, posts, dismissed, week } = input;
  if (entries.length < 5 || posts.length < 3) return null;

  /* Document frequency across his captures. */
  const df = new Map<string, number>();
  for (const e of entries) for (const t of docTokens(e)) df.set(t, (df.get(t) || 0) + 1);
  const ranked = [...df.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 60)
    .map(([term, captures]) => ({ term, captures, published: docsMentioning(term, posts) }));

  const order: MirrorFace[] = week % 2 === 0 ? ["apart", "unsaid"] : ["unsaid", "apart"];
  for (const face of order) {
    const claim = face === "apart" ? apart(ranked, dismissed) : unsaid(ranked, dismissed);
    if (claim && claim.sentences.every(hasCount)) return claim;
  }
  return null;
}

type Row = { term: string; captures: number; published: number };

/** What sets him apart: in his file, absent from his speech. */
function apart(rows: Row[], dismissed: string[]): MirrorClaim | null {
  const hit = rows.find(r => r.captures >= 3 && r.published === 0 && !dismissed.includes(`apart:${r.term}`));
  if (!hit) return null;
  return {
    face: "apart",
    signature: `apart:${hit.term}`,
    sentences: [
      `${hit.captures} of your captures reference ${hit.term}.`,
      `None of your published posts do.`,
    ],
    term: hit.term,
    actionLabel: `Draft from ${hit.term}`,
    gapLine: `On ${hit.term}, the number I have never put in writing is ___.`,
  };
}

/** What he didn't say: kept heavily, published rarely. */
function unsaid(rows: Row[], dismissed: string[]): MirrorClaim | null {
  for (const a of rows) {
    if (a.captures < 6) continue;
    for (const b of rows) {
      if (b.term === a.term || b.captures < 2) continue;
      if (a.captures < b.captures * 3) continue;
      const sig = `unsaid:${a.term}:${b.term}`;
      if (dismissed.includes(sig)) continue;
      return {
        face: "unsaid",
        signature: sig,
        sentences: [
          `You've captured ${a.term} ${a.captures} times and ${b.term} ${b.captures} times.`,
          `Your published posts mention ${a.term} ${a.published} times and ${b.term} ${b.published} times.`,
        ],
        term: a.term,
        actionLabel: `Draft from ${a.term}`,
        gapLine: `On ${a.term}, the number I have never put in writing is ___.`,
      };
    }
  }
  return null;
}

/** ISO-ish week number, used to alternate the face and to fire once a week. */
export function weekKey(d = new Date()): { week: number; key: string } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return { week, key: `${t.getUTCFullYear()}-W${week}` };
}
