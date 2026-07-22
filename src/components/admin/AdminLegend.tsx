import { CSSProperties } from "react";

/**
 * AdminLegend — small labeled key card used above KPI rows on admin pages.
 * Design-system only: no new colors, no new fonts. Uses --ob-panel surface,
 * 1px --hair border, 8px radius, and the 11px tracked-uppercase kpiLabel
 * style reused across admin surfaces.
 */
export type AdminLegendItem = {
  /** Optional dot color (any token or literal). If omitted the dot is hidden. */
  color?: string;
  /** Bold-ish label rendered before the description. */
  label: string;
  /** Plain-English explanation of what the label means. */
  text: string;
};

const card: CSSProperties = {
  background: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 8,
  padding: 16,
};

const heading: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--glass-2)",
  marginBottom: 10,
};

const list: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 18px",
  fontSize: 13,
  color: "var(--glass-2)",
  lineHeight: 1.5,
};

const dot = (color: string): CSSProperties => ({
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: 999,
  background: color,
  marginRight: 8,
  verticalAlign: "middle",
});

export default function AdminLegend({
  title,
  items,
}: {
  title: string;
  items: AdminLegendItem[];
}) {
  return (
    <div style={card}>
      <div style={heading}>{title}</div>
      <div style={list}>
        {items.map((it) => (
          <span key={it.label} style={{ whiteSpace: "nowrap" }}>
            {it.color && <span style={dot(it.color)} aria-hidden />}
            <span style={{ color: "var(--glass)", fontWeight: 500 }}>{it.label}</span>
            <span> = {it.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}