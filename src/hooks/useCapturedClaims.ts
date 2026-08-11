import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CapturedClaim = { title: string; content: string; confidence?: number | null };

const SETTLE_MS = 800;
const POLL_MS = 5000;
const SLOW_MS = 20000;
const CEILING_MS = 120000;

/**
 * Realtime is the mechanism; the 5s poll is only a backstop for blocked websockets.
 */
export function useCapturedClaims(opts: { userId: string | null; sinceIso: string | null; active: boolean }) {
  const { userId, sinceIso, active } = opts;
  const [claims, setClaims] = useState<CapturedClaim[]>([]);
  const [slow, setSlow] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  const doneRef = useRef(false);

  useEffect(() => {
    if (!active || !userId || !sinceIso) return;

    let mounted = true;
    doneRef.current = false;
    setClaims([]); setSlow(false); setGaveUp(false);

    const started = Date.now();
    let settleTimer: number | undefined;
    let pollTimer: number | undefined;
    let slowTimer: number | undefined;
    let ceilingTimer: number | undefined;

    const clearAll = () => {
      if (settleTimer) window.clearTimeout(settleTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      if (slowTimer) window.clearTimeout(slowTimer);
      if (ceilingTimer) window.clearTimeout(ceilingTimer);
      settleTimer = pollTimer = slowTimer = ceilingTimer = undefined;
    };

    /* one reconciliation query — used on activate, on settle, and on each poll */
    const reconcile = async () => {
      if (doneRef.current || !mounted) return;
      try {
        const { data } = await (supabase.from("evidence_fragments" as any) as any)
          .select("title, content, confidence")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("confidence", { ascending: false })
          .limit(3);
        if (data && data.length > 0 && mounted && !doneRef.current) {
          doneRef.current = true;
          setClaims(data as CapturedClaim[]);
          clearAll();
          void supabase.removeChannel(channel);
        }
      } catch { /* the backstop will try again */ }
    };

    const channel = supabase
      .channel(`claims-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "evidence_fragments", filter: `user_id=eq.${userId}` },
        () => {
          if (doneRef.current) return;
          /* fragments land as a batch — let them settle before reading */
          if (settleTimer) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => { void reconcile(); }, SETTLE_MS);
        },
      )
      .subscribe();

    void reconcile(); /* catch-up: survives a reload */

    pollTimer = window.setInterval(() => {
      if (Date.now() - started >= CEILING_MS) { clearAll(); return; }
      void reconcile();
    }, POLL_MS);

    slowTimer = window.setTimeout(() => {
      if (!doneRef.current && mounted) setSlow(true);
    }, SLOW_MS);

    ceilingTimer = window.setTimeout(() => {
      if (!doneRef.current && mounted) setGaveUp(true);
      clearAll();
    }, CEILING_MS);

    return () => {
      mounted = false;
      clearAll();
      void supabase.removeChannel(channel);
    };
  }, [active, userId, sinceIso]);

  return { claims, slow, gaveUp };
}
