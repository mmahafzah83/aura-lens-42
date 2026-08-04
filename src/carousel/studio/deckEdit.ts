/**
 * Pure, immutable edit operations on a DeckIR.
 *
 * The studio never lets a member touch layout — only the text inside named
 * slots, the archetype of a middle slide, and whether a middle slide exists.
 * Everything here is a value transform so the canvas can re-validate and
 * re-run the fit ladder on every keystroke.
 */
import type { Archetype, DeckIR, HeroLine, Run, Slide, Slots, TextNode } from "../deckIR";
import {
  COVER_TRIM_TARGET, MEDIA_BY_ARCHETYPE, REQUIRED_SLOTS, pictureTextPlan, wordBudgetFor,
} from "../slots";

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

/**
 * Reorder one middle slide. Lock semantics are unchanged: the cover stays
 * first, the closing slide stays last, everything between them moves freely.
 * A move that would violate a lock is refused by returning the deck unchanged.
 */
export function moveSlide(deck: DeckIR, fromIndex: number, toIndex: number): DeckIR {
  if (fromIndex === toIndex) return deck;
  const slide = deck.slides.find((s) => s.index === fromIndex);
  if (!slide || isLocked(deck, slide)) return deck;
  if (toIndex < 0 || toIndex >= deck.slides.length) return deck;
  const target = deck.slides.find((s) => s.index === toIndex);
  // Landing on a locked position would push it out of place.
  if (!target || isLocked(deck, target)) return deck;
  const rest = deck.slides.filter((s) => s.index !== fromIndex);
  rest.splice(toIndex, 0, slide);
  return { ...deck, slides: reindex(rest) };
}

export function replaceSlide(deck: DeckIR, slideIndex: number, slide: Slide): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => (s.index === slideIndex ? { ...slide, index: slideIndex } : s)),
  };
}

/**
 * A member photo. `credit: null` means explicitly "the member's own work"
 * (INV-15).
 *
 * `placement` is now DERIVED from the one media taxonomy and is what the
 * renderer actually reads, so the stored value and the drawn composition can
 * never disagree. It used to be hard-coded to "lower" while the renderer
 * ignored it entirely — a value nothing reads is a lie in the data.
 *
 * An archetype that refuses pictures is returned unchanged; the studio states
 * the real reason before the file picker ever opens.
 */
