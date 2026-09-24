import { describe, it, expect } from "vitest";
import { parseLevel } from "../../../supabase/functions/_shared/oeEligibility";

const CASES: Array<[string, string]> = [
  ["الرئيس التنفيذي", "c_suite"],
  ["رئيس تنفيذي للعمليات", "c_suite"],
  ["الرئيس التنفيذي للشركة", "c_suite"],
  ["نائب الرئيس للموارد البشرية", "vp"],
  ["نائب رئيس تنفيذي للمالية", "vp"],
  ["نائب الرئيس التنفيذي", "vp"],
  ["نائب رئيس الشؤون القانونية", "vp"],
  ["مدير عام الموارد البشرية", "director"],
  ["المدير العام", "director"],
  ["مدير عام مساعد للتخطيط", "director"],
  ["مساعد المدير العام", "director"],
  ["مدير إدارة المشتريات", "director"],
  ["مدير ادارة التحول الرقمي", "director"],
  ["مدير إدارة عامة للاستراتيجية", "director"],
  ["رئيس قطاع الأعمال", "director"],
  ["مدير تنفيذي للاستراتيجية", "director"],
  ["المدير التنفيذي للعمليات", "director"],
  ["مدير ادارة البيانات الجغرافية (Geospatial Data Management Director)", "director"],
  ["مستشار أول - وزارة الاقتصاد", "director"],
  ["مستشار أول في شركة استشارات", "director"],
  ["مستشار أول مبيعات", "ic"],
  ["مدير", "manager"],
  ["مدير المبيعات", "manager"],
  ["مدير فرع", "manager"],
  ["رئيس قسم المحاسبة", "manager"],
  ["رئيس قسم الجودة", "manager"],
  ["مدير مشروع", "manager"],
  ["مدير مشروع تقنية المعلومات", "manager"],
  ["مدير أول الشراكات", "senior_manager"],
  ["أخصائي موارد بشرية", "ic"],
  ["اخصائي تسويق", "ic"],
  ["محلل بيانات", "ic"],
  ["محلل مالي أول", "ic"],
  ["موظف خدمة عملاء", "ic"],
  ["مساعد إداري", "ic"],
  ["منسق فعاليات", "ic"],
  ["صراف", "ic"],
  ["فني صيانة", "ic"],
  ["مهندس مدني", "ic"],
  ["محاسب", "ic"],
  ["عضو مجلس إدارة مستقل", "board"],
  ["Senior Manager - مدير أول", "senior_manager"],
  ["محلل (Data Analyst)", "ic"],
  ["Director of Strategy مدير إدارة الاستراتيجية", "director"],
];

describe("Arabic level parsing", () => {
  it.each(CASES)("%s → %s", (title, want) => {
    expect(parseLevel(title, null)).toBe(want);
  });
  it("has at least 40 Arabic cases", () => expect(CASES.length).toBeGreaterThanOrEqual(40));
});
