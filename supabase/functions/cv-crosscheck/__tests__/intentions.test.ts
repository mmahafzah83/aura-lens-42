import { describe, it, expect } from "vitest";
import { makeUsable } from "../usable";
import { stripIntentions, splitSentences } from "../intentions";
import { sourceNumbers, unsupportedNumbers } from "../figures";
import { hasBanned } from "../../_shared/bannedWords.ts";

const CV = `Supply chain executive with 17 years in logistics. Director of Supply Chain — Najd Cold Chain, Riyadh March 2021 – Present
- Lead supply chain for a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks, with a team of 410 people.
- Reduced annual cold-chain spoilage cost by SAR 14 million by enforcing dock temperature rules and redesigning loading sequences.
- Cut temperature excursions from 4.1% of shipments to 1.3% within one year.`;
const PROFILE = "Lead planning, procurement, warehousing and last-mile for a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks.";
const SOURCE = `${CV}\n${PROFILE}`;

const S1 = "Najd is family-owned and growth has stalled; I am looking for a business with regional expansion plans or a mandate to build new capability.";
const S2 = "After four years building Najd's cold-chain capability from three to six distribution centres, I am looking for multi-country supply chain accountability where temperature discipline and commercial planning sit together.";
const LEAD = "Director of Supply Chain at Najd Cold Chain in Riyadh. I lead a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks. I cut temperature excursions from 4.1% of shipments to 1.3% within one year.";

const F = (o: Record<string, unknown>) => ({
  what: "Scope is missing.", why_it_matters: "A search partner will ask.", do_this: "Add one figure.",
  weight: "high", what_you_lose: "The search partner moves you to the second list.",
  evidence: { cv_line: "x", profile_line: "y" }, do_first: false, ...o,
});
const run = (p: any, source = SOURCE) => makeUsable(
  { headline_finding: "Lead.", the_hard_truth: "Truth.", recommendations: [1, 2, 3].map((i) => ({ action: `Act ${i}`, why_now: "Now." })), ...p },
  { lang: "en", bannedWords: [], hasBanned, source },
);

describe("intentions guard", () => {
  it("splits on delimiters, not on decimals or semicolons", () => {
    expect(splitSentences(LEAD)).toHaveLength(3);
    expect(splitSentences(S1)).toHaveLength(1);
  });
  it("removes sentence (1) and keeps the three before it", () => {
    const out = run({ findings: [F({ rewrite: `${LEAD} ${S1}` })] });
    expect(out.result.findings[0].rewrite).toBe(LEAD);
    expect(out.notes.filter((n) => n === "rewrite_sentence_removed:intention")).toHaveLength(1);
    expect(out.intentionSentencesRemoved).toBe(1);
  });
  it("removes sentence (2) and keeps the three before it", () => {
    expect(stripIntentions(`${LEAD} ${S2}`, SOURCE)).toEqual({ text: LEAD, removed: [S2] });
  });
  it("in the full guard, sentence (2) is removed by the intentions guard", () => {
    const out = run({ findings: [F({ rewrite: `${LEAD} ${S2}` })] });
    expect(out.result.findings[0].rewrite).toBe(LEAD);
    expect(out.notes).toContain("rewrite_sentence_removed:intention");
  });
  it("a rewrite that is only an intention becomes null and high becomes medium", () => {
    const out = run({ findings: [F({ rewrite: S1 })] });
    expect(out.result.findings[0].rewrite).toBeNull();
    expect(out.result.findings[0].weight).toBe("medium");
    expect(out.notes).toContain("downgraded:rewrite_missing");
  });
  it("keeps an intention the member's own CV states", () => {
    const src = `${SOURCE}\nI am looking for a chief operating officer role in logistics.`;
    const s = "I am looking for a chief operating officer role in logistics, ports or e-commerce fulfilment.";
    expect(stripIntentions(s, src)).toEqual({ text: s, removed: [] });
  });
  it("removes an Arabic «أبحث عن» sentence with nothing in the source", () => {
    const r = stripIntentions("أقود شبكة من 6 مراكز توزيع. أبحث عن دور إقليمي أوسع في شركة متعددة الدول.", SOURCE);
    expect(r.text).toBe("أقود شبكة من 6 مراكز توزيع.");
    expect(r.removed).toHaveLength(1);
  });
  it("headline left empty becomes null", () => {
    const out = run({ findings: [F({ rewrite: LEAD })], headline_suggestion: "Cold-chain director. I am open to roles in the Gulf." });
    expect(out.result.headline_suggestion).toBe("Cold-chain director.");
    const out2 = run({ findings: [F({ rewrite: LEAD })], headline_suggestion: "I am open to roles in the Gulf." });
    expect(out2.result.headline_suggestion).toBeNull();
    expect(out2.notes).toContain("headline_sentence_removed:intention");
  });
  it("number words are not judged by the figures guard (digits only)", () => {
    const src = sourceNumbers(SOURCE);
    expect(unsupportedNumbers("from three to nine distribution centres", src)).toEqual([]);
  });
});
