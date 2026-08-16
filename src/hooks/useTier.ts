import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useTier — which half of Aura this member has.
 *
 *   read  — the Read is theirs; the Loop is locked.
 *   loop  — the whole instrument.
 *
 * Fails closed in the SAFE direction: while loading and on ANY error the
 * member is treated as `loop`. A paying member seeing a lock because a query
 * was slow is far worse than a free member briefly seeing a panel.
 */
export type Tier = "read" | "loop";

async function fetchTier(): Promise<Tier> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "loop";
  const { data, error } = await supabase
    .from("diagnostic_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return "loop";
  const t = (data as { tier?: string } | null)?.tier;
  return t === "read" ? "read" : "loop";
}

export function useTier(): { tier: Tier; isLoop: boolean; loading: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["member-tier"],
    queryFn: fetchTier,
  });
  // loading → loop. error → loop. anything unexpected → loop.
  const tier: Tier = isLoading || isError || data !== "read" ? "loop" : "read";
  return { tier, isLoop: tier === "loop", loading: isLoading };
}

export default useTier;
