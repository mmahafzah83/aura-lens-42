import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasFullAccess, isFree, isTrial, resolvePlan, type Plan } from "@/lib/plan";

/**
 * usePlan — which half of Aura this member has, read from
 * `diagnostic_profiles.plan` (the entitlement source of truth).
 *
 * Three-state on purpose:
 *   pending  — still loading, or the query failed. `plan` is null. Render a
 *              neutral state: neither grant the loop nor show a lock.
 *   full     — trial or paid.
 *   locked   — loaded and the plan is `free` (or an unrecognised stored value,
 *              which `normalizePlan` resolves down to `free`).
 *
 * So it fails CLOSED on the value and NEUTRAL on the load — a slow query never
 * flashes a lock at a paying member, and an unknown string never buys access.
 */
async function fetchPlan(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "free";
  const { data, error } = await supabase
    .from("diagnostic_profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as { plan?: string | null } | null)?.plan ?? null;
}

export function usePlan(): {
  /** null while pending — never treat null as a plan. */
  plan: Plan | null;
  /** Neither granted nor denied yet. Render neutral. */
  pending: boolean;
  /** Resolved AND entitled to the loop. */
  fullAccess: boolean;
  /** Resolved AND not entitled — the only correct trigger for lock UI. */
  locked: boolean;
  trial: boolean;
  free: boolean;
  loading: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["member-plan"],
    queryFn: fetchPlan,
  });
  const loaded = !isLoading && !isError;
  const plan = resolvePlan(data, loaded);
  const profile = plan ? { plan } : null;
  const fullAccess = plan !== null && hasFullAccess(profile);
  return {
    plan,
    pending: plan === null,
    fullAccess,
    locked: plan !== null && !fullAccess,
    trial: plan !== null && isTrial(profile),
    free: plan !== null && isFree(profile),
    loading: isLoading,
  };
}

export default usePlan;
