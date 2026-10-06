import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { effectiveLang, arabicPreviewOn } from "@/i18n";

const EN = en as Record<string, string>;
const AR = ar as Record<string, string>;
const PREFIXES = ["ob.", "cap."];
const AR_PLURALS = ["zero", "one", "two", "few", "many", "other"];
const PLACEHOLDER_EXEMPT = new Set([
  "ob.s10.p1", // Arabic drops the count on purpose
  "ob.s9.flat.body", // Arabic drops the count on purpose
  "ob.s1.recs.readAll", // Arabic drops the count on purpose
  "ob.s0.steps", // Arabic drops the count on purpose
  "ob.age.days", "ob.age.months",
]);
/** English-only for now: falls back to English until the Arabic is written. */
const EN_ONLY = new Set([
  "ob.s1.connectAfterAccount", "ob.s1.connectNote.sameTab", "ob.s1.connectNote.blocked",
  "ob.s1.connectNote.unfinished", "ob.s1.connectNote.domain", "ob.s5.linkError.https", "ob.resume.bannerDone",
]);
/** Arabic-only: English keeps its rotating placeholders. */
const AR_ONLY = new Set(["ob.q.placeholderAr"]);

const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, "");
const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const inScope = (k: string) => PREFIXES.some((p) => k.startsWith(p));

const enBases = new Set(Object.keys(EN).filter(inScope).map(base));
const arBases = new Set(Object.keys(AR).filter(inScope).map(base));

describe("onboarding slider and question keys", () => {
  it("every English key has Arabic, and the reverse", () => {
    expect([...enBases].filter((k) => !arBases.has(k) && !EN_ONLY.has(k))).toEqual([]);
    expect([...arBases].filter((k) => !enBases.has(k) && !AR_ONLY.has(k))).toEqual([]);
  });

  it("placeholders match", () => {
    for (const k of Object.keys(AR).filter(inScope)) {
      const b = base(k);
      if (PLACEHOLDER_EXEMPT.has(b) || AR_ONLY.has(b)) continue;
      const e = EN[k] ?? EN[`${b}_other`] ?? EN[b];
      expect(vars(AR[k]), k).toEqual(vars(e));
    }
  });

  it("counted keys carry all six Arabic forms and both English forms", () => {
    for (const b of enBases) {
      const counted = `${b}_other` in EN;
      if (!counted) continue;
      const AR_WORD_FORMS = new Set(["ob.age.days", "ob.age.months"]);
      for (const f of AR_PLURALS) expect(`${b}_${f}` in AR, `${b}_${f}`).toBe(true);
      expect(`${b}_one` in EN).toBe(true);
      if (!PLACEHOLDER_EXEMPT.has(b)) expect(vars(AR[`${b}_other`])).toContain("count");
      if (AR_WORD_FORMS.has(b)) continue;
    }
  });
});

describe("slider level tags", () => {
  it("Arabic matches Formation / Independence / Reference", () => {
    expect(AR["cap.band.developing"]).toBe("مشارك");
    expect(AR["cap.band.solid"]).toBe("مستقل");
    expect(AR["cap.band.strong"]).toBe("مرجع");
  });
});

describe("?items=ar preview", () => {
  it("/onboarding follows the stored choice; the preview still forces Arabic", () => {
    expect(effectiveLang("en", "/onboarding", true)).toBe("ar");
    expect(effectiveLang("en", "/onboarding", false)).toBe("en");
    expect(effectiveLang("ar", "/onboarding", false)).toBe("ar");
  });
  it("covers /onboarding only", () => {
    expect(arabicPreviewOn("/", true)).toBe(false);
    expect(effectiveLang("en", "/admin", true)).toBe("en");
    expect(effectiveLang("en", "/auth", true)).toBe("en");
  });
});

describe("reveal provenance", () => {
  it("English is unchanged; Arabic uses counts after a colon", async () => {
    const { toRevealData } = await import("@/lib/marketRead");
    const r = { primary_archetype: "X", content_pillars: ["a"] };
    const sources = { posts: 3, saved: 1, answers: 9, sliders: 8 };
    const en = toRevealData(r, { sources })!;
    expect(en.provenance).toEqual({
      read: "From your profile, 3 of your posts, 1 thing you saved, and your own answers.",
      subjects: "From 1 thing you saved and 3 of your posts.",
      softGround: "From your own 9 answers and 8 sliders you moved.",
    });
    const ar = toRevealData(r, { sources, lang: "ar" })!;
    expect(ar.provenance).toEqual({
      read: "من صفحتك، ومن منشوراتك: 3، ومما حفظته: 1، ومن إجاباتك.",
      subjects: "مما حفظته: 1 · من منشوراتك: 3",
      softGround: "من إجاباتك: 9 · من تقييمك لنفسك: 8",
    });
    expect(toRevealData(r, { lang: "ar" })!.provenance.read).toBe("من صفحتك.");
    expect(toRevealData({ content_pillars: ["a"] }, { lang: "ar" })!.archetype).toBe("ملفك");
    expect(toRevealData({ content_pillars: ["a"] })!.archetype).toBe("Your read");
  });
});
