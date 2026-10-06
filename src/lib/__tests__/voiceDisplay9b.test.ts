import { describe, expect, it } from "vitest";
import ar from "@/i18n/locales/ar.json";
import { corpusWord, scopeWord, traitWord, type VoiceTr } from "@/lib/voiceText";
import { planVerdict, type FeedbackTrait } from "@/lib/voiceFeedback";

const AR = ar as Record<string, string>;
const tr: VoiceTr = {
  lang: "ar",
  t: (k, vars) => (AR[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars?.[v] ?? "")),
};
const strip = (s: string) => s.replace(/[\u2066-\u2069]/g, "");

describe("stored values shown in Arabic, never rewritten", () => {
  it("scope: all modes, all, default, preset key and mode label", () => {
    expect(scopeWord("all modes", tr)).toBe("كل الأنماط");
    expect(scopeWord("all", tr)).toBe("كل الأنماط");
    expect(scopeWord("default", tr)).toBe("صوتك الأساسي");
    expect(scopeWord("your default voice", tr)).toBe("صوتك الأساسي");
    expect(scopeWord("executive", tr)).toBe(AR["vo.mode.executive.label"]);
    expect(scopeWord("Ideas worth quoting", tr)).toBe(AR["vo.mode.thought_leadership.label"]);
    expect(scopeWord("Executive")).toBe("Executive");
  });
  it("raw trait keys use the trait-name map", () => {
    expect(traitWord("evidence_density", tr)).toBe("كثافة الأدلة");
    expect(traitWord("formality", tr)).toBe("الرسمية");
  });
  it("corpus labels: Arabic map, English display says KnownBy", () => {
    expect(corpusWord("You set this aside", tr)).toBe("استبعدته أنت");
    expect(corpusWord("Aura wrote this", tr)).toBe("كتبه KnownBy");
    expect(corpusWord("Aura wrote this")).toBe("KnownBy wrote this");
    expect(corpusWord("Written by Aura")).toBe("Written by KnownBy");
    expect(corpusWord("Your post")).toBe("Your post");
  });
});

describe("one verdict sentence", () => {
  const t: FeedbackTrait = {
    id: "t1", trait_key: "formality", display_name: "Formality", value: 44,
    band_low: 30, band_high: 60, locked: false, source: "learned", computable: false,
  };
  it("Arabic line is a whole sentence; the stored scope stays English", () => {
    const plan = planVerdict("too_formal", [t], "Executive", ["Executive"], false, tr);
    expect(strip(plan.lines[0])).toBe(`انخفضت الرسمية من 44% إلى 38% في ${AR["vo.mode.executive.label"]}.`);
    expect(plan.changes[0].scope).toBe("Executive");
    expect(plan.lines[0]).not.toMatch(/[→←]|\bتم\b/);
  });
  it("English unchanged except the product name", () => {
    const plan = planVerdict("too_formal", [{ ...t, source: "user" }], "Executive", ["Executive"], false);
    expect(plan.lines[0]).toContain("Change it on Your voice if you want it different.");
  });
});
