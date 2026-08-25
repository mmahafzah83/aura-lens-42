/**
 * THE DICTIONARY — the single source of member-facing count nouns, bilingual.
 *
 * THE LAW. One meaning per word, one DB field per word:
 *
 *   capture / captures        التقاط   rows in `entries` (a thing the member saved)
 *   source / sources          مصدر     rows in `source_registry`, or
 *                                      `strategic_signals.unique_orgs` for one signal
 *   piece(s) of evidence      قطعة     rows in `evidence_fragments`, or
 *                                      `strategic_signals.fragment_count` for one signal
 *   signal / signals          إشارة    rows in `strategic_signals`
 *   page / pages              صفحة     rows in `agent_findings` — pages AURA went
 *                                      and read overnight — or `documents.page_count`
 *                                      / `pages_total`, pages of a file the member
 *                                      uploaded. NOT the member's own sources, NOT
 *                                      captures, NEVER "reading(s)".
 *   draft / drafts            مسودة    draft rows in `linkedin_posts` /
 *                                      `content_items` — text Aura wrote that the
 *                                      member has not published.
 *   post / posts              منشور    rows in `post_provenance` — what the member
 *                                      actually published.


 *
 * Chain: entries (1) → source_registry (1) → evidence_fragments (many) → backs a signal.
 *
 * BANNED as member-facing nouns for these concepts: fragment(s), theme(s),
 * topic(s), subject(s), claim(s), thing(s), item(s), reading(s).
 *
 * Never re-inline a count noun in a component — import a formatter from here.
 * `scripts/check-vocabulary.mjs` fails the build when one is hand-written.
 */

export type VocabLang = "en" | "ar";

// ── bare nouns ─────────────────────────────────────────────────────────────

export const SIGNAL = { one: "signal", many: "signals", One: "Signal", Many: "Signals" } as const;

export const EVIDENCE = {
  one: "piece of evidence",
  many: "pieces of evidence",
  One: "Piece of evidence",
  Many: "Evidence",
} as const;

export const CAPTURE = { verbPast: "captured", noun: "capture", nounPlural: "captures" } as const;

export const SOURCE = { one: "source", many: "sources", One: "Source", Many: "Sources" } as const;

/** The same four nouns in Arabic, for the cases that need only the word. */
export const NOUN_AR = {
  capture: { one: "التقاط", many: "التقاطات" },
  source: { one: "مصدر", many: "مصادر" },
  evidence: { one: "قطعة من الأدلة", many: "قطع من الأدلة" },
  signal: { one: "إشارة", many: "إشارات" },
} as const;

export const STANDING = { label: "Your standing" } as const;

export function velocityWord(v: string | null | undefined): string {
  const s = String(v ?? "").toLowerCase();
  if (s === "accelerating" || s === "growing") return "growing";
  if (s === "declining" || s === "cooling") return "cooling";
  return "steady";
}

// ── Arabic number agreement ────────────────────────────────────────────────
//
// 1 → singular, 2 → dual, 3–10 → plural of paucity, 11+ → singular accusative.
// This is the pattern Round 1 established in studio/strings.ts; it now lives
// here once and studio/strings.ts re-exports it.

function arabicCount(
  n: number,
  forms: { one: string; two: string; few: (n: number) => string; many: (n: number) => string },
): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return forms.few(n);
  return forms.many(n);
}

export function evidenceCountAr(n: number): string {
  return arabicCount(n, {
    one: "قطعة واحدة من الأدلة",
    two: "قطعتان من الأدلة",
    few: (x) => `${x} قطع من الأدلة`,
    many: (x) => `${x} قطعة من الأدلة`,
  });
}

export function sourceCountAr(n: number): string {
  return arabicCount(n, {
    one: "مصدر واحد",
    two: "مصدران",
    few: (x) => `${x} مصادر`,
    many: (x) => `${x} مصدراً`,
  });
}

export function captureCountAr(n: number): string {
  return arabicCount(n, {
    one: "التقاط واحد",
    two: "التقاطان",
    few: (x) => `${x} التقاطات`,
    many: (x) => `${x} التقاطاً`,
  });
}

export function signalCountAr(n: number): string {
  return arabicCount(n, {
    one: "إشارة واحدة",
    two: "إشارتان",
    few: (x) => `${x} إشارات`,
    many: (x) => `${x} إشارة`,
  });
}

export function evidenceCountEn(n: number): string {
  return `${n} piece${n === 1 ? "" : "s"} of evidence`;
}

export function sourceCountEn(n: number): string {
  return `${n} ${n === 1 ? SOURCE.one : SOURCE.many}`;
}

export function captureCountEn(n: number): string {
  return `${n} ${n === 1 ? CAPTURE.noun : CAPTURE.nounPlural}`;
}

