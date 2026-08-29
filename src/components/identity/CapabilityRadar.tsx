import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The capability radar for "Where you stand".
 *
 * Every question, anchor sentence and why_line is read from
 * `capability_dimensions` — nothing about the instrument lives in this file.
 * The stored level (1/2/3) is positional and is never shown to the member.
 *
 * Layout: geometry on one side, prose on the other. The SVG carries no words
 * beyond the 1–8 index markers; names live in the list where they can wrap.
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

/* White-on-night text scale — no invented colours, opacity only. */
const W_STRONG = "rgba(255,255,255,0.92)";
const W_BODY = "rgba(255,255,255,0.86)";
const W_LINK = "rgba(255,255,255,0.72)";
const W_DIM = "rgba(255,255,255,0.45)";
const W_LINE = "rgba(255,255,255,0.14)";
const W_SPOKE_ON = "rgba(255,255,255,0.35)";
const W_DOT_OFF = "rgba(255,255,255,0.20)";

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

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];


/* ── Geometry ───────────────────────────────────────────────────────────── */

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 108;

const pointAt = (index: number, count: number, ratio: number) => {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return { x: CX + Math.cos(angle) * R * ratio, y: CY + Math.sin(angle) * R * ratio };
};

/* ── Component ──────────────────────────────────────────────────────────── */

interface Props {
  userId: string | null;
  band: Band | null;
  onBandChosen?: (band: Band) => void;
}

