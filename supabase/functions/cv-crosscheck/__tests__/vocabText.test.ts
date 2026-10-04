import { describe, it, expect } from "vitest";
import { vocabText } from "../vocabText";
import { hasBanned } from "../../_shared/bannedWords.ts";

const words = ["authority"];
const finding = (cv_line: string, why: string) => ({
  findings: [{ what: "Gap", why_it_matters: why, evidence: { cv_line, profile_line: "Absent" } }],
});

describe("vocabText", () => {
  it("a quoted cv_line containing Ports Authority passes", () => {
    expect(hasBanned(vocabText(finding("Head of planning, Jeddah ports authority, 2016-2021", "Boards look for scale.")), words)).toBe(false);
  });
  it("the same word in why_it_matters still fails", () => {
    expect(hasBanned(vocabText(finding("Head of planning, 2016-2021", "This builds your ports authority with boards.")), words)).toBe(true);
  });
  it("profile_line is excluded too; other fields kept", () => {
    const t = vocabText({ findings: [{ evidence: { cv_line: "a", profile_line: "showcase" }, do_this: "keep me" }] });
    expect(t).not.toContain("showcase");
    expect(t).toContain("keep me");
  });
});
