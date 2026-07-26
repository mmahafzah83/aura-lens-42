import { useCallback, useEffect, useState } from "react";
import {
  AdminMetrics,
  Decision,
  DECISION_BLOCKED_MESSAGE,
  DECISION_METRIC_OPTIONS,
  DECISION_STATUS_LABEL,
  DecisionDraft,
  countWhere,
  daysUntilReview,
  decisionScoreboard,
  dueDecisions,
  loadAdminMetrics,
  loadDecisions,
  openDecisions,
  pendingDecisions,
  reviewSentence,
  saveDecision,
  settleDecision,
  settledDecisions,
  validateDecision,
} from "@/lib/adminMetrics";
import { Btn, C, Finding, Label, MONO, SERIF } from "./ui";

/**
 * The decision log — and, more to the point, the review loop.
 *
 * A decision that comes due and does not appear in front of the founder is a
 * decision that will never be reviewed, so due items render both here and in
 * the DECIDE section of the cockpit.
 */

export type DecisionsState = {
  rows: Decision[];
  /** Today's brief — the only source of a baseline or an actual value. */
  metrics: AdminMetrics | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useDecisions(): DecisionsState {
  const [rows, setRows] = useState<Decision[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([loadDecisions(), loadAdminMetrics().catch(() => null)])
      .then(([r, m]) => {
        setRows(r);
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

/* ---------- the review card: the actual point of this build ---------- */

export function ReviewCard({
  decision,
  metrics,
  onSettled,
}: {
  decision: Decision;
  metrics: AdminMetrics | null;
  onSettled: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const settle = async (verdict: "confirmed" | "refuted" | "inconclusive") => {
    setBusy(true);
    setErr(null);
    try {
      await settleDecision(decision, verdict, note, metrics);
      onSettled();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Finding
      colour={C.damber}
      finding={reviewSentence(decision, metrics)}
      example={decision.expected_outcome ?? decision.decision}
      recommendation="Call it now. An unreviewed decision teaches you nothing."
      action={
        <div style={{ width: "100%" }}>
          <input
            style={{ ...input, marginBottom: 8 }}
            placeholder="A line on why (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => settle("confirmed")} disabled={busy}>
              Worked
            </Btn>
            <Btn tone="ox" onClick={() => settle("refuted")} disabled={busy}>
              Did not work
            </Btn>
            <Btn tone="quiet" onClick={() => settle("inconclusive")} disabled={busy}>
              Cannot tell yet
            </Btn>
          </div>
          {err && <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox, marginTop: 8 }}>{err}</div>}
        </div>
      }
      countedFrom="decisions.review_on <= today and status = open"
    />
  );
}

/** Due decisions, for the DECIDE section of the Today zone. */
export function DecisionsDue({ state }: { state: DecisionsState }) {
  const metrics = state.metrics;
  const due = dueDecisions(state.rows);
  if (state.loading || state.error || countWhere(due, () => true) === 0) return null;
  return (
    <>
      {due.map((d) => (
        <ReviewCard key={d.id} decision={d} metrics={metrics} onSettled={state.reload} />
      ))}
    </>
  );
}

/* ---------- the new decision form ---------- */

const emptyDraft: DecisionDraft = {
  title: "",
  decision: "",
  rationale: "",
  expected_outcome: "",
  metric_key: "",
  expected_value: "",
  review_on: "",
  status: "open",
};

function NewDecisionForm({ metrics, onSaved }: { metrics: AdminMetrics | null; onSaved: () => void }) {
  const [draft, setDraft] = useState<DecisionDraft>(emptyDraft);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof DecisionDraft, v: string) => setDraft((d) => ({ ...d, [k]: v } as DecisionDraft));
  const blocked = validateDecision(draft);

  const save = async () => {
    const problem = validateDecision(draft);
    if (problem) {
      setMsg(problem);
      return;
    }
    setBusy(true);
    try {
      await saveDecision(draft, metrics);
      setDraft(emptyDraft);
      setMsg(null);
      onSaved();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 4, padding: 14, marginTop: 18 }}>
      <Label>Write down a decision</Label>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <input style={input} placeholder="Title" value={draft.title} onChange={(e) => set("title", e.target.value)} />
        <textarea
          style={{ ...input, minHeight: 54 }}
          placeholder="What was decided"
          value={draft.decision}
          onChange={(e) => set("decision", e.target.value)}
        />
        <textarea
          style={{ ...input, minHeight: 44 }}
          placeholder="Why (the evidence in front of you today)"
          value={draft.rationale}
          onChange={(e) => set("rationale", e.target.value)}
        />
        <textarea
          style={{ ...input, minHeight: 44 }}
          placeholder="What you expect to happen"
          value={draft.expected_outcome}
          onChange={(e) => set("expected_outcome", e.target.value)}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
          <select style={input} value={draft.status} onChange={(e) => set("status", e.target.value)}>
            <option value="open">Decided — put it in flight</option>
            <option value="pending">Not decided yet — leave it on the desk</option>
          </select>
          <select style={input} value={draft.metric_key} onChange={(e) => set("metric_key", e.target.value)}>
            <option value="">Metric it should move…</option>
            {DECISION_METRIC_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            style={input}
            type="number"
            placeholder="Expected value"
            disabled={draft.metric_key === "none"}
            value={draft.expected_value}
            onChange={(e) => set("expected_value", e.target.value)}
          />
          <input style={input} type="date" value={draft.review_on} onChange={(e) => set("review_on", e.target.value)} />
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 10 }}>
        The baseline is captured by the system from today&apos;s brief. You are never asked to type it.
      </div>
      {msg && (
        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ox, marginTop: 10 }}>{msg}</div>
      )}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={save} disabled={busy} title={blocked ?? undefined}>
          {busy ? "Saving…" : "Save decision"}
        </Btn>
      </div>
    </div>
  );
}

