import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ThemeValue = string | { dark: string; light: string };

interface DesignTokens {
  colors?: Record<string, ThemeValue>;
  typography?: Record<string, string>;
  shadows?: Record<string, ThemeValue>;
  radii?: Record<string, string>;
}

function resolve(val: ThemeValue, theme: "dark" | "light"): string {
  if (val && typeof val === "object" && "dark" in val) return val[theme];
  return val as string;
}

function applyTokens(tokens: DesignTokens, theme: "dark" | "light") {
  const root = document.documentElement;
  const { colors = {}, typography = {}, shadows = {}, radii = {} } = tokens;

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