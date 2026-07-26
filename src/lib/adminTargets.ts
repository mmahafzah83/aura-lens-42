/**
 * TARGETS — the mechanism, not the conclusion.
 *
 * The table ships empty on purpose. An invented target is worse than none,
 * because real progress then reads as failure. Every rule here exists to keep
 * a target honest:
 *
 *  - the baseline is captured by the system from today's brief, never typed;
 *  - a target with no date is a wish, so the date is required;
 *  - a target with no written reason cannot be judged later, so it is required;
 *  - the prompt to set one stays silent until a cohort reaches five people,
 *    the same floor the cohort work already uses;
 *  - when the date passes, the target behaves exactly like a decision review.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  AdminMetrics,
  COHORT_MIN_FOR_PCT,
  Cohort,
  FUNNEL_ORDER,
  MetricKey,
  countWhere,
  metricValue,
} from "./adminMetrics";

export type TargetStatus = "active" | "kept" | "revised" | "dropped";

export type MetricTarget = {
  id: string;
  metric_key: string;
  target_value: number;
  target_by: string;
  baseline_value: number | null;
  baseline_on: string | null;
  rationale: string;
  status: TargetStatus;
  reviewed_on: string | null;
  review_note: string | null;
  set_on: string;
  created_at: string;
};

export const NO_TARGET_LINE = "no target set";

export const TARGET_BASELINE_NOTE =
  "The baseline is captured by the system from today's brief. You are never asked to type it.";

const todayISO = () => new Date().toISOString().slice(0, 10);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;

export async function loadTargets(): Promise<MetricTarget[]> {
  const { data, error } = await supabase
    .from("metric_targets" as any)
    .select("*")
    .order("set_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    target_value: num(r.target_value) ?? 0,
    baseline_value: num(r.baseline_value),
  })) as MetricTarget[];
}

export const activeTargets = (t: MetricTarget[]) => t.filter((x) => x.status === "active");

/** The one target currently in force for a metric, or null. */
export function targetFor(t: MetricTarget[], key: MetricKey): MetricTarget | null {
  return activeTargets(t).find((x) => x.metric_key === key) ?? null;
}

export function daysUntil(date: string | null, on = todayISO()): number | null {
  if (!date) return null;
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${on}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** Active targets whose date has arrived. They behave like a decision review. */
export function dueTargets(t: MetricTarget[], on = todayISO()): MetricTarget[] {
  return activeTargets(t).filter((x) => {
    const left = daysUntil(x.target_by, on);
    return left !== null && left <= 0;
  });
}

export const countTargets = (t: MetricTarget[], fn: (x: MetricTarget) => boolean) =>
  countWhere(t, fn);

export const labelFor = (key: string): string =>
  FUNNEL_ORDER.find((f) => f.key === key)?.label ?? key;

/**
 * What renders beside a funnel row. Never blank, never a zero — either the
 * target and the gap, or the words "no target set".
 */
export function targetGapLine(
  target: MetricTarget | null,
  current: number | null,
): { text: string; hasTarget: boolean; met: boolean } {
  if (!target) return { text: NO_TARGET_LINE, hasTarget: false, met: false };
  const left = daysUntil(target.target_by);
  const by =
    left === null
      ? `by ${target.target_by}`
      : left > 0
        ? `${left} day${left === 1 ? "" : "s"} left`
        : left === 0
          ? "due today"
          : `${-left} day${left === -1 ? "" : "s"} overdue`;
  if (current === null) {
    return { text: `target ${target.target_value} · today's count unknown · ${by}`, hasTarget: true, met: false };
  }
  const gap = target.target_value - current;
  if (gap <= 0) return { text: `target ${target.target_value} · met · ${by}`, hasTarget: true, met: true };
  return { text: `target ${target.target_value} · ${gap} to go · ${by}`, hasTarget: true, met: false };
}

/* ---------- the prompt: silent until five ---------- */

export const TARGET_PROMPT_FLOOR = COHORT_MIN_FOR_PCT;

/**
 * One line, and only when a cohort has actually reached five people. Below
 * that the cockpit says nothing at all about targets.
 */
export function targetPrompt(
  cohorts: Cohort[],
  targets: MetricTarget[],
  metrics: AdminMetrics | null,
): string | null {
  const bigEnough = countWhere(cohorts, (c) => c.size >= TARGET_PROMPT_FLOOR);
  if (bigEnough === 0) return null;
  const untargeted = FUNNEL_ORDER.filter((f) => !targetFor(targets, f.key));
  if (untargeted.length === 0) return null;
  // Prompt on the metric that matters most and has no target: the last stage
  // in the funnel that at least one person has reached.
  const reached = untargeted.filter((f) => (metrics ? (metricValue(metrics, f.key) ?? 0) > 0 : false));
  const pick = (reached.length > 0 ? reached[reached.length - 1] : untargeted[0]);
  return `You now have enough users to set a meaningful target for ${pick.label}.`;
}

/* ---------- writing ---------- */

export type TargetDraft = {
  metric_key: string;
  target_value: string;
  target_by: string;
  rationale: string;
};

export function validateTarget(d: TargetDraft): string | null {
  if (!d.metric_key) return "Choose the metric this target is for.";
  if (d.target_value.trim() === "" || !Number.isFinite(Number(d.target_value)))
    return "A target needs a number to reach.";
  if (!d.target_by) return "A target with no date is a wish. Give it a date.";
  if (!d.rationale.trim()) return "Write one line on why this number and this date.";
  return null;
}

/** The baseline is read from today's brief. It is never typed. */
export async function saveTarget(d: TargetDraft, m: AdminMetrics | null) {
  const blocked = validateTarget(d);
  if (blocked) throw new Error(blocked);
  const baseline = m ? metricValue(m, d.metric_key as MetricKey) : null;
  const { error } = await supabase.from("metric_targets" as any).insert({
    metric_key: d.metric_key,
    target_value: Number(d.target_value),
    target_by: d.target_by,
    baseline_value: baseline,
    baseline_on: m?.briefDate || todayISO(),
    rationale: d.rationale.trim(),
    status: "active",
    set_on: todayISO(),
  });
  if (error) throw error;
}

/** Keep, revise or drop — the same three calls a due decision asks for. */
export async function settleTarget(
  target: MetricTarget,
  verdict: "kept" | "revised" | "dropped",
  note: string,
) {
  const { error } = await supabase
    .from("metric_targets" as any)
    .update({
      status: verdict,
      reviewed_on: todayISO(),
      review_note: note.trim() || null,
    })
    .eq("id", target.id);
  if (error) throw error;
}

/** "You set Published to reach 5 by 2026-08-01. It is 2." */
export function targetReviewSentence(t: MetricTarget, m: AdminMetrics | null): string {
  const label = labelFor(t.metric_key);
  const live = m ? metricValue(m, t.metric_key as MetricKey) : null;
  const base = t.baseline_value === null ? "an uncaptured baseline" : String(t.baseline_value);
  return `On ${t.set_on} you set ${label} to reach ${t.target_value} by ${t.target_by}, from ${base}. It is ${live === null ? "unknown" : live}.`;
}