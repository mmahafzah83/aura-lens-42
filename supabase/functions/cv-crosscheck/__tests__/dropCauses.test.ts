import { describe, it, expect } from "vitest";
import { makeUsable } from "../usable";
import { hasBanned } from "../../_shared/bannedWords.ts";

// Verbatim from the last live call (4 Oct).
const GAP_RW = "Supply chain executive with 17 years in logistics. [Add one sentence here naming why you are exploring: for example, the scale or kind of network you want to run next.]";
const SRC = "Supply chain executive with 17 years in logistics.";
const opts = { lang: "en" as const, bannedWords: ["authority", "leverage"], hasBanned, source: SRC };
const F = (o: Record<string, unknown> = {}) => ({
  what: "Scope is missing.", why_it_matters: "A search partner will ask.", do_this: "Add one figure.",
  weight: "high", what_you_lose: "You move to the second list.", evidence: { cv_line: "x", profile_line: "y" }, do_first: false, ...o,
});
const base = (o: Record<string, unknown>) => ({
  headline_finding: "Lead.", the_hard_truth: "Truth.",
  recommendations: [1, 2, 3].map((i) => ({ action: `Act ${i}`, why_now: "Now." })), ...o,
});

describe("named drop causes", () => {
  it("finding dropped names word and field", () => {
    const out = makeUsable(base({ findings: [F(), F({ do_this: "Showcase the result." })] }), opts);
    expect(out.notes).toContain("dropped_finding:platitude:showcase@do_this");
    expect(out.kept).toBe(1);
  });
  it("recommendation, defensibility item and single field name the cause", () => {
    const out = makeUsable(base({
      findings: [F()],
      recommendations: [{ action: "Build authority now.", why_now: "x" }, ...[1, 2, 3].map((i) => ({ action: `Act ${i}`, why_now: "Now." }))],
      defensibility: ["You can leverage the record."], peer_comparison: "Peers have more authority.",
    }), opts);
    expect(out.notes).toContain("dropped_recommendation:banned:authority@action");
    expect(out.notes).toContain("dropped_item:banned:leverage@defensibility");
    expect(out.notes).toContain("nulled:banned:authority@peer_comparison");
  });
  it("banned word only in the rewrite nulls the rewrite, keeps the finding as medium", () => {
    const out = makeUsable(base({ findings: [F({ rewrite: "Supply chain executive with real authority." })] }), opts);
    expect(out.kept).toBe(1);
    expect(out.result.findings[0].rewrite).toBeNull();
    expect(out.result.findings[0].weight).toBe("medium");
    expect(out.notes).toContain("rewrite_removed:banned:authority");
  });
});

describe("bracket gaps", () => {
  it("real bracketed rewrite becomes null; finding kept and downgraded", () => {
    const out = makeUsable(base({ findings: [F({ rewrite: GAP_RW })] }), opts);
    expect(out.failure).toBeNull();
    expect(out.result.findings[0].rewrite).toBeNull();
    expect(out.result.findings[0].weight).toBe("medium");
    expect(out.notes).toContain("rewrite_removed:bracket_gap");
    expect(out.rewritesRemoved).toBe(1);
  });
  it("bracketed headline suggestion is removed", () => {
    const out = makeUsable(base({ findings: [F()], headline_suggestion: "Director [add sector]" }), opts);
    expect(out.result.headline_suggestion).toBeNull();
    expect(out.notes).toContain("headline_removed:bracket_gap");
  });
  it("short brackets like [x] are not a gap", () => {
    const out = makeUsable(base({ findings: [F({ rewrite: "Supply chain executive [1] with 17 years in logistics." })] }), opts);
    expect(out.notes).not.toContain("rewrite_removed:bracket_gap");
  });
});
