import { describe, it, expect } from "vitest";
import { buildInterpretationFromReport, normaliseReport, retryAllowed, reportChecks } from "../report";
import { buildBrandPaper } from "@/lib/buildBrandPaper";

// Replicated exactly from src/lib/marketRead.ts (not exported there).
function splitTail(raw: string): { prose: string; json: any | null } {
  if (!raw) return { prose: "", json: null };
  const idx = raw.indexOf("---JSON---");
  if (idx === -1) return { prose: raw, json: null };
  const prose = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + "---JSON---".length).trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return { prose, json: JSON.parse(tail) };
  } catch {
    return { prose, json: null };
  }
}

const base = {
  primary_archetype: "المُصلح الهادئ",
  secondary_archetype: "المترجم العملي",
  positioning_statement: "أساعد مديري البرامج في قطاع المياه على إنقاذ المشاريع المتعثرة. أبدأ من الأرقام قبل الخطط. هدفي أن أقود محفظة برامج وطنية.",
  market_read: "يراك السوق مُصلحًا هادئًا للبرامج المتعثرة. تكتب عن الأرقام لا عن الشعارات. وأسلوبك الثاني ترجمة القرار إلى خطوات.",
  trust_pattern: "تبني الثقة حين تعرض الرقم قبل الرأي.",
  natural_tone: "نبرتك هادئة ومباشرة.",
  unique_capability: "تجمع بين إدارة البرامج وفهم التشغيل في قطاع المياه.",
  uncontested_space: "لا يكتب أحد عن كلفة التأخير في مشاريع المياه. هذه مساحتك.",
  the_gap: "قيّمت نفسك أعلى في الكتابة. من 40 منشورًا، 12 فقط فيها رقم.",
  honest_truth: "العائق الذي ذكرته قابل للحل بخطوة أسبوعية واحدة.",
  authority_style: "تقنع بالدليل.",
  voice_signature: "جمل قصيرة وأرقام.",
  key_barrier: "قلة الوقت.",
  topics: [
    { title: "كلفة تأخير مشاريع المياه", description: "تشرح أثر التأخير على الميزانية." },
    { title: "إنقاذ البرامج المتعثرة", description: "تعرض خطوات العودة إلى المسار." },
    { title: "مؤشرات التشغيل", description: "تربط المؤشر بالقرار." },
  ],
  invest_next: [
    { area: "الكتابة المنتظمة", insight: "تفتح لك ظهورًا أمام صاحب القرار." },
    { area: "الحديث العام", insight: "يرفع مكانتك في القطاع." },
  ],
  growth_areas: ["الكتابة", "الحديث"],
};

describe("buildInterpretationFromReport", () => {
  const withQuote = normaliseReport({ ...base, own_words_quote: "Delay is a cost, not a date.", own_words_read: "تفكر بالكلفة قبل الجدول." });
  const text = buildInterpretationFromReport(withQuote);

  it("round-trips through splitTail and buildBrandPaper", () => {
    const { prose, json } = splitTail(text);
    expect(json).not.toBeNull();
    for (const k of ["primary_archetype", "market_read", "positioning_statement", "the_gap", "uncontested_space", "honest_truth"]) {
      expect(json[k]).toBe((base as any)[k]);
    }
    expect(json.topics).toHaveLength(3);
    expect(json.topics.every((t: any) => t.title)).toBe(true);
    expect(json.invest_next).toHaveLength(2);
    expect(json.content_pillars).toEqual(base.topics.map((t) => t.title));
    expect(prose).toContain("IN YOUR OWN WORDS\n«Delay is a cost, not a date.»");

    const bp = buildBrandPaper({ interpretation: text }, null);
    expect(bp.primary_archetype).toBe(base.primary_archetype);
    expect(bp.market_read).toBe(base.market_read);
    expect(bp.positioning_statement).toBe(base.positioning_statement);
    expect(bp.the_gap).toBe(base.the_gap);
    expect(bp.uncontested_space).toBe(base.uncontested_space);
    expect(bp.honest_truth).toBe(base.honest_truth);
    expect(bp.topics).toHaveLength(3);
    expect(bp.own_words_quote).toBe("Delay is a cost, not a date.");
  });

  it("omits IN YOUR OWN WORDS and nulls the quote when absent", () => {
    const t = buildInterpretationFromReport(normaliseReport({ ...base, own_words_quote: "null", own_words_read: "" }));
    const { prose, json } = splitTail(t);
    expect(prose).not.toContain("IN YOUR OWN WORDS");
    expect(json.own_words_quote).toBeNull();
    expect(json.own_words_read).toBeNull();
    expect(buildBrandPaper({ interpretation: t }, null).own_words_quote).toBeNull();
  });

  it("has every required marker header", () => {
    for (const h of ["HOW THE MARKET SEES YOU", "HOW YOU BUILD TRUST", "YOUR NATURAL TONE", "YOUR ONE-LINER", "WHAT ONLY YOU CAN DO", "THE GAP", "THE SPACE NOBODY ELSE OWNS", "YOUR 3 TOPICS", "WHERE TO INVEST NEXT", "THE HONEST TRUTH"]) {
      expect(text.split("\n")).toContain(h);
    }
  });
});

describe("retryAllowed", () => {
  it("69 s yes, 71 s no", () => {
    expect(retryAllowed(69_000)).toBe(true);
    expect(retryAllowed(71_000)).toBe(false);
  });
});

describe("reportChecks", () => {
  it("passes a good report, names every failure otherwise", () => {
    expect(reportChecks(normaliseReport(base), "tool_use").checks).toEqual([]);
    expect(reportChecks(null, "max_tokens").checks).toEqual(["truncated_output", "no_tool_result"]);
    const bad = reportChecks(normaliseReport({ ...base, market_read: "", topics: base.topics.slice(0, 2) }), "tool_use");
    expect(bad.checks).toContain("empty_field");
    expect(bad.checks).toContain("topics_count");
  });
});

describe("normaliseReport tolerates mislabelled fields", () => {
  const live = {
    primary_archetype: "المُصلح التشغيلي", market_read: "نص.", positioning_statement: "نص.",
    topics: [{ name: "أ", insight: "وصف أ" }, { title: "ب", description: "وصف ب" }, { area: "ج", text: "وصف ج" }],
    invest_next: [{ area: "قراءة الغرفة فوقك", insight: "رؤية" }, { area: "إلى أين يتجه مجالك", description: "النص الذي ضاع" }, { area: "", insight: "x" }],
    growth_areas: ["أ", "", 3, "ب"],
  };
  it("keeps the {area, description} item's text under insight and drops empty areas", () => {
    const r = normaliseReport(live);
    expect(r.invest_next).toEqual([
      { area: "قراءة الغرفة فوقك", insight: "رؤية" },
      { area: "إلى أين يتجه مجالك", insight: "النص الذي ضاع" },
    ]);
    expect(r.topics.map((t: any) => t.title)).toEqual(["أ", "ب", "ج"]);
    expect(r.topics[2]).toEqual({ title: "ج", description: "وصف ج" });
    expect(r.growth_areas).toEqual(["أ", "ب"]);
    expect(reportChecks(r, "tool_use").checks).not.toContain("invest_count");
  });
  it("flags invest_count when fewer than 2 usable items", () => {
    const r = normaliseReport({ ...live, invest_next: [{ area: "أ", insight: "ب" }, { area: "ج" }] });
    expect(reportChecks(r, "tool_use").checks).toContain("invest_count");
  });
});
