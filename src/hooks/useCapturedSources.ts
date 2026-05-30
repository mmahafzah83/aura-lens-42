import { useCallback, useEffect, useState } from "react";

// Session-scoped tracker of source keys the user has already captured this
// session. Backed by sessionStorage so the captured-state survives the
// existing daily caches and re-renders, but resets when the tab closes.

const STORAGE_KEY = "aura_captured_sources";
const EVENT_NAME = "aura:captured-sources-changed";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function useCapturedSources() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const markCaptured = useCallback((key: string | null | undefined) => {
    if (!key) return;
    const normalized = key.trim();
    if (!normalized) return;
    const set = readSet();
    if (set.has(normalized)) return;
    set.add(normalized);
    writeSet(set);
  }, []);

  const isCaptured = useCallback(
    (key: string | null | undefined): boolean => {
      if (!key) return false;
      const normalized = key.trim();
      if (!normalized) return false;
      // touch `version` so React re-renders consumers when the set changes
      void version;
      return readSet().has(normalized);
    },
    [version],
  );

  return { markCaptured, isCaptured };
}