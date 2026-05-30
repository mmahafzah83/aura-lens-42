import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GuideArticle {
  slug: string;
  tab: string | null;
  category: string | null;
  question_en: string;
  answer_en: string;
  formula_note_en: string | null;
  related_terms: string[] | null;
  surfaces: string[] | null;
  sort_order: number | null;
}

interface Options {
  tab?: string;
  surface?: string;
  /** When true, bypass cache and fetch fresh on mount. */
  forceFresh?: boolean;
}

// Shared module-level cache (keyed by tab+surface) with TTL so guide content
// edits propagate across the app without a hard reload.
const TTL_MS = 5 * 60 * 1000;
type Entry = { data: GuideArticle[]; ts: number; promise?: Promise<GuideArticle[]> };
const _cache: Map<string, Entry> = new Map();
const _subs: Map<string, Set<(d: GuideArticle[]) => void>> = new Map();

function cacheKey(tab?: string, surface?: string) {
  return `${tab ?? ""}|${surface ?? ""}`;
}

async function fetchArticles(tab?: string, surface?: string): Promise<GuideArticle[]> {
  let q = supabase
    .from("guide_articles")
    .select("slug,tab,category,question_en,answer_en,formula_note_en,related_terms,surfaces,sort_order")
    .order("sort_order", { ascending: true });
  if (tab) q = q.eq("tab", tab);
  if (surface) q = q.contains("surfaces", [surface]);
  const { data, error } = await q;
  if (error) throw error;
  return (data as GuideArticle[]) || [];
}

function notify(key: string, data: GuideArticle[]) {
  const set = _subs.get(key);
  if (set) set.forEach((fn) => fn(data));
}

function ensureFetch(key: string, tab?: string, surface?: string): Promise<GuideArticle[]> {
  const existing = _cache.get(key);
  if (existing?.promise) return existing.promise;
  const p = fetchArticles(tab, surface).then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    notify(key, data);
    return data;
  }).catch((e) => {
    const cur = _cache.get(key);
    if (cur) _cache.set(key, { data: cur.data, ts: cur.ts });
    throw e;
  });
  _cache.set(key, { data: existing?.data ?? [], ts: existing?.ts ?? 0, promise: p });
  // Clear promise marker on settle
  p.finally(() => {
    const cur = _cache.get(key);
    if (cur) _cache.set(key, { data: cur.data, ts: cur.ts });
  });
  return p;
}

export function useGuideArticles({ tab, surface, forceFresh }: Options = {}) {
  const key = cacheKey(tab, surface);
  const cached = _cache.get(key);
  const [articles, setArticles] = useState<GuideArticle[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached || cached.data.length === 0);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    ensureFetch(key, tab, surface)
      .then((data) => setArticles(data))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [key, tab, surface]);

  useEffect(() => {
    let cancelled = false;
    const sub = (data: GuideArticle[]) => { if (!cancelled) setArticles(data); };
    if (!_subs.has(key)) _subs.set(key, new Set());
    _subs.get(key)!.add(sub);

    const cur = _cache.get(key);
    const fresh = cur && Date.now() - cur.ts < TTL_MS && cur.data.length > 0;
    if (cur && cur.data.length > 0) {
      setArticles(cur.data);
      setLoading(false);
    }
    if (!fresh || forceFresh) {
      ensureFetch(key, tab, surface)
        .then((data) => { if (!cancelled) { setArticles(data); setError(null); } })
        .catch((e) => { if (!cancelled) setError(e); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => {
      cancelled = true;
      _subs.get(key)?.delete(sub);
    };
  }, [key, tab, surface, forceFresh]);

  return { articles, loading, error, refetch };
}

export default useGuideArticles;