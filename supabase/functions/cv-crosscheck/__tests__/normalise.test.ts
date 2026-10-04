import { describe, it, expect } from "vitest";
import { normaliseCrosscheck } from "../normalise";

const f = (weight: string, do_first?: unknown) => ({ what: "x", weight, do_first });

describe("normaliseCrosscheck", () => {
  it("none first: picks the first high finding", () => {
    const { result, changes } = normaliseCrosscheck({ findings: [f("medium", false), f("high", false), f("high", false)] });
    expect(result.findings.map((x: any) => x.do_first)).toEqual([false, true, false]);
    expect(changes).toContain("do_first_none_set");
  });
  it("several first: keeps exactly one, the first high", () => {
    const { result } = normaliseCrosscheck({ findings: [f("low", true), f("high", true), f("high", true)] });
    expect(result.findings.map((x: any) => x.do_first)).toEqual([false, true, false]);
  });
  it("one first: left alone", () => {
    const { result, changes } = normaliseCrosscheck({ findings: [f("high", false), f("low", true)] });
    expect(result.findings.map((x: any) => x.do_first)).toEqual([false, true]);
    expect(changes).toEqual([]);
  });
  it("no high weight: picks the first finding", () => {
    const { result } = normaliseCrosscheck({ findings: [f("low"), f("medium")] });
    expect(result.findings.map((x: any) => x.do_first)).toEqual([true, false]);
  });
  it("string booleans are coerced", () => {
    const { result } = normaliseCrosscheck({ findings: [f("high", "false"), f("low", "true")] });
    expect(result.findings.map((x: any) => x.do_first)).toEqual([false, true]);
  });
  it("six recommendations become five; two stay two", () => {
    const recs = Array.from({ length: 6 }, (_, i) => ({ action: `a${i}`, why_now: "w" }));
    expect(normaliseCrosscheck({ findings: [], recommendations: recs }).result.recommendations.map((r: any) => r.action))
      .toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect(normaliseCrosscheck({ findings: [], recommendations: recs.slice(0, 2) }).result.recommendations).toHaveLength(2);
  });
});
