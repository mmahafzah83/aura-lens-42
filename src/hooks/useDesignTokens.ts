import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ThemeValue = string | { dark: string; light: string };

interface DesignTokens {
  colors?: Record<string, ThemeValue>;
  typography?: Record<string, string>;
  shadows?: Record<string, ThemeValue>;
  radii?: Record<string, string>;
  sidebar?: Record<string, ThemeValue>;
  effects?: Record<string, ThemeValue | boolean | { dark: boolean | string; light: boolean | string }>;
}

function resolve(val: ThemeValue, theme: "dark" | "light"): string {
  if (val && typeof val === "object" && "dark" in val) return val[theme];
  return val as string;
}

function applyTokens(tokens: DesignTokens, theme: "dark" | "light") {
  const root = document.documentElement;
  const { colors = {}, typography = {}, shadows = {}, radii = {}, sidebar = {}, effects = {} } = tokens;

  // Colors → --<key with - instead of _>
  Object.entries(colors).forEach(([key, val]) => {
    const cssKey = `--${key.replace(/_/g, "-")}`;
    root.style.setProperty(cssKey, resolve(val, theme));
  });

  // Backward-compatibility aliases so existing var(--brand), var(--bronze), etc. keep working.
  const brand = colors.brand ? resolve(colors.brand, theme) : null;
  const brandDeep = colors.brand_deep ? resolve(colors.brand_deep, theme) : null;
  const brandSurface = colors.brand_surface ? resolve(colors.brand_surface, theme) : null;
  const brandLine = colors.brand_line ? resolve(colors.brand_line, theme) : null;
  const brandGlow = colors.brand_glow ? resolve(colors.brand_glow, theme) : null;

  if (brand) {
    root.style.setProperty("--brand", brand);
    root.style.setProperty("--bronze", brand);
  }
  if (brandDeep) {
    root.style.setProperty("--brand-hover", brandDeep);
    root.style.setProperty("--bronze-deep", brandDeep);
  }
  if (brandSurface) {
    root.style.setProperty("--brand-pale", brandSurface);
    root.style.setProperty("--bronze-pale", brandSurface);
    root.style.setProperty("--bronze-mist", brandSurface);
  }
  if (brandLine) {
    root.style.setProperty("--brand-muted", brandLine);
    root.style.setProperty("--bronze-line", brandLine);
  }
  if (brandGlow) {
    root.style.setProperty("--bronze-glow", brandGlow);
  }

  // Typography
  if (typography.display) root.style.setProperty("--font-display", typography.display);
  if (typography.body) root.style.setProperty("--font-body", typography.body);
  if (typography.arabic) root.style.setProperty("--font-arabic", typography.arabic);
  if (typography.mono) root.style.setProperty("--font-mono", typography.mono);

  // Shadows
  Object.entries(shadows).forEach(([key, val]) => {
    root.style.setProperty(`--shadow-${key.replace(/_/g, "-")}`, resolve(val, theme));
  });

  // Radii
  Object.entries(radii).forEach(([key, val]) => {
    root.style.setProperty(`--radius-${key}`, val);
  });

  // ── Sidebar tokens ── (active bar, active bg, hover bg)
  // Fallbacks keep bronze defaults so UI never breaks if tokens missing.
  const sidebarFallbacks: Record<string, string> = {
    "active-bar":
      (colors.brand && resolve(colors.brand, theme)) || "var(--brand)",
    "active-bg":
      (colors.brand_surface && resolve(colors.brand_surface, theme)) ||
      "var(--brand-surface)",
    "hover-bg":
      (colors.brand_ghost && resolve(colors.brand_ghost as ThemeValue, theme)) ||
      "var(--brand-ghost)",
  };
  Object.entries(sidebarFallbacks).forEach(([key, fallback]) => {
    const tokenVal = sidebar[key] as ThemeValue | undefined;
    const value = tokenVal != null ? resolve(tokenVal, theme) : fallback;
    root.style.setProperty(`--sidebar-${key}`, value);
  });

  // Derive --brand-rgb from --brand hex (used for inset glow alpha)
  const brandHex = colors.brand ? resolve(colors.brand, theme) : null;
  if (brandHex && /^#?[0-9a-fA-F]{6}$/.test(brandHex.replace("#", ""))) {
    const h = brandHex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    root.style.setProperty("--brand-rgb", `${r}, ${g}, ${b}`);
  } else if (!getComputedStyle(root).getPropertyValue("--brand-rgb").trim()) {
    // Bronze fallback (#C5A55A)
    root.style.setProperty("--brand-rgb", "197, 165, 90");
  }

  // ── Grain effect ──
  const grainEnabledRaw = effects.grain_enabled as
    | { dark: boolean | string; light: boolean | string }
    | boolean
    | undefined;
  let grainEnabled = true;
  if (typeof grainEnabledRaw === "boolean") grainEnabled = grainEnabledRaw;
  else if (grainEnabledRaw && typeof grainEnabledRaw === "object") {
    const v = grainEnabledRaw[theme];
    grainEnabled = v === true || v === "true";
  }
  const grainOpacityRaw = effects.grain_opacity as ThemeValue | undefined;
  const grainOpacity = grainOpacityRaw
    ? resolve(grainOpacityRaw, theme)
    : theme === "dark"
    ? "0.06"
    : "0.04";
  root.style.setProperty("--grain-opacity", grainEnabled ? grainOpacity : "0");

  // ── Effect flags as data-attributes on <html> ──
  // Defaults to ON when token missing, so polish ships even if DB row not extended.
  const flagOn = (key: string, fallback = true): boolean => {
    const raw = effects[key];
    if (raw == null) return fallback;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") return raw === "true";
    if (typeof raw === "object" && (theme in (raw as object))) {
      const v = (raw as Record<string, unknown>)[theme];
      return v === true || v === "true";
    }
    return fallback;
  };
  const setFlag = (attr: string, on: boolean) => {
    if (on) root.setAttribute(attr, "true");
    else root.removeAttribute(attr);
  };
  setFlag("data-fx-card-hover", flagOn("card_hover_lift"));
  setFlag("data-fx-card-entry", flagOn("card_entry_animation"));
  setFlag("data-fx-pulse", flagOn("pulse_indicators"));
  setFlag("data-fx-tab-slider", flagOn("tab_slider"));
}

let cachedTokens: DesignTokens | null = null;
let inflight: Promise<DesignTokens | null> | null = null;

async function loadTokens(): Promise<DesignTokens | null> {
  if (cachedTokens) return cachedTokens;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("design_system")
        .select("tokens")
        .eq("scope", "global")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      cachedTokens = (data?.tokens as DesignTokens) || null;
      return cachedTokens;
    } catch (e) {
      console.warn("[useDesignTokens] failed to load:", e);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useDesignTokens(theme: "dark" | "light") {
  const [tokens, setTokens] = useState<DesignTokens | null>(cachedTokens);
  const [loading, setLoading] = useState(!cachedTokens);
  const [error, setError] = useState<unknown>(null);

  // Fetch once
  useEffect(() => {
    let cancelled = false;
    if (cachedTokens) {
      setTokens(cachedTokens);
      setLoading(false);
      return;
    }
    loadTokens()
      .then((t) => {
        if (cancelled) return;
        setTokens(t);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-apply on tokens or theme change
  useEffect(() => {
    if (tokens) applyTokens(tokens, theme);
  }, [tokens, theme]);

  return { tokens, loading, error };
}