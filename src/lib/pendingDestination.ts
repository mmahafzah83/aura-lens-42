/**
 * One key, one meaning: where the member was actually trying to go before we
 * interrupted them with onboarding or a sign-in wall (D122).
 *
 * A deep link from a lifecycle email — /dashboard?tab=authority&draft=…&src=…
 * — used to be thrown away by `navigate("/onboarding", { replace: true })`.
 * We park it here instead and consume it exactly once.
 */
const KEY = "aura_pending_destination";

/** Internal paths only. An absolute or protocol-relative URL is an open redirect. */
export function isSafeInternalPath(path: string | null | undefined): boolean {
  return (
    !!path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/^\/?\w+:/.test(path)
  );
}

export function setPendingDestination(path: string): void {
  if (!isSafeInternalPath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch { /* private mode — the deep link is simply not resumed */ }
}

/**
 * Read-and-delete. Consume-once: the key is removed the moment it is read, so
 * a destination can never hijack a later, unrelated visit.
 */
export function takePendingDestination(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafeInternalPath(v) ? v : null;
  } catch {
    return null;
  }
}
