/**
 * THE MORNING PROMISE GUARD.
 *
 * No surface may promise a morning/daily delivery unless the system has
 * actually been delivering. `public.morning_promise_state` is the single
 * source of truth: { runs_checked, runs_that_sent, may_promise }.
 *
 * Fails toward honesty: any error, any missing row, any loading state
 * resolves to FALSE. Never hard-code the promising copy.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useMayPromiseMorning(): boolean {
  const [mayPromise, setMayPromise] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("morning_promise_state")
          .select("may_promise")
          .maybeSingle();
        if (!alive) return;
        setMayPromise(!error && data?.may_promise === true);
      } catch {
        if (alive) setMayPromise(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return mayPromise;
}
