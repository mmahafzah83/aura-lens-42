import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FamilyEntry } from "./renderers";
import type { Lang } from "./renderers/shared";
import { logSignatureEvent } from "./logEvent";

export interface Suggestion {
  lines: string[];
  source: "profile" | "signal" | "voice";
}

/**
 * Fetches 3 AI suggestions for the current family + lang.
 * Never blocks the UI — returns [] on any failure so the editor's
 * default fields remain usable.
 */
export function useSuggestions(family: FamilyEntry | null, lang: Lang) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!family) return;
    const key = `${family.id}:${lang}`;
    if (lastKey.current === key && suggestions.length > 0) return;
    lastKey.current = key;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("signature-suggest", {
          body: { family: family.id, lang },
        });
        if (cancelled) return;
        const list: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(list);
        if (list.length && !error) {
          void logSignatureEvent("suggested", family.id, lang, { suggestions: list });
        }
      } catch (e) {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, lang]);

  return { suggestions, loading };
}