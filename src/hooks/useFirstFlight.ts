import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/track";

export interface FirstFlightSignal {
  id: string;
  title: string;
  what: string | null;
  explanation: string | null;
}

export interface FirstFlightState {
  loading: boolean;
  active: boolean;
  currentStep: 1 | 2 | 3 | 4;
  steps: { s1: boolean; s2: boolean; s3: boolean; s4: boolean };
  topSignal: FirstFlightSignal | null;
  justCompleted: boolean;
  retire: () => void;
  skip: () => void;
  refresh: () => void;
}

const skipKey = (uid: string) => `aura_first_flight_skipped_${uid}`;
const doneKey = (uid: string) => `aura_first_flight_done_${uid}`;
const stepFiredKey = (uid: string, n: number) => `aura_first_flight_step_${n}_fired_${uid}`;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch { /* noop */ }
}

export function useFirstFlight(userId: string | null | undefined): FirstFlightState {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState({ s1: false, s2: false, s3: false, s4: false });
  const [topSignal, setTopSignal] = useState<FirstFlightSignal | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [retiredLocal, setRetiredLocal] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const compute = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    const alreadyDone = safeGet(doneKey(userId)) === "1";
    const alreadySkipped = safeGet(skipKey(userId)) === "1";
    setSkipped(alreadySkipped);

    try {
      const [connRes, entryRes, docRes, sigRes, postRes] = await Promise.all([
        supabase.from("linkedin_connections_safe" as any).select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
        (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, what_it_means_for_you, explanation, confidence, status")
          .eq("user_id", userId).eq("status", "active")
          .order("confidence", { ascending: false })
          .limit(1),
        supabase.from("linkedin_posts").select("id, published_at, tracking_status").eq("user_id", userId).limit(200),
      ]);

      const s1 = (connRes.count ?? 0) > 0;
      const s2 = ((entryRes.count ?? 0) + (docRes.count ?? 0)) > 0;
      const sigRow: any = Array.isArray(sigRes.data) ? sigRes.data[0] : null;
      const s3 = !!sigRow;
      const postRows: any[] = (postRes.data as any[]) || [];
      const s4 = postRows.some(p => !!p.published_at || p.tracking_status === "published" || p.tracking_status === "self_reported_published");

      const next = { s1, s2, s3, s4 };
      setSteps(next);
      setTopSignal(sigRow ? {
        id: sigRow.id,
        title: sigRow.signal_title || "Untitled signal",
        what: sigRow.what_it_means_for_you ?? null,
        explanation: sigRow.explanation ?? null,
      } : null);

      // Grandfather: all four done on first-ever load, no prior FF keys → silently retire.
      if (!alreadyDone && !alreadySkipped && s1 && s2 && s3 && s4) {
        safeSet(doneKey(userId), "1");
        setRetiredLocal(true);
      }

      // Per-step tracking (fire once each).
      const firedNow: number[] = [];
      ([1,2,3,4] as const).forEach((n) => {
        const flag = [s1, s2, s3, s4][n - 1];
        if (flag && !safeGet(stepFiredKey(userId, n))) {
          safeSet(stepFiredKey(userId, n), "1");
          firedNow.push(n);
        }
      });
      firedNow.forEach(n => { void track(`first_flight_step_${n}`); });

      // Completion celebration: s4 flipped true this session AND not already done AND not grandfathered.
      if (s4 && !alreadyDone && !(alreadySkipped) && !(s1 && s2 && s3 && s4 && !safeGet(stepFiredKey(userId, 1)))) {
        // Only celebrate if not just-grandfathered above. The grandfather branch already set doneKey.
        if (safeGet(doneKey(userId)) !== "1") {
          safeSet(doneKey(userId), "1");
          setJustCompleted(true);
          void track("first_flight_complete");
        }
      }
    } catch (e) {
      console.warn("[useFirstFlight] compute failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { compute(); }, [compute]);

  useEffect(() => {
    const h = () => compute();
    window.addEventListener("capture-complete", h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener("capture-complete", h);
      window.removeEventListener("focus", h);
    };
  }, [compute]);

  const skip = useCallback(() => {
    if (!userId) return;
    safeSet(skipKey(userId), "1");
    setSkipped(true);
    void track("first_flight_skipped");
  }, [userId]);

  const retire = useCallback(() => {
    if (!userId) return;
    safeSet(doneKey(userId), "1");
    setRetiredLocal(true);
    setJustCompleted(false);
  }, [userId]);

  const alreadyDonePersisted = userId ? safeGet(doneKey(userId)) === "1" : false;

  const currentStep: 1 | 2 | 3 | 4 = !steps.s1 ? 1 : !steps.s2 ? 2 : !steps.s3 ? 3 : 4;

  const active = !!userId
    && !loading
    && !skipped
    && !retiredLocal
    && !(alreadyDonePersisted && !justCompleted);

  return {
    loading,
    active,
    currentStep,
    steps,
    topSignal,
    justCompleted,
    retire,
    skip,
    refresh: compute,
  };
}

export default useFirstFlight;