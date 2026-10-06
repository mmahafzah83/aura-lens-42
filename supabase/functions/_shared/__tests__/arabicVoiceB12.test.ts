import { describe, it, expect } from "vitest";
import { arabicTextNotes, findKafAs, contrastSkeletons, withArabicVoice, ARABIC_VOICE_BLOCK, arabicGate } from "../arabicVoice";
import { pickMemberLang } from "../memberLang";

const checks = (t: string) => arabicTextNotes(t).map((d) => d.check);

describe("Batch 12 Arabic checker", () => {
  it("GOOD lines pass", () => {
    expect(arabicTextNotes("يراك السوق مدير برامج رقمية يعمل داخل جهات حكومية كبيرة.")).toEqual([]);
    expect(arabicTextNotes("مساحتك: ما يحدث في الشهر الثالث بعد الإطلاق. لم يشغلها أحد.")).toEqual([]);
    expect(arabicTextNotes("لا ترى المشروع ملفاً تقنياً، بل قراراً إدارياً.")).toEqual([]);
  });
  it("BAD line fails on «كـ»", () => {
    expect(checks("لا تنظر إلى المشروع كملف تقني، بل كقرار إداري.")).toContain("kaf_as");
  });
  it("kaf pattern and exceptions", () => {
    for (const w of ["كملف", "كقرار", "كمشروع"]) expect(findKafAs(`نراه ${w} مهم`)).not.toBeNull();
    expect(findKafAs("يعمل كـ Partner في الشركة")).not.toBeNull();
    expect(findKafAs("كل ما كان كما هو، وكذلك كثير من كبار الكتاب وكلمة واحدة")).toBeNull();
    expect(findKafAs("زادت كمية العمل")).toBeNull();
  });
  it("openers, dialect, Latin prefix, skeletons", () => {
    expect(checks("معظم المديرين لا يكتبون.")).toContain("banned_opener");
    expect(checks("في ظل التغيرات نكتب.")).toContain("banned_opener");
    expect(checks("هذا مش واضح للقارئ.")).toContain("banned_word");
    expect(checks("عملت مع الـ PMO سنوات.")).toContain("latin_prefix");
    const two = "ليس المهم العدد. بل الأثر. وليس الكلام، بل الفعل.";
    expect(contrastSkeletons(two)).toBe(2);
    expect(checks(two)).toContain("contrast_skeleton");
    expect(checks("ليس المهم العدد. بل الأثر.")).not.toContain("contrast_skeleton");
  });
  it("block carries the new rules and examples", () => {
    expect(ARABIC_VOICE_BLOCK).toContain("Gulf reader first");
    expect(ARABIC_VOICE_BLOCK).toContain("Write tanween fath on the alif: دليلاً، مؤشراً، شيئاً.");
    expect(ARABIC_VOICE_BLOCK).toContain("لا ترى المشروع ملفاً تقنياً");
    expect(withArabicVoice("S", "en")).toBe("S");
    expect(withArabicVoice("S", "ar").endsWith(ARABIC_VOICE_BLOCK)).toBe(true);
  });
  it("requires Arabic industry and sector names in running text", () => {
    expect(ARABIC_VOICE_BLOCK).toContain("الطاقة والمرافق");
    expect(ARABIC_VOICE_BLOCK).toContain("الخدمات المالية");
    expect(ARABIC_VOICE_BLOCK).toContain("القطاع الحكومي");
    expect(checks("يتابع التحول في Energy & Utilities داخل المملكة.")).toContain("english_sector");
    expect(checks("يتابع التحول في الطاقة والمرافق داخل المملكة.")).not.toContain("english_sector");
  });
  it("rejects standalone Latin technical tokens but permits proper names", () => {
    for (const token of ["AI", "KPI", "KPIs", "dashboard", "roadmap", "stakeholders"]) {
      expect(checks(`يربط ${token} بالقرار التنفيذي داخل المؤسسة.`)).toContain("latin_technical");
    }
    expect(checks("يربط الذكاء الاصطناعي بالقرار في KnownBy و LinkedIn و Imprint.")).not.toContain("latin_technical");
  });
  it("gate rejects the BAD line", () => expect(arabicGate({ x: "لا تنظر إلى المشروع كملف تقني، بل كقرار إداري." })).toBe("kaf_as"));
});

describe("member language", () => {
  it("Arabic only when saved as Arabic", () => {
    expect(pickMemberLang("ar")).toBe("ar");
    expect(pickMemberLang("en")).toBe("en");
    expect(pickMemberLang(null)).toBe("en");
    expect(pickMemberLang("fr")).toBe("en");
  });
});

import { fieldFixRequest, applyFieldFix, pathGet } from "../arabicVoice";
describe("Batch 12 field-level correction", () => {
  it("sends only offending fields and keeps a better reply", () => {
    const obj: any = { a: "نص سليم تماماً هنا.", findings: [{ what: "لا ترى المشروع كملف تقني، بل قرار إداري." }] };
    const notes = [{ check: "kaf_as" as const, field: "findings[0].what" }];
    const req = fieldFixRequest(obj, notes)!;
    expect(Object.keys(req.fields)).toEqual(["findings[0].what"]);
    const n = applyFieldFix(obj, req.fields, JSON.stringify({ "findings[0].what": "لا ترى المشروع ملفاً تقنياً، بل قراراً إدارياً." }));
    expect(n).toBe(1);
    expect(pathGet(obj, "findings[0].what")).toBe("لا ترى المشروع ملفاً تقنياً، بل قراراً إدارياً.");
    expect(obj.a).toBe("نص سليم تماماً هنا.");
  });
  it("keeps the original when the reply is no better", () => {
    const obj: any = { x: "نراه كمشروع كبير." };
    const req = fieldFixRequest(obj, [{ check: "kaf_as", field: "x" }])!;
    expect(applyFieldFix(obj, req.fields, '{"x":"نراه كملف كبير."}')).toBe(0);
    expect(obj.x).toBe("نراه كمشروع كبير.");
  });
});
