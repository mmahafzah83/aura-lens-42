/**
 * THE HONEST WAIT.
 *
 * Every number a member sees while waiting comes from `operation_runs` — real
 * runs, really timed. Below ten of them we say we are still learning rather
 * than invent a figure.
 *
 * There IS one honest percentage, and only one: stages whose durations we have
 * measured, weighted by their measured share of the whole, with the running
 * stage decaying toward — never reaching — its own weight. Anything we cannot
 * defend from finished runs returns null and the panel prints an em dash.
 */
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import type { InstrumentedOperation } from "@/lib/operationStages";

/**
 * DERIVED, not restated. The stage definition is the only list of operations;
 * an operation with no measurable stages cannot be named on a waiting screen.
 */
export type WaitOperation = InstrumentedOperation;

/** One measured stage of an operation. Milliseconds, from finished runs. */
export interface StageTiming {
  key: string;
  p50Ms: number;
  p95Ms: number;
  /** Spread over mean. Above 0.5 the stage is too erratic to weight honestly. */
  sigmaOverMu: number;
  /** How many finished runs carried this stage. */
  sample: number;
}

export type WaitEstimate =
  | { known: false; stages: StageTiming[] }
  | { known: true; p50: number; p95: number; sample: number; stages: StageTiming[] };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<WaitOperation, { at: number; value: WaitEstimate }>();

const UNKNOWN: WaitEstimate = { known: false, stages: [] };

/** "four minutes", "a minute and a half" — never raw seconds. */
export function humanDuration(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 20) return "a few seconds";
  if (s < 45) return "half a minute";
  if (s < 75) return "about a minute";
  if (s < 105) return "a minute and a half";
  const mins = s / 60;
  const whole = Math.floor(mins);
  const rest = mins - whole;
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const word = (n: number) => (n <= 10 ? WORDS[n] : String(n));
  if (rest < 0.25) return `${word(whole)} minutes`;
  if (rest < 0.75) return `${word(whole)} and a half minutes`;
  return `${word(whole + 1)} minutes`;
}

/** The line above the counter. Always says something true. */
export function waitCopy(est: WaitEstimate): string {
  if (!est.known) return "This takes a few minutes. We are still learning how long — the counter below is real.";
  return `This usually takes about ${humanDuration(est.p50)} and almost always under ${humanDuration(est.p95)}. You can leave this open — the counter below is real.`;
}

export const OVER_P95_LINE = "This one is taking longer than most. It is still running.";

/* ── the one honest percentage ─────────────────────────────────────────── */

/** Below this many finished runs a stage timing is not a number we can defend. */
export const MIN_STAGE_SAMPLE = 10;
/** Above this spread the stage is too erratic to carry weight. */
export const MAX_SIGMA_OVER_MU = 0.5;
/** The running stage never fills more than this share of its own weight. */
const ACTIVE_STAGE_CEILING = 0.92;
/** Nothing reads 100% before the completion event. */
const TOTAL_CEILING = 0.95;

/**
 * Weighted progress, 0..1, or null when we cannot defend a number.
 *
 * Stages are weighted by their measured p50 share — never equal-weighted,
 * because equal weights guarantee a visible stall on the long stage.
 */
