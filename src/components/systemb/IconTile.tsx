import React from "react";
import type { LucideIcon } from "lucide-react";

/** Tinted 27px tile holding a 13px Lucide icon. Tints match the chip semantics. */

export type TileTone = "live" | "clock" | "cooling" | "published" | "scheduled" | "failed" | "act";

const TONES: Record<TileTone, { background: string; color: string }> = {
  live:      { background: "var(--machine-tint)",   color: "var(--machine-text)" },
  clock:     { background: "var(--deadline-tint)",  color: "var(--deadline-text)" },
  cooling:   { background: "var(--surface-subtle)", color: "var(--text-secondary)" },
  published: { background: "var(--success-tint)",   color: "var(--success)" },
  scheduled: { background: "var(--act-tint)",       color: "var(--act)" },
  failed:    { background: "var(--error-tint)",     color: "var(--error)" },
  act:       { background: "var(--act-tint)",       color: "var(--act)" },
};

interface IconTileProps {
  icon: LucideIcon;
  tone?: TileTone;
  size?: number;
  label?: string;
  style?: React.CSSProperties;
}

const IconTile: React.FC<IconTileProps> = ({ icon: Icon, tone = "cooling", size = 27, label, style }) => (
  <span
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    style={{
      ...TONES[tone],
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      ...style,
    }}
  >
    <Icon size={13} strokeWidth={2} />
  </span>
);

export default IconTile;