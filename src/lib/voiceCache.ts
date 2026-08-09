/**
 * One model per visit, not one per subpage.
 *
 * Voice & Writing has three subpages that read the same three database
 * functions. Without a cache, switching tabs re-ran `voice_window`,
 * `voice_opener_diversity` and `voice_top_style_share` every time. This holds
 * the in-flight promise so the second and third reader join the first.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Entry {
  promise: Promise<unknown>;
  at: number;
}

const TTL_MS = 60_000;
const store = new Map<string, Entry>();

/** Drop everything, or everything under one prefix, after a write. */
export function invalidateVoiceCache(prefix?: string) {
  if (!prefix) { store.clear(); return; }
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

export function cachedLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>;
  const promise = loader().catch((e) => { store.delete(key); throw e; });
  store.set(key, { promise, at: Date.now() });
  return promise;
}

export interface CachedState<T> {
  data: T | null;
  loading: boolean;
  /** A failure to read is not an empty result — the page must say which it is. */
  error: string | null;
  reload: (fresh?: boolean) => Promise<void>;
  set: (next: T) => void;
}

/**
 * `key` null means there is nothing to load (signed out, or a harness override).
 * `loader` is read from a ref, so an inline arrow does not re-trigger the fetch.
 */
export function useCachedVoice<T>(key: string | null, loader: () => Promise<T>): CachedState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(key));
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  /** Guards against an older response landing after a newer one. */
  const token = useRef(0);

  const reload = useCallback(async (fresh = false) => {
    if (!key) { setLoading(false); return; }
    const mine = ++token.current;
    setLoading(true);
    setError(null);
    if (fresh) invalidateVoiceCache(key);
    try {
      const next = await cachedLoad(key, () => loaderRef.current());
      if (mine !== token.current) return;
      setData(next);
    } catch (e) {
      if (mine !== token.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong reading your voice.");
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, loading, error, reload, set: setData };
}
