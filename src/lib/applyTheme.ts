/**
 * Shared theme application.
 * Mirrors what Dashboard has used since launch so every route that mounts
 * outside Dashboard (e.g. /onboarding) can honour the user's saved preference.
 */
export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "aura-theme";

export const applyThemeToRoot = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.remove("light", "dark");
  root.classList.add(theme);
};

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "light";
};

/** One-shot: read stored preference and apply. Safe to call on every mount. */
export const initThemeFromStorage = (): ThemeMode => {
  const t = getStoredTheme();
  try { applyThemeToRoot(t); } catch { /* SSR / restricted env */ }
  return t;
};