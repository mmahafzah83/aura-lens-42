import React from "react";
import { BAND_COPY, BAND_TOKEN, type CapabilityBand } from "@/lib/capabilityBands";

export interface CapabilityBandMeterProps {
  label: string;
  band: CapabilityBand;
  meaning?: boolean;
  size?: "sm" | "md";
}

const SEGMENTS = 4;

/**
 * The single way a capability is ever shown. Four discrete steps — the
 * underlying data has four states, so the visual must not imply precision
 * that does not exist. No number appears here, ever.
 */
export function CapabilityBandMeter({
  label,
  band,
  meaning = false,
  size = "md",
}: CapabilityBandMeterProps) {
  const copy = BAND_COPY[band];
  const token = BAND_TOKEN[band];
  const empty = band === "not_assessed";

  return (
    <div
      role="img"
      aria-label={`${label}: ${copy.label} — ${copy.meaning}`}
      style={{ display: "flex", flexDirection: "column", gap: size === "sm" ? 6 : 8 }}
    >
      <div
        style={{
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          fontWeight: 600,
          fontSize: size === "sm" ? 13 : 15,
          color: "#0F1519",
          lineHeight: 1.35,
        }}
      >
        {label}
      </div>

      <div
        aria-hidden="true"
        style={{ display: "flex", gap: 6, opacity: empty ? 0.3 : 1 }}
      >
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 4,
              background: !empty && i <= copy.step ? token.fill : "#E2E7EE",
            }}
          />
        ))}
      </div>

      <div>
        <span
          style={{
            display: "inline-block",
            background: token.bg,
            color: token.text,
            borderRadius: 999,
            padding: "3px 10px",
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {copy.label}
        </span>
      </div>

      {meaning && (
        <div style={{ fontSize: 13, color: "#5B6673", lineHeight: 1.5 }}>
          {copy.meaning}
        </div>
      )}
    </div>
  );
}

export default CapabilityBandMeter;
