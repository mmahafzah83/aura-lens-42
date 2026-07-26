/**
 * "Is it working?" — cohorts, trend, and ship markers.
 *
 * Answers a different question from the rest of the cockpit. Everything else
 * says what is happening today; this says whether what we shipped changed
 * anything. Two rules run through it:
 *
 *  1. A percentage is only shown when the cohort has enough people for one to
 *     mean something. Below that the number of people is the whole truth.
 *  2. RECORDED history (what the brief said that morning, solid) is never
 *     merged with RECONSTRUCTED history (derived now from raw timestamps,
 *     dashed). Reconstruction is read-only; nothing is written back.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cohort,
  COHORT_MIN_FOR_PCT,
  COHORT_STAGES,
  COHORT_TOO_SMALL_NOTE,
  HISTORY_LEGEND,
  ShipMarker,
  StageKey,
  TREND_STAGES,
  TrendPoint,
  addShipMarker,
  cohortPct,
  cohortVerdict,
  loadCohorts,
  loadRecordedHistory,
  loadShipMarkers,
  loadStageTimeline,
} from "@/lib/adminMetrics";
import { Btn, C, Label, MONO, SERIF, Table } from "./ui";

export type IsItWorking = {
  cohorts: Cohort[];
  timeline: TrendPoint[];
  recorded: Record<string, Record<string, number>>;
  markers: ShipMarker[];
  verdict: { line: string; enough: boolean };
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useIsItWorking(days = 90): IsItWorking {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [timeline, setTimeline] = useState<TrendPoint[]>([]);
  const [recorded, setRecorded] = useState<Record<string, Record<string, number>>>({});
  const [markers, setMarkers] = useState<ShipMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadCohorts(), loadStageTimeline(days), loadRecordedHistory(days), loadShipMarkers()])
      .then(([c, t, r, m]) => {
        setCohorts(c);
        setTimeline(t);
        setRecorded(r);
        setMarkers(m);
      })
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  const verdict = useMemo(() => cohortVerdict(cohorts), [cohorts]);
  return { cohorts, timeline, recorded, markers, verdict, loading, error, reload: load };
}

/* --------------------------------- chart --------------------------------- */

const W = 720;
const H = 240;
const PAD = { l: 34, r: 12, t: 14, b: 26 };

