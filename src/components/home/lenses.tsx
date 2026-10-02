import React, { useState } from "react";
import {
  MONO, Card, Kicker, Body, Muted, TextButton, ReadFailure,
  SectionTitle, titleCaseFacet,
} from "./homeAtoms";
import type { HomeFacts } from "@/hooks/useHomeAddress";
import { useShapePast } from "@/hooks/useHomeExtras";
import { useLanguage } from "@/contexts/LanguageContext";
import { dateLocale, type UiLang } from "@/i18n";

/**
 * The two lenses. Each renders only from facts and real rows — nothing
 * here invents a name, a competitor or a number.
 */

// ── THE RECORD ─────────────────────────────────────────────────────────────
// Lives in its own file — the Record has its own data layer and zoom model.

// ── THE SHAPE ──────────────────────────────────────────────────────────────

/** Plain-English names and one sentence each (text in en.json). Unmapped keys fall back. */
const FACET_KEYS = new Set(["conviction", "discernment", "edge", "voice", "focus", "identity", "audience"]);

const facetWords = (key: string, t: (k: string) => string) =>
  FACET_KEYS.has(key)
    ? { name: t(`home.shape.facet.${key}.name`), line: t(`home.shape.facet.${key}.line`) as string | null }
    : { name: titleCaseFacet(key), line: null as string | null };

const longDate = (iso: string, lang: UiLang) =>
  new Date(iso).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "long" });

export interface ShapeLensProps {
  facts: HomeFacts | null;
  userId: string | null | undefined;
  /** the address read failed — the facets below may be stale or absent. */
  factsFailed?: boolean;
  onRetryFacts?: () => void;
}

function polygon(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length;
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = r * Math.max(0.06, Math.min(1, v));
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const CEILING = 0.995;

export const ShapeLens: React.FC<ShapeLensProps> = ({ facts, userId, factsFailed, onRetryFacts }) => {
  const facets = (facts?.facets ?? []).slice(0, 7);
  const dormant = new Set(facts?.facets_dormant ?? []);
  const past = useShapePast(userId);
  const [showDiagram, setShowDiagram] = useState(false);
  const { t, lang } = useLanguage();

  const size = 260, cx = size / 2, cy = size / 2, r = size / 2 - 34;
  const values = facets.map((f) => f.value);
  const pastValues = past.values
    ? facets.map((f) => past.values![f.facet] ?? f.value)
    : null;
  const hasPast = Boolean(pastValues && pastValues.some((v, i) => Math.abs(v - values[i]) > 0.005));

  const hasCaptures = (facts?.captures_total ?? 0) > 0;
  const hasSignals = (facts?.signals_active ?? 0) > 0;

  // Only claim nothing has registered when genuinely nothing has.
  if (facets.length === 0 && !hasCaptures && !hasSignals && !factsFailed) {
    return (
      <Card>
        <Kicker>{t("home.shape.kicker")}</Kicker>
        <SectionTitle as="h2">{t("home.shape.emptyTitle")}</SectionTitle>
        <Body>{t("home.shape.emptyBody")}</Body>
      </Card>
    );
  }

  // A failed read with nothing yet on screen: say so, never fake an empty state.
  if (facets.length === 0 && factsFailed) {
    return (
      <Card>
        <Kicker>{t("home.shape.kicker")}</Kicker>
        <SectionTitle as="h2">{t("home.shape.title")}</SectionTitle>
        <ReadFailure onRetry={onRetryFacts} />
      </Card>
    );
  }

  const anyDormant = facets.some((f) => dormant.has(f.facet));
  const pastCaption = past.loading
    ? t("home.shape.pastLoading")
    : past.failed
      ? t("home.shape.pastFailed")
      : hasPast
      ? (past.takenOn
        ? t("home.shape.pastDotted", { date: longDate(past.takenOn, lang) })
        : t("home.shape.pastSolidDotted"))
      : past.values
        ? t("home.shape.pastUnchanged")
        : t("home.shape.pastNone");

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "20px 22px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>{t("home.shape.kicker")}</Kicker>
        <SectionTitle as="h2">{t("home.shape.title")}</SectionTitle>
      </div>

      <div style={{ padding: "20px 22px", display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gap: 12 }}>
          {facets.map((f) => {
            const ceiling = f.value >= CEILING;
            const w = facetWords(f.facet, t);
            return (
              <div key={f.facet} style={{ display: "grid", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{w.name}</span>
                  <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {Math.round(f.value * 100)}
                    {ceiling && (
                      <span style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                        {" "}{t("home.shape.highest")}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ blockSize: 6, background: "var(--surface-subtle)", borderRadius: 999 }}>
                  <div style={{
                    blockSize: 6, borderRadius: 999,
                    inlineSize: `${Math.max(2, Math.round(f.value * 100))}%`,
                    background: dormant.has(f.facet) ? "var(--border-strong)" : "var(--act)",
                  }} />
                </div>
                {w.line && <Muted style={{ fontSize: 12 }}>{w.line}</Muted>}
              </div>
            );
          })}
          {anyDormant && (
            <Muted style={{ marginBlockStart: 2 }}>
              {t("home.shape.dormant")}
            </Muted>
          )}
          {facts?.facets_dormant_reason && (
            <Muted style={{ marginBlockStart: 2 }}>{t("home.shape.dormantReason")}</Muted>
          )}
          {factsFailed && <ReadFailure onRetry={onRetryFacts} style={{ marginBlockStart: 2 }} />}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <TextButton onClick={() => setShowDiagram((v) => !v)} style={{ justifySelf: "start" }}>
            {showDiagram ? t("home.shape.hideDiagram") : t("home.shape.showDiagram")}
          </TextButton>
          {showDiagram && (
        <div style={{ maxInlineSize: 340 }}>
          <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t("home.shape.diagramLabel")}>
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <polygon key={g} points={polygon(facets.map(() => g), cx, cy, r)}
                fill="none" stroke="var(--rule-outer)" strokeWidth={1} />
            ))}
            {hasPast && pastValues && (
              <polygon points={polygon(pastValues, cx, cy, r)} fill="none"
                stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 4" />
            )}
            <polygon points={polygon(values, cx, cy, r)}
              fill="var(--act-tint)" stroke="var(--act)" strokeWidth={2} />
            {facets.map((f, i) => {
              const a = -Math.PI / 2 + (i * 2 * Math.PI) / facets.length;
              const rr = r * Math.max(0.06, Math.min(1, f.value));
              const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
              if (!dormant.has(f.facet)) return null;
              return (
                <g key={f.facet}>
                  <circle cx={x} cy={y} r={6} fill="var(--surface-card)" />
                  <circle cx={x} cy={y} r={4} fill="var(--act)" />
                </g>
              );
            })}
          </svg>
          <Muted style={{ marginBlockStart: 8 }}>{pastCaption}</Muted>
          {past.failed && <ReadFailure onRetry={past.reload} style={{ marginBlockStart: 6 }} />}
        </div>
          )}
        </div>
      </div>
    </Card>
  );
};
