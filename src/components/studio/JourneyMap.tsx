import React from "react";
import { T, type Lang } from "./strings";

/**
 * A MAP, not a wizard. Every step is clickable in any order, at any time.
 * Nothing here refuses a click and nothing is greyed out.
 */
export const JourneyMap: React.FC<{
  lang: Lang;
  step: number;
  done: Record<number, boolean>;
  onStep: (n: number) => void;
  /** Arabic shell — Cairo needs 1.9. */
  rtlShell?: boolean;
}> = ({ lang, step, done, onStep, rtlShell = false }) => {
  const labels = [T.step1[lang], T.step2[lang], T.step3[lang], T.step4[lang]];
  return (
    <div style={{ padding: "14px 0 6px" }}>
      <ol
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {labels.map((label, i) => {
          const n = i + 1;
          const isDone = Boolean(done[n]);
          const isCurrent = step === n;
          return (
            <li key={n}>
              <button
                type="button"
                className="v23-tap v23-focus"
                onClick={() => onStep(n)}
                aria-current={isCurrent ? "step" : undefined}
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "var(--ff-ui)",
                  fontSize: 13.5,
                  fontWeight: isCurrent ? 700 : 500,
                  /* Blue is "your turn" — only the CURRENT step wears it. A
                     finished step is status, so it reads neutral: cyan is never
                     a fill on a control, and a step chip is a control. The
                     machine colour survives only as a MARK, below. */
                  background: isCurrent ? "var(--act-tint)" : isDone ? "var(--surface-subtle)" : "var(--surface-card)",
                  /* 4.5:1 gate: --act on --act-tint is 4.37:1 at 13.5px/700,
                     which is not large text. --act-hover clears it at 8.41:1 —
                     the same fix the language chip carries. Done chips read
                     --text-secondary on --surface-subtle: 5.20:1. */
                  color: isCurrent ? "var(--act-hover)" : "var(--text-secondary)",
                  border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? "var(--act)" : "var(--border-default)"}`,
                }}
              >
                {/* W10 — being here does not un-finish the work: the current
                    step still shows its tick. The tick is the only cyan on the
                    chip, and it is a mark, not a fill. It is a leading span in
                    both directions, so RTL places it on the right by flow —
                    never a ↳ or any drawn arrow. */}
                {isDone && (
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: "var(--ff-mono)", color: "var(--machine-text)", fontWeight: 700 }}
                  >
                    ✓
                  </span>
                )}
                <span aria-hidden="true" style={{ fontFamily: "var(--ff-mono)" }}>{n}</span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 12.5,
          lineHeight: rtlShell ? 1.9 : 1.7,
          color: "var(--text-muted)",
          margin: "8px 0 0",
        }}
      >
        {T.mapNote[lang]}
      </p>
    </div>
  );
};

export default JourneyMap;