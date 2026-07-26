import { useCallback, useEffect, useState } from "react";
import {
  Economics,
  RATIOS_NOT_BUILT,
  costRatios,
  countWhereEcon,
  loadEconomics,
  money,
  topConsumers,
} from "@/lib/adminEconomics";
import { C, Label, MONO, SERIF, Table } from "./ui";

/**
 * ECONOMICS — one definition, two renders.
 *
 * The cockpit headline and /admin/cost both read `loadEconomics`. Spend by
 * function is honest at any scale. A per-unit ratio is only rendered once its
 * denominator reaches the floor, and the denominator is printed beside it
 * either way.
 */

export type EconomicsState = {
  data: Economics | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useEconomics(): EconomicsState {
  const [data, setData] = useState<Economics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    loadEconomics()
      .then((e) => {
        setData(e);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);
  return { data, loading, error, reload };
}

/** The headline sentence for the cockpit. Same numbers as /admin/cost. */
export function EconomicsHeadline({ state }: { state: EconomicsState }) {
  if (state.loading) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Reading spend…</div>;
  if (state.error || !state.data)
    return <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox }}>{state.error ?? "Spend could not be read."}</div>;
  const e = state.data;
  const top = topConsumers(e, 3);
  const named = top.map((t) => `${t.function_name} ${money(t.spend)}`).join(", ");
  return (
    <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.5, color: C.ink }}>
      {money(e.spendMonth)} spent this month against {money(e.spendLastMonth)} last month, projecting{" "}
      {money(e.projectedMonthEnd)} by month end.{" "}
      {countWhereEcon(top, () => true) === 0
        ? "No AI spend has been recorded this month."
        : `The biggest consumers are ${named}.`}
    </div>
  );
}

/** Spend by function, this month and last. Works today, no caveats needed. */
export function SpendByFunction({ state }: { state: EconomicsState }) {
  if (state.loading) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Reading spend…</div>;
  if (state.error || !state.data)
    return <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox }}>{state.error ?? "Spend could not be read."}</div>;
  const e = state.data;
  const last = new Map(e.byFunctionLastMonth.map((r) => [r.function_name, r.spend]));
  const rows = e.byFunction.map((r) => [
    r.function_name,
    money(r.spend),
    String(r.calls),
    e.spendMonth > 0 ? `${((r.spend / e.spendMonth) * 100).toFixed(1)}%` : "—",
    last.has(r.function_name) ? money(last.get(r.function_name) as number) : "nothing last month",
  ]);
  return (
    <>
      <Label>Spend by function · this month</Label>
      <div style={{ height: 10 }} />
      {countWhereEcon(e.byFunction, () => true) === 0 ? (
        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>
          No AI call has been logged this month.
        </div>
      ) : (
        <Table head={["Function", "Spend", "Calls", "Share", "Last month"]} rows={rows} />
      )}
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 10 }}>
        counted from: ai_usage_log.est_cost_usd grouped by function_name · total {money(e.spendMonth)} this month,{" "}
        {money(e.spendLastMonth)} last month
      </div>
    </>
  );
}

/** Per-unit costs — built, then suppressed until a denominator earns them. */
export function CostRatios({ state }: { state: EconomicsState }) {
  if (state.loading) return null;
  if (state.error || !state.data) return null;
  const e = state.data;
  return (
    <>
      <Label>Per unit</Label>
      <div style={{ marginTop: 8 }}>
        {costRatios(e).map(({ label, ratio }) => (
          <div key={label} style={{ borderTop: `1px solid ${C.rule}`, padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SERIF, fontSize: 16, color: ratio.suppressed ? C.muted : C.ink }}>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: ratio.suppressed ? C.muted : C.ink }}>
                {ratio.display}
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {" "}
                  ÷ {ratio.denominator} {ratio.unit}
                </span>
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 4 }}>↳ {ratio.note}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 12 }}>{RATIOS_NOT_BUILT}</div>
    </>
  );
}

export default SpendByFunction;