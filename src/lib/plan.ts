/**
 * plan.ts — the single place entitlement is decided.
 *
 * `diagnostic_profiles.plan` is the source of truth. Values:
 *   trial — full access while the trial runs
 *   paid  — full access
 *   free  — the read only; the loop is locked
 *
 * HOW THIS FAILS: it fails CLOSED on the value, and NEUTRAL on the load.
 *   - A stored value we do not recognise (including null) resolves to `free`,
 *     the least-privileged plan. Once `paid` means money, an unknown string
 *     must never buy the loop.
 *   - "Not loaded yet" is NOT a plan. It is `null` — see `resolvePlan` and
 *     `usePlan().pending`. Callers must render a neutral/pending state while
 *     pending, never a lock and never full access.
 *
 * The legacy `diagnostic_profiles.tier` column ('loop' / 'read') is gone from
 * every reader. The word "tier" now only ever means the achievement band on
 * `imprint_snapshots` / `score_snapshots` — never entitlement.
 *
 * Never compare plan strings in components. Route every decision through the
 * helpers here.
 */
export type Plan = "trial" | "free" | "paid";

export type PlanProfile = { plan?: string | null } | null | undefined;

/** Anything unrecognised — including null — is the least-privileged plan. */
export function normalizePlan(value: string | null | undefined): Plan {
  return value === "paid" ? "paid" : value === "trial" ? "trial" : "free";
}

/**
 * The load-aware form: `null` means "we do not know yet". Use this whenever the
 * value may still be in flight, and keep `null` distinct from `"free"`.
 */
export function resolvePlan(value: string | null | undefined, loaded: boolean): Plan | null {
  return loaded ? normalizePlan(value) : null;
}

/** May this member use the whole instrument (the loop, not just the read)? */
export function hasFullAccess(profile: PlanProfile): boolean {
  const p = normalizePlan(profile?.plan);
  return p === "trial" || p === "paid";
}

/** Is the member inside their trial (full access, but time-boxed)? */
export function isTrial(profile: PlanProfile): boolean {
  return normalizePlan(profile?.plan) === "trial";
}

/** Read-only plan: the read is theirs, the loop is locked. */
export function isFree(profile: PlanProfile): boolean {
  return normalizePlan(profile?.plan) === "free";
}
