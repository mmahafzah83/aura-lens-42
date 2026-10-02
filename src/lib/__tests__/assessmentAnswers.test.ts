import { describe, it, expect } from "vitest";
import { toCoded, toLegacyEnglish, legacyKey, NONE_CODE, type CanonicalQuestion } from "../assessmentAnswers";

const base = { id: "q1", position: 1, framework: "archetype", band: "work", instrument_version: 2 };
const multi: CanonicalQuestion = {
  ...base, kind: "multi", prompt: "How do people at work describe you?",
  options: [
    { label: "The one who is usually right", value: "right" },
    { label: "The one who fixes what is stuck", value: "fix" },
    { label: "The one who gets it finished", value: "finish" },
  ],
};
const at = "2026-10-02T00:00:00.000Z";

describe("assessmentAnswers", () => {
  it("choice", () => {
    const q = { ...multi, kind: "choice" };
    const c = toCoded(q, { values: ["fix"], lang: "en", at });
    expect(c.values).toEqual(["fix"]);
    expect(toLegacyEnglish(q, c)).toBe("The one who fixes what is stuck");
    expect(legacyKey(1, q)).toBe("Q1 How do people at work describe you?");
  });
  it("multi keeps order", () => {
    const c = toCoded(multi, { values: ["finish", "right"], lang: "en", at });
    expect(c.values).toEqual(["finish", "right"]);
    expect(toLegacyEnglish(multi, c)).toBe("The one who gets it finished · The one who is usually right");
  });
  it("none", () => {
    const c = toCoded(multi, { values: [NONE_CODE], lang: "en", at });
    expect(toLegacyEnglish(multi, c)).toBe("None of these fit");
  });
  it("text", () => {
    const q = { ...multi, kind: "text", options: null };
    const c = toCoded(q, { text: "I fix ports  ", lang: "en", at });
    expect(c.values).toEqual([]);
    expect(toLegacyEnglish(q, c)).toBe("I fix ports  ");
  });
  it("proposed", () => {
    const q = { ...multi, kind: "proposed", options: null };
    const c = toCoded(q, { proposed: { chosen: "A", rejected: ["B", "C"] }, lang: "en", at });
    expect(toLegacyEnglish(q, c)).toBe("A (not: B, C)");
    const solo = toCoded(q, { proposed: { chosen: "A", rejected: [] }, lang: "en", at });
    expect(toLegacyEnglish(q, solo)).toBe("A");
  });
  it("Arabic display label never reaches the legacy object", () => {
    // What the screen showed in Arabic; selection is held by value.
    const shown = [{ label: "الذي يصلح ما تعطّل", value: "fix" }];
    const picked = shown.map((o) => o.value);
    const c = toCoded(multi, { values: picked, lang: "ar", at });
    expect(c.values).toEqual(["fix"]);
    expect(c.answered_lang).toBe("ar");
    expect(toLegacyEnglish(multi, c)).toBe("The one who fixes what is stuck");
  });
});
