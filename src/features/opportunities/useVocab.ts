import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * ONE VOCABULARY. Every label word on an opportunity screen comes from
 * public.oe_vocabulary, in both languages. No component holds its own map.
 */
export type VocabMap = Record<string, { en: string; ar: string }>;

let cache: VocabMap | null = null;
let inflight: Promise<VocabMap> | null = null;

async function load(): Promise<VocabMap> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await (supabase.from("oe_vocabulary" as any) as any).select("key, en, ar");
      const map: VocabMap = {};
      for (const row of data ?? []) map[String(row.key)] = { en: String(row.en), ar: String(row.ar) };
      cache = map;
      return map;
    })();
  }
  return inflight;
}

export type Vocab = (key: string, lang?: "en" | "ar") => string;

export function useVocab(language: "en" | "ar"): Vocab {
  const [map, setMap] = useState<VocabMap>(cache ?? {});
  useEffect(() => {
    let live = true;
    void load().then((m) => { if (live) setMap(m); });
    return () => { live = false; };
  }, []);
  return (key: string, lang: "en" | "ar" = language) => map[key]?.[lang] ?? "";
}

export const chairKey = (chairType?: string | null) => `chair_${String(chairType ?? "").trim()}`;
export const bandKey = (band?: string | null) => `fit_${String(band ?? "stretch").trim()}`;
