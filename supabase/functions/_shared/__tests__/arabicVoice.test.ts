import { describe, it, expect } from "vitest";
import { arabicGate, arabicGateDetail, arabicCorrectionText, repairArabic, repairValues, ARABIC_VOICE_BLOCK } from "../arabicVoice";

const good = {
  archetype: "المُصلح الهادئ",
  market_read: "يراك السوق مدير برامج في قطاع المياه. تكتب عن 20 مشروعًا في EY بوضوح.",
  themes: ["إصلاح المرافق", "التمويل العام", "الحوكمة"],
  uncontested_space: "تستطيع أن تُعرف بكفاءة المياه في الخليج.",
  honest_gap: "لا يظهر في حضورك العام أنك قدت فرقًا كبيرة.",
  own_words_quote: "Utilities don't fail overnight.",
  own_words_read: "تُظهر هذه الجملة أنك تفكر على المدى الطويل.",
};
const opts = { skipKeys: ["own_words_quote"] };
const gate = (patch: Record<string, unknown>) => arabicGate({ ...good, ...patch } as any, opts);

describe("arabicGate", () => {
  it("passes a good Arabic read", () => expect(arabicGate(good, opts)).toBeNull());
  it("block is the supplied text", () => expect(ARABIC_VOICE_BLOCK.startsWith("LANGUAGE — write every value in Arabic")).toBe(true));

  it("arabic_ratio", () => {
    expect(gate({ market_read: "يراك السوق خبيرًا في ZATCA." })).toBeNull();
    expect(gate({ market_read: "Your field sees you as a water expert in EY." })).toBe("arabic_ratio");
  });
  it("arabic_indic_digits", () => {
    expect(gate({ honest_gap: "قدت 20 مشروعًا دون أن تكتب عنها." })).toBeNull();
    expect(gate({ honest_gap: "قدت ٢٠ مشروعًا دون أن تكتب عنها." })).toBe("arabic_indic_digits");
  });
  it("banned_word", () => {
    expect(gate({ honest_gap: "تمكنت من قيادة فرق كبيرة حيث لم يرك أحد." })).toBeNull();
    expect(gate({ honest_gap: "تم ذكر خبرتك قليلًا." })).toBe("banned_word");
    expect(gate({ honest_gap: "تعمل بشكل واضح مع الفرق." })).toBe("banned_word");
    expect(gate({ honest_gap: "يُعدّ هذا مهمًا لك في عملك." })).toBe("banned_word");
    expect(gate({ own_words_quote: "تم إنجاز المشروع." })).toBeNull();
  });
  it("kaf_as", () => {
    expect(gate({ market_read: "يراك السوق مدير برامج في قطاع المياه." })).toBeNull();
    expect(gate({ market_read: "يراك السوق كمدير برامج في قطاع المياه." })).toBe("kaf_as");
  });
  it("glued_latin", () => {
    expect(gate({ market_read: "عملت في NWC، ثم SPL، ثم ZATCA سنوات طويلة." })).toBeNull();
    expect(gate({ market_read: "عملت في NWC وSPL سنوات طويلة في القطاع." })).toBe("glued_latin");
  });
  it("glued_digit", () => {
    expect(gate({ market_read: "كتبت عشرة منشورات وثلاثة مقالات هذا العام." })).toBeNull();
    expect(gate({ market_read: "كتبت عشرة منشورات و3 مقالات هذا العام." })).toBe("glued_digit");
  });
  it("anta_openers", () => {
    expect(gate({ market_read: "أنت تكتب بوضوح. يراك السوق خبيرًا." })).toBeNull();
    expect(gate({ market_read: "أنت تكتب بوضوح. أنت تقود فرقًا كبيرة. أنت تقيس." })).toBe("anta_openers");
  });
  it("archetype_english", () => {
    expect(gate({ archetype: "المُصلح الهادئ" })).toBeNull();
    expect(gate({ archetype: "The Quiet Reformer" })).toBe("archetype_english");
  });
  it("archetype_banned", () => {
    expect(gate({ archetype: "المُرمّم الصبور" })).toBeNull();
    expect(gate({ archetype: "المهندس الهادئ" })).toBe("archetype_banned");
    expect(gate({ archetype: "المُصلح الاستراتيجي" })).toBe("archetype_banned");
  });
});

describe("repairArabic", () => {
  it("spaces «و» before Latin or a digit", () => {
    expect(repairArabic("في NWC وSPL و50 مشروعًا")).toBe("في NWC و SPL و 50 مشروعًا");
  });
  it("spaces tatweel prefixes before Latin or a digit", () => {
    expect(repairArabic("عمل بـEY ثم لـZATCA ثم الـPMO وكـ5")).toBe("عمل بـ EY ثم لـ ZATCA ثم الـ PMO وكـ5");
  });
  it("turns Arabic-Indic digits Western", () => {
    expect(repairArabic("قدت ٢٠ مشروعًا")).toBe("قدت 20 مشروعًا");
  });
  it("leaves everything else alone", () => {
    const t = "وقت العمل في EY، بوضوح.";
    expect(repairArabic(t)).toBe(t);
  });
  it("skips own_words_quote and repairs arrays", () => {
    const r = repairValues({ own_words_quote: "وSPL", themes: ["وSPL"] }, ["own_words_quote"]);
    expect(r).toEqual({ own_words_quote: "وSPL", themes: ["و SPL"] });
  });
});

describe("gate after repair", () => {
  const g = (o: Record<string, unknown>) => arabicGate(repairValues(o, ["own_words_quote"]));
  it("repaired glue passes; unreachable glue fails", () => {
    expect(g({ market_read: "عملت في NWC وSPL و50 مشروعًا بـEY سنوات طويلة." })).toBeNull();
    expect(g({ market_read: "عملت سنوات طويلة بEY في القطاع العام." })).toBe("glued_latin");
    expect(g({ market_read: "قدّمت تقارير كثيرة للPMO في القطاع العام." })).toBe("glued_latin");
  });
  it("Arabic-Indic digits cannot fire after repair", () => {
    expect(g({ honest_gap: "قدت ٢٠ مشروعًا دون أن تكتب عنها." })).toBeNull();
  });
  it("anta_openers fails only above two", () => {
    expect(arabicGate({ market_read: "أنت تكتب بوضوح. أنت تقود فرقًا كبيرة." })).toBeNull();
    expect(arabicGate({ market_read: "أنت تكتب بوضوح. أنت تقود فرقًا كبيرة. أنت تقيس الأثر." })).toBe("anta_openers");
  });
  it("correction quotes the fragment, up to 60 characters", () => {
    const d = arabicGateDetail({ market_read: "عملت سنوات طويلة بEY في القطاع العام." })!;
    const msg = arabicCorrectionText(d);
    expect(msg).toContain("glued_latin");
    expect(msg).toContain("بEY");
    expect(d.fragment!.length).toBeLessThanOrEqual(60);
  });
});
