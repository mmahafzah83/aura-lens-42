import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

export type UiLang = "en" | "ar";
export const dateLocale = (lang: UiLang): string =>
  lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";

export const UI_LANG_KEY = "kb_ui_lang";

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

/** Sets lang/dir on <html>. /admin always stays English, left to right. */
export function applyDocumentLang(lang: UiLang, pathname = window.location.pathname) {
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const eff: UiLang = admin ? "en" : lang;
  document.documentElement.lang = eff;
  document.documentElement.dir = eff === "ar" ? "rtl" : "ltr";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: readStoredLang(),
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
