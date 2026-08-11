import { useCallback, useEffect, useRef, useState } from "react";
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
  signalSeen: boolean;
  markSignalSeen: () => void;
  retire: () => void;
  skip: () => void;
  refresh: () => void;
  /** A read errored — what is shown may be incomplete. */
  failed: boolean;
  dimmedTabs: Set<string>;
}

const skipKey = (uid: string) => `aura_first_flight_skipped_${uid}`;
const doneKey = (uid: string) => `aura_first_flight_done_${uid}`;
const stepFiredKey = (uid: string, n: number) => `aura_first_flight_step_${n}_fired_${uid}`;
const signalSeenKey = (uid: string) => `aura_first_flight_signal_seen_${uid}`;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch { /* noop */ }
}

/** The durable half of First Flight, as it lives in ui_dismissals.first_flight. */
interface FirstFlightRecord {
  done?: boolean;
  done_at?: string;
  skipped?: boolean;
  skipped_at?: string;
  signal_seen?: boolean;
  signal_seen_at?: string;
  steps_fired?: number[];
}

/**
 * Merge a patch into diagnostic_profiles.ui_dismissals.first_flight without
 * touching any other key in the object. Never throws: a failed write leaves
 * localStorage in charge and the member unblocked.
 */
async function mergeFirstFlight(userId: string, patch: FirstFlightRecord): Promise<void> {
  try {
    const { data } = await supabase
      .from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle();
    const existing = (data?.ui_dismissals && typeof data.ui_dismissals === "object")
      ? (data.ui_dismissals as Record<string, unknown>) : {};
    const prev = (existing.first_flight && typeof existing.first_flight === "object")
      ? (existing.first_flight as FirstFlightRecord) : {};
    const steps = Array.from(new Set([...(prev.steps_fired ?? []), ...(patch.steps_fired ?? [])])).sort();
    const next = { ...existing, first_flight: { ...prev, ...patch, ...(steps.length ? { steps_fired: steps } : {}) } };
    await supabase.from("diagnostic_profiles").update({ ui_dismissals: next as any }).eq("user_id", userId);
  } catch (e) {
    console.warn("[useFirstFlight] persist failed", e);
  }
}

/**
 * Read the durable half. `ok:false` means the read errored — which is NOT the
 * same as "this member has no record", and must never be treated as "not done".
 */
async function readFirstFlight(userId: string): Promise<{ ok: boolean; record: FirstFlightRecord }> {
  try {
    const { data, error } = await supabase
      .from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const d = (data?.ui_dismissals && typeof data.ui_dismissals === "object")
      ? (data.ui_dismissals as Record<string, unknown>) : {};
    const record = (d.first_flight && typeof d.first_flight === "object")
      ? (d.first_flight as FirstFlightRecord) : {};
    return { ok: true, record };
  } catch (e) {
    console.warn("[useFirstFlight] durable read failed", e);
    return { ok: false, record: {} };
  }
}

