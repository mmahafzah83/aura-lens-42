/**
 * Deck invariants. `checkInvariants` returns an empty array on pass; every
 * entry is a human-readable failure prefixed with its rule name.
 *
 * Two rules (INV-02 overflow, INV-16 media reaching the DOM) can only be
 * decided at render time. Their names are exported so the renderer reports
 * them in the same vocabulary.
 */
import {
  ARCHETYPES,
  plainText,
  type Archetype,
  type DeckIR,
  type HeroLine,
  type Run,
  type Slide,
  type TextNode,
} from "./deckIR.ts";

/** Checked by the renderer once real glyph metrics exist. */
export const INV_02_OVERFLOW = "INV-02";
/** Checked by the renderer: declared media must actually reach the DOM. */
export const INV_16_MEDIA_IN_DOM = "INV-16";
export const RENDER_TIME_RULES = [INV_02_OVERFLOW, INV_16_MEDIA_IN_DOM] as const;

const BANNED_STRINGS = ["lorem", "tbd", "placeholder", "todo", "\u2026"];

const BANNED_VOCAB = [
  "thought leader",
  "personal brand",
  "game-changing",
  "game changing",
  "seamless",
  "unlock",
  "elevate",
  "empower",
  "utilize",
  "facilitate",
];

/** "leverage" is banned as a verb only; the noun ("financial leverage") is fine. */
const LEVERAGE_AS_VERB =
  /\b(leverage|leverages|leveraged|leveraging)\b(?!\s+(ratio|ratios|effect|point|points))/i;

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_RE = /[A-Za-z]/;

/* ------------------------------------------------------------------ */
/* INV-18 / INV-19 — the AI tells                                      */
/* ------------------------------------------------------------------ */

/** "Stop guessing. Start measuring." and every imperative antithesis of that shape. */
const IMPERATIVE_ANTITHESIS =
  /\b(stop|quit|forget)\b[^.?!]{0,48}[.?!—-]\s*\b(start|begin)\b/i;

/** Openers that belong to no one. Matched only at the head of a text node. */
const DEAD_OPENERS = [
  "in today's landscape",
  "in today's world",
  "in an era of",
  "in the era of",
  "as we navigate",
  "it's no secret that",
  "it is no secret that",
  "in a world where",
];

/** Abstractions carrying no object. Each one could sit in any deck in any industry. */
const EMPTY_ABSTRACTIONS = [
  "drive value",
  "driving value",
  "unlock potential",
  "foundation for",
  "key to success",
  "critical enabler",
  "robust framework",
  "holistic approach",
  "comprehensive strategy",
  "strategic imperative",
  "paradigm shift",
];

/** A three-item parallel list: "people, process, and technology". */
const TRIPLET_RE =
  /\b[\w-]+(?:\s+[\w-]+){0,2},\s+[\w-]+(?:\s+[\w-]+){0,2},\s+(?:and\s+)?[\w-]+(?:\s+[\w-]+){0,2}\b/;

const MAX_SENTENCE_WORDS = 28;

/** First-person and lived-observation markers, English and Arabic. */
const FIRST_PERSON_RE =
  /\b(i|i'm|i've|my|we|we're|we've|our|us)\b|(?:^|\s)(?:من\s+خبرتي|شفت|رأيت|عندنا|لدينا|أعرف|قابلت)/i;

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

/** A proper noun: a capitalised word that is not simply the head of a sentence. */
function hasProperNoun(text: string): boolean {
  for (const sentence of sentencesOf(text)) {
    const words = sentence.split(/\s+/);
    for (let i = 1; i < words.length; i += 1) {
      const w = words[i].replace(/[^A-Za-z-]/g, "");
      if (w.length > 1 && /^[A-Z]/.test(w) && w !== "I") return true;
    }
    // An all-caps or capitalised acronym anywhere, including at the head.
    if (/\b[A-Z]{2,}\b/.test(sentence)) return true;
  }
  return false;
}

function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

/**
 * "Could this sentence appear in any company's deck in any industry?" —
 * operationalised as: no proper noun, no number, no first-person marker.
 */
