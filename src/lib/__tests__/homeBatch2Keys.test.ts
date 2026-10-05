import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

const PREFIXES = ["readHome.", "firstFlight.", "drift.", "liNudge.", "liStatus.", "editProfile.", "idTab.", "appear.", "mirror.", "brandRep.", "versions.", "viewer.", "country.", "pi.", "cr.", "acp.", "vws.", "ms.", "gj.", "dpc.", "ph.", "pc.", "msn.", "cl.", "acf.", "mirror.persona.", "pf.", "pm."];
const E = en as Record<string, string>;
const A = ar as Record<string, string>;

describe("Home batch 2 keys", () => {
  const keys = Object.keys(E).filter((k) => PREFIXES.some((p) => k.startsWith(p)));
  it("has keys", () => expect(keys.length).toBeGreaterThan(40));
  it("every key exists in both languages and Arabic carries no retired name or arrow", () => {
    for (const k of keys) {
      expect(A[k], k).toBeTruthy();
      expect(A[k]).not.toMatch(/Aura|→/);
      expect(E[k]).not.toMatch(/\bAura\b/);
    }
    /* Arabic has plural forms English lacks; those need the English _other. */
    for (const k of Object.keys(A).filter((k) => PREFIXES.some((p) => k.startsWith(p)))) {
      const en = /_(zero|two|few|many)$/.test(k) ? k.replace(/_(zero|two|few|many)$/, "_other") : k;
      expect(E[en], k).toBeTruthy();
    }
  });
});
