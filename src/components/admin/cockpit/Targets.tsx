import { useCallback, useEffect, useState } from "react";
import {
  AdminMetrics,
  Cohort,
  FUNNEL_ORDER,
  MetricKey,
  countWhere,
  loadAdminMetrics,
  metricValue,
} from "@/lib/adminMetrics";
import {
  MetricTarget,
  NO_TARGET_LINE,
  TARGET_BASELINE_NOTE,
  TargetDraft,
  dueTargets,
  labelFor,
  loadTargets,
  saveTarget,
  settleTarget,
  targetFor,
  targetGapLine,
  targetPrompt,
  targetReviewSentence,
  validateTarget,
} from "@/lib/adminTargets";
import { Btn, C, Finding, Label, MONO, SERIF } from "./ui";

/**
 * TARGETS in the cockpit.
 *
 * Beside every funnel metric there is either a target and the gap to it, or
 * the words "no target set". Never a blank. Never a zero standing in for a
 * target that was never set.
 */

export type TargetsState = {
  rows: MetricTarget[];
  metrics: AdminMetrics | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useTargets(): TargetsState {
  const [rows, setRows] = useState<MetricTarget[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([loadTargets(), loadAdminMetrics().catch(() => null)])
      .then(([t, m]) => {
        setRows(t);
        setMetrics(m);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);
  return { rows, metrics, loading, error, reload };
}

const input: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  padding: "8px 10px",
  background: C.paper,
  border: `1px solid ${C.rule}`,
  borderRadius: 3,
  color: C.ink,
  width: "100%",
};

/** The quiet grey line that sits under a funnel bar. */
export function TargetLine({
  metricKey,
  current,
  state,
  onSet,
}: {
  metricKey: MetricKey;
  current: number | null;
  state: TargetsState;
  onSet?: (key: MetricKey) => void;
}) {
  if (state.loading || state.error) return null;
  const t = targetFor(state.rows, metricKey);
  const line = targetGapLine(t, current);
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, color: line.met ? C.teal : C.muted, marginTop: 2 }}>
      ↳ {line.text}
      {!line.hasTarget && onSet && (
        <>
          {" · "}
          <button
            type="button"
            onClick={() => onSet(metricKey)}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 10,
              color: C.muted,
              borderBottom: `1px solid ${C.rule}`,
            }}
          >
            set a target
          </button>
        </>
      )}
    </div>
  );
}

/** One line, only once a cohort has reached five people. Otherwise nothing. */
export function TargetPromptLine({ state, cohorts }: { state: TargetsState; cohorts: Cohort[] }) {
  if (state.loading || state.error) return null;
  const line = targetPrompt(cohorts, state.rows, state.metrics);
  if (!line) return null;
  return (
    <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.5, color: C.ink, marginTop: 12 }}>{line}</div>
  );
}

/* ---------- the review, identical in behaviour to a due decision ---------- */