function isAnonymous(text: string): boolean {
  return !hasProperNoun(text) && !hasNumber(text) && !FIRST_PERSON_RE.test(text);
}

/** Slides that carry an argument, and are therefore held to the specificity test. */
const SUBSTANTIVE_ARCHETYPES: string[] = [
  "frame", "evidence", "callout", "steps", "definition", "quote", "benchmark",
];

export interface InvariantOptions {
  /** The member's own `vocabulary_preferences.avoid` list, enforced verbatim. */
  avoid?: string[];
  /**
   * Sector vocabulary drawn from the signal itself — theme tags, title words,
   * named entities. A slide carrying one of these is not "any company's deck".
   * When absent the slide-level anonymity test is skipped, because without the
   * source material there is no way to tell domain language from filler.
   */
  domainTerms?: string[];
}

const HERO_BUDGET: Record<"en" | "ar", number> = { en: 14, ar: 20 };

const CONTRAST_ARCHETYPES: Archetype[] = [
  "evidence",
  "cover_stat",
  "benchmark",
  "quote",
  "definition",
  "steps",
];

/** Every text node reachable from a slide, for string scanning. */
function slideTextNodes(slide: Slide): TextNode[] {
  const s = slide.slots;
  const out: TextNode[] = [];
  const push = (n?: TextNode) => { if (n) out.push(n); };
  push(s.chip); push(s.subline); push(s.headline); push(s.stat_label);
  push(s.source); push(s.callout_label); push(s.callout_body); push(s.quote);
  push(s.term); push(s.term_def); push(s.cta_pill);
  for (const b of s.body ?? []) out.push(b);
  for (const c of s.checklist ?? []) out.push(c);
  for (const item of s.media?.chart?.series ?? []) out.push(item.label);
  return out;
}

function slideRuns(slide: Slide): Run[] {
  const hero = (slide.slots.hero_lines ?? []).flatMap((l: HeroLine) => l.runs);
  return [...slideTextNodes(slide).flatMap((n) => n.runs), ...hero];
}

function slideStrings(slide: Slide): string[] {
  const out = slideTextNodes(slide).map(plainText);
  for (const line of slide.slots.hero_lines ?? []) out.push(plainText(line));
  if (slide.slots.stat_value) out.push(slide.slots.stat_value);
  if (slide.slots.media?.credit) out.push(slide.slots.media.credit);
  return out.filter(Boolean);
}

/** Content slots — `media` alone does not make a slide, but it does count. */
function contentSlotCount(slide: Slide): number {
  const s = slide.slots;
  let n = 0;
  for (const v of [
    s.chip, s.subline, s.headline, s.stat_label, s.source, s.callout_label,
    s.callout_body, s.quote, s.term, s.term_def, s.cta_pill, s.media,
  ]) if (v) n += 1;
  if (s.hero_lines?.length) n += 1;
  if (s.body?.length) n += 1;
  if (s.checklist?.length) n += 1;
  if (s.stat_value) n += 1;
  return n;
}

