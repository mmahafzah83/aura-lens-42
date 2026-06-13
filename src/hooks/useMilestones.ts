import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";

export interface Milestone {
  id: string;
  user_id: string;
  milestone_id: string;
  milestone_name: string;
  context: Record<string, any>;
  earned_at: string;
  acknowledged: boolean;
  shared: boolean;
}

export function useMilestones(userId: string | null) {
  const [allMilestones, setAllMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_milestones" as any)
      .select("*")
      .eq("user_id", userId)
      .order("earned_at", { ascending: false })
      .limit(50);
    if (!error && data) setAllMilestones(data as unknown as Milestone[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkAndAwardMilestone = useCallback(
    async (milestoneId: string, milestoneName: string, context: Record<string, any> = {}) => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_milestones" as any)
        .upsert(
          {
            user_id: userId,
            milestone_id: milestoneId,
            milestone_name: milestoneName,
            context,
          },
          { onConflict: "user_id,milestone_id", ignoreDuplicates: true }
        )
        .select()
        .maybeSingle();
      if (error) {
        console.error("checkAndAwardMilestone failed", error);
        return null;
      }
      if (data) await refresh();
      return data as unknown as Milestone | null;
    },
    [userId, refresh]
  );

  const acknowledgeMilestone = useCallback(
    async (id: string) => {
      // Optimistic update first so the UI never re-shows the milestone
      // even if navigation/refresh interrupts the DB write.
      setAllMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, acknowledged: true } : m)));
      const { error } = await supabase
        .from("user_milestones" as any)
        .update({ acknowledged: true })
        .eq("id", id);
      if (error) {
        console.error("acknowledgeMilestone failed", error);
        return;
      }
    },
    []
  );

  const shareMilestone = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("user_milestones" as any)
        .update({ shared: true })
        .eq("id", id);
      if (error) {
        console.error("shareMilestone failed", error);
        return;
      }
      setAllMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, shared: true } : m)));
    },
    []
  );

  const unacknowledgedMilestones = celebrationsEnabled
    ? allMilestones.filter((m) => !m.acknowledged)
    : [];

  return {
    allMilestones,
    unacknowledgedMilestones,
    loading,
    refresh,
    checkAndAwardMilestone,
    acknowledgeMilestone,
    shareMilestone,
  };
}

export default useMilestones;