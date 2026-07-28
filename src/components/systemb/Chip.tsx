import React from "react";

/**
 * System-B chip — the only status pill in the kit.
 *
 * Colour law: cyan = the machine, amber = a real clock, green = done,
 * blue = your turn, red = broken, neutral = everything else.
 */

export type ChipVariant =
  | "live"
  | "clock"
  | "cooling"
  | "published"
  | "scheduled"
  | "failed";

const VARIANTS: Record<ChipVariant, { background: string; color: string }> = {
  live:      { background: "var(--machine-tint)",  color: "var(--machine-text)" },
  clock:     { background: "var(--deadline-tint)", color: "var(--deadline-text)" },
  cooling:   { background: "var(--surface-subtle)", color: "var(--text-secondary)" },
  published: { background: "var(--success-tint)",  color: "var(--success)" },
  scheduled: { background: "var(--act-tint)",      color: "var(--act)" },
  failed:    { background: "var(--error-tint)",    color: "var(--error)" },
};

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: ChipVariant;
}

const Chip: React.FC<React.PropsWithChildren<ChipProps>> = ({ variant, children, style, ...rest }) => (
  <span
    style={{
      ...VARIANTS[variant],
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      borderRadius: 6,
      padding: "2px 7px",
      fontFamily: "var(--ff-mono)",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: ".08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      ...style,
    }}
    {...rest}
  >{children}</span>
);

export default Chip;