/* ---------- the zone ---------- */

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 0" }}>{children}</div>
  );
}

export function DecisionsZone({ state }: { state: DecisionsState }) {
  const metrics = state.metrics;
  if (state.loading) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Reading the decision log…</div>;
  if (state.error) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.ox }}>{state.error}</div>;

  const board = decisionScoreboard(state.rows);
  const pending = pendingDecisions(state.rows);
  const open = openDecisions(state.rows);
  const settled = settledDecisions(state.rows);
  const due = dueDecisions(state.rows);

  return (
    <>
      <div style={{ fontFamily: SERIF, fontSize: 18, color: C.ink, marginBottom: 6 }}>{board.line}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginBottom: 18 }}>
        a decision without a metric, an expected value and a review date cannot be saved as in flight
      </div>

      {countWhere(due, () => true) > 0 && (
        <>
          <Label>Due for review today</Label>
          <div style={{ height: 10 }} />
          {due.map((d) => (
            <ReviewCard key={d.id} decision={d} metrics={metrics} onSettled={state.reload} />
          ))}
        </>
      )}

      <Label>Awaiting your call · {countWhere(pending, () => true)}</Label>
      {countWhere(pending, () => true) === 0 ? (
        <Row>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>Nothing undecided on the desk.</span>
        </Row>
      ) : (
        pending.map((d) => (
          <Row key={d.id}>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink }}>{d.title}</div>
            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, marginTop: 4 }}>{d.decision}</div>
            {d.rationale && (
              <div style={{ fontFamily: SERIF, fontSize: 14, color: C.muted, marginTop: 4 }}>{d.rationale}</div>
            )}
          </Row>
        ))
      )}

      <div style={{ height: 22 }} />
      <Label>In flight · {countWhere(open, () => true)}</Label>
      {countWhere(open, () => true) === 0 ? (
        <Row>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>No decision is waiting on a result.</span>
        </Row>
      ) : (
        open.map((d) => {
          const left = daysUntilReview(d.review_on);
          return (
            <Row key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink }}>{d.title}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: left !== null && left <= 0 ? C.ox : C.muted }}>
                  {left === null
                    ? "no review date"
                    : left <= 0
                      ? `due ${left === 0 ? "today" : `${-left} day${left === -1 ? "" : "s"} ago`}`
                      : `review in ${left} day${left === 1 ? "" : "s"}`}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 6 }}>
                {d.metric_key && d.metric_key !== "none"
                  ? `${d.metric_key}: baseline ${d.baseline_value ?? "unknown"} → expected ${d.expected_value ?? "?"}`
                  : "judged yes/no on the review date"}
              </div>
            </Row>
          );
        })
      )}

      <div style={{ height: 22 }} />
      <Label>Settled · {countWhere(settled, () => true)}</Label>
      {countWhere(settled, () => true) === 0 ? (
        <Row>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>Nothing reviewed yet.</span>
        </Row>
      ) : (
        settled.map((d) => (
          <Row key={d.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink }}>{d.title}</div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: d.status === "confirmed" ? C.teal : d.status === "refuted" ? C.ox : C.muted,
                }}
              >
                {DECISION_STATUS_LABEL[d.status]}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 6 }}>
              expected {d.expected_value ?? "yes/no"} · actual {d.actual_value ?? "judged"} · reviewed{" "}
              {d.reviewed_on ?? "—"}
            </div>
            {d.review_note && (
              <div style={{ fontFamily: SERIF, fontSize: 14, color: C.ink, marginTop: 4 }}>{d.review_note}</div>
            )}
          </Row>
        ))
      )}

      <NewDecisionForm metrics={metrics} onSaved={state.reload} />
    </>
  );
}

export default DecisionsZone;
