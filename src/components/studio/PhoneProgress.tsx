import React from "react";
import { T, type Lang } from "./strings";

/**
 * M1 — PROGRESS IS ALWAYS ON SCREEN.
 *
 * Pinned under the app bar with `position: sticky`. It is rendered on every
 * step and is never unmounted while Aura is working, so a member can always
 * see where they are and how far they have come. The four pills replace the
 * desktop journey map on a phone: same behaviour, clickable in any order,
 * never blocking.
 */
export const PhoneProgress: React.FC<{
  lang: Lang;
  step: number;
  done: Record<number, boolean>;
  onStep: (n: number) => void;
  rtl: boolean;
}> = ({ lang, step, done, onStep, rtl }) => {
  const labels = [T.step1[lang], T.step2[lang], T.step3[lang], T.step4[lang]];
  const name = labels[Math.min(Math.max(step, 1), 4) - 1];
  const filled = Math.round((Math.min(Math.max(step, 1), 4) / 4) * 100);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--surface-page, var(--paper-1, #0c0c0e))",
        borderBottom: "1px solid var(--border-default)",
        padding: "10px 0 8px",
        margin: "0 0 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <p style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1, minWidth: 0 }}>
          {name}
        </p>
        <p style={{ fontFamily: "var(--ff-mono)", fontSize: 11.5, color: "var(--text-muted)", margin: 0, whiteSpace: "nowrap" }}>
          {T.stepWord[lang]} {step} {T.of[lang]} 4
        </p>
      </div>

      {/* The bar fills from the reading side, so Arabic fills from the right. */}
      <div
        aria-hidden="true"
        style={{ height: 4, borderRadius: 999, background: "var(--surface-subtle)", overflow: "hidden", margin: "8px 0" }}
      >
        <div
          style={{
            height: "100%",
            width: `${filled}%`,
            marginInlineStart: 0,
            background: "var(--act)",
            borderRadius: 999,
            transition: "width .25s ease",
          }}
        />
      </div>

      <ol
        style={{
          display: "flex",
          gap: 8,
          listStyle: "none",
          margin: 0,
          padding: "2px 0",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {labels.map((label, i) => {
          const n = i + 1;
          const isDone = Boolean(done[n]);
          const isCurrent = step === n;
          return (
            <li key={n} style={{ flex: "0 0 auto" }}>
              <button
                type="button"
                onClick={() => onStep(n)}
                aria-current={isCurrent ? "step" : undefined}
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--ff-ui)",
                  fontSize: 13,
                  fontWeight: isCurrent ? 700 : 500,
                  background: isCurrent ? "var(--act)" : "var(--surface-subtle)",
                  color: isCurrent ? "var(--ink, #111)" : isDone ? "var(--act)" : "var(--text-secondary)",
                  border: `1px solid ${isCurrent || isDone ? "var(--act)" : "var(--border-default)"}`,
                }}
              >
                <span aria-hidden="true" style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>
                  {isDone && !isCurrent ? "✓" : n}
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <span style={{ display: "none" }}>{rtl ? "rtl" : "ltr"}</span>
    </div>
  );
};

export default PhoneProgress;
