import { describe, it, expect } from "vitest";
import { perUnit } from "@/lib/adminEconomics";
import { targetGapLine } from "@/lib/adminTargets";
describe("item9", () => {
  it("suppresses thin denominators", () => {
    const r = perUnit(2.6125, 2, "published post");
    console.log("PUBLISHED:", r.display, "÷", r.denominator, r.unit, "|", r.note);
    expect(r.suppressed).toBe(true);
    const a = perUnit(2.6125, 11, "active person", "active people");
    console.log("ACTIVE:", a.display, "÷", a.denominator, a.unit, "|", a.note);
    expect(a.suppressed).toBe(false);
    expect(perUnit(1, 10, "x").suppressed).toBe(false);
    expect(perUnit(1, 9, "x").suppressed).toBe(true);
  });
  it("renders no target set", () => {
    const l = targetGapLine(null, 2);
    console.log("FUNNEL ROW:", JSON.stringify(l));
    expect(l.text).toBe("no target set");
    console.log("WITH TARGET:", targetGapLine({ id:"1", metric_key:"published", target_value:5, target_by:"2026-08-15", baseline_value:2, baseline_on:"2026-07-26", rationale:"x", status:"active", reviewed_on:null, review_note:null, set_on:"2026-07-26", created_at:"" } as any, 2).text);
  });
});
