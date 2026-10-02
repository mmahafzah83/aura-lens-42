import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

export type UiLang = "en" | "ar";
export const dateLocale = (lang: UiLang): string =>
  lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";

/** Wraps a Latin value (email, address, time) in left-to-right isolate marks so it
 *  keeps its order inside an Arabic sentence. Invisible in English. */
export const ltrIsolate = (v: string | null | undefined): string =>
  v ? `\u2066${v}\u2069` : (v ?? "");

export const UI_LANG_KEY = "kb_ui_lang";

/** Set when a signed-out visitor picks a language; the first sign-in copies it to the profile once. */
export const UI_LANG_PENDING_KEY = "kb_ui_lang_pending";

/**
 * Browser-language detection. OFF until the landing page and the journey are
 * Arabic-ready — turn on then, so an Arabic browser is not sent into English pages.
 */
export const AUTO_DETECT_BROWSER_LANG = false;

/** The one registry of routes whose text exists in Arabic. Everything else renders English, LTR. */
export const ARABIC_READY_ROUTES: (string | RegExp)[] = [
  "/home", "/dashboard", "/opportunities", "/settings",
  "/auth", "/login", "/request-access", "/accept-invitation",
];

const normPath = (pathname: string): string => {
  let p = (pathname || "/").split(/[?#]/)[0] || "/";
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return p;
};

export function isArabicReadyRoute(pathname: string): boolean {
  const p = normPath(pathname);
  if (p === "/admin" || p.startsWith("/admin/")) return false;
  return ARABIC_READY_ROUTES.some((r) =>
    typeof r === "string" ? p === r || p.startsWith(`${r}/`) : r.test(p),
  );
}

/** The language a route actually renders in: the choice on ready routes, English elsewhere and on /admin. */
export function effectiveLang(chosen: UiLang, pathname: string): UiLang {
  return chosen === "ar" && isArabicReadyRoute(pathname) ? "ar" : "en";
}

const parseLang = (v: string | null | undefined): UiLang | null =>
  v === "ar" || v === "en" ? v : null;

/** Order when nothing is stored: ?lang= → browser language (only when detection is on) → English. */
export function resolveInitialLang(input: {
  stored: string | null;
  urlParam: string | null;
  navigatorLangs: readonly string[];
  autoDetect: boolean;
}): { lang: UiLang; source: "stored" | "url" | "browser" | "default" } {
  const stored = parseLang(input.stored);
  if (stored) return { lang: stored, source: "stored" };
  const url = parseLang(input.urlParam);
  if (url) return { lang: url, source: "url" };
  if (input.autoDetect && (input.navigatorLangs[0] || "").toLowerCase().startsWith("ar")) {
    return { lang: "ar", source: "browser" };
  }
  return { lang: "en", source: "default" };
}

/** At sign-in: a pending visitor choice wins once; otherwise the profile wins (today's rule). */
export function resolveSignInLang(input: {
  pending: boolean;
  browser: UiLang;
  profile: string | null | undefined;
}): { lang: UiLang | null; writeProfile: boolean } {
  if (input.pending) return { lang: input.browser, writeProfile: true };
  return { lang: parseLang(input.profile), writeProfile: false };
}

export function readStoredLang(): UiLang {
  try {
    return localStorage.getItem(UI_LANG_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function storeLang(lang: UiLang) {
  try { localStorage.setItem(UI_LANG_KEY, lang); } catch { /* ignore */ }
}

export function readPending(): boolean {
  try { return localStorage.getItem(UI_LANG_PENDING_KEY) === "1"; } catch { return false; }
}
export function setPending(on: boolean) {
  try { on ? localStorage.setItem(UI_LANG_PENDING_KEY, "1") : localStorage.removeItem(UI_LANG_PENDING_KEY); } catch { /* ignore */ }
}

/** Runs once before first paint: applies ?lang= / detection when nothing is stored, and strips ?lang from the address bar. */
export function initLangFromUrl() {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("lang");
    const r = resolveInitialLang({
      stored: localStorage.getItem(UI_LANG_KEY),
      urlParam: param,
      navigatorLangs: navigator.languages ?? [navigator.language],
      autoDetect: AUTO_DETECT_BROWSER_LANG,
    });
    if (r.source === "url" || r.source === "browser") storeLang(r.lang);
    if (r.source === "url") setPending(true);
    if (param !== null) {
      url.searchParams.delete("lang");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch { /* ignore */ }
}

/** Sets lang/dir on <html> to the effective language for the route. */
export function applyDocumentLang(lang: UiLang, pathname = window.location.pathname) {
  const eff = effectiveLang(lang, pathname);
  document.documentElement.lang = eff;
  document.documentElement.dir = eff === "ar" ? "rtl" : "ltr";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: effectiveLang(readStoredLang(), window.location.pathname),
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