const CapabilityRadar: React.FC<Props> = ({ userId, band, onBandChosen }) => {
  const [dims, setDims] = useState<Dimension[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [chooser, setChooser] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);

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

/* Select by VALUE, not by count: every dimension at the minimum answered
     level is marked. On a three-point scale ties are the normal case. */
  const minLevel = useMemo(
    () => (complete && dims.length ? Math.min(...dims.map((d) => levels[d.id] ?? 3)) : null),
    [complete, dims, levels],
  );
  const lowest = useMemo(
    () => (minLevel !== null && minLevel < 3
      ? dims.filter((d) => (levels[d.id] ?? 3) === minLevel)
      : []),
    [minLevel, dims, levels],
  );

  /* The thinnest points open on first render — that is what they came for. */
  useEffect(() => {
    if (defaultsApplied || !complete || lowest.length === 0) return;
    setExpanded(new Set(lowest.map((d) => d.id)));
    setDefaultsApplied(true);
  }, [complete, lowest, defaultsApplied]);

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
        { user_id: userId, dimension_id: dimensionId, level, instrument_version: 2 },
        { onConflict: "user_id,dimension_id" },
      );
    if (error) console.error("[CapabilityRadar] answer save failed", error);
  };

  const finish = async (finalLevels: Record<string, number>) => {
    if (!userId || !band) return;
    const payload: Record<string, number> = {};
    dims.forEach((d) => { if (finalLevels[d.id]) payload[d.id] = finalLevels[d.id]; });
    // Await the insert before the reload, or the reload can read 7 of 8.
    const { error } = await (supabase.from("capability_radar_snapshots" as any) as any)
      .insert({ user_id: userId, band, instrument_version: 2, levels: payload });
    if (error) console.error("[CapabilityRadar] snapshot failed", error);
    setAssessing(false);
    setDefaultsApplied(false);
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
      <div style={{ background: NIGHT, borderRadius: 20, height: 380 }} aria-busy="true" />
    );
  }

  /* ── Assessment ───────────────────────────────────────────────────── */
  if (assessing) {
    return (
      <Assessment
        dims={dims}
        levels={levels}
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

  const lowestIds = new Set(lowest.map((d) => d.id));

  return (
    <div style={{ background: NIGHT, borderRadius: 20, padding: 20, color: "#FFFFFF" }}>
      <div className="cap-radar-grid">
        {/* LEFT — geometry only */}
        <div>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width="100%"
            role="img"
            aria-label="What you can do"
            style={{ display: "block", aspectRatio: "1 / 1", maxWidth: 320, marginInline: "auto" }}
          >
            {[0.33, 0.66, 1].map((r) => (
              <circle key={r} cx={CX} cy={CY} r={R * r} fill="none" stroke={W_LINE} strokeWidth={1} />
            ))}
            {dims.map((d, i) => {
              const tip = pointAt(i, count, 1);
              const on = activeId === d.id;
              return (
                <line
                  key={d.id}
                  x1={CX} y1={CY} x2={tip.x} y2={tip.y}
                  stroke={on ? W_SPOKE_ON : W_LINE}
                  strokeWidth={1}
                />
              );
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
                  const on = activeId === d.id;
                  return (
                    <g key={d.id}>
                      {on && (
                        <circle cx={p.x} cy={p.y} r={6} fill="none" stroke={CYAN} strokeWidth={1.5} />
                      )}
                      <circle
                        cx={p.x} cy={p.y} r={3} fill={CYAN}
                        tabIndex={0}
                        role="button"
                        aria-label={d.name}
                        className="cap-vertex"
                        onMouseEnter={() => setActiveId(d.id)}
                        onMouseLeave={() => setActiveId((cur) => (cur === d.id ? null : cur))}
                        onFocus={() => setActiveId(d.id)}
                        onBlur={() => setActiveId((cur) => (cur === d.id ? null : cur))}
                        style={{ cursor: "pointer" }}
                      />
                    </g>
                  );
                })}
              </>
            )}

            {answeredCount === 0 && <circle cx={CX} cy={CY} r={3} fill={W_SPOKE_ON} />}

            {/* The only text in the SVG: the 1–8 index markers. */}
            {dims.map((d, i) => {
              const tip = pointAt(i, count, 1.18);
              return (
                <text
                  key={d.id}
                  x={tip.x}
                  y={tip.y + 3}
                  textAnchor="middle"
                  style={{ fontFamily: MONO, fontSize: 9, fill: activeId === d.id ? CYAN : W_DIM }}
                >
                  {i + 1}
                </text>
              );
            })}
          </svg>

          {prevSnap && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: W_LINK, marginBlockStart: 10, letterSpacing: "0.08em", textAlign: "center" }}>
              PREVIOUS · {fmtShort(prevSnap.taken_at)}
            </div>
          )}
        </div>

        {/* RIGHT — the list */}
        <div>
          {answeredOtherBand && (
            <p style={{ fontFamily: UI, fontSize: 14, color: W_LINK, margin: "0 0 10px" }}>
              You're reading at the {band} now. These eight are different.
            </p>
          )}

          {complete && minLevel === 3 && (
            <p style={{ fontFamily: UI, fontSize: 14, color: W_BODY, margin: "0 0 10px" }}>
              Nothing here sits low. The shape is where it moves next.
            </p>
          )}
          {complete && lowest.length > 0 && (
            <p style={{ fontFamily: UI, fontSize: 14, color: W_BODY, margin: "0 0 10px" }}>
              {lowest.length === 1
                ? "One point sits lowest."
                : `${NUMBER_WORDS[lowest.length] ?? lowest.length} points sit lowest.`}
            </p>
          )}

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
            {dims.map((d, i) => {
              const level = levels[d.id];
              const isExpanded = expanded.has(d.id);
              const isLow = lowestIds.has(d.id);
              return (
                <li
                  key={d.id}
                  style={{
                    borderInlineStart: isLow ? `2px solid ${CYAN}` : "2px solid transparent",
                    paddingInlineStart: 10,
                  }}
                >
                  <button
                    type="button"
                    className="cap-row"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? new Set() : new Set([d.id]))}
                    onMouseEnter={() => setActiveId(d.id)}
                    onMouseLeave={() => setActiveId((cur) => (cur === d.id ? null : cur))}
                    onFocus={() => setActiveId(d.id)}
                    onBlur={() => setActiveId((cur) => (cur === d.id ? null : cur))}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "transparent",
                      border: "none",
                      padding: "10px 0",
                      cursor: "pointer",
                      textAlign: "start",
                      color: level ? W_STRONG : W_DIM,
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 11, color: activeId === d.id ? CYAN : W_DIM, minWidth: 14 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontFamily: UI, fontSize: 14, lineHeight: 1.45, flex: 1 }}>{d.name}</span>
                    <span aria-hidden="true" style={{ display: "inline-flex", gap: 4 }}>
                      {[1, 2, 3].map((n) => (
                        <span
                          key={n}
                          style={{
                            width: 6, height: 6, borderRadius: 999,
                            background: level === n ? CYAN : W_DOT_OFF,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ paddingBlockEnd: 12, maxWidth: "62ch" }}>
                      {d.why_line && (
                        <p style={{ fontFamily: UI, fontSize: 13, color: W_LINK, margin: "0 0 6px", lineHeight: 1.55 }}>
                          {d.why_line}
                        </p>
                      )}
                      {level && (
                        <p style={{ fontFamily: UI, fontSize: 14, color: W_BODY, margin: 0, lineHeight: 1.55 }}>
                          {d.name} — you said: “{anchorFor(d, level)}”
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {answeredCount === 0 && (
            <div style={{ marginBlockStart: 16 }}>
              <p style={{ fontFamily: UI, fontSize: 14, color: W_BODY, margin: "0 0 14px" }}>
                Eight questions about how far your work travels. Two minutes.
              </p>
              <PrimaryButton onClick={() => setAssessing(true)}>Answer the eight</PrimaryButton>
            </div>
          )}

          {answeredCount > 0 && !complete && (
            <div style={{ marginBlockStart: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: W_BODY, marginBlockEnd: 12 }}>
                {answeredCount} OF {dims.length} ANSWERED
              </div>
              <PrimaryButton onClick={() => setAssessing(true)}>Continue</PrimaryButton>
            </div>
          )}

          {complete && (
            <div style={{ marginBlockStart: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: W_BODY }}>
                ANSWERED {current ? fmtDate(current.taken_at) : ""} · BAND: {band.toUpperCase()} ·{" "}
                <button type="button" className="cap-link" onClick={() => setChooser(true)}
                  style={{ background: "transparent", border: "none", padding: 0, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                  change
                </button>
              </div>
              <button
                type="button"
                className="cap-link"
                onClick={() => setAssessing(true)}
                style={{ marginBlockStart: 14, background: "transparent", border: "none", padding: 0, fontFamily: UI, fontSize: 13, cursor: "pointer", minHeight: 44 }}
              >
                Answer again
              </button>
            </div>
          )}

          {!complete && (
            <div style={{ marginBlockStart: 14, fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: W_LINK }}>
              BAND: {band.toUpperCase()} ·{" "}
              <button type="button" className="cap-link" onClick={() => setChooser(true)}
                style={{ background: "transparent", border: "none", padding: 0, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                change
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .cap-radar-grid {
          display: grid;
          grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
          gap: 28px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .cap-radar-grid { grid-template-columns: minmax(0, 1fr); }
        }
        .cap-link {
          color: ${W_LINK};
          text-decoration: underline;
          text-decoration-color: rgba(255,255,255,0.32);
        }
        .cap-link:hover, .cap-link:focus-visible { color: #FFFFFF; }
        .cap-row:focus-visible, .cap-link:focus-visible, .cap-vertex:focus-visible {
          outline: 2px solid ${CYAN};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

/* ── Primary button ─────────────────────────────────────────────────── */

const PrimaryButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && !disabled ? BLUE_HOVER : BLUE,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 8,
        padding: "12px 18px",
        minHeight: 44,
        fontFamily: UI,
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
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
  onAnswer: (dimensionId: string, level: number) => Promise<void> | void;
  onFinish: (levels: Record<string, number>) => Promise<void> | void;
  onExit: () => void;
}

const Assessment: React.FC<AssessProps> = ({ dims, levels, onAnswer, onFinish, onExit }) => {
  const firstUnanswered = Math.max(0, dims.findIndex((d) => !levels[d.id]));
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);
  const [local, setLocal] = useState<Record<string, number>>(levels);
  const [finishing, setFinishing] = useState(false);
  const pending = useRef<Promise<unknown> | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dim = dims[index];
  if (!dim) return null;

  const anchors = [dim.anchor_low, dim.anchor_mid, dim.anchor_high];
  const selected = local[dim.id];
  const last = index === dims.length - 1;
  const canAdvance = Boolean(selected) && !finishing;

  /* Selecting only selects. Moving is the footer button's job. Each tap
     still upserts immediately, so resume-where-you-stopped is unchanged. */
  const pick = (level: number) => {
    setLocal((prev) => ({ ...prev, [dim.id]: level }));
    pending.current = Promise.resolve(onAnswer(dim.id, level));
  };

  const goForward = async () => {
    if (!canAdvance) return;
    if (!last) { setIndex(index + 1); return; }
    setFinishing(true);
    try {
      // The eighth upsert lands before the snapshot insert and the reload.
      if (pending.current) await pending.current;
      await onFinish({ ...local, [dim.id]: selected });
    } finally {
      setFinishing(false);
    }
  };

  const rtl = typeof document !== "undefined" && document.dir === "rtl";

  const focusOption = (i: number) => {
    const clamped = (i + anchors.length) % anchors.length;
    optionRefs.current[clamped]?.focus();
    void pick(clamped + 1);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === "ArrowDown" || e.key === forward) { e.preventDefault(); focusOption(i + 1); }
    else if (e.key === "ArrowUp" || e.key === back) { e.preventDefault(); focusOption(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusOption(0); }
    else if (e.key === "End") { e.preventDefault(); focusOption(anchors.length - 1); }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 20, padding: 20 }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && canAdvance) { e.preventDefault(); void goForward(); }
      }}
    >
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
          const roving = selected ? isSel : i === 0;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSel}
              tabIndex={roving ? 0 : -1}
              ref={(el) => { optionRefs.current[i] = el; }}
              disabled={finishing}
              onKeyDown={(e) => onKeyDown(e, i)}
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
                cursor: finishing ? "not-allowed" : "pointer",
              }}
            >
              {sentence}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBlockStart: 16, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => (index === 0 ? onExit() : setIndex(index - 1))}
          style={{ background: "transparent", border: "none", padding: "0 4px", color: BLUE, fontFamily: UI, fontSize: 13, cursor: "pointer", minHeight: 44 }}
        >
          {index === 0 ? "Back to the radar" : "Back"}
        </button>
        <PrimaryButton onClick={() => void goForward()} disabled={!canAdvance}>
          {finishing ? "Working" : last ? "Show me the shape" : "Next"}
        </PrimaryButton>
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
