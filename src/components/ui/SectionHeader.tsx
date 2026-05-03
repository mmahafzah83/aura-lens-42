import React from "react";

export interface SectionHeaderProps {
  label: string;
  subtitle?: string;
  className?: string;
}

export function SectionHeader({ label, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={className} style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "var(--ink)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {label}
      </div>
      {subtitle && (
        <div
          style={{
            fontFamily: "var(--font-display, 'Cormorant Garamond')",
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--ink-3)",
            marginTop: 3,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;