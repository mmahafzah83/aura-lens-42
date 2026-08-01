import React from "react";
import {
  MONO, Card, Kicker, Body, Muted, GhostButton, Skeleton,
  SectionTitle, titleCaseFacet,
} from "./homeAtoms";
import type { HomeFacts } from "@/hooks/useHomeAddress";
import { useRoomSources, useShapePast } from "@/hooks/useHomeExtras";

/**
 * The three lenses. Each renders only from facts and real rows — nothing
 * here invents a name, a competitor or a number.
 */

// ── THE RECORD ─────────────────────────────────────────────────────────────
// Lives in its own file — the Record has its own data layer and zoom model.
export { RecordLens } from "./RecordLens";
export type { RecordLensProps, RecordZoom } from "./RecordLens";

// ── THE ROOM ───────────────────────────────────────────────────────────────

export interface RoomLensProps {
  facts: HomeFacts | null;
  userId: string | null | undefined;
  memberName: string;
  onWriteOnSignal: () => void;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const RoomLens: React.FC<RoomLensProps> = ({ facts, userId, memberName, onWriteOnSignal }) => {
  const top = facts?.top_signal ?? null;
  const room = useRoomSources(userId, top?.id ?? null);

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "20px 22px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The room</Kicker>
        <SectionTitle>{top?.title ?? "No theme is leading yet"}</SectionTitle>
        {top ? (
          <Muted>
            <span style={{ ...MONO }}>{top.fragment_count}</span>{" "}
            {top.fragment_count === 1 ? "fragment backs" : "fragments back"} this theme
            {top.gained_last_7d ? " — it gained evidence this week." : "."}
          </Muted>
        ) : (
          <Muted>Keep a few more things and one theme will pull ahead. The room draws itself from that theme.</Muted>
        )}
      </div>

      {top && (
        <div style={{ padding: "6px 0" }}>
          {room.loading && (
            <div style={{ padding: "14px 22px", display: "grid", gap: 8 }}>
              <Skeleton h={13} w="70%" /><Skeleton h={13} w="52%" />
            </div>
          )}

          {!room.loading && room.sources.length === 0 && (
            <div style={{ padding: "14px 22px" }}>
              <Body>No source Aura tracks published on this theme this week. You would be first.</Body>
            </div>
          )}

          {!room.loading && room.sources.map((s, i) => (
            <div key={s.id} style={{
              padding: "14px 22px", display: "grid", gap: 4,
              borderBlockStart: i === 0 ? undefined : "1px solid var(--rule-divider)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{s.source}</span>
                <span style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {shortDate(s.date)}
                </span>
              </div>
              {s.title && <Muted>{s.title}</Muted>}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "18px 22px", borderBlockStart: "1px solid var(--rule-divider)" }}>
        {/* his own row — the empty chair */}
        <div style={{
          border: "1px solid var(--act)", borderRadius: 12, padding: 14,
          background: "var(--act-tint)", display: "grid", gap: 6,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{memberName}</div>
          {room.memberPublished ? (
            <Body>You published on this theme{room.memberPostTitle ? ` — "${room.memberPostTitle}".` : "."}</Body>
          ) : (
            <Body>You have not published on this theme.</Body>
          )}
          {top && !room.memberPublished && (
            <div style={{ marginBlockStart: 6 }}>
              <GhostButton onClick={onWriteOnSignal}>Write on this theme</GhostButton>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

// ── THE SHAPE ──────────────────────────────────────────────────────────────

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
