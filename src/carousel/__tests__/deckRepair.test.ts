/**
 * Deterministic repair gates for the two codes that dominated deck failures:
 * INV-07 (a mixed-script run in an Arabic deck) and INV-04 (a slide the model
 * emitted with no emphasis at all).
 */
import { describe, expect, it } from "vitest";
import { repairDeck, splitMixedScriptRun } from "../../../supabase/functions/generate-deck/repair.ts";
import { checkInvariants } from "../../../supabase/functions/generate-deck/invariants.ts";

import arInlineEn from "../__fixtures__/ar-7-inline-en.json";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("INV-07 run splitter", () => {
  it("splits a Latin brand out of an Arabic run, preserving the text exactly", () => {
    const parts = splitMixedScriptRun({ t: "ضوابط FedRAMP High", lang: "ar" });
    expect(parts).not.toBeNull();
    expect(parts!.map((p) => p.t).join("")).toBe("ضوابط FedRAMP High");
    expect(parts!.map((p) => p.lang)).toEqual(["ar", "en"]);
  });

  it("leaves a single-script run untouched", () => {
    expect(splitMixedScriptRun({ t: "McKinsey & Company 2025", lang: "en" })).toBeNull();
    expect(splitMixedScriptRun({ t: "خطط رأس المال 2026", lang: "ar" })).toBeNull();
  });

  it("repairs an Arabic deck carrying Latin brands so it validates", () => {
    const deck: any = clone(arInlineEn);
    deck.slides[1].slots.body[1].runs = [{ t: "ضوابط FedRAMP High على الشبكة.", lang: "ar" }];
    deck.slides[2].slots.source.runs = [{ t: "McKinsey & Company 2025", lang: "ar" }];

    const before = checkInvariants(deck);
    expect(before.filter((e) => e.startsWith("INV-07")).length).toBeGreaterThan(0);

    const { deck: fixed, repaired } = repairDeck(deck);
    expect(repaired.some((r) => r.startsWith("INV-07"))).toBe(true);
    expect(checkInvariants(fixed).filter((e) => e.startsWith("INV-07"))).toEqual([]);
  });
});

describe("INV-04 emphasis floor", () => {
  const emphasisCount = (s: any) =>
    (s.stat_value ? 1 : 0)
    + (s.hero_lines ?? []).filter((l: any) => l.highlight).length
    + (s.media?.chart?.series ?? []).filter((x: any) => x.emphasis === "alert").length;

  it("promotes a chart peak on a benchmark whose only emphasis is an accent", () => {
    const deck: any = clone(arInlineEn);
    const bench = deck.slides.find((s: any) => s.archetype === "benchmark");
    delete bench.slots.hero_lines;
    for (const item of bench.slots.media.chart.series) item.emphasis = "none";
    bench.slots.media.chart.series[1].emphasis = "accent";

    expect(checkInvariants(deck).some((e) => e.startsWith("INV-04"))).toBe(true);
    const { deck: fixed, repaired } = repairDeck(deck);
    expect(repaired.some((r) => r.includes("added the missing emphasis"))).toBe(true);
    const fixedBench = fixed.slides.find((s: any) => s.archetype === "benchmark") as any;
    expect(emphasisCount(fixedBench.slots)).toBe(1);
    expect(checkInvariants(fixed).filter((e) => e.startsWith("INV-04"))).toEqual([]);
  });

  it("highlights the first hero line on a slide the model left with no emphasis", () => {
    const deck: any = clone(arInlineEn);
    const slide = deck.slides[0];
    for (const line of slide.slots.hero_lines) delete line.highlight;

    expect(checkInvariants(deck).some((e) => e.startsWith("INV-04"))).toBe(true);
    const { deck: fixed } = repairDeck(deck);
    expect((fixed.slides[0].slots as any).hero_lines[0].highlight).toBe(true);
    expect(emphasisCount(fixed.slides[0].slots)).toBe(1);
    expect(checkInvariants(fixed).filter((e) => e.startsWith("INV-04"))).toEqual([]);
  });
});
