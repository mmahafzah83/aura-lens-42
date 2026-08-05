/**
 * The three field/gradient families — salford, blueprint, concept — must draw
 * from a DeckIR alone, in both directions, and their grounds must survive
 * html-to-image.
 *
 * EXPORT SAFETY is the second half of this file. Every pattern this phase
 * introduced — the salford dot matrix, the blueprint hairline grid and its
 * leader lines, the concept gradients and wireframes — is asserted to be a
 * plain CSS gradient or an SVG stroke. `filter:`, `mix-blend-mode` and SVG
 * filters either drop out or render differently in the export iframe, so
 * their ABSENCE is the test. The blueprint ghost numeral is the specific
 * temptation here: it is dimmed with `opacity`, never a blend mode.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DeckIRSchema } from "../deckIR";
import Slide from "../render/Slide";
import { checkTypeFloor } from "../invariants";
import { getTemplate } from "../render/template";
import enSalford from "../__fixtures__/en-9-salford.json";
import arSalford from "../__fixtures__/ar-9-salford.json";
import enBlueprint from "../__fixtures__/en-9-blueprint.json";
import arBlueprint from "../__fixtures__/ar-9-blueprint.json";
import enConcept from "../__fixtures__/en-9-concept.json";
import arConcept from "../__fixtures__/ar-9-concept.json";

const decks: Array<[string, unknown]> = [
  ["en-salford", enSalford],
  ["ar-salford", arSalford],
  ["en-blueprint", enBlueprint],
  ["ar-blueprint", arBlueprint],
  ["en-concept", enConcept],
  ["ar-concept", arConcept],
];

/** Every inline style string on and under the slide root. */
function styles(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>("*"))
    .map((el) => el.getAttribute("style") ?? "")
    .join(" | ");
}

describe("field templates render", () => {
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

  it.each(decks)("%s honours the reading direction on every slide", (_name, raw) => {
    const deck = DeckIRSchema.parse(raw);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      expect(container.querySelector("[data-slide-root]")?.getAttribute("dir")).toBe(deck.dir);
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

describe("export safety — field patterns rasterize", () => {
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

  it("salford draws its dot matrix as a gradient, on the cover only", () => {
    const deck = DeckIRSchema.parse(enSalford);
    const cover = render(<Slide deck={deck} slide={deck.slides[0]} />);
    // jsdom discards gradient values from `style`, so the CSS the renderer
    // will actually print is mirrored onto data-css and asserted there.
    expect(cover.container.querySelector("[data-dotmatrix]")?.getAttribute("data-css") ?? "")
      .toMatch(/radial-gradient/);
    cleanup();
    const interior = render(<Slide deck={deck} slide={deck.slides[1]} />);
    expect(interior.container.querySelector("[data-dotmatrix]")).toBeNull();
  });

  it("salford alternates its ground and tells the exporter which one", () => {
    const deck = DeckIRSchema.parse(enSalford);
    const grounds = new Map<number, string>();
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      grounds.set(slide.index, container.querySelector("[data-slide-root]")?.getAttribute("data-bg") ?? "");
      cleanup();
    }
    // Cover and close hold the navy whatever their index.
    expect(grounds.get(0)).toBe("#152436");
    expect(grounds.get(8)).toBe("#152436");
    // Odd interiors flip to the mint. Even ones do not.
    expect(grounds.get(1)).toBe("#5CE8A4");
    expect(grounds.get(2)).toBe("#152436");
    expect(grounds.get(3)).toBe("#5CE8A4");
  });

  it("blueprint draws the hairline grid and leader lines as gradients", () => {
    const deck = DeckIRSchema.parse(enBlueprint);
    const { container } = render(<Slide deck={deck} slide={deck.slides[0]} />);
    expect(container.querySelector("[data-grid]")?.getAttribute("data-css") ?? "")
      .toMatch(/repeating-linear-gradient/);
    expect(container.querySelector("[data-leader]")?.getAttribute("data-css") ?? "")
      .toMatch(/repeating-linear-gradient/);
  });

  it("blueprint dims the ghost numeral with opacity, never a blend mode", () => {
    const deck = DeckIRSchema.parse(enBlueprint);
    // Not on the cover — the ghost is an interior device.
    const cover = render(<Slide deck={deck} slide={deck.slides[0]} />);
    expect(cover.container.querySelector("[data-ghost-numeral]")).toBeNull();
    cleanup();
    const interior = render(<Slide deck={deck} slide={deck.slides[1]} />);
    const ghost = interior.container.querySelector("[data-ghost-numeral]");
    expect(ghost).not.toBeNull();
    expect(ghost?.getAttribute("style") ?? "").toMatch(/opacity/);
    expect(ghost?.getAttribute("style") ?? "").not.toMatch(/blend/i);
  });

  it("blueprint never inverts: every slide reports the same ground", () => {
    const deck = DeckIRSchema.parse(enBlueprint);
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      expect(container.querySelector("[data-slide-root]")?.getAttribute("data-bg")).toBe("#161616");
      cleanup();
    }
  });

  it("concept paints both grounds as gradients and reports an opaque stand-in", () => {
    const deck = DeckIRSchema.parse(enConcept);
    const grounds = new Map<string, string>();
    for (const slide of deck.slides) {
      const { container } = render(<Slide deck={deck} slide={slide} />);
      expect(container.querySelector("[data-ground]")?.getAttribute("data-css") ?? "")
        .toMatch(/linear-gradient/);
      grounds.set(slide.archetype, container.querySelector("[data-slide-root]")?.getAttribute("data-bg") ?? "");
      cleanup();
    }
    // JPEG has no alpha: the exporter is handed a hex, never a gradient.
    for (const [archetype, bg] of grounds) {
      expect(bg, `${archetype} reports a non-opaque ground`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // The reading-heavy archetypes flip to the light ground.
    expect(grounds.get("benchmark")).toBe("#FFFFFF");
    expect(grounds.get("steps")).toBe("#FFFFFF");
    expect(grounds.get("definition")).toBe("#FFFFFF");
    expect(grounds.get("cover_hero")).toBe("#4B3AA8");
  });
});