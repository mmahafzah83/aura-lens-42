import { describe, it, expect } from "vitest";
import { formatSmartDate } from "@/lib/formatDate";

const NOW = new Date("2026-10-05T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const M = 60000, H = 3600000, D = 86400000;

describe("formatSmartDate", () => {
  it("English unchanged", () => {
    expect(formatSmartDate(ago(10_000), "en", NOW)).toBe("just now");
    expect(formatSmartDate(ago(1 * M), "en", NOW)).toBe("1 minute ago");
    expect(formatSmartDate(ago(5 * M), "en", NOW)).toBe("5 minutes ago");
    expect(formatSmartDate(ago(2 * H), "en", NOW)).toBe("2 hours ago");
    expect(formatSmartDate(ago(3 * D), "en", NOW)).toBe("3 days ago");
    expect(formatSmartDate("2026-04-11T12:00:00Z", undefined, NOW)).toBe("Apr 11");
  });
  it("Arabic minutes", () => {
    const c: [number, string][] = [[1, "قبل دقيقة"], [2, "قبل دقيقتين"], [3, "قبل 3 دقائق"], [10, "قبل 10 دقائق"], [11, "قبل 11 دقيقة"], [59, "قبل 59 دقيقة"]];
    for (const [n, s] of c) expect(formatSmartDate(ago(n * M), "ar", NOW), String(n)).toBe(s);
    expect(formatSmartDate(ago(10_000), "ar", NOW)).toBe("الآن");
  });
  it("Arabic hours", () => {
    const c: [number, string][] = [[1, "قبل ساعة"], [2, "قبل ساعتين"], [3, "قبل 3 ساعات"], [10, "قبل 10 ساعات"], [11, "قبل 11 ساعة"], [23, "قبل 23 ساعة"]];
    for (const [n, s] of c) expect(formatSmartDate(ago(n * H), "ar", NOW), String(n)).toBe(s);
  });
  it("Arabic days and older dates", () => {
    expect(formatSmartDate(ago(1 * D), "ar", NOW)).toBe("أمس");
    expect(formatSmartDate(ago(2 * D), "ar", NOW)).toBe("قبل يومين");
    expect(formatSmartDate(ago(5 * D), "ar", NOW)).toBe("قبل 5 أيام");
    expect(formatSmartDate("2026-04-11T12:00:00Z", "ar", NOW)).toBe("11 أبريل");
  });
});
