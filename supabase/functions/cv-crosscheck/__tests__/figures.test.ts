import { describe, it, expect } from "vitest";
import { makeUsable } from "../usable";
import { numbersIn, sourceNumbers, unsupportedNumbers } from "../figures";
import { hasBanned } from "../../_shared/bannedWords.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The real test CV and profile lines from the 4 Oct fact-check.
const CV = `Supply chain executive with 17 years in logistics. Director of Supply Chain — Najd Cold Chain, Riyadh March 2021 – Present
- Lead supply chain for a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks, with a team of 410 people.
- Reduced annual cold-chain spoilage cost by SAR 14 million by enforcing dock temperature rules and redesigning loading sequences.
- Cut temperature excursions from 4.1% of shipments to 1.3% within one year.`;
const PROFILE = "Lead planning, procurement, warehousing and last-mile for a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks.";
const SOURCE = `${CV}\n${PROFILE}`;

const RW1 = "Lead supply chain for a temperature-controlled network of 6 distribution centres and 240 refrigerated trucks serving 1,200 delivery points across three regions, moving 18,000 tonnes per month, with a team of 410 people.";
const RW2 = "Supply chain executive with 17 years in logistics across retail distribution, chilled dairy and temperature-controlled food distribution in Saudi Arabia. I run planning, procurement, warehousing and last-mile delivery for a cold-chain network serving grocery, food service and pharmacy customers. I focus on the parts that break quietly: temperature excursions, empty kilometres, and planning teams that catch problems before customers do.";
const D1 = "The SAR 14 million spoilage saving is defensible now if it reflects total network savings attributable to the two named interventions (dock temperature rules and loading sequence redesign) during his tenure as Director from March 2021 to present. If it is an annualised figure, qualify it: 'Reduced annual cold-chain spoilage cost by SAR 14 million (annualised) by enforcing dock temperature rules and redesigning loading sequences.' If it is cumulative over the period, state: 'Reduced cold-chain spoilage cost by SAR 14 million over three years by enforcing dock temperature rules and redesigning loading sequences.' Defensible with one more detail: specify whether the figure is annual or cumulative.";
const D2 = "The claim of six distribution centres and two hundred forty refrigerated trucks is defensible now if those figures reflect the current network size as of the date the CV was prepared. If the network has grown during his tenure, add the starting scale to show the growth: 'Lead supply chain for a temperature-controlled network that has grown from 4 to 6 distribution centres and from 180 to 240 refrigerated trucks, with a team of 410 people.' Defensible with one more detail: confirm the network scale at the start of his Director tenure in March 2021.";
const D3 = "The reduction in temperature excursions from 4.1% to 1.3% within one year is defensible now. The posts confirm the figure and the CV states the time span clearly. No change needed.";
const HL = "Cold-chain director who cut spoilage SAR 14m and temperature excursions from 4.1% to 1.3% across six distribution centres and 240 trucks in Saudi Arabia";

const F = (o: Record<string, unknown>) => ({
  what: "Scope is missing.", why_it_matters: "A search partner will ask.", do_this: "Add one figure.",
  weight: "high", what_you_lose: "The search partner moves you to the second list.",
  evidence: { cv_line: "x", profile_line: "y" }, do_first: false, ...o,
});
const run = (p: any) => makeUsable(
  { headline_finding: "Lead.", the_hard_truth: "Truth.", recommendations: [1, 2, 3].map((i) => ({ action: `Act ${i}`, why_now: "Now." })), ...p },
  { lang: "en", bannedWords: [], hasBanned, source: SOURCE },
);

describe("figures guard", () => {
  it("normalises tokens", () => {
    expect(numbersIn("1,200 and 14m and 4.1% and ٢٤٠ in 2021.")).toEqual(["1200", "14", "4.1", "240", "2021"]);
  });
  it("removes the finding-1 rewrite, keeps the finding as medium; keeps the finding-2 rewrite", () => {
    const out = run({ findings: [F({ rewrite: RW1 }), F({ rewrite: RW2 })] });
    expect(out.result.findings).toHaveLength(2);
    const f1 = out.result.findings.find((f: any) => f.rewrite === null);
    expect(f1.weight).toBe("medium");
    expect(out.notes).toContain("rewrite_removed:unsupported_figure:1200,18000");
    expect(out.result.findings.some((f: any) => f.rewrite === RW2)).toBe(true);
    expect(out.rewritesRemoved).toBe(1);
  });
  it("drops defensibility item 2 only, keeps the headline", () => {
    const out = run({ findings: [F({ rewrite: RW2 })], defensibility: [D1, D2, D3], headline_suggestion: HL });
    expect(out.result.defensibility).toEqual([D1, D3]);
    expect(out.notes).toContain("dropped_defensibility:unsupported_figure:4,180");
    expect(out.defensibilityDropped).toBe(1);
    expect(out.result.headline_suggestion).toBe(HL);
  });
  it("years exception and Arabic text", () => {
    const src = sourceNumbers(SOURCE);
    expect(unsupportedNumbers("He has spent 9 years at the firm.", src)).toEqual([]);
    expect(unsupportedNumbers("قضى 9 سنوات في الشركة", src)).toEqual([]);
    expect(unsupportedNumbers("6 مراكز و 240 شاحنة", src)).toEqual([]);
    expect(unsupportedNumbers("9 trucks", src)).toEqual(["9"]);
  });
});
