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

function applyTokens(_tokens: DesignTokens, _theme: "dark" | "light"): void {
  // ── F-SWAP no-op ──────────────────────────────────────────────────────
  // System-A tokens (src/index.css) are the single effective source. This
  // hook previously wrote --brand / --bronze / sidebar / effect tokens onto
  // documentElement at runtime, which would override the new theme. The
  // file, the design_system table, AdminDesignSystem, and AdminExperience
  // are untouched — this hook simply stops driving the live theme.
  return;
}
// `resolve` is kept exported-free to preserve module shape; mark as
// intentionally unused so the no-unused-vars rule stays clean.
void resolve;

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