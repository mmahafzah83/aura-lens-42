/**
 * ReadShape — the visual summary of a member's Read.
 *
 * Mounted at the end of the Identity tab. Renders only what is genuinely
 * present in the data.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

interface AuthorityTheme {
  theme?: string;
  rationale?: string;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
};

const CARD: React.CSSProperties = {
  background: "var(--surface-card, #FFFFFF)",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: "20px 20px",
  marginBottom: 14,
};

const NIGHT: React.CSSProperties = {
  background: "var(--v23-night)",
  border: "1px solid var(--v23-night-line)",
  borderRadius: 16,
  padding: "22px 20px",
  marginBottom: 14,
  color: "var(--text-inverse)",
};

const SECTION_TITLE: React.CSSProperties = {
  margin: "0 0 12px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: 16,
  color: "var(--text-primary)",
  lineHeight: 1.25,
};

const SECONDARY: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-secondary)",
};

const ReadShape: React.FC = () => {
  const navigate = useNavigate();
  const { isLoop } = useTier();
  const [authorityThemes, setAuthorityThemes] = useState<(AuthorityTheme | string)[]>([]);
  const [contentPillars, setContentPillars] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("identity_intelligence, brand_assessment_results")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive || !data) return;

      const ii = (data as any).identity_intelligence;
      const rawThemes = ii && typeof ii === "object" ? ii.authority_themes : null;
      if (Array.isArray(rawThemes)) {
        setAuthorityThemes(rawThemes);
      } else {
        setAuthorityThemes([]);
      }

      const bar = (data as any).brand_assessment_results;
      const rawPillars = bar && typeof bar === "object" ? bar.content_pillars : null;
      if (Array.isArray(rawPillars)) {
        setContentPillars(
          rawPillars
            .map((p) => (typeof p === "string" ? p.trim() : ""))
            .filter((p) => p.length > 0),
        );
      } else {
        setContentPillars([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggle = (idx: number) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const hasThemes = authorityThemes.length > 0;
  const hasPillars = contentPillars.length > 0;

  if (!hasThemes && !hasPillars && isLoop) {
    return null;
  }

  return (
    <div style={{ marginTop: 8 }}>
      {hasThemes && (
        <section style={CARD}>
          <h2 style={SECTION_TITLE}>The subjects your material keeps returning to</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
            {authorityThemes.map((entry, idx) => {
              const label = typeof entry === "string" ? entry : (entry?.theme || "");
              const rationale = typeof entry === "string" ? "" : (entry?.rationale || "");
              if (!label) return null;

              const size = idx === 0 ? 16 : idx === 1 ? 14 : 12.5;
              const beyondThird = idx >= 3;
              const isExpanded = !!expanded[idx];

              return (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => rationale && toggle(idx)}
                    aria-expanded={rationale ? isExpanded : undefined}
                    style={{
                      background: beyondThird ? "#EDF1F6" : "#E8F1F9",
                      color: beyondThird ? "#5B6673" : "#04477C",
                      border: 0,
                      borderRadius: 999,
                      padding: "6px 13px",
                      fontFamily: "var(--font-body)",
                      fontSize: size,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      cursor: rationale ? "pointer" : "default",
                      textAlign: "start",
                    }}
                  >
                    {label}
                  </button>
                  {rationale && isExpanded && (
                    <p style={{ ...SECONDARY, maxWidth: 320, margin: "2px 0 0 2px" }}>{rationale}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hasPillars && (
        <section style={CARD}>
          <h2 style={SECTION_TITLE}>Two subjects your work already clusters around</h2>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {contentPillars.slice(0, 2).map((pillar, idx) => (
              <div
                key={idx}
                style={{
                  background: "var(--surface-card, #FFFFFF)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>
                  {pillar}
                </p>
              </div>
            ))}
          </div>
          <p style={{ ...SECONDARY, marginTop: 12 }}>
            Read from what you have actually written and done — not assigned to you.
          </p>
        </section>
      )}

      {!isLoop && (
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
      )}
    </div>
  );
};

export default ReadShape;
