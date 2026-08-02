import { describe, expect, it } from "vitest";
import { moveSlide } from "../studio/deckEdit";
import type { DeckIR } from "../deckIR";

const node = (t: string) => ({ runs: [{ t, lang: "en" as const }] });
const deck = {
  deck_id: "d", signal_id: "s", primary_lang: "en", dir: "ltr", numerals: "western",
  theme: "midnight", length: 5, profile: { name: node("A Member") },
  slides: [
    { index: 0, archetype: "cover_hero", slots: { hero_lines: [{ runs: [{ t: "One", lang: "en" }] }] } },
    { index: 1, archetype: "frame", slots: { headline: node("B") } },
    { index: 2, archetype: "evidence", slots: { headline: node("C") } },
    { index: 3, archetype: "quote", slots: { quote: node("D") } },
    { index: 4, archetype: "close", slots: { cta_pill: node("E") } },
  ],
} as unknown as DeckIR;

describe("moveSlide", () => {
  it("reorders middle slides and reindexes", () => {
    const out = moveSlide(deck, 1, 3);
    expect(out.slides.map((s) => s.archetype)).toEqual(["cover_hero", "evidence", "quote", "frame", "close"]);
    expect(out.slides.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });
  it("refuses to move the locked cover", () => {
    expect(moveSlide(deck, 0, 2)).toBe(deck);
  });
  it("refuses to move the locked close slide", () => {
    expect(moveSlide(deck, 4, 1)).toBe(deck);
  });
  it("refuses to land on a locked position", () => {
    expect(moveSlide(deck, 2, 0)).toBe(deck);
    expect(moveSlide(deck, 2, 4)).toBe(deck);
  });
});
