import React from "react";
import i18n from "@/i18n";

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
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: i18n.language === "ar" ? 0 : "0.12em",
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
            fontFamily: "var(--font-display)",
            fontSize: 14,
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