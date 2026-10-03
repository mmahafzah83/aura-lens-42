import { describe, it, expect } from "vitest";
import { itemText, optionLabel, sliderKey, itemsPreviewFromSearch } from "../assessmentItems";
import { toCoded, toLegacyEnglish, type CanonicalQuestion } from "../assessmentAnswers";

describe("itemText", () => {
  const row = { prompt: "English", prompt_ar: "عربي", helper: "Help", helper_ar: "", why_asked: "Why", why_asked_ar: null };
  it("returns Arabic when present and lang is ar", () => expect(itemText(row, "prompt", "ar")).toBe("عربي"));
  it("falls back on empty string", () => expect(itemText(row, "helper", "ar")).toBe("Help"));
  it("falls back on null", () => expect(itemText(row, "why_asked", "ar")).toBe("Why"));
  it("returns English for en even when Arabic exists", () => expect(itemText(row, "prompt", "en")).toBe("English"));
  it("whitespace-only Arabic falls back", () => expect(itemText({ prompt: "E", prompt_ar: "  " }, "prompt", "ar")).toBe("E"));
});

describe("optionLabel", () => {
  it("ar present", () => expect(optionLabel({ label: "A", label_ar: "أ" }, "ar")).toBe("أ"));
  it("ar empty", () => expect(optionLabel({ label: "A", label_ar: "" }, "ar")).toBe("A"));
  it("ar null", () => expect(optionLabel({ label: "A", label_ar: null }, "ar")).toBe("A"));
  it("ar missing", () => expect(optionLabel({ label: "A" }, "ar")).toBe("A"));
  it("lang en", () => expect(optionLabel({ label: "A", label_ar: "أ" }, "en")).toBe("A"));
});

describe("slider key", () => {
  it("stays the English name when name_ar is present", () => {
    const d = { name: "Strategic judgement", name_ar: "الحكم الاستراتيجي" };
    expect(sliderKey(d)).toBe("Strategic judgement");
    const scores = { [sliderKey(d)]: 70 };
    expect(Object.keys(scores)).toEqual(["Strategic judgement"]);
  });
});

describe("toLegacyEnglish ignores label_ar", () => {
  it("builds from English labels", () => {
    const q = {
      id: "q1", position: 1, framework: null, kind: "multi", band: "work", instrument_version: 1, prompt: "P",
      prompt_ar: "س",
      options: [{ label: "One", value: "one", label_ar: "واحد" }, { label: "Two", value: "two", label_ar: "اثنان" }],
    } as unknown as CanonicalQuestion;
    const c = toCoded(q, { values: ["two", "one"], lang: "ar", at: "x" });
    expect(c.values).toEqual(["two", "one"]);
    expect(toLegacyEnglish(q, c)).toBe("Two · One");
  });
});

describe("items preview switch", () => {
  it("reads ?items=ar only", () => {
    expect(itemsPreviewFromSearch("?items=ar")).toBe(true);
    expect(itemsPreviewFromSearch("?items=en")).toBe(false);
    expect(itemsPreviewFromSearch("")).toBe(false);
  });
});
