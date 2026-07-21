import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FamilyEntry } from "./renderers";
import type { Lang } from "./renderers/shared";
import { logSignatureEvent } from "./logEvent";

export interface Suggestion {
  lines: string[];
  source: "profile" | "signal" | "voice";
}

export type SuggestSource = "profile" | "signal" | "voice";

/**
 * Fetches 3 AI suggestions for the current family + lang.
 * Never blocks the UI — returns [] on any failure so the editor's
 * default fields remain usable. Supports regenerate with a fresh
 * nonce and an optional `prefer` bias.
 */
export function useSuggestions(family: FamilyEntry | null, lang: Lang) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef<string>("");
  const cancelRef = useRef(false);

  const fetchOnce = useCallback(async (opts: { prefer?: SuggestSource[]; nonce?: number; regenerated?: boolean } = {}) => {
    if (!family) return;
    cancelRef.current = false;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("signature-suggest", {
        body: { family: family.id, lang, prefer: opts.prefer, nonce: opts.nonce ?? Date.now() },
      });
      if (cancelRef.current) return;
      const list: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setSuggestions(list);
      if (list.length && !error) {
        void logSignatureEvent("suggested", family.id, lang, {
          suggestions: list,
          regenerated: !!opts.regenerated,
          prefer: opts.prefer ?? null,
        });
      }
    } catch {
      if (!cancelRef.current) setSuggestions([]);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [family, lang]);

  useEffect(() => {
    if (!family) return;
    const key = `${family.id}:${lang}`;
    if (lastKey.current === key && suggestions.length > 0) return;
    lastKey.current = key;
    void fetchOnce({});
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, lang]);

  const regenerate = useCallback((prefer?: SuggestSource[]) => {
    return fetchOnce({ prefer, nonce: Date.now(), regenerated: true });
  }, [fetchOnce]);

  return { suggestions, loading, regenerate };
}