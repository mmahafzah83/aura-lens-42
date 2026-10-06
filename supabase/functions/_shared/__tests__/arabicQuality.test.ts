import { describe, it, expect } from "vitest";
import { arabicQualityNotes, arabicStyleNotes, fieldFixRequest, ARABIC_VOICE_BLOCK } from "../arabicVoice";

const rules = (v: Record<string, unknown>, allow: string[] = []) =>
  arabicQualityNotes(v, { allowLatin: allow }).map((n) => n.check);

describe("Batch 14b Arabic quality detectors", () => {
  it("dash", () => {
    expect(rules({ market_read: "تولّيت مناصب كبيرة — وكيل الجامعة — لكن" })).toContain("dash");
    expect(rules({ market_read: "تولّيت مناصب كبيرة: وكيل الجامعة وعمدة الدرعية." })).not.toContain("dash");
  });
  it("latin_run with allowlist", () => {
    expect(rules({ market_read: "عملت 41 عاماً في King Saud University." })).toContain("latin_run");
    expect(rules({ market_read: "يقرأ KnownBy صفحتك على LinkedIn، وعنوانك Professor of Engineering." }, ["Professor of Engineering"])).not.toContain("latin_run");
  });
  it("junior_label only in label fields", () => {
    expect(rules({ archetype: "المُدرّس الإداري" })).toContain("junior_label");
    expect(rules({ archetype: "الأستاذ المؤسِّس" })).not.toContain("junior_label");
  });
  it("title_repeat", () => {
    expect(rules({ uncontested_space: "المساحة التي لم يشغلها أحد: كيف يُترجم أكاديمي خبرته." })).toContain("title_repeat");
    expect(rules({ uncontested_space: "لم يكتب أحد عن إدارة المرافق الجامعية من الداخل." })).not.toContain("title_repeat");
  });
  it("loanword", () => {
    expect(rules({ honest_gap: "الانتقال من الأكاديميا إلى السوق لا يظهر." })).toContain("loanword");
    expect(rules({ honest_gap: "الانتقال من العمل الأكاديمي إلى السوق لا يظهر." })).not.toContain("loanword");
  });
  it("feeds the one correction call and the style notes", () => {
    const report = { archetype: "المدرّس الإداري", market_read: "مناصب — كبيرة" };
    expect(arabicStyleNotes(report).map((n) => n.check)).toEqual(expect.arrayContaining(["junior_label", "dash"]));
    expect(fieldFixRequest(report, arabicStyleNotes(report))?.fields).toHaveProperty("archetype");
  });
  it("block carries the new rules", () => {
    for (const s of ["جامعة الملك سعود", "«—»", "«مدرّس»", "الأكاديميا", "41 عاماً", "أيٍّ منها"]) expect(ARABIC_VOICE_BLOCK).toContain(s);
  });
});
