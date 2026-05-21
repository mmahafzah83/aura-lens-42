import { useEffect, ReactNode } from "react";

/**
 * Aura ships ONE visual identity — warm parchment + bronze.
 * Light / dark switching lives in Dashboard (data-theme + .dark class).
 * This provider only clears legacy theme-selector keys so users who had
 * Nebula / Prism / Terrain selected don't see broken styles on next load.
 */
const LEGACY_KEYS = [
  "aura-color-theme",
  "color-theme",
  "selected-theme",
  "theme-preference",
  "aura-theme-name",
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    try {
      LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
      // Also strip any stale aura color-theme variables that older builds set inline.
      const root = document.documentElement;
      root.removeAttribute("data-aura-theme");
    } catch {}
  }, []);

  return <>{children}</>;
}

export default ThemeProvider;