export function setSlidePhoto(deck: DeckIR, slideIndex: number, src: string | null): DeckIR {
  return {
    ...deck,
    slides: deck.slides.map((s) => {
      if (s.index !== slideIndex) return s;
      const slots: any = { ...s.slots };
      if (!src) { delete slots.media; return { ...s, slots }; }
      const mode = MEDIA_BY_ARCHETYPE[s.archetype];
      if (mode === "none") return s;
      slots.media = { kind: "photo", placement: mode === "cover" ? "full" : "lower", src, credit: null };
      return { ...s, slots };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Picture variants — the words have to know they have less room       */
/* ------------------------------------------------------------------ */

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function nodeWords(node: { runs: Run[] } | undefined | null): number {
  return words(textOf(node)).length;
}

export function slideHasPicture(slide: Slide): boolean {
  const media = slide.slots.media;
  return Boolean(media && media.kind !== "chart" && media.kind !== "icon" && media.src);
}

/** Every word the member can see on this slide, in its current variant. */
export function slideWordCount(slide: Slide): number {
  const s = slide.slots;
  const cover = slideHasPicture(slide) && MEDIA_BY_ARCHETYPE[slide.archetype] === "cover";
  let n = (s.hero_lines ?? []).reduce((a, l) => a + nodeWords(l), 0);
  if (cover) return n || words(String(s.stat_value ?? "")).length;
  for (const key of ["chip", "headline", "subline", "stat_label", "term", "term_def", "quote", "cta_pill"] as const) {
    n += nodeWords(s[key] as TextNode | undefined);
  }
  n += (s.body ?? []).reduce((a, node) => a + nodeWords(node), 0);
  n += (s.checklist ?? []).reduce((a, node) => a + nodeWords(node), 0);
  return n;
}

/** True when this slide's words no longer fit the composition it is in. */
export function overPictureBudget(slide: Slide): boolean {
  if (!slideHasPicture(slide)) return false;
  return slideWordCount(slide) > wordBudgetFor(slide.archetype, true);
}

function clipNode(node: TextNode, limit: number, lang: "en" | "ar"): TextNode {
  const w = words(textOf(node));
  if (w.length <= limit) return node;
  return makeTextNode(w.slice(0, Math.max(1, limit)).join(" "), lang, node);
}

/**
 * Shorten ONE slide's text so it fits its picture variant. Deterministic and
 * local: nothing is invented, the member's own words are only trimmed, and the
 * member is free to ignore the offer and keep every word.
 */
export function shortenSlideForPicture(deck: DeckIR, slideIndex: number): DeckIR {
  const lang = deck.primary_lang;
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.index !== slideIndex || !slideHasPicture(slide)) return slide;
      const mode = MEDIA_BY_ARCHETYPE[slide.archetype];
      const slots: any = { ...slide.slots };

      if (mode === "cover") {
        // The hero is the only text the cover variant draws, so that is the
        // only text worth trimming.
        if (Array.isArray(slots.hero_lines) && slots.hero_lines.length) {
          let left = COVER_TRIM_TARGET;
          slots.hero_lines = slots.hero_lines
            .map((line: HeroLine) => {
              if (left <= 0) return null;
              const w = words(textOf(line));
              const keep = Math.min(w.length, left);
              left -= keep;
              return keep === w.length ? line : makeHeroLine(w.slice(0, keep).join(" "), lang, line);
            })
            .filter(Boolean);
        }
        return { ...slide, slots };
      }

      // Band: drop the optional tail first, then the trailing body nodes, then
      // clip what remains. Structural slots are never removed.
      const budget = wordBudgetFor(slide.archetype, true);
      if (Array.isArray(slots.body) && slots.body.length) {
        let kept: TextNode[] = slots.body.filter((n: TextNode) => !n.optional_tail);
        if (!kept.length) kept = [slots.body[0]];
        let used = slideWordCount({ ...slide, slots: { ...slots, body: [] } } as Slide);
        const out: TextNode[] = [];
        for (const node of kept) {
          const room = budget - used;
          if (room <= 3) break;
          const clipped = clipNode(node, room, lang);
          out.push(clipped);
          used += nodeWords(clipped);
        }
        slots.body = out;
      }
      return { ...slide, slots };
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

/* ------------------------------------------------------------------ */
/* Z2 / Z3 — the two ways out, each one press, each naming its field   */
/* ------------------------------------------------------------------ */

/** The filled slots this slide's picture variant cannot draw, in priority order. */
export function droppedPictureSlots(slide: Slide): string[] {
  if (!slideHasPicture(slide)) return [];
  return pictureTextPlan(slide.archetype, slide.slots as Record<string, unknown>, true).dropped;
}

/**
 * Z3 — SHORTEN ONE FIELD. Rewrites ONLY the named slot, deterministically,
 * out of the member's own words. Every other slot is returned untouched, and
 * if there is no room to keep even a few words the deck comes back unchanged
 * so the caller can say so plainly rather than silently emptying a field.
 */
export function shortenSlotForPicture(deck: DeckIR, slideIndex: number, slot: string): DeckIR {
  const lang = deck.primary_lang;
  let changed = false;
  const next = {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.index !== slideIndex) return slide;
      const value = (slide.slots as any)[slot];
      if (value === undefined || value === null) return slide;
      // Room left once every slot the variant KEEPS has had its words.
      const budget = wordBudgetFor(slide.archetype, true);
      const withoutSlot: any = { ...slide.slots, [slot]: Array.isArray(value) ? [] : undefined };
      const used = slideWordCount({ ...slide, slots: withoutSlot } as Slide);
      const room = budget - used;
      if (room < 3) return slide;
      const slots: any = { ...slide.slots };
      if (Array.isArray(value)) {
        let left = room;
        slots[slot] = value
          .map((node: TextNode | HeroLine) => {
            if (left <= 0) return null;
            const w = words(textOf(node));
            const keep = Math.min(w.length, left);
            left -= keep;
            if (keep === w.length) return node;
            return slot === "hero_lines"
              ? makeHeroLine(w.slice(0, keep).join(" "), lang, node as HeroLine)
              : makeTextNode(w.slice(0, keep).join(" "), lang, node as TextNode);
          })
          .filter(Boolean);
      } else if (typeof value === "object" && "runs" in value) {
        slots[slot] = clipNode(value as TextNode, room, lang);
      } else {
        return slide;
      }
      changed = true;
      return { ...slide, slots };
    }),
  };
  return changed ? next : deck;
}

/**
 * Z2 — MOVE ONE FIELD TO ITS OWN SLIDE. The words the picture variant cannot
 * hold are lifted onto a new plain slide directly after this one — no
 * picture, so nothing has to give way — and removed from this slide only
 * once they exist on the new one. Nothing is invented and nothing is lost.
 */
export function moveSlotToOwnSlide(deck: DeckIR, slideIndex: number, slot: string): DeckIR {
  const lang = deck.primary_lang;
  const source = deck.slides.find((s) => s.index === slideIndex);
  if (!source) return deck;
  const value = (source.slots as any)[slot];
  const text = Array.isArray(value)
    ? value.map((n: TextNode | HeroLine) => textOf(n)).filter(Boolean).join(" ")
    : textOf(value as TextNode | undefined);
  if (!text.trim()) return deck;

  const slots: any = { ...source.slots };
  delete slots[slot];

  const carried: Slide = {
    index: slideIndex + 1,
    archetype: "frame",
    slots: { hero_lines: [makeHeroLine(text, lang)] } as any,
  } as Slide;

  const before = deck.slides.filter((s) => s.index <= slideIndex).map((s) => (s.index === slideIndex ? { ...s, slots } : s));
  const after = deck.slides.filter((s) => s.index > slideIndex);
  return { ...deck, slides: reindex([...before, carried, ...after]) };
}