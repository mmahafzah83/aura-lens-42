/**
 * ReadShape — the seat panel at the end of "How you appear".
 *
 * It used to also render two lists of the member's recurring work. Both were
 * duplicates: `identity_intelligence.authority_themes` lives in
 * `ProfileIntelligence` (dated and regenerable) and
 * `brand_assessment_results.content_pillars` lives in `BrandReportSection`.
 * Each list now has exactly one home, so this component keeps only the seat.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { ButtonPrimary } from "@/components/systemb/Button";
import { useTier } from "@/hooks/useTier";
import {
  SEAT_HEADING,
  SEAT_ROWS,
  SEAT_PRICE,
  SEAT_PRICE_SUBLINE,
  SEAT_ONE_JOB,
  SEAT_CTA,
  SEAT_PATH,
} from "@/lib/seatCopy";

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
};

const NIGHT: React.CSSProperties = {
  background: "var(--v23-night)",
  border: "1px solid var(--v23-night-line)",
  borderRadius: 16,
  padding: "22px 20px",
  marginBottom: 14,
  color: "var(--text-inverse)",
};

const ReadShape: React.FC = () => {
  const navigate = useNavigate();
  const { isLoop } = useTier();

  if (isLoop) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <section data-surface="dark" style={NIGHT}>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--text-inverse)",
          }}
        >
          {SEAT_HEADING}
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-inverse)" }}>
          {SEAT_ONE_JOB}
        </p>
        <div style={{ display: "grid", gap: 6, margin: "14px 0 16px" }}>
          {SEAT_ROWS.map((row) => (
            <p
              key={row}
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--v23-on-night, rgba(255,255,255,.78))",
              }}
            >
              {row}
            </p>
          ))}
        </div>
        <div style={{ ...MONO, fontSize: 24, color: "var(--text-inverse)" }}>{SEAT_PRICE}</div>
        <p
          style={{
            margin: "6px 0 16px",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--v23-on-night, rgba(255,255,255,.72))",
          }}
        >
          {SEAT_PRICE_SUBLINE}
        </p>
        <ButtonPrimary onClick={() => navigate(SEAT_PATH)}>{SEAT_CTA}</ButtonPrimary>
      </section>
    </div>
  );
};

export default ReadShape;
