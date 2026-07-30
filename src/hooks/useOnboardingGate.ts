import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingCard = "welcome" | "home_hint";

/**
 * Gating for onboarding surfaces on Home.
 * - Dismissal is persisted per user in diagnostic_profiles.ui_dismissals (DB, not localStorage).
 * - Activated users (>=3 captures OR >=1 published post) never see onboarding cards.
 * - Only one surface at a time: the home hint waits until Welcome is dismissed.
 */
export function useOnboardingGate(userId?: string | null) {
  const [ready, setReady] = useState(false);
  const [activated, setActivated] = useState(true); // fail closed: hide until proven new
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;

    (async () => {
      try {
        const [profileRes, entriesRes, postsRes] = await Promise.all([
          supabase
            .from("diagnostic_profiles")
            .select("ui_dismissals")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("entries")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .not("published_at", "is", null),
        ]);

        if (cancelled) return;

        const raw = (profileRes.data as { ui_dismissals?: unknown } | null)?.ui_dismissals;
        setDismissed(
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, boolean>)
            : {}
        );
        setActivated((entriesRes.count ?? 0) >= 3 || (postsRes.count ?? 0) >= 1);
      } catch (err) {
        console.warn("[useOnboardingGate] load failed", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(
    async (card: OnboardingCard) => {
      setDismissed((prev) => ({ ...prev, [card]: true }));
      if (!userId) return;
      const next = { ...dismissed, [card]: true };
      const { error } = await supabase
        .from("diagnostic_profiles")
        .update({ ui_dismissals: next })
        .eq("user_id", userId);
      if (error) console.warn("[useOnboardingGate] dismiss persist failed", error);
    },
    [userId, dismissed]
  );

  const eligible = ready && !activated;
  const showWelcome = eligible && !dismissed.welcome;
  const showHomeHint = eligible && !!dismissed.welcome && !dismissed.home_hint;

  return { ready, activated, showWelcome, showHomeHint, dismiss };
}

export default useOnboardingGate;