export function signalCountEn(n: number): string {
  return `${n} ${n === 1 ? SIGNAL.one : SIGNAL.many}`;
}

// ── the four formatters every surface calls ────────────────────────────────
//
// `lang` is REQUIRED. A forgotten argument used to render English silently on
// an Arabic surface with no type error; now the compiler catches it. An
// English-only surface passes "en" explicitly, which is honest about its state.

export const nCaptures = (n: number, lang: VocabLang): string =>
  lang === "ar" ? captureCountAr(n) : captureCountEn(n);

export const nSources = (n: number, lang: VocabLang): string =>
  lang === "ar" ? sourceCountAr(n) : sourceCountEn(n);

export const nEvidence = (n: number, lang: VocabLang): string =>
  lang === "ar" ? evidenceCountAr(n) : evidenceCountEn(n);

export const nSignals = (n: number, lang: VocabLang): string =>
  lang === "ar" ? signalCountAr(n) : signalCountEn(n);

// ── the fifth word: pages Aura read overnight ──────────────────────────────
//
// `agent_findings` is one row per URL Aura went and read on its own. Those are
// NOT `source_registry` rows and NOT the member's material, so they may never
// be called "sources" (that word belongs to the member) nor "captures" nor
// "readings" (banned). They are PAGES.

export const PAGE_NOUN = { one: "page", many: "pages", One: "Page", Many: "Pages" } as const;

export function pageCountAr(n: number): string {
  return arabicCount(n, {
    one: "صفحة واحدة",
    two: "صفحتان",
    few: (x) => `${x} صفحات`,
    many: (x) => `${x} صفحة`,
  });
}

export function pageCountEn(n: number): string {
  return `${n} ${n === 1 ? PAGE_NOUN.one : PAGE_NOUN.many}`;
}

/** Pages Aura read overnight. Only permitted source: `agent_findings` rows. */
export const nPages = (n: number, lang: VocabLang): string =>
  lang === "ar" ? pageCountAr(n) : pageCountEn(n);

/** Drafts Aura wrote — `linkedin_posts` / `content_items` rows in draft state. */
export const nDrafts = (n: number, lang: VocabLang): string =>
  lang === "ar" ? arabicCount(n, {
    one: "مسودة واحدة", two: "مسودتان",
    few: (x) => `${x} مسودات`, many: (x) => `${x} مسودة`,
  }) : `${n} draft${n === 1 ? "" : "s"}`;

/** Posts the member published — `post_provenance` rows. */
export const nPosts = (n: number, lang: VocabLang): string =>
  lang === "ar" ? arabicCount(n, {
    one: "منشور واحد", two: "منشوران",
    few: (x) => `${x} منشورات`, many: (x) => `${x} منشوراً`,
  }) : `${n} post${n === 1 ? "" : "s"}`;



/** Evidence and sources in one line — the pair every signal surface states. */
export const evidenceAndSources = (evidence: number, sources: number, lang: VocabLang): string =>
  `${nEvidence(evidence, lang)} · ${nSources(sources, lang)}`;

// ── parts, for surfaces that render the numeral in the mono face ───────────
//
// A surface that gives the digit its own <span> must NOT reverse-engineer the
// placeholder out of a rendered sentence (`.replace(String(n), "{n}")`): the
// Arabic singular and dual carry NO numeral at all, and a second numeral in any
// future wording would be swapped by mistake. So the dictionary emits the split
// BY CONSTRUCTION.
//
// DECISION for Arabic n=1 / n=2: keep the worded forms (قطعة واحدة / قطعتان)
// and return `digit: null`. Native Arabic states one and two as words; forcing
// a numeral to satisfy a typographic effect would be worse grammar for the sake
// of a font. The caller renders the mono digit only when `digit` is non-null.

export type CountParts = { pre: string; digit: string | null; post: string };

const worded = (text: string): CountParts => ({ pre: text, digit: null, post: "" });
const numbered = (n: number, tail: string): CountParts => ({ pre: "", digit: String(n), post: tail });

export function evidencePartsAr(n: number): CountParts {
  if (n === 1) return worded("قطعة واحدة من الأدلة");
  if (n === 2) return worded("قطعتان من الأدلة");
  return numbered(n, n <= 10 ? " قطع من الأدلة" : " قطعة من الأدلة");
}

export function evidencePartsEn(n: number): CountParts {
  return numbered(n, ` piece${n === 1 ? "" : "s"} of evidence`);
}

/** The evidence count, split so the caller can style the numeral. */
export const nEvidenceParts = (n: number, lang: VocabLang): CountParts =>
  lang === "ar" ? evidencePartsAr(n) : evidencePartsEn(n);

/** Append a trailing clause to a parts object without touching the numeral. */
export const withTail = (parts: CountParts, tail: string): CountParts =>
  ({ ...parts, post: `${parts.post}${tail}` });

