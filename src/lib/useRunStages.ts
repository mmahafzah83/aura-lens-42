/**
 * THE TICK CHANNEL — what the operation has ACTUALLY finished, live.
 *
 * The client mints the run id and passes it into the edge function, so the tab
 * can watch its own run before the work begins. There is no race to lose.
 *
 * Two mouths, one truth:
 *   • a realtime subscription on `operation_runs` (instant, member rows), and
 *   • a poll of `get_run_stages` every 1.5s, which is ALSO the backfill on
 *     subscribe and the only path an anonymous run has.
 * A mark that fired before the channel opened is therefore never missed.
 *
 * The shape returned mirrors what actually happened: a stage with a measured
 * duration is DONE, the stage still open (`ms: null`) is ACTIVE, everything
 * else is waiting. Nothing here is guessed from a local boolean.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readToken } from "@/lib/assessmentSession";
import { buildStages, type InstrumentedOperation } from "@/lib/operationStages";
import type { WorkingStage } from "@/components/ui/WorkingPanel";

export const newRunId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

interface StageRow { key?: unknown; ms?: unknown }

export interface RunStages {
  /** Stage keys with a measured duration — finished, and they stay finished. */
  completed: string[];
  /** The stage currently open, from the record. Null before the first mark. */
  active: string | null;
  /** The stage that was open when the run failed. */
  failedAt: string | null;
  outcome: "ok" | "refused" | "failed" | null;
  /** Ready to hand straight to `<WorkingPanel stages=… />`. */
  stages: WorkingStage[];
}

const POLL_MS = 1500;

export function useRunStages(
  operation: InstrumentedOperation,
  runId: string | null,
  opts?: { active?: boolean; anonToken?: string | null },
): RunStages {
  const watching = opts?.active !== false && !!runId;
  const [completed, setCompleted] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RunStages["outcome"]>(null);
  /* Finished stays finished: a late-arriving older snapshot may not un-tick. */
  const doneRef = useRef<Set<string>>(new Set());
  /* Each finished stage's own duration, so the mono column can show it. */
  const msRef = useRef<Record<string, number>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    doneRef.current = new Set();
    msRef.current = {};
    setCompleted([]); setActive(null); setFailedAt(null); setOutcome(null); setDurations({});
  }, [runId]);

  useEffect(() => {
    if (!watching || !runId) return;
    let alive = true;
    let timer = 0;
    /* A run with an outcome is OVER. Stop the poll here rather than trusting
       every call site to drop its `active` prop. */
    const stopPolling = () => { if (timer) { window.clearInterval(timer); timer = 0; } };

    const apply = (stages: unknown, runOutcome: unknown) => {
      if (!alive) return;
      const list = Array.isArray(stages) ? (stages as StageRow[]) : [];
      let open: string | null = null;
      for (const s of list) {
        const key = String(s?.key ?? "").trim();
        if (!key) continue;
        const ms = Number(s?.ms);
        if (Number.isFinite(ms) && ms > 0) { doneRef.current.add(key); msRef.current[key] = ms; }
        else open = key;
      }
      const out = (runOutcome as RunStages["outcome"]) ?? null;
      setCompleted(Array.from(doneRef.current));
      setDurations({ ...msRef.current });
      setOutcome(out);
      if (out === "failed" || out === "refused") {
        setActive(null);
        setFailedAt(open ?? list.map((s) => String(s?.key ?? "")).filter(Boolean).pop() ?? null);
      } else {
        setFailedAt(null);
        setActive(open);
      }
      if (out) stopPolling();
    };

    /* Backfill — and the anonymous path's only channel. Runs immediately, so a
       mark that landed before the subscription opened is still seen. */
    const read = async () => {
      const { data } = await supabase.rpc("get_run_stages" as never, {
        p_run_id: runId,
        p_anon_token: opts?.anonToken ?? readToken(),
      } as never);
      const row = data as { stages?: unknown; outcome?: unknown } | null;
      if (row) apply(row.stages, row.outcome);
    };
    void read();
    timer = window.setInterval(() => { void read(); }, POLL_MS);

    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "operation_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const row = payload.new as { stages?: unknown; outcome?: unknown };
          apply(row?.stages, row?.outcome);
        },
      )
      .subscribe(() => { void read(); });

    return () => {
      alive = false;
      stopPolling();
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, runId, opts?.anonToken]);

  return {
    completed,
    active,
    failedAt,
    outcome,
    stages: buildStages(operation, { completed, active, failed: failedAt, ms: durations }),
  };
}
