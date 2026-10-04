import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";
import { arabicDate, detectPaperLang } from "@/components/report/paperText";
import { buildBrandPaper } from "@/lib/buildBrandPaper";

describe("paper language", () => {
  it("arabic date uses the fixed month list and western digits", () => {
    expect(arabicDate("2026-10-04T12:00:00Z")).toBe("4 أكتوبر 2026");
    expect(arabicDate("2026-01-15T12:00:00Z")).toBe("15 يناير 2026");
  });
  it("saved lang wins, else detect from archetype or market read", () => {
    expect(detectPaperLang({ lang: "en", primary_archetype: "المصلح" })).toBe("en");
    expect(detectPaperLang({ primary_archetype: "المصلح" })).toBe("ar");
    expect(detectPaperLang({ market_read: "يراك السوق" })).toBe("ar");
    expect(detectPaperLang({ primary_archetype: "The Fixer" })).toBe("en");
  });
  it("arabic sheets carry no letter-spacing, uppercase or italic", () => {
    const bp = buildBrandPaper({
      lang: "ar", primary_archetype: "المُصلح التشغيلي", market_read: "يراك السوق مُصلحًا.",
      positioning_statement: "أساعد.", trust_pattern: "تبني الثقة.", the_gap: "فجوة.",
      own_words_quote: "اقتباس", uncontested_space: "مساحة.", key_barrier: "الوقت",
      topics: [{ title: "أ", description: "ب" }], invest_next: [{ area: "ج", insight: "د" }],
      content_pillars: ["أ"], voice_signature: "جمل قصيرة.",
    }, { first_name: "سلمان" }, { skillRatings: { "Being called first": 49 } });
    const html = renderToStaticMarkup(<BrandPaperDocument paper={bp} />);
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    const bad = styles.filter((s) =>
      /letter-spacing:\s*(?!0(px|em)?\s*(;|$))/.test(s) || /text-transform:\s*uppercase/.test(s) || /font-style:\s*italic/.test(s));
    expect(bad).toEqual([]);
    expect(html).not.toMatch(/AI Professional Identity Platform/);
    expect(html).toContain("4 ");
    expect(html).not.toMatch(/\b(Finding|Chapter|Source|Page|Figure|Issued)\b/);
  });
});
