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

const fixtures: Array<[string, unknown]> = [
  ["en-7-chart", enChart],
  ["ar-7-inline-en", arInlineEn],
  ["en-5-no-stat", enNoStat],
  ["en-7-highlighter", enHighlighter],
  ["ar-7-highlighter", arHighlighter],
];

/** The two highlighter fixtures must resolve to the highlighter family. */
const highlighterFixtures: Array<[string, unknown]> = [
  ["en-7-highlighter", enHighlighter],
  ["ar-7-highlighter", arHighlighter],
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