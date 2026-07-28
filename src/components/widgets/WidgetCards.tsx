import React from "react";
import type { WidgetKey, WidgetMetrics } from "./widgetData";

const FF = { fontFamily: "var(--ff-ui)" } as const;
const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono, ui-monospace, SFMono-Regular, monospace)",
  letterSpacing: ".04em",
};

export const WidgetShell: React.FC<React.PropsWithChildren<{ label: string; machine?: boolean }>> = ({
  label, machine, children,
}) => (
  <div
    style={{
      ...FF,
      border: "1px solid var(--rule-outer)",
      borderRadius: 12,
      padding: 14,
      background: "var(--surface-card)",
      minWidth: 0,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      {machine && (
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--live)" }} />
      )}
      <span style={{
        ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
        color: machine ? "var(--machine-text)" : "var(--text-secondary)",
      }}>{label}</span>
    </div>
    {children}
  </div>
);

const Big: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ fontSize: 26, lineHeight: 1.1, color: "var(--text-primary)", fontWeight: 500 }}>{children}</div>
);
const Sub: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ ...MONO, fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{children}</div>
);

/** Renders one widget from measured data. Returns null when the data doesn't exist. */
export const WidgetBody: React.FC<{ k: WidgetKey; m: WidgetMetrics }> = ({ k, m }) => {
  if (k === "imprint") {
    if (!m.imprint) return null;
    const { score, tier, toNext, nextTier } = m.imprint;
    return (
      <WidgetShell label="Imprint">
        <Big>{score}<span style={{ fontSize: 14, color: "var(--text-secondary)" }}> / 100</span></Big>
        <Sub>{tier}{toNext != null && nextTier ? ` · ${toNext} to ${nextTier}` : " · top band"}</Sub>
      </WidgetShell>
    );
  }
  if (k === "live_signals") {
    if (m.liveSignals == null) return null;
    return (
      <WidgetShell label="Live signals">
        <Big>{m.liveSignals}</Big>
        <Sub>active right now</Sub>
      </WidgetShell>
    );
  }
  if (k === "overnight") {
    if (!m.overnight) return null;
    const { lastRunAt, nights, window } = m.overnight;
    const t = lastRunAt ? new Date(lastRunAt) : null;
    const hhmm = t ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "—";
    return (
      <WidgetShell label="The Overnight" machine>
        <Big>{nights} of {window}</Big>
        <Sub>nights produced something · last ran {hhmm}</Sub>
      </WidgetShell>
    );
  }
  if (k === "language") {
    if (!m.language) return null;
    const { arabic, english, total } = m.language;
    return (
      <WidgetShell label="Language balance">
        <Big>{arabic} : {english}</Big>
        <Sub>Arabic : English, of {total} posts with text</Sub>
      </WidgetShell>
    );
  }
  if (k === "rhythm") {
    if (!m.rhythm) return null;
    const w = m.rhythm.weeks;
    return (
      <WidgetShell label="Capture rhythm">
        <Big>{w}</Big>
        <Sub>{w === 1 ? "consecutive week with a capture" : "consecutive weeks with a capture"}</Sub>
      </WidgetShell>
    );
  }
  if (k === "published") {
    if (!m.published) return null;
    return (
      <WidgetShell label="Published">
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div>
            <Big>{m.published.live}</Big>
            <Sub>Published · live on LinkedIn</Sub>
          </div>
          <div>
            <Big>{m.published.throughAura}</Big>
            <Sub>Published through Aura</Sub>
          </div>
        </div>
      </WidgetShell>
    );
  }
  return null;
};
