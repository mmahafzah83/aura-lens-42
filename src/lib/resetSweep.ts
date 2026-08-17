/**
 * A reset on the server must never leave a stale journey in the browser.
 *
 * `public.reset_journey()` stamps `diagnostic_profiles.journey_reset_at`. Every
 * authenticated boot path compares that stamp against the local marker
 * `aura_reset_seen`; when the server is newer (or the marker is missing while a
 * reset exists) every `aura_`-prefixed key in localStorage and sessionStorage is
 * removed, so the app can never boot into a state no real member is ever in.
 *
 * Returns true when a sweep happened.
 */
export function sweepIfServerReset(journeyResetAt: string | null | undefined): boolean {
  if (!journeyResetAt) return false;
  let seen: string | null = null;
  try { seen = localStorage.getItem("aura_reset_seen"); } catch { return false; }

  const serverMs = new Date(journeyResetAt).getTime();
  if (!Number.isFinite(serverMs)) return false;
  const seenMs = seen ? new Date(seen).getTime() : NaN;
  const newer = !seen || !Number.isFinite(seenMs) || serverMs > seenMs;
  if (!newer) return false;

  const sweep = (store: Storage) => {
    let keys: string[] = [];
    try { keys = Object.keys(store); } catch { return; }
    for (const k of keys) {
      if (k.startsWith("aura_")) {
        try { store.removeItem(k); } catch { /* ignore */ }
      }
    }
  };
  try { sweep(window.localStorage); } catch { /* ignore */ }
  try { sweep(window.sessionStorage); } catch { /* ignore */ }

  try { localStorage.setItem("aura_reset_seen", journeyResetAt); } catch { /* ignore */ }
  return true;
}