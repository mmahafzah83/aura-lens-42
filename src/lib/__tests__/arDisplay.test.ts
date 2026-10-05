import { describe, it, expect } from "vitest";
import { displayDate, displayNumber, arabicDaysAgo, arabicList } from "@/lib/arDisplay";

describe("arDisplay", () => {
  it("Arabic dates: Gregorian months, Western digits", () => {
    expect(displayDate("2026-08-10T12:00:00Z", "ar")).toBe("10 أغسطس 2026");
    expect(displayDate("2026-08-10T12:00:00Z", "ar", { year: false })).toBe("10 أغسطس");
  });
  it("English dates unchanged (en-GB)", () => {
    expect(displayDate("2026-08-10T12:00:00Z", "en")).toBe("10 Aug 2026");
    expect(displayDate("2026-08-10T12:00:00Z", "en", { year: false })).toBe("10 Aug");
  });
  it("numbers always Western", () => expect(displayNumber(12345)).toBe("12,345"));
  it("time-ago forms", () => {
    const cases: [number, string][] = [
      [0, "اليوم"], [1, "أمس"], [2, "قبل يومين"], [3, "قبل 3 أيام"], [6, "قبل 6 أيام"],
      [7, "قبل أسبوع"], [13, "قبل أسبوع"], [14, "قبل أسبوعين"], [20, "قبل أسبوعين"],
      [21, "قبل 3 أسابيع"], [76, "قبل 10 أسابيع"], [77, "قبل 11 أسبوعاً"],
    ];
    for (const [d, s] of cases) expect(arabicDaysAgo(d), String(d)).toBe(s);
  });
  it("list joiner", () => {
    expect(arabicList(["العنوان", "النبذة", "المهارات"])).toBe("العنوان، النبذة والمهارات");
    expect(arabicList(["العنوان", "النبذة"])).toBe("العنوان والنبذة");
    expect(arabicList(["العنوان"])).toBe("العنوان");
  });
});
