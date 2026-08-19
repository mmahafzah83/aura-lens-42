/**
 * THE HONEST WAIT.
 *
 * Every number a member sees while waiting comes from `operation_runs` — real
 * runs, really timed. Below ten of them we say we are still learning rather
 * than invent a figure. There is no percentage anywhere in this file, because
 * no client can know one.
 */
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type WaitOperation = "linkedin_read" | "cv_crosscheck" | "market_read";

export type WaitEstimate =
  | { known: false }
  | { known: true; p50: number; p95: number; sample: number };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<WaitOperation, { at: number; value: WaitEstimate }>();

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

export async function fetchWaitEstimate(operation: WaitOperation): Promise<WaitEstimate> {
  const hit = cache.get(operation);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: WaitEstimate = { known: false };
  try {
    const { data, error } = await supabase.functions.invoke("wait-estimate", { body: { operation } });
    const row = data as { p50_seconds?: number; p95_seconds?: number; sample_size?: number; insufficient?: boolean } | null;
    if (!error && row && !row.insufficient && typeof row.p50_seconds === "number" && typeof row.p95_seconds === "number") {
      value = { known: true, p50: row.p50_seconds, p95: row.p95_seconds, sample: Number(row.sample_size ?? 0) };
    }
  } catch { /* an estimate that fails is simply an estimate we do not have */ }
  cache.set(operation, { at: Date.now(), value });
  return value;
}

/** Never blocks a render: it starts unknown and improves if the answer arrives. */
export function useWaitEstimate(operation: WaitOperation): WaitEstimate {
  const [est, setEst] = useState<WaitEstimate>(() => cache.get(operation)?.value ?? { known: false });
  useEffect(() => {
    let alive = true;
    void fetchWaitEstimate(operation).then((v) => { if (alive) setEst(v); });
    return () => { alive = false; };
  }, [operation]);
  return est;
}

/** mm:ss of real elapsed time. Nothing else. */
export function useElapsed(active = true): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    setSecs(0);
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return secs;
}

export const mmss = (secs: number): string =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
