/**
 * THE WORKING PANEL — the one way Aura says it is busy.
 *
 * Colour law: cyan is the machine working, blue is the member's turn, amber is
 * the clock running long, red is the stage that failed. Never two on one
 * element, never cyan on a button, never cyan as body text (#00807B is the
 * only legal cyan text).
 *
 * The percentage is computed from finished runs of this same operation, or it
 * is an em dash. It never speeds up to hide a slow run, and it never moves
 * backwards. Completed ticks stay: the accumulating column of checks IS the
 * progress.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  OVER_P95_LINE, mmss, useElapsed, useWaitEstimate, useWeightedProgress, waitCopy,
  type WaitOperation,
} from "@/lib/waitEstimate";

/* ── System-B values. Module scope, always. ─────────────────────────────── */
const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const NIGHT = "#0F1519";
const NIGHT_TEXT = "#FFFFFF";
const NIGHT_MUTED = "#9BA9B4";
const NIGHT_LINE = "#25313A";
const CYAN = "#00CEC9";
const CYAN_TRACK = "#EAF9F8";
const CYAN_TEXT = "#00807B";
const DONE = "#12805C";
const ERR = "#C0392B";
const BLUE = "#0670C4";
const AMBER_BG = "#FDF6E6";
const AMBER_TEXT = "#9A6F12";
const AMBER_LINE = "#F2E2B8";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const EASE = "cubic-bezier(.22,.8,.3,1)";

const NIGHT_WASH = "radial-gradient(120% 90% at 50% -10%, rgba(0,206,201,.13), transparent 62%)";

const CSS = `
@keyframes wp-breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.62);opacity:.55}}
@keyframes wp-draw{from{stroke-dashoffset:16}to{stroke-dashoffset:0}}
.wp-dot{animation:wp-breathe 1.9s ease-in-out infinite;}
.wp-check path{stroke-dasharray:16;animation:wp-draw 200ms ease-out both;}
@media (prefers-reduced-motion:reduce){
  .wp-dot,.wp-check path{animation:none !important;}
  .wp-fill{transition:none !important;}
}
`;

/** A live read of the motion preference — not a one-shot read at first render. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    setReduced(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export type StageState = "done" | "active" | "waiting" | "failed";

export interface WorkingStage {
  key: string;
  label: string;
  state: StageState;
  /** This stage's own elapsed, in ms, when we have it. */
  ms?: number;
}

export interface WorkingPanelProps {
  /**
   * Only an operation we actually measure may be named. Pass nothing when the
   * work is not instrumented: the panel then shows the steps and the real
   * counter, and no percentage it cannot defend.
   */
  operation?: WaitOperation | null;
  title: string;
  stages: WorkingStage[];
  onNight?: boolean;
  failure?: { stageKey: string; message: string } | null;
  onRetryFromStage?: (stageKey: string) => void;
  onCarryOn?: { label: string; action: () => void } | null;
  onNotifyMe?: () => void;
  rtl?: boolean;
  /**
   * Changes on every new run. Resets the monotonic floor and the counter, so
   * a retry never opens at the last run's percentage.
   */
  runId?: string | number;
}

const secsOf = (ms?: number) => (typeof ms === "number" && ms > 0 ? mmss(Math.floor(ms / 1000)) : "");

