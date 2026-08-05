import { describe, expect, it } from "vitest";
import { DeckIRSchema } from "../deckIR";
import { checkInvariants } from "../invariants";
import { compose } from "../compose";
import { getTemplate } from "../render/template";
import { THEMES, templateThemes } from "../render/themes";

import enChart from "../__fixtures__/en-7-chart.json";
import arInlineEn from "../__fixtures__/ar-7-inline-en.json";
import enNoStat from "../__fixtures__/en-5-no-stat.json";
import enHighlighter from "../__fixtures__/en-7-highlighter.json";
import arHighlighter from "../__fixtures__/ar-7-highlighter.json";
import enCrumple from "../__fixtures__/en-9-crumple.json";
import arCrumple from "../__fixtures__/ar-9-crumple.json";
import enGridpaper from "../__fixtures__/en-9-gridpaper.json";
import arGridpaper from "../__fixtures__/ar-9-gridpaper.json";
import enSalford from "../__fixtures__/en-9-salford.json";
import arSalford from "../__fixtures__/ar-9-salford.json";
import enBlueprint from "../__fixtures__/en-9-blueprint.json";
import arBlueprint from "../__fixtures__/ar-9-blueprint.json";
import enConcept from "../__fixtures__/en-9-concept.json";
import arConcept from "../__fixtures__/ar-9-concept.json";

const fixtures: Array<[string, unknown]> = [
  ["en-7-chart", enChart],
  ["ar-7-inline-en", arInlineEn],
  ["en-5-no-stat", enNoStat],
  ["en-7-highlighter", enHighlighter],
  ["ar-7-highlighter", arHighlighter],
  ["en-9-crumple", enCrumple],
  ["ar-9-crumple", arCrumple],
  ["en-9-gridpaper", enGridpaper],
  ["ar-9-gridpaper", arGridpaper],
  ["en-9-salford", enSalford],
  ["ar-9-salford", arSalford],
  ["en-9-blueprint", enBlueprint],
  ["ar-9-blueprint", arBlueprint],
  ["en-9-concept", enConcept],
  ["ar-9-concept", arConcept],
];

/** The two highlighter fixtures must resolve to the highlighter family. */
const highlighterFixtures: Array<[string, unknown]> = [
  ["en-7-highlighter", enHighlighter],
  ["ar-7-highlighter", arHighlighter],
];

/**
 * Every family that has its own renderer and its own single registered
 * colourway. Adding a family here is what makes the archetype-coverage test
 * below apply to it — that is the point of one list rather than six.
 */
const familyFixtures: Array<[string, unknown, string]> = [
  ["en-9-crumple", enCrumple, "crumple"],
  ["ar-9-crumple", arCrumple, "crumple"],
  ["en-9-gridpaper", enGridpaper, "gridpaper"],
  ["ar-9-gridpaper", arGridpaper, "gridpaper"],
  ["en-9-salford", enSalford, "salford"],
  ["ar-9-salford", arSalford, "salford"],
  ["en-9-blueprint", enBlueprint, "blueprint"],
  ["ar-9-blueprint", arBlueprint, "blueprint"],
  ["en-9-concept", enConcept, "concept"],
  ["ar-9-concept", arConcept, "concept"],
];

describe("DeckIR fixtures", () => {
  it.each(fixtures)("%s parses against the schema", (_name, raw) => {
    const parsed = DeckIRSchema.safeParse(raw);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it.each(fixtures)("%s passes every invariant", (_name, raw) => {
    const ir = DeckIRSchema.parse(raw);
    expect(checkInvariants(ir)).toEqual([]);
  });

  it.each(highlighterFixtures)("%s resolves to a registered highlighter template and theme", (_name, raw) => {
    const ir = DeckIRSchema.parse(raw);
    expect(ir.template).toBe("highlighter");
    expect(getTemplate(ir.template).id).toBe("highlighter");
    expect(templateThemes.highlighter).toContain(ir.theme);
    expect(ir.theme in THEMES).toBe(true);
  });

  it("leaves the three original fixtures on the instrument default", () => {
    for (const raw of [enChart, arInlineEn, enNoStat]) {
      const ir = DeckIRSchema.parse(raw);
      expect(ir.template).toBe("instrument");
      expect(getTemplate(ir.template).id).toBe("instrument");
    }
  });

  it.each(familyFixtures)("%s resolves to its own registered family and colourway", (_name, raw, family) => {
    const ir = DeckIRSchema.parse(raw);
    expect(ir.template).toBe(family);
    expect(getTemplate(ir.template).id).toBe(family);
    expect(templateThemes[family]).toContain(ir.theme);
    expect(ir.theme in THEMES).toBe(true);
  });

  it("covers all nine archetypes in every family fixture", () => {
    const nine = [
      "cover_hero", "cover_stat", "frame", "evidence",
      "benchmark", "quote", "steps", "definition", "close",
    ];
    for (const [name, raw] of familyFixtures) {
      const ir = DeckIRSchema.parse(raw);
      const seen = new Set(ir.slides.map((s) => s.archetype));
      for (const a of nine) expect(seen.has(a as never), `${name} is missing ${a}`).toBe(true);
    }
  });
});

describe("invariants catch violations", () => {
  const base = () => DeckIRSchema.parse(enNoStat);

  it("flags a second emphasis on one slide", () => {
    const ir = base();
    // The cover already has one highlighted line; a second one competes.
    ir.slides[0].slots.hero_lines![0].highlight = true;
    expect(checkInvariants(ir).some((e) => e.startsWith("INV-04"))).toBe(true);
  });

  it("flags a stat with no source", () => {
    const ir = base();
    ir.slides[2].slots.hero_lines = undefined;
    ir.slides[2].slots.stat_value = "42%";
    expect(checkInvariants(ir).some((e) => e.startsWith("INV-05"))).toBe(true);
  });

  it("flags an over-budget English hero line", () => {
    const ir = base();
    ir.slides[0].slots.hero_lines![0].runs[0].t = "A line that is far too long";
    expect(checkInvariants(ir).some((e) => e.startsWith("INV-13"))).toBe(true);
  });

  it("flags banned vocabulary", () => {
    const ir = base();
    ir.slides[1].slots.body![0].runs[0].t = "We elevate the personal brand.";
    const errs = checkInvariants(ir);
    expect(errs.some((e) => e.startsWith("INV-12"))).toBe(true);
  });
});

describe("compose", () => {
  it("picks the longest fillable length", () => {
    const long = compose({ hasNumber: true, hasComparison: true, stepCount: 3, lang: "en" });
    expect(long.length).toBe(10);
    expect(long.slots).toHaveLength(10);
  });

  it("falls back rather than padding", () => {
    const short = compose({ hasNumber: false, hasComparison: false, stepCount: 0, lang: "en" });
    expect(short.length).toBe(5);
    expect(short.slots[0].archetype).toBe("cover_hero");
    expect(short.slots[short.slots.length - 1].archetype).toBe("close");
  });

  it("never emits evidence when there is no number", () => {
    const r = compose({ hasNumber: false, hasComparison: true, stepCount: 2, lang: "en" });
    expect(r.slots.some((s) => s.archetype === "evidence")).toBe(false);
  });
});