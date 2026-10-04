import { describe, it, expect } from "vitest";
import { arabicHardFail, arabicStyleNotes } from "../arabicVoice";

describe("arabicHardFail / arabicStyleNotes", () => {
  it("style faults pass the hard check and come back as three notes", () => {
    const v = {
      market_read: "أنت تقود البرامج بهدوء. أنت تكتب قليلًا عن عملك. أنت تُعرف بها في القطاع.",
      honest_gap: "تمّ ذكر خبرتك مرة واحدة فقط في سجلّك.",
      uncontested_space: "يراك السوق كملف مفتوح في إدارة المياه.",
    };
    expect(arabicHardFail(v)).toBeNull();
    const notes = arabicStyleNotes(v);
    expect(notes.map((n) => n.check).sort()).toEqual(["anta_openers", "banned_word", "kaf_as"]);
  });
  it("English-only result fails the hard check with arabic_ratio", () => {
    expect(arabicHardFail({ market_read: "Your field sees you as a water programme director." })?.check).toBe("arabic_ratio");
  });
  it("English archetype fails hard", () => {
    expect(arabicHardFail({ archetype: "The Quiet Fixer" })?.check).toBe("archetype_english");
  });
});
