import { describe, it, expect } from "vitest";
import { makeUsable, phraseIn } from "../usable";
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
  it("brand banned words in a recommendation, defensibility item and single field are notes only", () => {
    const out = makeUsable(base({
      findings: [F()],
      recommendations: [{ action: "Build authority now.", why_now: "x" }, ...[1, 2, 3].map((i) => ({ action: `Act ${i}`, why_now: "Now." }))],
      defensibility: ["You can leverage the record."], peer_comparison: "Peers have more authority.",
    }), opts);
    expect(out.result.recommendations).toHaveLength(4);
    expect(out.result.defensibility).toHaveLength(1);
    expect(out.result.peer_comparison).toBe("Peers have more authority.");
    expect(out.notes).toContain("noted:banned:authority@action");
    expect(out.notes).toContain("noted:banned:leverage@defensibility");
    expect(out.notes).toContain("noted:banned:authority@peer_comparison");
  });
  it("brand banned word in the rewrite keeps the rewrite, with a note", () => {
    const out = makeUsable(base({ findings: [F({ rewrite: "Supply chain executive with real authority." })] }), opts);
    expect(out.result.findings[0].rewrite).toBe("Supply chain executive with real authority.");
    expect(out.notes).toContain("noted:banned:authority@rewrite");
  });
  it("do_this with 'commercial authority or transformation mandate' keeps the finding, with the note", () => {
    const out = makeUsable(base({ findings: [F({ do_this: "Name the commercial authority or transformation mandate you want." })] }), opts);
    expect(out.kept).toBe(1);
    expect(out.notes).toContain("noted:banned:authority@do_this");
    expect(out.notes.some((n) => n.startsWith("dropped_finding"))).toBe(false);
  });
});

describe("stock phrases match whole words only", () => {
  it("'the float of receivables' and 'floats' do not trigger ats", () => {
    for (const t of ["Watch the float of receivables.", "Cash floats were cut."]) {
      const out = makeUsable(base({ findings: [F({ why_it_matters: t })] }), opts);
      expect(out.kept).toBe(1);
    }
    expect(phraseIn("floats", "ats")).toBe(false);
  });
  it("'ATS-friendly' and 'an ATS' do trigger ats", () => {
    expect(phraseIn("Make it ATS-friendly.", "ats")).toBe(true);
    const out = makeUsable(base({ findings: [F(), F({ why_it_matters: "It must pass an ATS." })] }), opts);
    expect(out.notes).toContain("dropped_finding:platitude:ats@why_it_matters");
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
