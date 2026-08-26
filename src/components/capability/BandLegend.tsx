import React from "react";
import { AuraCard } from "@/components/ui/AuraCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { BAND_COPY, BAND_ORDER, BAND_TOKEN } from "@/lib/capabilityBands";

/** Shown once at the top of the read flows and in the summary. 375px-first. */
export function BandLegend({ className }: { className?: string }) {
  return (
    <AuraCard hover="none" className={className}>
      <SectionHeader label="How Aura reads this" />
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "#5B6673", marginBottom: 14 }}>
        Four steps, not a score out of a hundred. A step you haven't reached yet just means
        Aura hasn't seen it — it is never a mark against you.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BAND_ORDER.map((b) => (
          <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                background: BAND_TOKEN[b].bg,
                color: BAND_TOKEN[b].text,
                borderRadius: 999,
                padding: "3px 10px",
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {BAND_COPY[b].label}
            </span>
            <span style={{ fontSize: 13, color: "#5B6673", lineHeight: 1.5 }}>
              {BAND_COPY[b].meaning}
            </span>
          </div>
        ))}
      </div>
    </AuraCard>
  );
}

export default BandLegend;
