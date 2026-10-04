import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { effectiveLang, arabicPreviewOn } from "@/i18n";

const EN = en as Record<string, string>;
const AR = ar as Record<string, string>;
const PREFIXES = ["ob.", "cap."];
const AR_PLURALS = ["zero", "one", "two", "few", "many", "other"];
/** English spells the number as a word ({{number}}); Arabic shows the count. */
const PLACEHOLDER_EXEMPT = new Set(["ob.s10.p1", "ob.age.days", "ob.age.months"]);
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
      expect(vars(AR[`${b}_other`])).toContain("count");
      if (AR_WORD_FORMS.has(b)) continue;
    }
  });
});

describe("slider level tags", () => {
  it("Arabic matches Formation / Independence / Reference", () => {
    expect(AR["cap.band.developing"]).toBe("التكوين");
    expect(AR["cap.band.solid"]).toBe("الاستقلال");
    expect(AR["cap.band.strong"]).toBe("المرجعية");
  });
});

describe("?items=ar preview", () => {
  it("makes /onboarding Arabic only when on", () => {
    expect(effectiveLang("en", "/onboarding", true)).toBe("ar");
    expect(effectiveLang("en", "/onboarding", false)).toBe("en");
    expect(effectiveLang("ar", "/onboarding", false)).toBe("en");
  });
  it("covers /onboarding only", () => {
    expect(arabicPreviewOn("/", true)).toBe(false);
    expect(effectiveLang("en", "/admin", true)).toBe("en");
    expect(effectiveLang("en", "/auth", true)).toBe("en");
  });
});