export function weightedProgress(
  stages: StageTiming[],
  completedKeys: string[],
  activeKey: string | null,
  msInActiveStage: number,
): number | null {
  if (!stages || stages.length === 0) return null;
  /* Guard one: not enough finished runs behind any stage. */
  if (stages.some((s) => (s.sample ?? 0) < MIN_STAGE_SAMPLE)) return null;
  /* Guard two: a stage too erratic to weight. */
  if (stages.some((s) => !Number.isFinite(s.sigmaOverMu) || s.sigmaOverMu > MAX_SIGMA_OVER_MU)) return null;

  const total = stages.reduce((a, s) => a + Math.max(1, s.p50Ms), 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  const done = new Set(completedKeys);
  let acc = 0;
  for (const s of stages) {
    const w = Math.max(1, s.p50Ms) / total;
    if (done.has(s.key)) { acc += w; continue; }
    if (s.key === activeKey) {
      const t = Math.max(0, msInActiveStage);
      const decayed = 1 - Math.exp(-t / Math.max(1, s.p50Ms));
      acc += w * Math.min(ACTIVE_STAGE_CEILING, decayed);
    }
  }
  return Math.max(0, Math.min(TOTAL_CEILING, acc));
}

/* ── fetching the measurements ─────────────────────────────────────────── */

interface EstimateWire {
  p50_seconds?: number;
  p95_seconds?: number;
  sample_size?: number;
  insufficient?: boolean;
  stages?: { key: string; p50_ms: number; p95_ms: number; sigma_over_mu: number; sample: number }[];
}

const readStages = (row: EstimateWire | null): StageTiming[] =>
  (row?.stages ?? []).map((s) => ({
    key: String(s.key),
    p50Ms: Number(s.p50_ms) || 0,
    p95Ms: Number(s.p95_ms) || 0,
    sigmaOverMu: Number(s.sigma_over_mu),
    sample: Number(s.sample) || 0,
  }));

export async function fetchWaitEstimate(operation: WaitOperation): Promise<WaitEstimate> {
  const hit = cache.get(operation);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: WaitEstimate = UNKNOWN;
  try {
    const { data, error } = await supabase.functions.invoke("wait-estimate", { body: { operation } });
    const row = data as EstimateWire | null;
    const stages = readStages(row);
    if (!error && row && !row.insufficient && typeof row.p50_seconds === "number" && typeof row.p95_seconds === "number") {
      value = { known: true, p50: row.p50_seconds, p95: row.p95_seconds, sample: Number(row.sample_size ?? 0), stages };
    } else {
      value = { known: false, stages };
    }
  } catch { /* an estimate that fails is simply an estimate we do not have */ }
  cache.set(operation, { at: Date.now(), value });
  return value;
}

/** Never blocks a render: it starts unknown and improves if the answer arrives. */
export function useWaitEstimate(operation: WaitOperation | null | undefined): WaitEstimate {
  const [est, setEst] = useState<WaitEstimate>(() => (operation ? cache.get(operation)?.value ?? UNKNOWN : UNKNOWN));
  useEffect(() => {
    if (!operation) { setEst(UNKNOWN); return; }
    let alive = true;
    void fetchWaitEstimate(operation).then((v) => { if (alive) setEst(v); });
    return () => { alive = false; };
  }, [operation]);
  return est;
}

/**
 * The percentage the panel prints — monotonic for the life of one run.
 * `runKey` changes when a new run starts; that is the only time it may fall.
 */
export function useWeightedProgress(args: {
  stages: StageTiming[];
  completedKeys: string[];
  activeKey: string | null;
  /** epoch ms the active stage began. */
  activeSince: number | null;
  /**
   * A run boundary is an EVENT, not something to infer. Call sites change this
   * on every new run; the monotonic floor resets with it and nothing leaks
   * from the last run into this one.
   */
  runId: string | number;
  /** The completion event, and the only thing that reads 100%. */
  complete?: boolean;
}): number | null {
  const { stages, completedKeys, activeKey, activeSince, runId, complete } = args;
  const floorRef = useRef<{ runId: string | number; value: number | null }>({ runId, value: null });
  const [, tick] = useState(0);

  useEffect(() => {
    if (!activeKey || complete) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeKey, complete, runId]);

  if (floorRef.current.runId !== runId) floorRef.current = { runId, value: null };

  if (complete) { floorRef.current.value = 1; return 1; }

  const raw = weightedProgress(stages, completedKeys, activeKey, activeSince ? Date.now() - activeSince : 0);
  if (raw === null) return floorRef.current.value;
  const held = Math.max(raw, floorRef.current.value ?? 0);
  floorRef.current.value = held;
  return held;
}

/** mm:ss of real elapsed time. Nothing else. */
export function useElapsed(active = true, runId: string | number = 0): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    setSecs(0);
    if (!active) return;
    const started = Date.now();
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active, runId]);
  return secs;
}

export const mmss = (secs: number): string =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
