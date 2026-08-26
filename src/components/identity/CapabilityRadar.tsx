import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The capability radar for "Where you stand".
 *
 * Every question, anchor sentence and why_line is read from
 * `capability_dimensions` — nothing about the instrument lives in this file.
 * The stored level (1/2/3) is positional and is never shown to the member.
 */

const INK = "#0F1519";
const INK_2 = "#5B6673";
const BORDER = "#E2E7EE";
const BLUE = "#0670C4";
const BLUE_HOVER = "#04477C";
const CYAN = "#00CEC9";
const NIGHT = "#0F1519";
const MONO = "'IBM Plex Mono', monospace";
const UI = "Inter, system-ui, sans-serif";

type Band = "work" | "table" | "room";

interface Dimension {
  id: string;
  name: string;
  why_line: string | null;
  anchor_low: string;
  anchor_mid: string;
  anchor_high: string;
  position: number;
}

interface Snapshot {
  id: string;
  band: Band;
  levels: Record<string, number>;
  taken_at: string;
}

const BAND_CARDS: { band: Band; title: string; line: string }[] = [
  { band: "work", title: "The work", line: "Your name is on the delivery." },
  { band: "table", title: "The table", line: "You defend the programme and the budget." },
  { band: "room", title: "The room", line: "You set the direction others work to." },
];

const anchorFor = (d: Dimension, level: number) =>
  level === 1 ? d.anchor_low : level === 2 ? d.anchor_mid : d.anchor_high;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ── Geometry ───────────────────────────────────────────────────────────── */

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 96;

const pointAt = (index: number, count: number, ratio: number) => {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return { x: CX + Math.cos(angle) * R * ratio, y: CY + Math.sin(angle) * R * ratio };
};

/** Wrap a label to at most two short lines so raw <text> cannot overflow. */
const wrapLabel = (label: string, max = 16): string[] => {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    const rest = lines.slice(1).join(" ");
    return [lines[0], rest.length > max ? rest.slice(0, max - 1) + "…" : rest];
  }
  return lines;
};

/* ── Component ──────────────────────────────────────────────────────────── */

interface Props {
  userId: string | null;
  band: Band | null;
  onBandChosen?: (band: Band) => void;
}

