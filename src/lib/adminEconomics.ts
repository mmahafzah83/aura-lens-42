/**
 * ONE DEFINITION of the money numbers.
 *
 * The cockpit headline and /admin/cost both read this module. Neither
 * recomputes a rival figure, so the two surfaces cannot disagree.
 *
 * The principle: build the mechanism, refuse the conclusion. Spend by function
 * is honest at any scale. A per-unit ratio is not — divide by a denominator
 * this thin and the number says more about luck than about economics. So a
 * ratio renders only when its denominator reaches RATIO_MIN_DENOMINATOR, and
 * the denominator is shown beside it, always.
 */
import { supabase } from "@/integrations/supabase/client";

/** Below this many units, a per-unit cost is noise wearing a decimal point. */
export const RATIO_MIN_DENOMINATOR = 10;

export type FunctionSpend = { function_name: string; spend: number; calls: number };
export type DaySpend = { day: string; spend: number };

export type Denominators = {
  active_users: number;
  published_posts: number;
  signals_delivered: number;
};

export type Economics = {
  /** This calendar month to date. */
  spendMonth: number;
  /** The whole of last calendar month. */
  spendLastMonth: number;
  /** Straight-line projection to month end from the run rate so far. */
  projectedMonthEnd: number;
  byFunction: FunctionSpend[];
  byFunctionLastMonth: FunctionSpend[];
  daily: DaySpend[];
  denominators: Denominators;
  /** Day of month and days in month, so the projection can be explained. */
  dayOfMonth: number;
  daysInMonth: number;
};

const n = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0;

const sum = (rows: { spend: number }[]) => rows.reduce((s, r) => s + r.spend, 0);

/** Counted, never `.length`. */
export const countWhereEcon = <T,>(rows: T[], fn: (r: T) => boolean): number =>
  rows.reduce((c, r) => (fn(r) ? c + 1 : c), 0);

export const money = (v: number): string =>
  v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;

function shapeFunctions(data: any[]): FunctionSpend[] {
  return (data ?? []).map((r: any) => ({
    function_name: String(r.function_name ?? "unknown"),
    spend: n(r.spend),
    calls: n(r.calls),
  }));
}

export async function loadEconomics(): Promise<Economics> {
  const [thisMonth, lastMonth, daily, denom] = await Promise.all([
    (supabase as any).rpc("admin_spend_by_function", { p_months_back: 0 }),
    (supabase as any).rpc("admin_spend_by_function", { p_months_back: 1 }),
    (supabase as any).rpc("admin_spend_daily", { p_days: 30 }),
    (supabase as any).rpc("admin_economics_denominators"),
  ]);
  const err = thisMonth.error || lastMonth.error || daily.error || denom.error;
  if (err) throw err;

  const byFunction = shapeFunctions(thisMonth.data);
  const byFunctionLastMonth = shapeFunctions(lastMonth.data);
  const spendMonth = sum(byFunction);
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const d = (denom.data ?? [])[0] ?? {};

  return {
    spendMonth,
    spendLastMonth: sum(byFunctionLastMonth),
    projectedMonthEnd: dayOfMonth > 0 ? (spendMonth / dayOfMonth) * daysInMonth : 0,
    byFunction,
    byFunctionLastMonth,
    daily: (daily.data ?? []).map((r: any) => ({ day: String(r.day), spend: n(r.spend) })),
    denominators: {
      active_users: n(d.active_users),
      published_posts: n(d.published_posts),
      signals_delivered: n(d.signals_delivered),
    },
    dayOfMonth,
    daysInMonth,
  };
}

/** The three biggest consumers, ranked. Honest at any user count. */
export const topConsumers = (e: Economics, take = 3): FunctionSpend[] =>
  e.byFunction.slice(0, take);

export type Ratio = {
  /** null when suppressed — never render a zero in its place. */
  value: number | null;
  denominator: number;
  unit: string;
  suppressed: boolean;
  /** What to print instead of the number when suppressed. */
  display: string;
  /** The sentence that says why, or the denominator disclosure when shown. */
  note: string;
};

/**
 * A per-unit cost. Suppressed below the floor, and the denominator travels
 * with the number either way so nobody reads a ratio without seeing how thin
 * it is.
 */
export function perUnit(spend: number, denominator: number, unit: string, unitPlural = `${unit}s`): Ratio {
  const word = denominator === 1 ? unit : unitPlural;
  if (denominator < RATIO_MIN_DENOMINATOR) {
    return {
      value: null,
      denominator,
      unit: word,
      suppressed: true,
      display: "—",
      note: `${denominator} ${word} is too few to divide by — showing totals only.`,
    };
  }
  return {
    value: spend / denominator,
    denominator,
    unit: word,
    suppressed: false,
    display: money(spend / denominator),
    note: `over ${denominator} ${word} this month`,
  };
}

export const RATIOS_NOT_BUILT =
  "Margin, lifetime value, acquisition cost and payback are deliberately absent. There is no price and no acquisition spend, so any figure would be invented.";

export function costRatios(e: Economics): { label: string; ratio: Ratio }[] {
  return [
    { label: "Cost per active person", ratio: perUnit(e.spendMonth, e.denominators.active_users, "active person", "active people") },
    { label: "Cost per published post", ratio: perUnit(e.spendMonth, e.denominators.published_posts, "published post") },
    { label: "Cost per signal delivered", ratio: perUnit(e.spendMonth, e.denominators.signals_delivered, "signal") },
  ];
}