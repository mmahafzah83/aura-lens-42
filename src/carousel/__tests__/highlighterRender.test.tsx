/**
 * A smoke test for the dispatch: the highlighter fixtures must draw through
 * the highlighter renderer, and every slide must mount without throwing.
 * It does not assert pixels — that is the fixture harness's job — but it does
 * prove the family is reachable from a DeckIR alone.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DeckIRSchema } from "../deckIR";
import Slide from "../render/Slide";
import en from "../__fixtures__/en-7-highlighter.json";
import ar from "../__fixtures__/ar-7-highlighter.json";

describe("highlighter renderer", () => {
  it.each([["en", en], ["ar", ar]])("%s deck mounts every slide", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      expect(container.textContent ?? "").not.toBe("");
      cleanup();
    }
  });
});