export function useFirstFlight(userId: string | null | undefined): FirstFlightState {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState({ s1: false, s2: false, s3: false, s4: false });
  const [topSignal, setTopSignal] = useState<FirstFlightSignal | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [retiredLocal, setRetiredLocal] = useState(false);
  const [donePersisted, setDonePersisted] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [signalSeen, setSignalSeen] = useState(false);
  const [failed, setFailed] = useState(false);
  // Steps already reported, merged from localStorage + the database.
  const firedRef = useRef<Set<number>>(new Set());

  const compute = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    // The database is the truth; localStorage is the instant cache. Either
    // saying done/skipped means done/skipped.
    const { ok: durableOk, record: remote } = await readFirstFlight(userId);
    setFailed(!durableOk);
    const alreadyDone = safeGet(doneKey(userId)) === "1" || remote.done === true;
    const alreadySkipped = safeGet(skipKey(userId)) === "1" || remote.skipped === true;
    const seen = safeGet(signalSeenKey(userId)) === "1" || remote.signal_seen === true;

    const fired = firedRef.current;
    ([1, 2, 3, 4] as const).forEach((n) => {
      if (safeGet(stepFiredKey(userId, n)) === "1") fired.add(n);
    });

    // When the durable read failed we know nothing new: show what localStorage
    // holds, write NOTHING (a failed read must never overwrite good progress),
    // and let the card say so.
    if (!durableOk) {
      setDonePersisted(alreadyDone);
      setSkipped(alreadySkipped);
      setSignalSeen(seen);
      setJustCompleted(false);
      setLoading(false);
      return;
    }

    if (alreadyDone) safeSet(doneKey(userId), "1");
    if (alreadySkipped) safeSet(skipKey(userId), "1");
    if (seen) safeSet(signalSeenKey(userId), "1");

    setDonePersisted(alreadyDone);
    setSkipped(alreadySkipped);
    setSignalSeen(seen);

    (remote.steps_fired ?? []).forEach((n) => {
      fired.add(n);
      safeSet(stepFiredKey(userId, n), "1");
    });

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

      // Very first evaluation for this member = nothing fired anywhere yet.
      const anyStepFiredBefore = fired.size > 0;

      // Grandfather: all four already true on the very first load → retire silently.
      let grandfathered = false;
      if (!alreadyDone && !alreadySkipped && !anyStepFiredBefore && s1 && s2 && s3 && s4) {
        safeSet(doneKey(userId), "1");
        ([1, 2, 3, 4] as const).forEach(n => { safeSet(stepFiredKey(userId, n), "1"); fired.add(n); });
        setRetiredLocal(true);
        setDonePersisted(true);
        grandfathered = true;
        void mergeFirstFlight(userId, {
          done: true, done_at: new Date().toISOString(), steps_fired: [1, 2, 3, 4],
        });
      }

      if (!grandfathered) {
        // Per-step funnel events — once per member, ever.
        const newlyFired: number[] = [];
        ([1, 2, 3, 4] as const).forEach((n) => {
          const flag = [s1, s2, s3, s4][n - 1];
          if (flag && !fired.has(n)) {
            fired.add(n);
            newlyFired.push(n);
            safeSet(stepFiredKey(userId, n), "1");
            void track(`first_flight_step_${n}`);
          }
        });
        if (newlyFired.length) void mergeFirstFlight(userId, { steps_fired: newlyFired });

        // Completion celebration: s4 true, not already done, not skipped.
        if (s4 && !alreadyDone && !alreadySkipped) {
          safeSet(doneKey(userId), "1");
          setDonePersisted(true);
          setJustCompleted(true);
          void track("first_flight_complete");
          void mergeFirstFlight(userId, { done: true, done_at: new Date().toISOString() });
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
    if (!userId || skipped) return;
    safeSet(skipKey(userId), "1");
    setSkipped(true);
    void track("first_flight_skipped");
    void mergeFirstFlight(userId, { skipped: true, skipped_at: new Date().toISOString() });
  }, [userId, skipped]);

  const retire = useCallback(() => {
    if (!userId) return;
    safeSet(doneKey(userId), "1");
    setRetiredLocal(true);
    setDonePersisted(true);
    setJustCompleted(false);
    void mergeFirstFlight(userId, { done: true, done_at: new Date().toISOString() });
  }, [userId]);

  const markSignalSeen = useCallback(() => {
    if (!userId || signalSeen) return;
    safeSet(signalSeenKey(userId), "1");
    setSignalSeen(true);
    void mergeFirstFlight(userId, { signal_seen: true, signal_seen_at: new Date().toISOString() });
  }, [userId, signalSeen]);

  const currentStep: 1 | 2 | 3 | 4 = !steps.s1 ? 1 : !steps.s2 ? 2 : (!steps.s3 || !signalSeen) ? 3 : 4;

  const active = !!userId
    && !loading
    && !skipped
    && !retiredLocal
    && !(donePersisted && !justCompleted);

  const litTabs = new Set<string>(["home"]);
  if (currentStep >= 3) litTabs.add("intelligence");
  if (currentStep >= 4) litTabs.add("authority");
  const ALL_TABS = ["home", "intelligence", "authority", "influence", "identity"];
  const dimmedTabs = new Set<string>(active ? ALL_TABS.filter((t) => !litTabs.has(t)) : []);

  return {
    loading,
    active,
    failed,
    currentStep,
    steps,
    topSignal,
    justCompleted,
    signalSeen,
    markSignalSeen,
    retire,
    skip,
    refresh: compute,
    dimmedTabs,
  };
}

export default useFirstFlight;
