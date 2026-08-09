import { describe, expect, it } from "vitest";
import { needsCorpusReread, planVerdict, type FeedbackRow, type FeedbackTrait } from "@/lib/voiceFeedback";
import { voiceFidelity } from "@/lib/voiceFidelity";

const trait = (over: Partial<FeedbackTrait>): FeedbackTrait => ({
  id: "t1", trait_key: "formality", display_name: "Formality", value: 44,
  band_low: 30, band_high: 60, locked: false, source: "learned", computable: false, ...over,
});

describe("feedback never overrides an explicit setting", () => {
  it("moves nothing when the trait is locked", () => {
    const plan = planVerdict("too_formal", [trait({ locked: true })], "Executive", ["Executive", "Arabic"], false);
    expect(plan.changes).toEqual([]);
    expect(plan.lines[0]).toContain("locked");
  });

  it("moves nothing when the trait was set by the member", () => {
    const plan = planVerdict("too_formal", [trait({ source: "user" })], "Executive", ["Executive"], false);
    expect(plan.changes).toEqual([]);
    expect(plan.lines[0]).toContain("set by you");
  });

  it("creates an unmeasured trait as the member's own, never as learned", () => {
    const plan = planVerdict("too_formal", [trait({ value: null, band_low: null, band_high: null })], "Executive", ["Executive"], false);
    expect(plan.creates).toBe(true);
    expect(plan.changes[0].from).toBeNull();
    expect(plan.lines[0]).toContain("not as something it learned");
  });

  it("scopes a real move to the active mode and names what did not move", () => {
    const plan = planVerdict("too_formal", [trait({})], "Executive", ["Executive", "Thought leadership", "Arabic"], false);
    expect(plan.changes).toEqual([{ trait_key: "formality", from: 44, to: 38, scope: "Executive" }]);
    expect(plan.lines[0]).toBe("Formality lowered 44% → 38% in Executive.");
    expect(plan.lines[1]).toContain("Thought leadership and Arabic are unchanged.");
  });
});

describe("a single soft verdict moves nothing", () => {
  it.each(["partly", "not_me"] as const)("%s makes no change", (v) => {
    const plan = planVerdict(v, [trait({})], "Executive", ["Executive"], false);
    expect(plan.changes).toEqual([]);
  });

  it("sounds_like_me changes nothing and says so", () => {
    const plan = planVerdict("sounds_like_me", [trait({})], "Executive", ["Executive"], false);
    expect(plan.changes).toEqual([]);
    expect(plan.lines[0]).toContain("Nothing changed");
  });
});

describe("three negatives in fourteen days", () => {
  const row = (verdict: FeedbackRow["verdict"], daysAgo: number): FeedbackRow => ({
    id: `${verdict}-${daysAgo}`, verdict, mode_scope: "executive", applied_changes: [],
    created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  });

  it("two is not a pattern", () => {
    expect(needsCorpusReread([row("partly", 1), row("not_me", 3)])).toBe(false);
  });
  it("three inside the window is", () => {
    expect(needsCorpusReread([row("partly", 1), row("not_me", 3), row("partly", 12)])).toBe(true);
  });
  it("three outside the window is not", () => {
    expect(needsCorpusReread([row("partly", 1), row("not_me", 3), row("partly", 20)])).toBe(false);
  });
});

describe("fidelity is arithmetic, and excludes what it cannot measure", () => {
  it("counts only measurable traits with a band", () => {
    const r = voiceFidelity("Short post. 12% of sites disagreed.", [
      { trait_key: "length", display_name: "Length", computable: true, value: 20, band_low: 5, band_high: 45 },
      { trait_key: "formality", display_name: "Formality", computable: false, value: 44, band_low: null, band_high: null },
      { trait_key: "pace", display_name: "Pace", computable: true, value: null, band_low: null, band_high: null },
    ]);
    expect(r.total).toBe(1);
    expect(r.traits[0].inside).toBe(false);
    expect(r.traits[0].miss).toContain("your range is");
    expect(r.excluded.map((e) => e.trait_key).sort()).toEqual(["formality", "pace"]);
  });
});