const CapabilityRadar: React.FC<Props> = ({ userId, band, onBandChosen }) => {
  const reduced = usePrefersReducedMotion();
  const [dims, setDims] = useState<Dimension[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [chooser, setChooser] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const rtl = typeof document !== "undefined" && document.dir === "rtl";

  const load = useCallback(async () => {
    if (!userId || !band) { setLoading(false); return; }
    setLoading(true);
    const [dimRes, respRes, snapRes] = await Promise.all([
      (supabase.from("capability_dimensions") as any)
        .select('id, name, why_line, anchor_low, anchor_mid, anchor_high, "position"')
        .eq("active", true).eq("band", band).order("position", { ascending: true }),
      (supabase.from("capability_responses" as any) as any)
        .select("dimension_id, level").eq("user_id", userId),
      (supabase.from("capability_radar_snapshots" as any) as any)
        .select("id, band, levels, taken_at").eq("user_id", userId)
        .order("taken_at", { ascending: false }).limit(10),
    ]);
    const ds = (dimRes?.data ?? []) as Dimension[];
    setDims(ds);
    const allowed = new Set(ds.map((d) => d.id));
    const map: Record<string, number> = {};
    ((respRes?.data ?? []) as any[]).forEach((r) => {
      if (allowed.has(r.dimension_id)) map[r.dimension_id] = Number(r.level);
    });
    setLevels(map);
    setSnapshots(((snapRes?.data ?? []) as any[]).map((s) => ({
      id: s.id, band: s.band, levels: (s.levels || {}) as Record<string, number>, taken_at: s.taken_at,
    })));
    setLoading(false);
  }, [userId, band]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (!band) setChooser(true); }, [band]);

  const answeredCount = useMemo(
    () => dims.filter((d) => levels[d.id]).length,
    [dims, levels],
  );
  const complete = dims.length > 0 && answeredCount === dims.length;

  const chooseBand = async (b: Band) => {
    if (!userId) return;
    setSaving(true);
    await (supabase.from("diagnostic_profiles") as any)
      .update({ seniority_band: b, band_source: "answered" })
      .eq("user_id", userId);
    setSaving(false);
    setChooser(false);
    onBandChosen?.(b);
  };

  const saveAnswer = async (dimensionId: string, level: number) => {
    if (!userId) return;
    setLevels((prev) => ({ ...prev, [dimensionId]: level }));
    const { error } = await (supabase.from("capability_responses" as any) as any)
      .upsert(
        { user_id: userId, dimension_id: dimensionId, level, instrument_version: 2, answered_at: new Date().toISOString() },
        { onConflict: "user_id,dimension_id" },
      );
    if (error) console.error("[CapabilityRadar] answer save failed", error);
  };

  const finish = async (finalLevels: Record<string, number>) => {
    if (!userId || !band) return;
    const payload: Record<string, number> = {};
    dims.forEach((d) => { if (finalLevels[d.id]) payload[d.id] = finalLevels[d.id]; });
    const { error } = await (supabase.from("capability_radar_snapshots" as any) as any)
      .insert({ user_id: userId, band, instrument_version: 2, levels: payload });
    if (error) console.error("[CapabilityRadar] snapshot failed", error);
    setAssessing(false);
    await load();
  };

  /* ── Band chooser ─────────────────────────────────────────────────── */
  if (chooser || !band) {
    return (
      <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 20, padding: 20 }}>
        <div style={{ fontFamily: UI, fontSize: 15, color: INK, fontWeight: 500, marginBottom: 4 }}>
          Which of these rooms is yours?
        </div>
        <div style={{ fontFamily: UI, fontSize: 13, color: INK_2, marginBottom: 14 }}>
          The eight questions are different for each one.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {BAND_CARDS.map((c) => (
            <button
              key={c.band}
              type="button"
              disabled={saving}
              onClick={() => chooseBand(c.band)}
              style={{
                textAlign: "start",
                background: c.band === band ? "rgba(6,112,196,0.06)" : "#FFFFFF",
                border: `1px solid ${c.band === band ? BLUE : BORDER}`,
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              <div style={{ fontFamily: UI, fontSize: 15, fontWeight: 500, color: INK }}>{c.title}</div>
              <div style={{ fontFamily: UI, fontSize: 13, color: INK_2, marginTop: 2 }}>{c.line}</div>
            </button>
          ))}
        </div>
        {band && (
          <button
            type="button"
            onClick={() => setChooser(false)}
            style={{ marginTop: 12, background: "transparent", border: "none", color: BLUE, fontFamily: UI, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            Keep what I have
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: NIGHT, borderRadius: 20, height: 320 }} aria-busy="true" />
    );
  }

  /* ── Assessment ───────────────────────────────────────────────────── */
  if (assessing) {
    return (
      <Assessment
        dims={dims}
        levels={levels}
        reduced={reduced}
        onAnswer={saveAnswer}
        onFinish={finish}
        onExit={() => setAssessing(false)}
      />
    );
  }

  /* ── Radar ────────────────────────────────────────────────────────── */
  const count = dims.length || 8;
  const ratio = (lvl?: number) => (lvl === 1 ? 0.33 : lvl === 2 ? 0.66 : lvl === 3 ? 1 : 0);

  const bandSnaps = snapshots.filter((s) => s.band === band);
  const current = complete ? bandSnaps[0] ?? null : null;
  // Never overlay a shape taken against a different set of eight questions.
  const prevSnap = complete ? bandSnaps[1] ?? null : bandSnaps[0] ?? null;
  const answeredOtherBand = answeredCount === 0 && snapshots.some((s) => s.band !== band);

  const polygon = dims
    .map((d, i) => {
      const p = pointAt(i, count, ratio(levels[d.id]));
      return `${p.x},${p.y}`;
    })
    .join(" ");

  const prevPolygon = prevSnap
    ? dims.map((d, i) => {
        const p = pointAt(i, count, ratio(prevSnap.levels[d.id]));
        return `${p.x},${p.y}`;
      }).join(" ")
    : null;

  const lowest = complete
    ? [...dims].sort((a, b) => (levels[a.id] ?? 3) - (levels[b.id] ?? 3)).slice(0, 2)
    : [];

  return (
    <div style={{ background: NIGHT, borderRadius: 20, padding: 20, color: "#FFFFFF" }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        role="img"
        aria-label="Capability radar"
        style={{ display: "block", maxWidth: 380, marginInline: "auto" }}
      >
        {[0.33, 0.66, 1].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={R * r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        ))}
        {dims.map((d, i) => {
          const tip = pointAt(i, count, 1);
          return <line key={d.id} x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />;
        })}

        {prevPolygon && (
          <polygon points={prevPolygon} fill="none" stroke={CYAN} strokeOpacity={0.35} strokeWidth={1} />
        )}

        {answeredCount > 0 && (
          <>
            <polygon
              points={polygon}
              fill={complete ? CYAN : "none"}
              fillOpacity={complete ? 0.16 : 0}
              stroke={CYAN}
              strokeWidth={2}
            />
            {dims.map((d, i) => {
              if (!levels[d.id]) return null;
              const p = pointAt(i, count, ratio(levels[d.id]));
              return <circle key={d.id} cx={p.x} cy={p.y} r={3} fill={CYAN} />;
            })}
          </>
        )}

        {answeredCount === 0 && <circle cx={CX} cy={CY} r={3} fill="rgba(255,255,255,0.35)" />}

        {dims.map((d, i) => {
          const tip = pointAt(i, count, 1.16);
          const onRight = tip.x > CX + 2;
          const onLeft = tip.x < CX - 2;
          // Under RTL, "start" anchors the right-hand side; deriving from
          // direction keeps every label on canvas in both directions.
          const startSide = rtl ? onRight : onLeft;
          const anchor = onRight === onLeft ? "middle" : startSide ? "start" : "end";
          const lines = wrapLabel(d.name);
          return (
            <text
              key={d.id}
              x={tip.x}
              y={tip.y - (lines.length - 1) * 5}
              textAnchor={anchor}
              style={{ fontFamily: MONO, fontSize: 8.5, fill: "#FFFFFF", letterSpacing: "0.04em" }}
            >
              {lines.map((l, li) => (
                <tspan key={li} x={tip.x} dy={li === 0 ? 0 : 10}>{l}</tspan>
              ))}
            </text>
          );
        })}
      </svg>

      {prevSnap && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 10, letterSpacing: "0.08em" }}>
          PREVIOUS · {fmtShort(prevSnap.taken_at)}
        </div>
      )}

      {answeredCount === 0 && (
        <div style={{ marginTop: 16 }}>
          {answeredOtherBand && (
            <p style={{ fontFamily: UI, fontSize: 14, color: "rgba(255,255,255,0.72)", margin: "0 0 8px" }}>
              You're reading at the {band} now. These eight are different.
            </p>
          )}
          <p style={{ fontFamily: UI, fontSize: 14, color: "rgba(255,255,255,0.86)", margin: "0 0 14px" }}>
            Eight questions about how far your work travels. Two minutes.
          </p>
          <PrimaryButton onClick={() => setAssessing(true)}>Answer the eight</PrimaryButton>
        </div>
      )}

      {answeredCount > 0 && !complete && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.86)", marginBottom: 12 }}>
            {answeredCount} OF {dims.length} ANSWERED
          </div>
          <PrimaryButton onClick={() => setAssessing(true)}>Continue</PrimaryButton>
        </div>
      )}

      {complete && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.86)" }}>
            ANSWERED {current ? fmtDate(current.taken_at) : ""} · BAND: {band.toUpperCase()}
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {lowest.map((d) => (
              <div key={d.id} style={{ fontFamily: UI, fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 1.5 }}>
                {d.name} — you said: “{anchorFor(d, levels[d.id])}”
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAssessing(true)}
            style={{
              marginTop: 14, background: "transparent", border: "none", padding: 0,
              color: "#7FC0F2", fontFamily: UI, fontSize: 13, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Answer again
          </button>
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>
        BAND: {band.toUpperCase()} ·{" "}
        <button
          type="button"
          onClick={() => setChooser(true)}
          style={{ background: "transparent", border: "none", padding: 0, color: "#7FC0F2", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
        >
          change
        </button>
      </div>
    </div>
  );
};

/* ── Primary button ─────────────────────────────────────────────────── */

const PrimaryButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? BLUE_HOVER : BLUE,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 8,
        padding: "12px 18px",
        minHeight: 44,
        fontFamily: UI,
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
};

/* ── Assessment ─────────────────────────────────────────────────────── */

interface AssessProps {
  dims: Dimension[];
  levels: Record<string, number>;
  reduced: boolean;
  onAnswer: (dimensionId: string, level: number) => void;
  onFinish: (levels: Record<string, number>) => void;
  onExit: () => void;
}

const Assessment: React.FC<AssessProps> = ({ dims, levels, reduced, onAnswer, onFinish, onExit }) => {
  const firstUnanswered = Math.max(0, dims.findIndex((d) => !levels[d.id]));
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);
  const [local, setLocal] = useState<Record<string, number>>(levels);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const dim = dims[index];
  if (!dim) return null;

  const anchors = [dim.anchor_low, dim.anchor_mid, dim.anchor_high];
  const selected = local[dim.id];

  const pick = (level: number) => {
    const next = { ...local, [dim.id]: level };
    setLocal(next);
    onAnswer(dim.id, level);
    const advance = () => {
      if (index + 1 < dims.length) setIndex(index + 1);
      else onFinish(next);
    };
    if (reduced) advance();
    else timer.current = window.setTimeout(advance, 250);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 20, padding: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: INK_2 }}>
        {pad(index + 1)} / {pad(dims.length)}
      </div>
      <h3 style={{ fontFamily: UI, fontSize: 18, fontWeight: 500, color: INK, margin: "10px 0 6px", lineHeight: 1.35 }}>
        {dim.name}
      </h3>
      {dim.why_line && (
        <p style={{ fontFamily: UI, fontSize: 13, fontStyle: "italic", color: INK_2, margin: "0 0 16px", lineHeight: 1.5 }}>
          {dim.why_line}
        </p>
      )}

      <div role="radiogroup" aria-label={dim.name} style={{ display: "grid", gap: 10 }}>
        {anchors.map((sentence, i) => {
          const level = i + 1;
          const isSel = selected === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSel}
              onClick={() => pick(level)}
              className="capability-anchor"
              style={{
                textAlign: "start",
                width: "100%",
                minHeight: 44,
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${isSel ? BLUE : BORDER}`,
                background: isSel ? "rgba(6,112,196,0.08)" : "#FFFFFF",
                color: INK,
                fontFamily: UI,
                fontSize: 14,
                lineHeight: 1.5,
                cursor: "pointer",
              }}
            >
              {sentence}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => (index === 0 ? onExit() : setIndex(index - 1))}
          style={{ background: "transparent", border: "none", padding: 0, color: BLUE, fontFamily: UI, fontSize: 13, cursor: "pointer", minHeight: 44 }}
        >
          {index === 0 ? "Back to the radar" : "Back"}
        </button>
      </div>

      <style>{`
        .capability-anchor:focus-visible {
          outline: 2px solid ${BLUE};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

export default CapabilityRadar;
