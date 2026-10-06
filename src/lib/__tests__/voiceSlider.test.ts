import { describe, expect, it } from "vitest";
import { sliderKeyValue, sliderValueFromX } from "@/lib/voiceSlider";
import { readinessSentence, type VoiceOverviewModel } from "@/lib/voiceOverview";
import type { VoiceTr } from "@/lib/voiceText";
import ar from "@/i18n/locales/ar.json";

const rect = { left: 100, width: 200 };

describe("spectrum slider", () => {
  it("LTR: left edge is low, right edge is high", () => {
    expect(sliderValueFromX(100, rect, false)).toBe(0);
    expect(sliderValueFromX(300, rect, false)).toBe(100);
    expect(sliderValueFromX(150, rect, false)).toBe(25);
  });
  it("RTL: right edge is low, left edge is high", () => {
    expect(sliderValueFromX(300, rect, true)).toBe(0);
    expect(sliderValueFromX(100, rect, true)).toBe(100);
    expect(sliderValueFromX(150, rect, true)).toBe(75);
  });
  it("clamps outside the rail and ignores a zero-width rail", () => {
    expect(sliderValueFromX(0, rect, true)).toBe(100);
    expect(sliderValueFromX(500, rect, false)).toBe(100);
    expect(sliderValueFromX(150, { left: 0, width: 0 }, false)).toBeNull();
  });
  it("arrow keys are mirrored in RTL", () => {
    expect(sliderKeyValue("ArrowRight", 50, false)).toBe(51);
    expect(sliderKeyValue("ArrowLeft", 50, false)).toBe(49);
    expect(sliderKeyValue("ArrowLeft", 50, true)).toBe(51);
    expect(sliderKeyValue("ArrowRight", 50, true)).toBe(49);
    expect(sliderKeyValue("ArrowUp", 50, true)).toBe(51);
    expect(sliderKeyValue("Home", 50, true)).toBe(0);
    expect(sliderKeyValue("End", 50, true)).toBe(100);
    expect(sliderKeyValue("PageUp", 95, true)).toBe(100);
    expect(sliderKeyValue("Tab", 50, true)).toBeNull();
  });
});

const dict = ar as Record<string, string>;
const tr: VoiceTr = {
  lang: "ar",
  t: (k, p = {}) => (dict[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => String(p[n] ?? "")),
};
const base = {
  corpusCount: 5, readiness: "forming", traits: [], topShare: null, topStyleKey: null, topStyleCount: null,
  diversity: null, windowClassified: 0, windowSize: 12, windowDist: {},
} as unknown as VoiceOverviewModel;

describe("readiness sentences", () => {
  it("zero posts", () => {
    expect(readinessSentence({ ...base, corpusCount: 0 }, tr)).toBe(dict["vo.rs.zero"]);
    expect(readinessSentence({ ...base, corpusCount: 0 })).toBe("KnownBy hasn't read anything you've written yet, so it has nothing to write from.");
  });
  it("forming carries the real count", () => {
    expect(readinessSentence(base, tr)).toBe(dict["vo.rs.forming"].replace("{{n}}", "5"));
    expect(readinessSentence(base)).toContain("KnownBy has read 5 of your posts.");
  });
  it("working with a low-confidence trait names it in Arabic", () => {
    const m = {
      ...base, corpusCount: 22, readiness: "working",
      traits: [{ computable: true, confidence: "low", display_name: "Warmth" }],
    } as unknown as VoiceOverviewModel;
    const out = readinessSentence(m, tr);
    expect(out).toContain("الدفء");
    expect(out).toContain("22");
    expect(out).not.toMatch(/Aura|Warmth/);
  });
});