function StageIcon({ state }: { state: StageState }) {
  const box: React.CSSProperties = {
    inlineSize: 18, blockSize: 18, borderRadius: 999, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
  if (state === "done") {
    return (
      <span style={{ ...box, background: DONE }} aria-hidden>
        <svg className="wp-check" width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.3 L4.9 8.6 L9.5 3.6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span style={{ ...box, background: ERR }} aria-hidden>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M3 3 L9 9 M9 3 L3 9" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span style={{ ...box, border: `1.5px solid ${CYAN}` }} aria-hidden>
        <span className="wp-dot" style={{ inlineSize: 7, blockSize: 7, borderRadius: 999, background: CYAN, display: "block" }} />
      </span>
    );
  }
  return <span style={{ ...box, border: `1.5px solid ${LINE}`, opacity: 0.72 }} aria-hidden />;
}

export function WorkingPanel({
  operation = null, title, stages, onNight = false, failure = null,
  onRetryFromStage, onCarryOn = null, onNotifyMe, rtl = false, runId = 0,
}: WorkingPanelProps) {
  const est = useWaitEstimate(operation);
  const secs = useElapsed(true, runId);
  const reduced = useReducedMotion();
  const [howLongOpen, setHowLongOpen] = useState(false);

  /* A new run closes the disclosure with everything else. */
  useEffect(() => { setHowLongOpen(false); }, [runId]);

  const completedKeys = useMemo(() => stages.filter((s) => s.state === "done").map((s) => s.key), [stages]);
  const active = stages.find((s) => s.state === "active") ?? null;
  const activeKey = active?.key ?? null;

  /* When this stage began — measured here, never inferred from a timer. */
  const sinceRef = useRef<{ key: string | null; at: number }>({ key: activeKey, at: Date.now() });
  if (sinceRef.current.key !== activeKey) sinceRef.current = { key: activeKey, at: Date.now() };

  const complete = stages.length > 0 && stages.every((s) => s.state === "done");
  const progress = useWeightedProgress({
    stages: est.stages,
    completedKeys,
    activeKey,
    activeSince: sinceRef.current.at,
    runId,
    complete,
  });

  const failed = Boolean(failure);
  const over = est.known && secs > est.p95 && !failed;
  const doors = secs >= 60;

  const pctLabel = progress === null ? "—" : `${Math.round(progress * 100)}%`;
  const determinate = progress !== null;

  const text = onNight ? NIGHT_TEXT : INK;
  const muted = onNight ? NIGHT_MUTED : MUTED;
  const hair = onNight ? NIGHT_LINE : LINE;

  /* Screen readers hear stage changes, never percent ticks. */
  const announce = failed
    ? `${title}. ${failure?.message ?? ""}`
    : active
      ? `${title}. ${active.label}.`
      : complete ? `${title}. Done.` : title;

  const failedIndex = failure ? stages.findIndex((s) => s.key === failure.stageKey) : -1;

  const linkStyle: React.CSSProperties = {
    background: "transparent", border: 0, padding: 0, cursor: "pointer",
    color: onNight ? CYAN_TEXT : BLUE, fontSize: 12.5, fontWeight: 600, minBlockSize: 24,
  };

  return (
    <div
      dir={rtl ? "rtl" : undefined}
      style={{
        position: "relative",
        border: `1px solid ${hair}`, borderRadius: 16, padding: 16,
        background: onNight ? NIGHT : "#FFFFFF",
        backgroundImage: onNight ? NIGHT_WASH : undefined,
        color: text,
        fontFamily: rtl ? "Cairo, Inter, system-ui, sans-serif" : "Inter, system-ui, sans-serif",
        lineHeight: rtl ? 1.9 : 1.6,
      }}
    >
      <style>{CSS}</style>
      <div role="status" aria-live="polite" style={{ position: "absolute", inlineSize: 1, blockSize: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        {announce}
      </div>

      {/* 1 — title and the number */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: text }}>{title}</h3>
        <span
          dir="ltr"
          style={{ fontFamily: MONO, fontSize: 22, fontVariantNumeric: "tabular-nums", color: failed ? ERR : text }}
        >
          {pctLabel}
        </span>
      </div>

      {/* 2 — what we measured */}
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: muted }}>{waitCopy(est)}</p>

      {/* 3 — the bar */}
      <div
        {...(determinate
          ? { role: "progressbar" as const, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round((progress ?? 0) * 100) }
          : {})}
        aria-hidden={determinate ? undefined : true}
        style={{ blockSize: 5, borderRadius: 999, background: CYAN_TRACK, marginBlockStart: 12, overflow: "hidden" }}
      >
        <div
          className="wp-fill"
          style={{
            blockSize: "100%", borderRadius: 999,
            inlineSize: `${Math.round((progress ?? 0) * 100)}%`,
            background: failed ? ERR : CYAN,
            transition: reduced ? "none" : `inline-size 700ms ${EASE}`,
          }}
        />
      </div>

      {/* 4 — the steps */}
      <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 9 }}>
        {stages.map((s) => (
          <li key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StageIcon state={s.state} />
            <span style={{
              flex: 1, minInlineSize: 0, fontSize: 14,
              fontWeight: s.state === "active" ? 600 : 400,
              color: s.state === "failed" ? ERR : s.state === "waiting" ? muted : text,
              opacity: s.state === "waiting" ? 0.72 : 1,
            }}>
              {s.label}
            </span>
            <span dir="ltr" style={{ fontFamily: MONO, fontSize: 12, color: muted, fontVariantNumeric: "tabular-nums" }}>
              {secsOf(s.ms)}
            </span>
          </li>
        ))}
      </ul>

      {/* the clock running long — the copy changes, the bar does not */}
      {over ? (
        <p style={{
          margin: "14px 0 0", padding: "10px 12px", borderRadius: 10,
          background: AMBER_BG, color: AMBER_TEXT, border: `1px solid ${AMBER_LINE}`,
          fontSize: 12.5,
        }}>
          {OVER_P95_LINE}
        </p>
      ) : null}

      {/* the stage that failed — every earlier tick stays */}
      {failure ? (
        <div style={{
          margin: "14px 0 0", padding: "12px 14px", borderRadius: 10,
          background: onNight ? "rgba(192,57,43,.12)" : "#FCEDEB",
          border: `1px solid ${onNight ? "rgba(192,57,43,.35)" : "#F3CFC9"}`,
          color: onNight ? "#F5B4AC" : ERR, fontSize: 13,
        }}>
          {failure.message}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBlockStart: 12, alignItems: "center" }}>
            {onRetryFromStage ? (
              <button
                type="button"
                onClick={() => onRetryFromStage(failure.stageKey)}
                style={{
                  background: BLUE, color: "#FFFFFF", border: 0, borderRadius: 10,
                  minBlockSize: 44, paddingInline: 18, fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Pick up from step {failedIndex >= 0 ? failedIndex + 1 : 1}
              </button>
            ) : null}
            {onCarryOn ? (
              <button type="button" onClick={onCarryOn.action} style={linkStyle}>{onCarryOn.label}</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 5 — the real counter, and only after a minute, the two doors */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBlockStart: 14, paddingBlockStart: 12, borderBlockStart: `1px solid ${hair}`,
      }}>
        <span dir="ltr" style={{ fontFamily: MONO, fontSize: 13, color: muted, fontVariantNumeric: "tabular-nums" }}>
          {mmss(secs)}
        </span>
        {doors && !failed ? (
          <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {/* Never navigate away from a running operation. This opens in place. */}
            <button
              type="button"
              onClick={() => setHowLongOpen((v) => !v)}
              aria-expanded={howLongOpen}
              aria-controls="wp-how-long"
              style={linkStyle}
            >
              How long is this?
            </button>
            {/* A carry-on door is for a slow run, not only a failed one:
                past a minute there is always a way out. */}
            {onCarryOn ? (
              <button type="button" onClick={onCarryOn.action} style={linkStyle}>{onCarryOn.label}</button>
            ) : null}
            {onNotifyMe ? (
              <button type="button" onClick={onNotifyMe} style={linkStyle}>Email me when it's ready</button>
            ) : null}
          </span>
        ) : null}
      </div>

      {doors && howLongOpen ? (
        <div
          id="wp-how-long"
          style={{
            marginBlockStart: 12, padding: "12px 14px", borderRadius: 10,
            border: `1px solid ${hair}`,
            background: onNight ? "rgba(255,255,255,.04)" : "#F7F9FC",
            fontSize: 12.5, color: muted, lineHeight: 1.6,
          }}
        >
          {est.known ? (
            <>
              <div>
                Measured from <span dir="ltr" style={{ fontFamily: MONO }}>{est.sample}</span> finished runs of this
                same work: half finish inside{" "}
                <span dir="ltr" style={{ fontFamily: MONO }}>{mmss(est.p50)}</span>, almost all inside{" "}
                <span dir="ltr" style={{ fontFamily: MONO }}>{mmss(est.p95)}</span>.
              </div>
              <div style={{ marginBlockStart: 6 }}>
                You are at <span dir="ltr" style={{ fontFamily: MONO }}>{mmss(secs)}</span>. Leaving this page does not
                stop the work.
              </div>
            </>
          ) : (
            <>
              <div>
                Aura has not finished enough runs of this to know how long it takes. Rather than invent a figure, it
                says so.
              </div>
              <div style={{ marginBlockStart: 6 }}>
                What is real: <span dir="ltr" style={{ fontFamily: MONO }}>{mmss(secs)}</span> elapsed. Leaving this
                page does not stop the work.
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * WORKING INLINE — for waits under twenty seconds. A breathing dot, the verb
 * naming the work, and the real counter. Over twenty seconds this is not
 * permitted: it must be the panel.
 */
export function WorkingInline({ verb, onNight = false, rtl = false, runId = 0 }: {
  verb: string; onNight?: boolean; rtl?: boolean; runId?: string | number;
}) {
  const secs = useElapsed(true, runId);
  return (
    <span
      dir={rtl ? "rtl" : undefined}
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex", alignItems: "center", gap: 9,
        fontSize: 13, color: onNight ? NIGHT_MUTED : MUTED,
        fontFamily: rtl ? "Cairo, Inter, system-ui, sans-serif" : "Inter, system-ui, sans-serif",
        lineHeight: rtl ? 1.9 : 1.6,
      }}
    >
      <style>{CSS}</style>
      <span className="wp-dot" aria-hidden style={{ inlineSize: 8, blockSize: 8, borderRadius: 999, background: CYAN, flexShrink: 0 }} />
      <span>{verb}</span>
      <span dir="ltr" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{mmss(secs)}</span>
    </span>
  );
}

export default WorkingPanel;
