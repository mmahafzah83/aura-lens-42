import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PageBackgroundConfig {
  imageUrl: string | null;
  gradientOverlay: string | null;
  tintColor: string | null;
  opacity: number;
  position: string;
  enabled: boolean;
  loading: boolean;
}

const cache = new Map<string, PageBackgroundConfig>();
const inflight = new Map<string, Promise<PageBackgroundConfig>>();

async function fetchConfig(pageKey: string, theme: "dark" | "light"): Promise<PageBackgroundConfig> {
  const cacheKey = `${pageKey}:${theme}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;

  const p = (async () => {
    let cfg: PageBackgroundConfig = {
      imageUrl: null,
      gradientOverlay: null,
      tintColor: null,
      opacity: 0.07,
      position: "center",
      enabled: false,
      loading: false,
    };
    try {
      const { data } = await supabase
        .from("page_backgrounds")
        .select("*")
        .eq("page_key", pageKey)
        .in("theme", ["both", theme])
        .eq("enabled", true)
        .order("theme", { ascending: false }) // theme-specific wins over 'both'
        .limit(1)
        .maybeSingle();
      if (data) {
        cfg = {
          imageUrl: data.image_url ?? null,
          gradientOverlay: data.gradient_overlay ?? null,
          tintColor: data.tint_color ?? null,
          opacity: data.opacity != null ? Number(data.opacity) : 0.07,
          position: data.position ?? "center",
          enabled: data.enabled ?? false,
          loading: false,
        };
      }
    } catch {
      // swallow — dormant by default
    }
    cache.set(cacheKey, cfg);
    inflight.delete(cacheKey);
    return cfg;
  })();
  inflight.set(cacheKey, p);
  return p;
}

export function usePageBackground(pageKey: string, theme: "dark" | "light"): PageBackgroundConfig {
  const cacheKey = `${pageKey}:${theme}`;
  const [cfg, setCfg] = useState<PageBackgroundConfig>(
    () =>
      cache.get(cacheKey) ?? {
        imageUrl: null,
        gradientOverlay: null,
        tintColor: null,
        opacity: 0.07,
        position: "center",
        enabled: false,
        loading: true,
      }
  );

  useEffect(() => {
    let cancelled = false;
    if (cache.has(cacheKey)) {
      setCfg(cache.get(cacheKey)!);
      return;
    }
    fetchConfig(pageKey, theme).then((c) => {
      if (!cancelled) setCfg(c);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, pageKey, theme]);

  return cfg;
}