import React, { useState } from "react";
import {
  MONO, Card, Kicker, Body, Muted, TextButton,
  SectionTitle, titleCaseFacet,
} from "./homeAtoms";
import type { HomeFacts } from "@/hooks/useHomeAddress";
import { useShapePast } from "@/hooks/useHomeExtras";

/**
 * The two lenses. Each renders only from facts and real rows — nothing
 * here invents a name, a competitor or a number.
 */

// ── THE RECORD ─────────────────────────────────────────────────────────────
// Lives in its own file — the Record has its own data layer and zoom model.
export { RecordLens } from "./RecordLens";
export type { RecordLensProps, RecordZoom } from "./RecordLens";

// ── THE SHAPE ──────────────────────────────────────────────────────────────

/** Plain-English names and one sentence each. Unmapped keys fall back. */
const FACET_WORDS: Record<string, { name: string; line: string }> = {
  conviction:  { name: "Confidence", line: "How sure your writing sounds." },
  discernment: { name: "Perception", line: "How well you read what is changing." },
  edge:        { name: "Expertise",  line: "How specific your knowledge is." },
  voice:       { name: "Voice",      line: "How much your writing sounds like you." },
  focus:       { name: "Focus",      line: "How much you stay on your main topics." },
  identity:    { name: "Identity",   line: "How clear it is what you stand for." },
  audience:    { name: "Audience",   line: "How well your topics match who you want to reach." },
};

const facetWords = (key: string) =>
  FACET_WORDS[key] ?? { name: titleCaseFacet(key), line: null as string | null };

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export interface ShapeLensProps {
  facts: HomeFacts | null;
  userId: string | null | undefined;
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

export const ShapeLens: React.FC<ShapeLensProps> = ({ facts, userId }) => {
  const facets = (facts?.facets ?? []).slice(0, 7);
  const dormant = new Set(facts?.facets_dormant ?? []);
  const past = useShapePast(userId);

  const size = 260, cx = size / 2, cy = size / 2, r = size / 2 - 34;
  const values = facets.map((f) => f.value);
  const pastValues = past.values
    ? facets.map((f) => past.values![f.facet] ?? f.value)
    : null;
  const hasPast = Boolean(pastValues && pastValues.some((v, i) => Math.abs(v - values[i]) > 0.005));
  const atCeiling = facets.filter((f) => f.value >= CEILING).length;

  if (facets.length === 0) {
    return (
      <Card>
        <Kicker>The shape</Kicker>
        <SectionTitle>Your shape has not registered yet</SectionTitle>
        <Body>Keep something you have read and finish your calibration — the shape draws itself from those two things.</Body>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "20px 22px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The shape</Kicker>
        <SectionTitle>What you are made of, as measured</SectionTitle>
      </div>

      <div style={{
        padding: "20px 22px", display: "grid", gap: 22,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "start",
      }}>
        <div>
          <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Your shape across seven facets, today and thirty days ago">
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
          <Muted style={{ marginBlockStart: 8 }}>
            {past.loading
              ? "Reading your earlier shape."
              : hasPast
                ? "Solid: today. Dotted: thirty days ago."
                : past.values
                  ? "Solid: today. Nothing has moved since thirty days ago, so only one outline is drawn."
                  : "Solid: today. Aura holds no reading from thirty days ago, so no past is drawn."}
          </Muted>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {facets.map((f) => {
            const ceiling = f.value >= CEILING;
            return (
              <div key={f.facet} style={{ display: "grid", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{titleCaseFacet(f.facet)}</span>
                  <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {ceiling ? "at ceiling" : Math.round(f.value * 100)}
                  </span>
                </div>
                <div style={{ blockSize: 6, background: "var(--surface-subtle)", borderRadius: 999 }}>
                  <div style={{
                    blockSize: 6, borderRadius: 999,
                    inlineSize: `${Math.max(2, Math.round(f.value * 100))}%`,
                    background: dormant.has(f.facet) ? "var(--border-strong)" : "var(--act)",
                  }} />
                </div>
              </div>
            );
          })}
          {atCeiling > 0 && (
            <Muted style={{ marginBlockStart: 4 }}>
              {atCeiling === 1 ? "One of your readings sits" : `${atCeiling} of your readings sit`} at their maximum.
              That is a limit of the measure, not of you — we are refining it.
            </Muted>
          )}
          {facts?.facets_dormant_reason && (
            <Muted style={{ marginBlockStart: 4 }}>{facts.facets_dormant_reason}</Muted>
          )}
        </div>
      </div>
    </Card>
  );
};
