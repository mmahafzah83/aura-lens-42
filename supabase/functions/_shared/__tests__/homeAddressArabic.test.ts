import { describe, expect, it } from "vitest";
import { buildArabicEvidenceLines, fallbackArabicHomeAddress, gateArabicHomeAddress } from "../homeAddressArabic";

const evidence = [
  "أدلة إشارة «تحول المؤسسات»: 6. بدأت تتكوّن في مايو.",
  "وصل دليل جديد لإشارة «تحول المؤسسات» هذا الأسبوع.",
  "ما حفظته هذا الأسبوع: 3.",
];

describe("Arabic Home address", () => {
  it("accepts grounded prose and rejects invented figures or names", () => {
    const good = `${evidence[0]} ${evidence[1]} القرار الآن واضح.`;
    expect(gateArabicHomeAddress(good, evidence).pass).toBe(true);
    expect(gateArabicHomeAddress(`${good} والنتيجة 17.`, evidence).reasons).toContain("unknown figures: 17");
    expect(gateArabicHomeAddress(`${good} وظهرت إشارة «اسم مخترع».`, evidence).reasons).toContain("unknown names: اسم مخترع");
  });

  it("uses the fixed Arabic fallback and only supplied evidence", () => {
    const fallback = fallbackArabicHomeAddress(evidence);
    expect(fallback.startsWith("هذا ما تغيّر منذ أمس:\n")).toBe(true);
    expect(fallback).toContain(evidence[0]);
    expect(fallback).not.toMatch(/[A-Za-z]/);
  });

  it("builds whole evidence sentences with count labels", () => {
    const lines = buildArabicEvidenceLines({
      top_signal: { title: "تحول المؤسسات", fragment_count: 6, first_fragment_date: "2026-05-01" },
      drafts_total: 2, captures_total: 4, captures_this_week: 3, captured_today: false,
      weeks_with_a_capture_last_4: 2, facets_dormant: [], last_night: { sources_read: 5 }, linkedin_connected: true,
    }, null);
    expect(lines).toContain("أدلة إشارة «تحول المؤسسات»: 6. بدأت تتكوّن في مايو.");
    expect(lines).toContain("مسودات مكتوبة لم تنشرها: 2.");
    expect(lines.join(" ")).not.toContain("عددها");
  });
});