export function checkInvariants(ir: DeckIR, opts: InvariantOptions = {}): string[] {
  const errors: string[] = [];
  const slides = ir.slides ?? [];

  /** Short enough to be a phrase rather than a description of a habit. */
  const memberAvoid = (opts.avoid ?? [])
    .map((a) => String(a ?? "").trim())
    .filter((a) => a.length >= 3 && a.length <= 40)
    .map((a) => a.toLowerCase());

  const domainTerms = (opts.domainTerms ?? [])
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter((t) => t.length >= 4);

  let tripletCount = 0;
  let concreteParticulars = 0;

  // INV-08 — numerals are western, always.
  if (ir.numerals !== "western") {
    errors.push(`INV-08: numerals must be "western", got "${String(ir.numerals)}".`);
  }

  // INV-03 — a name is mandatory; an avatar is not. Absent avatar means the
  // renderer draws an accent rule, never a fabricated monogram.
  if (!plainText(ir.profile?.name).trim()) {
    errors.push("INV-03: profile.name is required.");
  }

  for (const slide of slides) {
    const where = `slide ${slide.index} (${slide.archetype})`;

    // INV-17 — unknown archetypes would silently render generic.
    if (!(ARCHETYPES as readonly string[]).includes(slide.archetype)) {
      errors.push(`INV-17: ${where} uses an archetype outside the nine implemented.`);
    }

    // INV-01 — no empty slide.
    if (contentSlotCount(slide) === 0) {
      errors.push(`INV-01: ${where} has no content slots.`);
    }

    // INV-04 — exactly one emphasis per slide.
    const emphases: string[] = [];
    if (slide.slots.stat_value) emphases.push("stat_value");
    const highlighted = (slide.slots.hero_lines ?? []).filter((l) => l.highlight).length;
    for (let i = 0; i < highlighted; i += 1) emphases.push("highlighted hero line");
    const alerts = (slide.slots.media?.chart?.series ?? []).filter((s) => s.emphasis === "alert").length;
    for (let i = 0; i < alerts; i += 1) emphases.push('chart series with emphasis "alert"');
    if (emphases.length !== 1) {
      errors.push(
        `INV-04: ${where} must carry exactly one emphasis, found ${emphases.length}` +
        (emphases.length ? ` (${emphases.join(", ")})` : "") +
        (slide.archetype === "cover_stat" && emphases.length > 1
          ? " — on cover_stat the stat is the emphasis, so a highlighted hero line competes with it"
          : "") + ".",
      );
    }

    // INV-05 — a number without a source is an assertion, not evidence.
    if (slide.slots.stat_value && !plainText(slide.slots.source).trim()) {
      errors.push(`INV-05: ${where} carries a stat_value but no source.`);
    }

    // INV-07 — direction integrity.
    for (const run of slideRuns(slide)) {
      if (run.lang === "en" && ARABIC_RE.test(run.t)) {
        errors.push(`INV-07: ${where} has a run marked "en" containing Arabic characters: "${run.t}".`);
      }
      if (run.lang === "ar") {
        const latin = (run.t.match(/[A-Za-z]/g) ?? []).length;
        const letters = (run.t.match(/[A-Za-z\u0600-\u06FF]/g) ?? []).length;
        if (letters > 0 && latin / letters > 0.5) {
          errors.push(`INV-07: ${where} has a run marked "ar" that is substantially Latin: "${run.t}".`);
        }
      }
    }

    // INV-10 / INV-12 — banned strings and banned vocabulary.
    for (const text of slideStrings(slide)) {
      const lower = text.toLowerCase();
      for (const banned of BANNED_STRINGS) {
        if (lower.includes(banned)) {
          errors.push(`INV-10: ${where} contains the banned string "${banned}".`);
        }
      }
      for (const phrase of BANNED_VOCAB) {
        if (lower.includes(phrase)) {
          errors.push(`INV-12: ${where} contains banned vocabulary "${phrase}".`);
        }
      }
      if (LEVERAGE_AS_VERB.test(text)) {
        errors.push(`INV-12: ${where} uses "leverage" as a verb.`);
      }
    }

    // INV-13 — hero line budget. A longer line wraps and destroys the highlight block.
    for (const line of slide.slots.hero_lines ?? []) {
      const text = plainText(line);
      const lang: "en" | "ar" = ARABIC_RE.test(text) ? "ar" : "en";
      const budget = HERO_BUDGET[lang];
      if (text.length > budget) {
        errors.push(
          `INV-13: ${where} hero line "${text}" is ${text.length} characters, over the ${lang} budget of ${budget}.`,
        );
      }
    }

    // INV-14 / INV-15 — media completeness.
    const media = slide.slots.media;
    if (media) {
      if ((media.kind === "photo" || media.kind === "screenshot") && !media.src?.trim()) {
        errors.push(`INV-14: ${where} declares ${media.kind} media without a resolvable src.`);
      }
      if (media.kind === "chart" && !media.chart?.series?.length) {
        errors.push(`INV-14: ${where} declares chart media without chart data.`);
      }
      if (media.kind === "photo" && !("credit" in media)) {
        errors.push(`INV-15: ${where} photo must declare credit explicitly (null means the member's own work).`);
      }
    }

    /* ---------------- INV-18 — the AI tells ---------------- */
    const prose = slideTextNodes(slide).map(plainText).filter(Boolean);
    const everything = slideStrings(slide);

    for (const text of prose) {
      const lower = text.toLowerCase().trim();

      if (IMPERATIVE_ANTITHESIS.test(text)) {
        errors.push(`INV-18: ${where} uses the "Stop X. Start Y." construction: "${text.slice(0, 90)}".`);
      }
      for (const opener of DEAD_OPENERS) {
        if (lower.startsWith(opener)) {
          errors.push(`INV-18: ${where} opens with the dead phrase "${opener}".`);
        }
      }
      for (const phrase of EMPTY_ABSTRACTIONS) {
        if (lower.includes(phrase)) {
          errors.push(`INV-18: ${where} contains the empty abstraction "${phrase}".`);
        }
      }
      for (const sentence of sentencesOf(text)) {
        const words = wordCount(sentence);
        if (words > MAX_SENTENCE_WORDS) {
          errors.push(
            `INV-18: ${where} has a ${words}-word sentence, over the limit of ${MAX_SENTENCE_WORDS}: "${sentence.slice(0, 90)}".`,
          );
        }
      }
      if (TRIPLET_RE.test(text)) tripletCount += 1;
    }

    // The member's own avoid list, enforced rather than requested.
    for (const text of everything) {
      const lower = text.toLowerCase();
      for (const phrase of memberAvoid) {
        if (lower.includes(phrase)) {
          errors.push(`INV-18: ${where} contains "${phrase}", which this member never writes.`);
        }
      }
    }

    // Could this slide belong to anyone? Judged on the slide's own prose, and
    // only where there is enough of it to judge.
    const joined = everything.join(" ").trim();
    const lowerJoined = joined.toLowerCase();
    const carriesDomainTerm = domainTerms.some((t) => lowerJoined.includes(t));
    if (!isAnonymous(joined)) concreteParticulars += 1;
    if (
      domainTerms.length > 0 &&
      !carriesDomainTerm &&
      SUBSTANTIVE_ARCHETYPES.includes(slide.archetype) &&
      wordCount(joined) >= 12 &&
      isAnonymous(joined)
    ) {
      errors.push(
        `INV-18: ${where} could appear in any company's deck in any industry — no proper noun, no number, no first-person observation and no term from this signal.`,
      );
    }
  }

  // INV-18 — one triplet is a rhythm, two is a machine writing.
  if (tripletCount > 1) {
    errors.push(
      `INV-18: the deck uses ${tripletCount} three-item parallel lists. At most one is allowed.`,
    );
  }

  // INV-19 — the specificity floor. One concrete particular, or the deck fails.
  if (slides.length && concreteParticulars === 0) {
    errors.push(
      "INV-19: This signal is too abstract to write from — pick another or add a capture.",
    );
  }

  // INV-06 — no two consecutive slides share an archetype.
  for (let i = 1; i < slides.length; i += 1) {
    if (slides[i].archetype === slides[i - 1].archetype) {
      errors.push(
        `INV-06: slides ${slides[i - 1].index} and ${slides[i].index} both use "${slides[i].archetype}".`,
      );
    }
  }

  // INV-09b — contrast floor. A deck is never a wall of text.
  const present = new Set(slides.map((s) => s.archetype));
  if (!present.has("cover_hero") && !present.has("cover_stat")) {
    errors.push("INV-09b: a deck must open with a cover (cover_hero or cover_stat).");
  }
  if (!present.has("close")) {
    errors.push("INV-09b: a deck must end with a close slide.");
  }
  if (!CONTRAST_ARCHETYPES.some((a) => present.has(a))) {
    errors.push(
      `INV-09b: a deck needs at least one of ${CONTRAST_ARCHETYPES.join(", ")} so it is not a wall of text.`,
    );
  }
  // Evidence is required only when a stat actually exists. Never invent a
  // statistic when the signal carries none.
  const hasStat = slides.some((s) => Boolean(s.slots.stat_value));
  if (hasStat && !present.has("evidence") && !present.has("cover_stat")) {
    errors.push("INV-09b: the deck carries a statistic but no evidence or cover_stat slide to hold it.");
  }

  return errors;
}