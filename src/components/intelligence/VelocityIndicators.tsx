import { TrendingUp, TrendingDown, Minus, Circle } from "lucide-react";

export type VelocityStatus = "accelerating" | "stable" | "fading" | "dormant" | null | undefined;

const STYLES: Record<string, { bg: string; color: string; border: string; icon: any; label: string }> = {
  accelerating: { bg: "var(--success-soft, hsl(140 50% 40% / 0.12))", color: "var(--success, hsl(140 60% 45%))", border: "var(--success, hsl(140 60% 45%))", icon: TrendingUp, label: "Accelerating" },
  stable: { bg: "var(--surface-ink-subtle)", color: "var(--ink-4)", border: "var(--brand-line)", icon: Minus, label: "Stable" },
  fading: { bg: "hsl(24 95% 53% / 0.10)", color: "hsl(24 95% 53%)", border: "hsl(24 95% 53% / 0.5)", icon: TrendingDown, label: "Fading" },
  dormant: { bg: "var(--surface-ink-subtle)", color: "var(--ink-3)", border: "var(--brand-line)", icon: Circle, label: "Dormant" },
};

export function VelocityPill({ status, compact = false }: { status: VelocityStatus; compact?: boolean }) {
  if (!status) return null;
  const cfg = STYLES[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "1px 6px" : "2px 8px",
        borderRadius: 999,
        fontSize: compact ? 9 : 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        background: cfg.bg,
        color: cfg.color,
        border: `0.5px solid ${cfg.border}`,
        opacity: status === "dormant" ? 0.7 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={compact ? 9 : 10} strokeWidth={2.4} />
      {cfg.label}
    </span>
  );
}

export function VelocityTrend({ velocity }: { velocity?: number | null }) {
  if (velocity === null || velocity === undefined || velocity === 0) return null;
  const pct = Math.round(velocity * 100);
  if (pct === 0) return null;
  const positive = pct > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? "var(--success, hsl(140 60% 45%))" : "hsl(24 95% 53%)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color, fontFamily: "var(--font-mono)" }}>
      <Icon size={10} strokeWidth={2.4} />
      {positive ? "+" : ""}{pct}% this week
    </span>
  );
}

export function ValidationBadge({ score }: { score?: number | null }) {
  if (score === null || score === undefined) return null;
  if (score > 1.5) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 600, background: "var(--success-soft, hsl(140 50% 40% / 0.12))", color: "var(--success, hsl(140 60% 45%))", border: "0.5px solid var(--success, hsl(140 60% 45%))" }}>
        ✦ {score.toFixed(1)}× avg engagement
      </span>
    );
  }
  if (score >= 1.0) {
    return <span style={{ fontSize: 9, color: "var(--ink-4)" }}>{score.toFixed(1)}× avg</span>;
  }
  return <span style={{ fontSize: 9, color: "hsl(24 95% 53%)", opacity: 0.85 }}>Below avg</span>;
}

/**
 * Estimated days until confidence decays to 0.15 dormant threshold.
 * Decay rate matches signal-decay-engine: lambda = 0.023 (~30-day half life).
 */
export function daysUntilDormant(confidence: number): number {
  if (confidence <= 0.15) return 0;
  const lambda = 0.023;
  const days = Math.log(confidence / 0.15) / lambda;
  return Math.max(1, Math.round(days));
}