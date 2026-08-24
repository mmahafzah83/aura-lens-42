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
// `lang` defaults to English so English-only surfaces stay a one-argument call.

export const nCaptures = (n: number, lang: VocabLang = "en"): string =>
  lang === "ar" ? captureCountAr(n) : captureCountEn(n);

export const nSources = (n: number, lang: VocabLang = "en"): string =>
  lang === "ar" ? sourceCountAr(n) : sourceCountEn(n);

export const nEvidence = (n: number, lang: VocabLang = "en"): string =>
  lang === "ar" ? evidenceCountAr(n) : evidenceCountEn(n);

export const nSignals = (n: number, lang: VocabLang = "en"): string =>
  lang === "ar" ? signalCountAr(n) : signalCountEn(n);

/** Evidence and sources in one line — the pair every signal surface states. */
export const evidenceAndSources = (evidence: number, sources: number, lang: VocabLang = "en"): string =>
  `${nEvidence(evidence, lang)} · ${nSources(sources, lang)}`;