function TargetReviewCard({
  target,
  metrics,
  onSettled,
}: {
  target: MetricTarget;
  metrics: AdminMetrics | null;
  onSettled: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const settle = async (verdict: "kept" | "revised" | "dropped") => {
    setBusy(true);
    setErr(null);
    try {
      await settleTarget(target, verdict, note);
      onSettled();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const live = metrics ? metricValue(metrics, target.metric_key as MetricKey) : null;

  return (
    <Finding
      colour={live !== null && live >= target.target_value ? C.teal : C.damber}
      finding={targetReviewSentence(target, metrics)}
      example={target.rationale}
      recommendation="Keep it, revise it or drop it. A target nobody calls is a target nobody believed."
      action={
        <div style={{ width: "100%" }}>
          <input
            style={{ ...input, marginBottom: 8 }}
            placeholder="A line on why (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => settle("kept")} disabled={busy}>
              Keep it
            </Btn>
            <Btn tone="quiet" onClick={() => settle("revised")} disabled={busy}>
              Revise it
            </Btn>
            <Btn tone="ox" onClick={() => settle("dropped")} disabled={busy}>
              Drop it
            </Btn>
          </div>
          {err && <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox, marginTop: 8 }}>{err}</div>}
        </div>
      }
      countedFrom="metric_targets.target_by <= today and status = active"
    />
  );
}

/** Targets that have come due, for the DECIDE section. */
export function TargetsDue({ state }: { state: TargetsState }) {
  if (state.loading || state.error) return null;
  const due = dueTargets(state.rows);
  if (countWhere(due, () => true) === 0) return null;
  return (
    <>
      {due.map((t) => (
        <TargetReviewCard key={t.id} target={t} metrics={state.metrics} onSettled={state.reload} />
      ))}
    </>
  );
}

/* ---------- setting one ---------- */

const emptyDraft: TargetDraft = { metric_key: "", target_value: "", target_by: "", rationale: "" };

export function SetTargetForm({
  state,
  presetKey,
  onSaved,
}: {
  state: TargetsState;
  presetKey?: MetricKey | null;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<TargetDraft>({ ...emptyDraft, metric_key: presetKey ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetKey) setDraft((d) => ({ ...d, metric_key: presetKey }));
  }, [presetKey]);

  const set = (k: keyof TargetDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const baselinePreview =
    draft.metric_key && state.metrics
      ? metricValue(state.metrics, draft.metric_key as MetricKey)
      : null;

  const save = async () => {
    const problem = validateTarget(draft);
    if (problem) {
      setMsg(problem);
      return;
    }
    setBusy(true);
    try {
      await saveTarget(draft, state.metrics);
      setDraft(emptyDraft);
      setMsg(null);
      state.reload();
      onSaved?.();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 4, padding: 14, marginTop: 18 }}>
      <Label>Set a target</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginTop: 12 }}>
        <select style={input} value={draft.metric_key} onChange={(e) => set("metric_key", e.target.value)}>
          <option value="">Metric…</option>
          {FUNNEL_ORDER.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          style={input}
          type="number"
          placeholder="Number to reach"
          value={draft.target_value}
          onChange={(e) => set("target_value", e.target.value)}
        />
        <input style={input} type="date" value={draft.target_by} onChange={(e) => set("target_by", e.target.value)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <input
          style={input}
          placeholder="One line on why this number and this date"
          value={draft.rationale}
          onChange={(e) => set("rationale", e.target.value)}
        />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 10 }}>
        {TARGET_BASELINE_NOTE}
        {draft.metric_key && (
          <>
            {" "}
            Today it reads {baselinePreview === null ? "unknown" : baselinePreview}.
          </>
        )}
      </div>
      {msg && <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ox, marginTop: 10 }}>{msg}</div>}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save target"}
        </Btn>
      </div>
    </div>
  );
}

/** The list of targets in force, and the plain truth when there are none. */
export function TargetsPanel({ state, presetKey }: { state: TargetsState; presetKey?: MetricKey | null }) {
  if (state.loading) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Reading targets…</div>;
  if (state.error) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox }}>{state.error}</div>;
  const inForce = state.rows.filter((t) => t.status === "active");
  const n = countWhere(inForce, () => true);
  return (
    <>
      <Label>Targets in force · {n}</Label>
      <div style={{ marginTop: 8 }}>
        {n === 0 ? (
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>
            No target is set on any metric — {NO_TARGET_LINE} anywhere. Nothing has been invented to fill the space.
          </div>
        ) : (
          inForce.map((t) => (
            <div key={t.id} style={{ borderTop: `1px solid ${C.rule}`, padding: "10px 0" }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, color: C.ink }}>
                {labelFor(t.metric_key)} → {t.target_value} by {t.target_by}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 4 }}>
                baseline {t.baseline_value === null ? "not captured" : t.baseline_value} on {t.baseline_on ?? t.set_on} ·{" "}
                {t.rationale}
              </div>
            </div>
          ))
        )}
      </div>
      <SetTargetForm state={state} presetKey={presetKey} />
    </>
  );
}