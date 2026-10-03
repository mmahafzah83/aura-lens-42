import { describe, it, expect } from "vitest";
import { effectiveLang, resolveInitialLang, resolveSignInLang } from "@/i18n";

describe("effectiveLang", () => {
  it("admin is always English", () => {
    expect(effectiveLang("ar", "/admin")).toBe("en");
    expect(effectiveLang("ar", "/admin/journey")).toBe("en");
  });
  it("ready routes honour the choice", () => {
    expect(effectiveLang("ar", "/auth")).toBe("ar");
    expect(effectiveLang("ar", "/settings/profile")).toBe("ar");
    expect(effectiveLang("ar", "/home/")).toBe("ar");
    expect(effectiveLang("ar", "/auth?lang=ar")).toBe("ar");
    expect(effectiveLang("en", "/auth")).toBe("en");
  });
  it("not-ready routes are English", () => {
    expect(effectiveLang("ar", "/")).toBe("en");
    expect(effectiveLang("ar", "/assessment")).toBe("ar");
    expect(effectiveLang("ar", "/onboarding?x=1")).toBe("en");
    expect(effectiveLang("ar", "/authx")).toBe("en");
  });
});

describe("resolveInitialLang", () => {
  const base = { stored: null, urlParam: null, navigatorLangs: ["ar-SA"], autoDetect: false };
  it("stored wins", () => expect(resolveInitialLang({ ...base, stored: "en", urlParam: "ar" }).lang).toBe("en"));
  it("url next", () => expect(resolveInitialLang({ ...base, urlParam: "ar" })).toEqual({ lang: "ar", source: "url" }));
  it("detection off → en", () => expect(resolveInitialLang(base)).toEqual({ lang: "en", source: "default" }));
  it("detection on → ar", () => expect(resolveInitialLang({ ...base, autoDetect: true })).toEqual({ lang: "ar", source: "browser" }));
  it("detection on, English browser → en", () => expect(resolveInitialLang({ ...base, autoDetect: true, navigatorLangs: ["en-GB", "ar"] }).lang).toBe("en"));
  it("bad url param ignored", () => expect(resolveInitialLang({ ...base, urlParam: "fr" }).lang).toBe("en"));
});

describe("resolveSignInLang", () => {
  it("pending wins and asks for a profile write", () =>
    expect(resolveSignInLang({ pending: true, browser: "ar", profile: "en" })).toEqual({ lang: "ar", writeProfile: true }));
  it("no pending → profile wins", () =>
    expect(resolveSignInLang({ pending: false, browser: "ar", profile: "en" })).toEqual({ lang: "en", writeProfile: false }));
  it("no pending, no profile value → no change", () =>
    expect(resolveSignInLang({ pending: false, browser: "ar", profile: null })).toEqual({ lang: null, writeProfile: false }));
});
