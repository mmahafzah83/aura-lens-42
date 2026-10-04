import { describe, it, expect } from "vitest";
import { makeUsable } from "../usable";
import { hasBanned } from "../../_shared/bannedWords.ts";

const opts = (lang: "ar" | "en" = "en") => ({ lang, bannedWords: ["authority"], hasBanned });
const F = (o: Record<string, unknown> = {}) => ({
  what: "Your CV hides the port turnaround.",
  why_it_matters: "A search partner will ask who owned it.",
  do_this: "Name the result.",
  weight: "medium",
  what_you_lose: "The search partner moves you to the second list.",
  evidence: { cv_line: "Ops director, 2018-2024", profile_line: "Absent" },
  do_first: false,
  ...o,
});
const recs = (n: number) => Array.from({ length: n }, (_, i) => ({ action: `Act ${i}`, why_now: "Now." }));
const base = (o: Record<string, unknown> = {}) => ({ headline_finding: "Lead.", the_hard_truth: "Truth.", recommendations: recs(3), ...o });

describe("makeUsable", () => {
  it("keeps a finding with one blank evidence side, no note", () => {
    const out = makeUsable(base({ findings: [F(), F({ evidence: { cv_line: "x", profile_line: "" } })] }), opts());
    expect(out.result.findings).toHaveLength(2);
    expect(out.notes).not.toContain("evidence_both_absent");
  });
  it("keeps a finding with both evidence sides Absent, with a note", () => {
    const out = makeUsable(base({ findings: [F({ evidence: { cv_line: "Absent", profile_line: "Absent" } })] }), opts());
    expect(out.result.findings).toHaveLength(1);
    expect(out.notes).toContain("evidence_both_absent");
  });
  it("rewrite \"Absent\" on a high finding becomes null and medium", () => {
    const out = makeUsable(base({ findings: [F({ weight: "high", rewrite: "Absent" })] }), opts("en"));
    expect(out.result.findings[0].rewrite).toBeNull();
    expect(out.result.findings[0].weight).toBe("medium");
    expect(out.notes).toContain("downgraded:rewrite_missing");
  });
  it("drops an empty defensibility item and blank headline_suggestion", () => {
    const out = makeUsable(base({ findings: [F()], defensibility: ["قابل للدفاع الآن", ""], headline_suggestion: "N/A" }), opts());
    expect(out.result.defensibility).toEqual(["قابل للدفاع الآن"]);
    expect(out.notes).toContain("dropped_blank:defensibility");
    expect(out.result.headline_suggestion).toBeNull();
  });
  it("high-weight finding without rewrite becomes medium and stays", () => {
    const out = makeUsable(base({ findings: [F({ weight: "high" })] }), opts());
    expect(out.result.findings[0].weight).toBe("medium");
    expect(out.notes).toContain("downgraded:rewrite_missing");
    expect(out.failure).toBeNull();
  });
  it("brand banned word in why_it_matters is a note only; the finding stays", () => {
    const out = makeUsable(base({ findings: [F(), F({ why_it_matters: "It builds authority." })] }), opts());
    expect(out.result.findings).toHaveLength(2);
    expect(out.notes).toContain("noted:banned:authority@why_it_matters");
  });
  it("all findings dropped gives no_usable_findings", () => {
    const out = makeUsable(base({ findings: [F({ what: "" }), F({ what_you_lose: "" })] }), opts());
    expect(out.failure).toBe("no_usable_findings");
  });
  it("two recommendations are accepted", () => {
    const out = makeUsable(base({ findings: [F()], recommendations: recs(2) }), opts());
    expect(out.failure).toBeNull();
    expect(out.result.recommendations).toHaveLength(2);
    expect(out.notes).toContain("recommendations_short:2");
  });
  it("empty hard truth becomes null", () => {
    const out = makeUsable(base({ findings: [F()], the_hard_truth: "  " }), opts());
    expect(out.result.the_hard_truth).toBeNull();
    expect(out.notes).toContain("nulled:the_hard_truth");
  });
  it("do_first is re-assigned after its finding is dropped", () => {
    const out = makeUsable(base({ findings: [F({ do_first: true, what_you_lose: "" }), F({ what: "Second." })] }), opts());
    expect(out.result.findings).toHaveLength(1);
    expect(out.result.findings[0].do_first).toBe(true);
  });
  it("Arabic object with one English-quoted what passes the whole-object check", () => {
    const ar = "سيرتك الذاتية تخفي أهم نتيجة حققتها في إدارة العمليات خلال السنوات الأخيرة.";
    const arF = (o: Record<string, unknown> = {}) => F({ what: ar, why_it_matters: ar, do_this: ar, what_you_lose: ar, ...o });
    const out = makeUsable({
      headline_finding: ar, the_hard_truth: ar,
      recommendations: [{ action: ar, why_now: ar }],
      findings: [arF({ what: "Your CV says 'Operations Director, Gulf Logistics Group, 2018-2024' only." }), arF(), arF()],
    }, opts("ar"));
    expect(out.failure).toBeNull();
    expect(out.kept).toBe(3);
  });
  it("an all-English Arabic-path object fails not_arabic", () => {
    const out = makeUsable(base({ findings: [F()] }), opts("ar"));
    expect(out.failure).toBe("not_arabic");
  });
});
