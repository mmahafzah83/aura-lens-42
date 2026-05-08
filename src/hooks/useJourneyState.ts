import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JourneyState {
  loading: boolean;
  profileComplete: boolean;
  assessmentComplete: boolean;
  distinctSources: number;
  entryCount: number;
  capturesReady: boolean;
  voiceTrained: boolean;
  voiceSkipped: boolean;
  hasSignals: boolean;
  hasThreeSignals: boolean;
  hasPublished: boolean;
  hasLinkedInData: boolean;
  /** 0 = profile, 1 = assessment, 2 = captures, 3 = past gates */
  currentGate: 0 | 1 | 2 | 3;
  /** True when user is past all guided onboarding gates (1+2 done; voice optional). */
  guidedJourneyDone: boolean;
  refresh: () => void;
}

const REFRESH_EVENT = "aura:journey-refresh";

export function useJourneyState(userId: string | null | undefined): JourneyState {
  const [state, setState] = useState<Omit<JourneyState, "refresh">>({
    loading: true,
    profileComplete: false,
    assessmentComplete: false,
    distinctSources: 0,
    entryCount: 0,
    capturesReady: false,
    voiceTrained: false,
    voiceSkipped: false,
    hasSignals: false,
    hasThreeSignals: false,
    hasPublished: false,
    hasLinkedInData: false,
    currentGate: 0,
    guidedJourneyDone: false,
  });

  const compute = useCallback(async () => {
    if (!userId) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    try {
      const [profileRes, entriesRes, voiceRes, signalsRes, postsRes, snapsRes, metricsRes] = await Promise.all([
        supabase.from("diagnostic_profiles").select("first_name, firm, level, sector_focus, brand_assessment_completed_at, brand_pillars").eq("user_id", userId).maybeSingle(),
        supabase.from("entries").select("account_name, type").eq("user_id", userId).limit(500),
        supabase.from("authority_voice_profiles").select("id, tone").eq("user_id", userId).maybeSingle(),
        (supabase.from("strategic_signals" as any) as any).select("id, status").eq("user_id", userId),
        supabase.from("linkedin_posts").select("tracking_status").eq("user_id", userId).limit(200),
        supabase.from("influence_snapshots").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("linkedin_post_metrics").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);

      const p: any = profileRes.data || {};
      const profileComplete = !!(p.first_name && p.firm && p.level && p.sector_focus);
      const assessmentComplete = !!p.brand_assessment_completed_at || (Array.isArray(p.brand_pillars) && p.brand_pillars.length > 0);

      const entryRows: any[] = entriesRes.data || [];
      const entryCount = entryRows.length;
      const sourceSet = new Set<string>();
      entryRows.forEach(r => {
        const k = (r.account_name || r.type || "").toString().trim().toLowerCase();
        if (k) sourceSet.add(k);
      });
      const distinctSources = sourceSet.size;
      const capturesReady = distinctSources >= 3;

      const voiceTrained = !!(voiceRes.data && (voiceRes.data as any).tone);
      let voiceSkipped = false;
      try { voiceSkipped = localStorage.getItem("aura_voice_skipped") === "1"; } catch {}

      const signalRows: any[] = (signalsRes.data as any[]) || [];
      const activeSignals = signalRows.filter(s => (s.status || "active") === "active");
      const hasSignals = activeSignals.length >= 1;
      const hasThreeSignals = activeSignals.length >= 3;

      const postRows: any[] = postsRes.data || [];
      const hasPublished = postRows.some(p => p.tracking_status === "self_reported_published");

      const hasLinkedInData = (snapsRes.count || 0) > 0 || (metricsRes.count || 0) > 0;

      const currentGate: 0 | 1 | 2 | 3 = !profileComplete ? 0 : !assessmentComplete ? 1 : !capturesReady ? 2 : 3;
      const guidedJourneyDone = profileComplete && assessmentComplete;

      setState({
        loading: false,
        profileComplete,
        assessmentComplete,
        distinctSources,
        entryCount,
        capturesReady,
        voiceTrained,
        voiceSkipped,
        hasSignals,
        hasThreeSignals,
        hasPublished,
        hasLinkedInData,
        currentGate,
        guidedJourneyDone,
      });
    } catch (e) {
      console.warn("[useJourneyState] compute failed", e);
      setState(s => ({ ...s, loading: false }));
    }
  }, [userId]);

  useEffect(() => { compute(); }, [compute]);

  useEffect(() => {
    const handler = () => compute();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [compute]);

  return { ...state, refresh: compute };
}

export function refreshJourneyState() {
  try { window.dispatchEvent(new CustomEvent(REFRESH_EVENT)); } catch {}
}

export default useJourneyState;