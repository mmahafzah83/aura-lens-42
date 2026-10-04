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
import { useTranslation } from "react-i18next";
import { ButtonPrimary } from "@/components/systemb/Button";
import { usePlan } from "@/hooks/usePlan";
import {
  SEAT_ROWS,
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
  const { t } = useTranslation();
  const { locked } = usePlan();

  if (!locked) return null;

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
          {t("seat.heading")}
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-inverse)" }}>
          {t("seat.oneJob")}
        </p>
        <div style={{ display: "grid", gap: 6, margin: "14px 0 16px" }}>
          {SEAT_ROWS.map((_r, i) => t(`seat.how.${i + 1}`)).map((row) => (
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
        <div style={{ ...MONO, fontSize: 24, color: "var(--text-inverse)" }}>{t("seat.price")}</div>
        <p
          style={{
            margin: "6px 0 16px",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--v23-on-night, rgba(255,255,255,.72))",
          }}
        >
          {t("seat.priceSub")}
        </p>
        <ButtonPrimary onClick={() => navigate(SEAT_PATH)}>{t("auth.request.reserve")}</ButtonPrimary>
      </section>
    </div>
  );
};

export default ReadShape;
