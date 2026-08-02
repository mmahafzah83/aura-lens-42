/**
 * Pure, immutable edit operations on a DeckIR.
 *
 * The studio never lets a member touch layout — only the text inside named
 * slots, the archetype of a middle slide, and whether a middle slide exists.
 * Everything here is a value transform so the canvas can re-validate and
 * re-run the fit ladder on every keystroke.
 */
import type { Archetype, DeckIR, HeroLine, Run, Slide, Slots, TextNode } from "../deckIR";
import { REQUIRED_SLOTS } from "../slots";

const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;

/**
 * Split typed text back into bidi-safe runs. A member editing an Arabic deck
 * types "لوحة KPI" in one box; we must not hand the renderer a single Arabic
 * run containing Latin, because that is exactly what INV-07 rejects and what
 * renders backwards.
 */
export function runsFromText(text: string, fallback: "en" | "ar"): Run[] {
  const value = text.replace(/\r/g, "");
  if (!value.trim()) return [{ t: value || " ", lang: fallback }];

  const tokens = value.split(/(\s+)/).filter((t) => t !== "");
  const runs: Run[] = [];
  for (const token of tokens) {
    const lang: "en" | "ar" | null = ARABIC_RE.test(token)
      ? "ar"
      : LATIN_RE.test(token)
        ? "en"
        : null;
    const last = runs[runs.length - 1];
    if (last && (lang === null || lang === last.lang)) {
      last.t += token;
      continue;
    }
    runs.push({ t: token, lang: lang ?? fallback });
  }
  // Whitespace-only leading token would otherwise sit alone in the wrong script.
  return runs.length ? runs : [{ t: value, lang: fallback }];
}

export function textOf(node: { runs: Run[] } | undefined | null): string {
  return node ? node.runs.map((r) => r.t).join("") : "";
}

export function langOf(deck: DeckIR): "en" | "ar" {
  return deck.primary_lang;
}

export function makeTextNode(text: string, fallback: "en" | "ar", prev?: TextNode): TextNode {
  return {
    runs: runsFromText(text, fallback),
    ...(prev?.optional_tail ? { optional_tail: true } : {}),
  };
}

export function makeHeroLine(text: string, fallback: "en" | "ar", prev?: HeroLine): HeroLine {
  return {
    runs: runsFromText(text, fallback),
    ...(prev?.highlight ? { highlight: true } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Slot addressing                                                     */
/* ------------------------------------------------------------------ */

/** A single editable box on the panel. `i` indexes into array-valued slots. */
export interface SlotPath {
  slot: keyof Slots;
  i?: number;
}

export function readSlot(slots: Slots, path: SlotPath): string {
  const value = slots[path.slot];
  if (value === undefined) return "";
  if (path.slot === "stat_value") return String(value);
  if (Array.isArray(value)) {
    const item = value[path.i ?? 0] as TextNode | HeroLine | undefined;
    return textOf(item);
  }
  return textOf(value as TextNode);
}

function writeSlot(slots: Slots, path: SlotPath, text: string, lang: "en" | "ar"): Slots {
  const next: any = { ...slots };
  if (path.slot === "stat_value") {
    if (!text.trim()) delete next.stat_value;
    else next.stat_value = text;
    return next;
  }
  const current = next[path.slot];
  if (Array.isArray(current)) {
    const arr = [...current];
    const idx = path.i ?? 0;
    const prev = arr[idx];
    arr[idx] =
      path.slot === "hero_lines"
        ? makeHeroLine(text, lang, prev as HeroLine)
        : makeTextNode(text, lang, prev as TextNode);
    next[path.slot] = arr;
    return next;
  }
  next[path.slot] = makeTextNode(text, lang, current as TextNode | undefined);
  return next;
}

/** Replace the text of one slot box. */
export function editSlotText(deck: DeckIR, slideIndex: number, path: SlotPath, text: string): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) =>
      s.index === slideIndex ? { ...s, slots: writeSlot(s.slots, path, text, deck.primary_lang) } : s,
    ),
  };
}

/**
 * Exactly one hero line may be highlighted (INV-04). Setting one clears the
 * rest rather than letting the member create a failure they cannot see.
 */
export function setHeroHighlight(deck: DeckIR, slideIndex: number, lineIndex: number): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (s.index !== slideIndex || !s.slots.hero_lines) return s;
      const hasStat = Boolean(s.slots.stat_value);
      return {
        ...s,
        slots: {
          ...s.slots,
          hero_lines: s.slots.hero_lines.map((line, i) => {
            const on = !hasStat && i === lineIndex && !line.highlight;
            const { highlight: _drop, ...rest } = line;
            return on ? { ...rest, highlight: true } : rest;
          }),
        },
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

export function isLocked(deck: DeckIR, slide: Slide): boolean {
  return slide.index === 0 || slide.archetype === "close" || slide.index === deck.slides.length - 1;
}

/** Archetypes this slide could legally become: every required slot already filled. */
export function swappableArchetypes(deck: DeckIR, slide: Slide): Archetype[] {
  if (isLocked(deck, slide)) return [];
  const filled = (name: string) => {
    const v = (slide.slots as any)[name];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  };
  const neighbours = new Set(
    [deck.slides[slide.index - 1]?.archetype, deck.slides[slide.index + 1]?.archetype].filter(Boolean),
  );
  return (["frame", "evidence", "benchmark", "quote", "steps", "definition"] as Archetype[]).filter(
    (a) => a !== slide.archetype && !neighbours.has(a) && REQUIRED_SLOTS[a].every(filled),
  );
}

export function swapArchetype(deck: DeckIR, slideIndex: number, archetype: Archetype): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => (s.index === slideIndex ? { ...s, archetype } : s)),
  };
}

/** Indexes are positional, so removal always renumbers. */
export function reindex(slides: Slide[]): Slide[] {
  return slides.map((s, i) => (s.index === i ? s : { ...s, index: i }));
}

export function deleteSlide(deck: DeckIR, slideIndex: number): DeckIR {
  const slide = deck.slides.find((s) => s.index === slideIndex);
  if (!slide || isLocked(deck, slide)) return deck;
  return { ...deck, slides: reindex(deck.slides.filter((s) => s.index !== slideIndex)) };
}

export function replaceSlide(deck: DeckIR, slideIndex: number, slide: Slide): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => (s.index === slideIndex ? { ...slide, index: slideIndex } : s)),
  };
}

/** A member photo. `credit: null` means explicitly "the member's own work" (INV-15). */
export function setSlidePhoto(deck: DeckIR, slideIndex: number, src: string | null): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (s.index !== slideIndex) return s;
      const slots: any = { ...s.slots };
      if (!src) delete slots.media;
      else slots.media = { kind: "photo", placement: "lower", src, credit: null };
      return { ...s, slots };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Hero budgets — the one constraint a member cannot otherwise see     */
/* ------------------------------------------------------------------ */

export const HERO_BUDGET = { en: 14, ar: 20 } as const;

export function heroBudgetFor(text: string): number {
  return ARABIC_RE.test(text) ? HERO_BUDGET.ar : HERO_BUDGET.en;
}