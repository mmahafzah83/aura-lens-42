import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sheetOverflows } from "@/components/report/BrandPaperDocument";
import CvCrosscheck, { cvPrintParts } from "@/components/report/CvCrosscheck";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "en" }) }));

const box = (scroll: number, client: number) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: scroll });
  Object.defineProperty(el, "clientHeight", { value: client });
  return el;
};

describe("sheet overflow", () => {
  it("flags content that runs under the footer while the sheet itself does not scroll", () => {
    const sheet = box(1123, 1123);
    const body = box(921, 831); // 90px past the footer line
    body.setAttribute("data-sheet-body", "");
    sheet.appendChild(body);
    expect(sheetOverflows(sheet)).toBe(true);
  });
  it("passes a sheet whose body fits", () => {
    const sheet = box(1123, 1123);
    const body = box(800, 831);
    body.setAttribute("data-sheet-body", "");
    sheet.appendChild(body);
    expect(sheetOverflows(sheet)).toBe(false);
  });
});

const cv = {
  headline_finding: "Verdict.", findings: [{ what: "One", rewrite: "Line.", do_first: true, evidence: { cv_line: "a", profile_line: "b" }, aura_can: "suggest_headline" }, { what: "Two" }],
  cv_is_behind: ["Missing."], headline_suggestion: "Headline.", the_hard_truth: "Truth.",
};

describe("CV comparison print version", () => {
  it("splits into one block per part", () => {
    expect(cvPrintParts(cv)).toEqual(["verdict", "lead", "rest", "missing", "headline", "truth"]);
  });
  it("has no buttons and no <details>; closed rows keep title and first line", () => {
    const html = renderToStaticMarkup(<CvCrosscheck data={cv} lang="en" print />);
    expect(html).not.toMatch(/<button|<details|<summary/);
    expect(html).toContain("Missing.");
    expect(html).toContain("Line."); // the lead finding stays in full
  });
  it("on screen it is unchanged: rows are <details> with controls", () => {
    const html = renderToStaticMarkup(<CvCrosscheck data={cv} lang="en" />);
    expect(html).toMatch(/<details/);
    expect(html).toMatch(/<button/);
  });
});
