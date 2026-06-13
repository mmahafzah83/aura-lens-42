import { useEffect, useState } from "react";

// One-character flip to re-enable celebrations later: change DEFAULT_MUTED to false.
// Persisted per-browser via localStorage("aura_celebrations_muted").
const DEFAULT_MUTED = true;
const KEY = "aura_celebrations_muted";

function readMuted(): boolean {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (v === null) return DEFAULT_MUTED;
    return v === "true" || v === "1";
  } catch {
    return DEFAULT_MUTED;
  }
}

/**
 * Returns { enabled, muted } where enabled === !muted.
 * Gate point for every celebration surface (tier ceremony, milestone toast,
 * score-jump banner, milestone share buttons). Does NOT affect milestone
 * writes or reads against user_milestones.
 */
export function useCelebrationsEnabled() {
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMuted(readMuted());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { enabled: !muted, muted };
}

export default useCelebrationsEnabled;