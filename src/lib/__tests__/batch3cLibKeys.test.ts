import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { scorePresence } from "@/lib/presenceHealth";
import { buildPresenceChange } from "@/lib/presenceChange";
import { classifyPublishError, publishFailureText } from "@/lib/publishFailure";
import { PERSONA_LABELS } from "@/lib/marketPersonas";

const A = ar as Record<string, string>;
const E = en as Record<string, string>;
const tAr = (k: string, p: Record<string, unknown> = {}) =>
  (A[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => String(p[n] ?? ""));

describe("presenceHealth keys", () => {
  const rows = scorePresence({ headline: "Director", about: "one two three", experience: [{ title: "x" }, { title: "y", description: "d" }], skills: ["a"], education: [] });
  it("returns keys and params", () => {
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.headline.factKey).toBe("ph.headline.fact");
    expect(by.headline.factParams).toEqual({ n: 8 });
    expect(by.headline.ruleKey).toBe("ph.headline.short");
    expect(by.about.ruleKey).toBe("ph.about.placeholder");
    expect(by.experience.factParams).toEqual({ a: 1, b: 2 });
    expect(by.experience.ruleParams).toEqual({ a: 1, b: 2 });
    expect(by.skills.ruleKey).toBe("ph.skills.few");
    expect(by.education.factKey).toBe("ph.education.none");
    expect(by.photo.factKey).toBe("ph.photo.none");
  });
  it("every key exists in both languages", () => {
    for (const r of rows) for (const k of [r.labelKey, r.factKey, r.ruleKey].filter(Boolean)) {
      expect(A[k], k).toBeTruthy(); expect(E[k], k).toBeTruthy();
    }
  });
});

describe("presenceChange Arabic", () => {
  it("uses whole patterns, no arrow", () => {
    const prev = scorePresence({ headline: "Director" });
    const cur = scorePresence({ headline: "Director of strategy" });
    const out = buildPresenceChange({ currentRows: cur, previousRows: prev, currentSum: 30, previousSum: 25, currentWord: "mixed", previousWord: "weak", lang: "ar", t: tAr });
    const text = out.map((s) => s.text).join("");
    expect(text).not.toMatch(/→/);
    expect(text).toContain("منذ آخر قراءة");
    expect(text).toContain("من 8 إلى 20");
  });
});

describe("publishFailure keys", () => {
  it.each([
    ["quality check failed", false, true, "pf.quality"],
    ["not connected", true, false, "pf.notConnected"],
    ["401", true, false, "pf.expired"],
    ["Failed to fetch", true, false, "pf.network"],
    ["boom", false, false, "pf.notReady"],
    ["boom", true, false, "pf.rejected"],
  ])("%s → %s", (raw, att, blk, key) => {
    const f = classifyPublishError(raw, att as boolean, blk as boolean);
    expect(f.messageKey).toBe(key);
    expect(A[key]).toBeTruthy();
    expect(E[key]).toBeTruthy();
  });
  it("English message unchanged; Arabic resolves with fallback", () => {
    const f = classifyPublishError("", false);
    expect(f.messageParams).toEqual({ text: "" });
    expect(publishFailureText(f, "en", tAr)).toBe(f.message);
    expect(publishFailureText(f, "ar", tAr)).toBe("تعذّر تجهيز منشورك للإرسال. حاول مرة أخرى. مسودتك محفوظة.");
    expect(classifyPublishError("x", false, true).message).not.toMatch(/Aura/);
  });
});

describe("persona labels", () => {
  it("every tab label and gap noun has Arabic", () => {
    for (const set of Object.values(PERSONA_LABELS)) for (const l of Object.values(set)) {
      expect(A[`mirror.persona.${l}`], l).toBeTruthy();
    }
  });
});
