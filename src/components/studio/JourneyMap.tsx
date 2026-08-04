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
}> = ({ lang, step, done, onStep }) => {
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
                onClick={() => onStep(n)}
                aria-current={isCurrent ? "step" : undefined}
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "var(--ff-ui)",
                  fontSize: 13.5,
                  fontWeight: isCurrent ? 700 : 500,
                  background: isCurrent || isDone ? "var(--act-tint)" : "var(--surface-card)",
                  color: isCurrent || isDone ? "var(--act)" : "var(--text-secondary)",
                  border: `${isCurrent ? 2 : 1}px solid ${isCurrent || isDone ? "var(--act)" : "var(--border-default)"}`,
                }}
              >
                {/* W10 — being here does not un-finish the work: the current
                    step still shows its tick. */}
                <span aria-hidden="true">{isDone ? `✓ ${n}` : n}</span>
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