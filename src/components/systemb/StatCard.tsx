import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import Tooltip from "./Tooltip";

/**
 * StatCard — the System-B KPI tile.
 * Delta and sparkline render only when the caller actually has that history.
 */

const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
};

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Signed change vs the previous period. Omit when no history exists. */
  delta?: number | null;
  /** Series for the mini bars. Omit when no history exists. */
  history?: number[];
  /** Real formula text — a tooltip appears only when this is provided. */
  explain?: string;
}

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const max = Math.max(...values, 1);
  return (
    <span aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18, marginTop: 8 }}>
      {values.map((v, i) => (
        <span key={i} style={{
          width: 4, borderRadius: 2,
          height: `${Math.max(2, (v / max) * 18)}px`,
          background: i === values.length - 1 ? "var(--act)" : "var(--border-strong)",
        }} />
      ))}
    </span>
  );
};

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, delta, history, explain }) => {
  const body = (
    <div
      tabIndex={explain ? 0 : undefined}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--rule-outer)",
        borderRadius: 16,
        boxShadow: "var(--v23-card-rest)",
        padding: 14,
        fontFamily: "var(--ff-ui)",
      }}
    >
      <div style={{ ...MONO, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ ...MONO, fontSize: 26, fontWeight: 600, color: "var(--text-primary)", marginTop: 6, lineHeight: 1.1 }}>
          {value}
        </div>
        {delta != null && delta !== 0 && (
          <span style={{
            ...MONO, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600,
            color: delta > 0 ? "var(--success)" : "var(--error)",
          }}>
            {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</div>}
      {history && history.length > 1 && <Sparkline values={history} />}
    </div>
  );
  return explain ? <Tooltip title="How it's made" body={explain}>{body}</Tooltip> : body;
};

export default StatCard;