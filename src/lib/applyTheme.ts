/**
 * Shared theme application.
 * Mirrors what Dashboard has used since launch so every route that mounts
 * outside Dashboard (e.g. /onboarding) can honour the user's saved preference.
 */
export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "aura-theme";

/**
 * Theme switching has been retired. Aura now ships a single System-A palette
 * driven by :root tokens in index.css. These exports remain as no-ops so any
 * lingering call sites compile, and we opportunistically clear the legacy
 * storage key + any stale data-theme attribute.
 */
const cleanupLegacy = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("light", "dark");
  } catch { /* SSR / restricted env */ }
};

export const applyThemeToRoot = (_theme: ThemeMode) => { cleanupLegacy(); };
export const getStoredTheme = (): ThemeMode => "light";
export const initThemeFromStorage = (): ThemeMode => { cleanupLegacy(); return "light"; };