/**
 * The two paper families must draw from a DeckIR alone, in both directions,
 * and their backgrounds must survive html-to-image.
 *
 * EXPORT SAFETY is the second half of this file. Every new pattern this phase
 * introduced — the crumple fold lines and vignette, the gridpaper graph rule
 * and halftone corner — is asserted to be a plain CSS gradient. html-to-image
 * rasterizes gradients faithfully; SVG filters, `filter:` and
 * `mix-blend-mode` either drop out or render differently in the export
 * iframe, so their ABSENCE is the test.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DeckIRSchema } from "../deckIR";
import Slide from "../render/Slide";
import { checkTypeFloor } from "../invariants";
import { getTemplate } from "../render/template";
import enCrumple from "../__fixtures__/en-9-crumple.json";
import arCrumple from "../__fixtures__/ar-9-crumple.json";
import enGridpaper from "../__fixtures__/en-9-gridpaper.json";
import arGridpaper from "../__fixtures__/ar-9-gridpaper.json";

const decks: Array<[string, unknown]> = [
  ["en-crumple", enCrumple],
  ["ar-crumple", arCrumple],
  ["en-gridpaper", enGridpaper],
  ["ar-gridpaper", arGridpaper],
];

/** Every inline style string on and under the slide root. */
function styles(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>("*"))
    .map((el) => el.getAttribute("style") ?? "")
    .join(" | ");
}

describe("paper templates render", () => {
  it.each(decks)("%s mounts every slide", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      expect(container.textContent ?? "").not.toBe("");
      // The dispatcher must reach the family the deck declares, not a fallback.
      const root = container.querySelector("[data-slide-root]");
      expect(root?.getAttribute("data-template")).toBe(deck.template);
      cleanup();
    }
  });

  it.each(decks)("%s draws the engagement row on the close slide and nowhere else", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      const rows = container.querySelectorAll("[data-engagement-row]");
      expect(rows.length, `${slide.archetype} engagement rows`).toBe(slide.archetype === "close" ? 1 : 0);
      cleanup();
    }
  });

  it.each(decks)("%s keeps the icon rail out of the headline composition", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      for (const line of Array.from(container.querySelectorAll("[data-hero-line]"))) {
        expect(line.querySelector("svg"), `${slide.archetype} hero line holds an icon`).toBeNull();
      }
      cleanup();
    }
  });

  it("prints no type below the INV-22 floors at full scale", () => {
    for (const [name, raw] of decks) {
      const deck = DeckIRSchema.parse(raw);
      const tpl = getTemplate(deck.template);
      const floors = tpl.ramp.floors ?? { content: 0, meta: 0 };
      // The ramp at scale 1 is what the renderer starts from.
      const verdict = checkTypeFloor(name, { content: tpl.ramp.body, meta: tpl.ramp.source }, floors);
      expect(verdict, `${name}: ${verdict}`).toBeNull();
    }
  });
});

describe("export safety — patterns rasterize", () => {
  it.each(decks)("%s uses no filter, no blend mode and no SVG filter", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      const css = styles(container);
      expect(css).not.toMatch(/mix-blend-mode/i);
      expect(css).not.toMatch(/(^|[^-])filter\s*:/i);
      expect(container.querySelector("feTurbulence")).toBeNull();
      expect(container.querySelector("filter")).toBeNull();
      cleanup();
    }
  });

  it("crumple draws five fold lines and a vignette, all as gradients", () => {
    const deck = DeckIRSchema.parse(enCrumple);
    const { container } = render(<Slide deck={deck} slide={deck.slides[0]} />);
    const folds = container.querySelectorAll("[data-fold-line]");
    expect(folds.length).toBe(5);
    for (const f of Array.from(folds)) {
      // jsdom discards gradient values from `style`, so the CSS the renderer
      // will actually print is mirrored onto data-css and asserted there.
      expect(f.getAttribute("data-css") ?? "").toMatch(/linear-gradient/);
    }
    expect(container.querySelector("[data-vignette]")?.getAttribute("data-css") ?? "").toMatch(/radial-gradient/);
  });

  it("crumple rotates its slab, and mirrors the rotation in RTL", () => {
    const ltr = DeckIRSchema.parse(enCrumple);
    const rtl = DeckIRSchema.parse(arCrumple);
    const a = render(<Slide deck={ltr} slide={ltr.slides[0]} />);
    expect(a.container.querySelector("[data-slab]")?.getAttribute("style") ?? "").toMatch(/rotate\(-2deg\)/);
    cleanup();
    const b = render(<Slide deck={rtl} slide={rtl.slides[0]} />);
    expect(b.container.querySelector("[data-slab]")?.getAttribute("style") ?? "").toMatch(/rotate\(2deg\)/);
  });

  it("gridpaper draws the graph rule and a halftone corner, all as gradients", () => {
    const deck = DeckIRSchema.parse(enGridpaper);
    const { container } = render(<Slide deck={deck} slide={deck.slides[0]} />);
    expect(container.querySelector("[data-grid]")?.getAttribute("data-css") ?? "").toMatch(/repeating-linear-gradient/);
    expect(container.querySelector("[data-halftone]")?.getAttribute("data-css") ?? "").toMatch(/radial-gradient/);
  });

  it("gridpaper reports the slide's real ground to the exporter", () => {
    const deck = DeckIRSchema.parse(enGridpaper);
    const grounds = new Map<string, string>();
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      grounds.set(slide.archetype, container.querySelector("[data-slide-root]")?.getAttribute("data-bg") ?? "");
      cleanup();
    }
    // The dark archetypes must NOT claim the cream paper as their background.
    expect(grounds.get("frame")).toBe("#141210");
    expect(grounds.get("quote")).toBe("#141210");
    expect(grounds.get("cover_hero")).toBe("#F6EFE2");
  });
});
