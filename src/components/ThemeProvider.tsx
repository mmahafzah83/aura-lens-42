import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AuraTheme = "nebula" | "prism" | "terrain";

const THEMES: Record<AuraTheme, Record<string, string>> = {
  nebula: {
    "--aura-bg": "#06060A",
    "--aura-card": "#0E1018",
    "--aura-card-glass": "rgba(255,255,255,0.03)",
    "--aura-border": "#1E2236",
    "--aura-t1": "#E4E8F4",
    "--aura-t2": "#7880A0",
    "--aura-t3": "#444D6B",
    "--aura-accent": "#FDCB6E",
    "--aura-accent2": "#A29BFE",
    "--aura-accent3": "#00CEC9",
    "--aura-positive": "#55EFC4",
    "--aura-negative": "#FF7675",
    "--aura-warning": "#FFEAA7",
    "--aura-blue": "#74B9FF",
    "--aura-purple": "#A29BFE",
    "--aura-pink": "#FD79A8",
    "--aura-font-heading": "'Space Grotesk', sans-serif",
  },
  prism: {
    "--aura-bg": "#FAF8F4",
    "--aura-card": "#FFFFFF",
    "--aura-card-glass": "#FFFFFF",
    "--aura-border": "#E5E0D5",
    "--aura-t1": "#1A1A14",
    "--aura-t2": "#6B6B5A",
    "--aura-t3": "#9A9A88",
    "--aura-accent": "#B08D3A",
    "--aura-accent2": "#3B82F6",
    "--aura-accent3": "#0D9488",
    "--aura-positive": "#059669",
    "--aura-negative": "#DC2626",
    "--aura-warning": "#D97706",
    "--aura-blue": "#3B82F6",
    "--aura-purple": "#7C3AED",
    "--aura-pink": "#EC4899",
    "--aura-font-heading": "'Playfair Display', serif",
  },
  terrain: {
    "--aura-bg": "#0B1A12",
    "--aura-card": "rgba(255,255,255,0.02)",
    "--aura-card-glass": "rgba(255,255,255,0.02)",
    "--aura-border": "rgba(74,222,128,0.1)",
    "--aura-t1": "#D4E7DC",
    "--aura-t2": "#5A8A6A",
    "--aura-t3": "#3D6B4E",
    "--aura-accent": "#4ADE80",
    "--aura-accent2": "#60A5FA",
    "--aura-accent3": "#FBBF24",
    "--aura-positive": "#86EFAC",
    "--aura-negative": "#F87171",
    "--aura-warning": "#FBBF24",
    "--aura-blue": "#60A5FA",
    "--aura-purple": "#A78BFA",
    "--aura-pink": "#F472B6",
    "--aura-font-heading": "'Outfit', sans-serif",
  },
};

export const THEME_LABELS: Record<AuraTheme, string> = {
  nebula: "Nebula",
  prism: "Prism",
  terrain: "Terrain",
};

export const THEME_SWATCHES: Record<AuraTheme, string> = {
  nebula: "linear-gradient(135deg,#06060A 0%,#A29BFE 60%,#FDCB6E 100%)",
  prism: "linear-gradient(135deg,#FAF8F4 0%,#B08D3A 60%,#3B82F6 100%)",
  terrain: "linear-gradient(135deg,#0B1A12 0%,#4ADE80 60%,#FBBF24 100%)",
};

function applyTheme(theme: AuraTheme) {
  const vars = THEMES[theme];
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-aura-theme", theme);
}

interface Ctx {
  theme: AuraTheme;
  setTheme: (t: AuraTheme) => Promise<void>;
}

const ThemeCtx = createContext<Ctx>({ theme: "nebula", setTheme: async () => {} });

export function useAuraTheme() {
  return useContext(ThemeCtx);
}

const LS_KEY = "aura-color-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AuraTheme>(() => {
    try {
      const t = localStorage.getItem(LS_KEY) as AuraTheme | null;
      if (t && THEMES[t]) return t;
    } catch {}
    return "nebula";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("theme_preference")
        .eq("user_id", user.id)
        .maybeSingle();
      const pref = (data?.theme_preference as AuraTheme | undefined);
      if (pref && THEMES[pref] && active) {
        setThemeState(pref);
        try { localStorage.setItem(LS_KEY, pref); } catch {}
      }
    })();
    return () => { active = false; };
  }, []);

  const setTheme = useCallback(async (t: AuraTheme) => {
    setThemeState(t);
    try { localStorage.setItem(LS_KEY, t); } catch {}
    applyTheme(t);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("diagnostic_profiles")
          .upsert({ user_id: user.id, theme_preference: t }, { onConflict: "user_id" });
      }
    } catch {}
  }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export default ThemeProvider;