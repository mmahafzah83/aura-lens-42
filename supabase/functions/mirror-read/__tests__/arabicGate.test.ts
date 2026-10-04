import { describe, it, expect } from "vitest";
import { arabicGate } from "../arabicGate";

const good = {
  archetype: "المُصلح الهادئ",
  market_read: "يراك مجالك خبيرًا في المياه والبنية التحتية. تكتب عن 20 مشروعًا في EY بوضوح.",
  themes: ["إصلاح المرافق", "التمويل العام", "الحوكمة"],
  uncontested_space: "يمكنك أن تملك الحديث عن كفاءة المياه في الخليج.",
  honest_gap: "لا يظهر في حضورك العام أنك قدت فرقًا كبيرة.",
  own_words_quote: "Utilities don't fail overnight.",
  own_words_read: "تُظهر هذه الجملة أنك تفكر على المدى الطويل.",
  raw: { about: "English raw text is ignored" },
};

describe("arabicGate", () => {
  it("passes a good Arabic read", () => {
    expect(arabicGate(good)).toBeNull();
  });
  it("fails Latin-heavy text", () => {
    expect(arabicGate({ ...good, market_read: "Your field sees you as a water expert in EY." })?.check).toBe("latin_heavy");
  });
  it("fails Arabic-Indic digits", () => {
    expect(arabicGate({ ...good, honest_gap: "قدت ٢٠ مشروعًا دون أن تكتب عنها." })?.check).toBe("arabic_indic_digits");
  });
  it("fails a banned word, standalone only", () => {
    expect(arabicGate({ ...good, honest_gap: "تم ذكر خبرتك في المياه قليلًا." })?.check).toBe("banned_word");
    expect(arabicGate({ ...good, honest_gap: "تمكنت من قيادة فرق كبيرة دون أن تذكرها." })).toBeNull();
  });
  it("allows a banned word inside the verbatim quote", () => {
    expect(arabicGate({ ...good, own_words_quote: "تم إنجاز المشروع." })).toBeNull();
  });
  it("fails an English 'The ' archetype", () => {
    expect(arabicGate({ ...good, archetype: "The Quiet Reformer" })?.check).toBe("english_archetype");
  });
});
