import React from "react";
import { S, type Lang } from "./strings";

/** Slim 6-step rail: done, current, upcoming. */
const ProgressRail: React.FC<{ step: number; lang: Lang }> = ({ step, lang }) => {
  const labels = S.stepLabels[lang];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <div
            key={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              background: current ? "var(--act-tint)" : "var(--surface-subtle)",
              border: `1px solid ${current ? "var(--act)" : "var(--border-default)"}`,
              fontFamily: "var(--ff-ui)",
              fontSize: 12,
              fontWeight: 600,
              color: current ? "var(--act)" : done ? "var(--text-secondary)" : "var(--text-muted)",
            }}
          >
            <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{done ? "✓" : n}</span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default ProgressRail;