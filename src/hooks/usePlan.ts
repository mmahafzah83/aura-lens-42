import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasFullAccess, isFree, isTrial, normalizePlan, type Plan } from "@/lib/plan";

/**
 * usePlan — which half of Aura this member has, read from
 * `diagnostic_profiles.plan` (the entitlement source of truth).
 *
 * Fails closed in the SAFE direction: while loading and on ANY error the member
 * is treated as having full access. A paying member seeing a lock because a
 * query was slow is far worse than a free member briefly seeing a panel.
 */
async function fetchPlan(): Promise<Plan> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "trial";
  const { data, error } = await supabase
    .from("diagnostic_profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return "trial";
  return normalizePlan((data as { plan?: string } | null)?.plan);
}

export function usePlan(): {
  plan: Plan;
  fullAccess: boolean;
  trial: boolean;
  free: boolean;
  loading: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["member-plan"],
    queryFn: fetchPlan,
  });
  const plan: Plan = isLoading || isError ? "trial" : normalizePlan(data);
  const profile = { plan };
  return {
    plan,
    fullAccess: hasFullAccess(profile),
    trial: isTrial(profile),
    free: isFree(profile),
    loading: isLoading,
  };
}

export default usePlan;
