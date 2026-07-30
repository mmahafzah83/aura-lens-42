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

const goTab = (tab: string) => {
  try { window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab } })); } catch { /* noop */ }
};

const ActionLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="v23-focus"
    style={{
      ...FF, marginTop: 8, background: "transparent", border: 0, padding: 0,
      cursor: "pointer", fontSize: 12.5, color: "var(--act)",
    }}
  >{children}</button>
);

/** Renders one widget from measured data. Returns null when the data doesn't exist. */
export const WidgetBody: React.FC<{ k: WidgetKey; m: WidgetMetrics }> = ({ k, m }) => {
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
  if (k === "fading") {
    if (!m.fading) return null;
    const { count, nearestDays } = m.fading;
    if (count === 0) {
      return (
        <WidgetShell label="Fading signals">
          <Big>0</Big>
          <Sub>nothing fades this month</Sub>
        </WidgetShell>
      );
    }
    return (
      <WidgetShell label="Fading signals">
        <Big style={undefined}><span style={{ color: "var(--time)" }}>{count}</span></Big>
        <Sub>
          {count === 1 ? "signal fades" : "signals fade"} this month without a post
          {nearestDays != null ? ` · nearest: ${nearestDays}d` : ""}
        </Sub>
        <ActionLink onClick={() => goTab("intelligence")}>Rescue one →</ActionLink>
      </WidgetShell>
    );
  }
  if (k === "drafts") {
    if (!m.drafts) return null;
    const { count, oldestDays } = m.drafts;
    if (count === 0) {
      return (
        <WidgetShell label="Drafts waiting">
          <Big>—</Big>
          <Sub>No drafts waiting</Sub>
        </WidgetShell>
      );
    }
    return (
      <WidgetShell label="Drafts waiting">
        <Big>{count}</Big>
        <Sub>{count === 1 ? "draft" : "drafts"}{oldestDays != null ? ` · oldest ${oldestDays} ${oldestDays === 1 ? "day" : "days"}` : ""}</Sub>
        <ActionLink onClick={() => goTab("authority")}>Open Composer →</ActionLink>
      </WidgetShell>
    );
  }
  return null;
};