function TrendChart({
  timeline,
  recorded,
  markers,
  stage,
}: {
  timeline: TrendPoint[];
  recorded: Record<string, Record<string, number>>;
  markers: ShipMarker[];
  stage: StageKey;
}) {
  const def = TREND_STAGES.find((s) => s.key === stage)!;
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  if (!first || !last) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>
        No history to draw yet.
      </div>
    );
  }

  const t0 = Date.parse(first.day);
  const t1 = Date.parse(last.day);
  const span = Math.max(t1 - t0, 1);

  let peak = 1;
  for (const p of timeline) peak = Math.max(peak, p[stage]);
  for (const day of Object.keys(recorded)) {
    const v = def.recordedKey ? recorded[day]?.[def.recordedKey] : undefined;
    if (typeof v === "number") peak = Math.max(peak, v);
  }

  const x = (day: string) => PAD.l + ((Date.parse(day) - t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / peak) * (H - PAD.t - PAD.b);

  const dashed = timeline.map((p) => `${x(p.day)},${y(p[stage])}`).join(" ");

  const recordedPoints = def.recordedKey
    ? Object.keys(recorded)
        .filter((d) => Date.parse(d) >= t0 && typeof recorded[d][def.recordedKey!] === "number")
        .sort()
        .map((d) => ({ d, v: recorded[d][def.recordedKey!] }))
    : [];
  const solid = recordedPoints.map((p) => `${x(p.d)},${y(p.v)}`).join(" ");

  const ticks = [0, Math.round(peak / 2), peak].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${def.label} over time`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={C.rule} strokeWidth={1} />
            <text x={4} y={y(v) + 4} fill={C.muted} fontFamily={MONO} fontSize={10}>
              {v}
            </text>
          </g>
        ))}

        {(() => {
          const shown = markers.filter(
            (m) => Date.parse(m.shipped_on) >= t0 && Date.parse(m.shipped_on) <= t1,
          );
          // Two things shipped on one day must not print on top of each other.
          const seen: Record<string, number> = {};
          return shown.map((m) => {
            const rank = seen[m.shipped_on] ?? 0;
            seen[m.shipped_on] = rank + 1;
            const lx = x(m.shipped_on) + 4 + rank * 12;
            return (
            <g key={m.id}>
              <line
                x1={x(m.shipped_on)}
                x2={x(m.shipped_on)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke={C.ox}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={lx}
                y={PAD.t + 8}
                fill={C.ox}
                fontFamily={MONO}
                fontSize={9}
                transform={`rotate(90 ${lx} ${PAD.t + 8})`}
              >
                {m.title.length > 30 ? `${m.title.slice(0, 29)}…` : m.title}
              </text>
            </g>
            );
          });
        })()}

        <polyline points={dashed} fill="none" stroke={C.muted} strokeWidth={1.6} strokeDasharray="5 4" />
        {recordedPoints.length > 1 && (
          <polyline points={solid} fill="none" stroke={C.ink} strokeWidth={2} />
        )}
        {recordedPoints.map((p) => (
          <circle key={p.d} cx={x(p.d)} cy={y(p.v)} r={3} fill={C.ink} />
        ))}

        <text x={PAD.l} y={H - 8} fill={C.muted} fontFamily={MONO} fontSize={10}>
          {first.day}
        </text>
        <text x={W - PAD.r} y={H - 8} fill={C.muted} fontFamily={MONO} fontSize={10} textAnchor="end">
          {last.day}
        </text>
      </svg>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 4 }}>
        {HISTORY_LEGEND}
        {recordedPoints.length === 0 && " No recorded history for this stage yet — the solid line begins the day the brief starts storing it."}
      </div>
    </div>
  );
}

/* ---------------------------------- zone ---------------------------------- */

export default function IsItWorkingZone({ data }: { data: IsItWorking }) {
  const { cohorts, timeline, recorded, markers, verdict, loading, error, reload } = data;
  const [stage, setStage] = useState<StageKey>("captured");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ shipped_on: new Date().toISOString().slice(0, 10), title: "", notes: "" });
  const [saving, setSaving] = useState(false);

  if (loading) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>Reading history…</div>;
  if (error)
    return (
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.ox }}>
        History could not be read: {error}
      </div>
    );

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await addShipMarker(form);
      setForm({ shipped_on: new Date().toISOString().slice(0, 10), title: "", notes: "" });
      setAdding(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const input: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 12,
    padding: "8px 10px",
    border: `1px solid ${C.rule}`,
    borderRadius: 3,
    background: C.paper,
    color: C.ink,
  };

  return (
    <>
      <Label>Sign-up week cohorts</Label>
      <div style={{ height: 10 }} />
      <Table
        head={["Signed up week", "People", ...COHORT_STAGES.map((s) => s.label)]}
        rows={cohorts.map((c) => [
          c.cohortWeek,
          c.size,
          ...COHORT_STAGES.map((s) => {
            const reached = c[s.key];
            const pct = cohortPct(reached, c.size);
            return (
              <span key={s.key} style={{ fontFamily: MONO, fontSize: 12 }}>
                {reached}
                {pct === null ? (
                  <span style={{ color: C.muted }} title={COHORT_TOO_SMALL_NOTE}>
                    {" "}
                    of {c.size}
                  </span>
                ) : (
                  <span style={{ color: C.muted }}> · {pct}%</span>
                )}
              </span>
            );
          }),
        ])}
      />
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 6 }}>
        Percentages appear only for weeks with {COHORT_MIN_FOR_PCT} or more people. Below that a percentage
        would flatter or damn one person. Founder and test accounts are excluded.
      </div>

      <div style={{ height: 1, background: C.rule, margin: "22px 0" }} />

      <Label>Ninety days, one stage at a time</Label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 14px" }}>
        {TREND_STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStage(s.key)}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "5px 9px",
              borderRadius: 3,
              border: `1px solid ${stage === s.key ? C.ink : C.rule}`,
              color: stage === s.key ? C.ink : C.muted,
              background: stage === s.key ? C.paper : "transparent",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <TrendChart timeline={timeline} recorded={recorded} markers={markers} stage={stage} />

      <div style={{ height: 1, background: C.rule, margin: "22px 0" }} />

      <Label>What we shipped</Label>
      <div style={{ height: 10 }} />
      <Table
        head={["Shipped", "What", "Note"]}
        rows={markers.map((m) => [m.shipped_on, m.title, m.notes ?? "—"])}
      />
      <div style={{ marginTop: 12 }}>
        {adding ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="date"
              value={form.shipped_on}
              onChange={(e) => setForm({ ...form, shipped_on: e.target.value })}
              style={input}
            />
            <input
              placeholder="What shipped"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{ ...input, flex: "1 1 200px" }}
            />
            <input
              placeholder="Note (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ ...input, flex: "1 1 200px" }}
            />
            <Btn onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : "Save marker"}
            </Btn>
            <Btn tone="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <Btn tone="quiet" onClick={() => setAdding(true)}>
            Add a ship marker
          </Btn>
        )}
      </div>

      <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.5, color: C.ink, marginTop: 20 }}>
        {verdict.line}
      </div>
    </>
  );
}