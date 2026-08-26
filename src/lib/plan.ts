/**
 * plan.ts — the single place entitlement is decided.
 *
 * `diagnostic_profiles.plan` is the source of truth. Values:
 *   trial — full access while the trial runs
 *   paid  — full access
 *   free  — the read only; the loop is locked
 *
 * The legacy `diagnostic_profiles.tier` column ('loop' / 'read') is no longer
 * read for entitlement. The word "tier" now only ever means the achievement
 * band on `imprint_snapshots` / `score_snapshots` — never entitlement.
 *
 * Never compare plan strings in components. Route every decision through the
 * helpers here.
 */
export type Plan = "trial" | "free" | "paid";

export type PlanProfile = { plan?: string | null } | null | undefined;

/** Anything unrecognised is treated as full access — failing closed the SAFE way. */
export function normalizePlan(value: string | null | undefined): Plan {
  return value === "free" ? "free" : value === "paid" ? "paid" : "trial";
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
