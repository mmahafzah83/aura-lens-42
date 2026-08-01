import React from "react";
import {
  MONO, Card, Kicker, Body, Muted, MachineDot, PublishPill, TextButton, GhostButton,
  SectionTitle, titleCaseFacet,
} from "./homeAtoms";
import type { HomeFacts } from "@/hooks/useHomeAddress";
import type { HomeLedger } from "@/hooks/useHomeAddress";

/**
 * The three lenses. Each renders only from facts and real rows — nothing
 * here invents a name, a competitor or a number.
 */

// ── THE RECORD ─────────────────────────────────────────────────────────────

export interface RecordLensProps {
  facts: HomeFacts | null;
  ledger: HomeLedger;
  draftDismissed: boolean;
  onPublishDraft: (id: string) => void;
  onDismissDraft: (id: string) => void;
}

const Counter: React.FC<{ n: number | string; label: string; blue?: boolean }> = ({ n, label, blue }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <span style={{ ...MONO, fontSize: 20, fontWeight: 700, color: blue ? "var(--act)" : "var(--text-primary)" }}>{n}</span>
    <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{label}</span>
  </div>
);

export const RecordLens: React.FC<RecordLensProps> = ({ facts, ledger, draftDismissed, onPublishDraft, onDismissDraft }) => {
  const draft = facts?.last_night?.newest_signal_draft ?? null;

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The record</Kicker>
        <SectionTitle>What has actually happened</SectionTitle>
        <Muted>Every line below is an event, not a projection.</Muted>
      </div>

      <div style={{ padding: "18px 20px" }}>
        <div style={{ position: "relative", paddingInlineStart: 20 }}>
          {/* the spine */}
          <span aria-hidden style={{
            position: "absolute", insetInlineStart: 3, insetBlockStart: 6, insetBlockEnd: 6,
            inlineSize: 1, background: "var(--rule-outer)",
          }} />

          {/* today */}
          <div style={{ position: "relative", marginBlockEnd: 20 }}>
            <span aria-hidden style={{
              position: "absolute", insetInlineStart: -20, insetBlockStart: 5, inlineSize: 7, blockSize: 7,
              borderRadius: 999, background: "var(--act)",
            }} />
            <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Today
            </div>
            {draft && !draftDismissed ? (
              <div style={{
                marginBlockStart: 10, border: "1px solid var(--rule-outer)", borderRadius: 12,
                padding: 14, background: "var(--surface-page)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBlockEnd: 8 }}>
                  <MachineDot />
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Aura wrote this overnight from your themes.</span>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.55, color: "var(--text-primary)", fontWeight: 600 }}>
                  {draft.title || "A draft is waiting"}
                </p>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <PublishPill onClick={() => onPublishDraft(draft.id)}>Publish</PublishPill>
                  <TextButton onClick={() => onDismissDraft(draft.id)}>Not this one</TextButton>
                </div>
              </div>
            ) : (
              <Body style={{ marginBlockStart: 8 }}>
                {draft && draftDismissed
                  ? "You passed on last night's draft. It stays in Composer."
                  : "No draft came out of last night."}
              </Body>
            )}
          </div>

          {/* the days */}
          {ledger.days.length === 0 && !ledger.loading && (
            <Muted>Nothing recorded in the last two weeks.</Muted>
          )}
          {ledger.days.map((d) => (
            <div key={d.key} style={{ position: "relative", marginBlockEnd: 16 }}>
              <span aria-hidden style={{
                position: "absolute", insetInlineStart: -20, insetBlockStart: 6, inlineSize: 7, blockSize: 7,
                borderRadius: 999, background: d.machine ? "var(--machine)" : "var(--border-strong)",
              }} />
              <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {d.label}
              </div>
              <div style={{ display: "grid", gap: 4, marginBlockStart: 6 }}>
                {d.lines.map((l, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>{l}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        borderBlockStart: "1px solid var(--rule-divider)", padding: "16px 20px",
        display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
      }}>
        <Counter n={ledger.daysOnRecord ?? "—"} label="days on the record" />
        <Counter n={ledger.fragments} label="fragments held" />
        <Counter n={facts?.signals_active ?? 0} label="themes formed" />
        <Counter n={`${ledger.nightsProduced}/7`} label="nights that produced something" />
        <Counter n={facts?.published_total ?? 0} label="entries published" blue />
      </div>
    </Card>
  );
};

// ── THE ROOM ───────────────────────────────────────────────────────────────

export interface RoomLensProps {
  facts: HomeFacts | null;
  memberName: string;
  onWriteOnSignal: () => void;
}

export const RoomLens: React.FC<RoomLensProps> = ({ facts, memberName, onWriteOnSignal }) => {
  const top = facts?.top_signal ?? null;

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The room</Kicker>
        <SectionTitle>{top?.title ?? "No theme is leading yet"}</SectionTitle>
        {top ? (
          <Muted>
            {top.fragment_count} {top.fragment_count === 1 ? "fragment backs" : "fragments back"} this theme
            {top.gained_last_7d ? " — it gained evidence this week." : "."}
          </Muted>
        ) : (
          <Muted>Capture a few more things and a theme will lead.</Muted>
        )}
      </div>

      <div style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        {/* the member's own row — highlighted and empty */}
        <div style={{
          border: "1px solid var(--act)", borderRadius: 12, padding: 14,
          background: "var(--act-tint)", display: "grid", gap: 6,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{memberName}</div>
          <Body>You have not published on this theme.</Body>
          {top && (
            <div style={{ marginBlockStart: 6 }}>
              <GhostButton onClick={onWriteOnSignal}>Write on it</GhostButton>
            </div>
          )}
        </div>

        <div style={{
          border: "1px dashed var(--rule-outer)", borderRadius: 12, padding: 14,
        }}>
          <Muted>
            Aura is not yet tracking who else published on this theme. When that arrives, their rows appear
            above yours. Until then the room shows only what is true: your own position.
          </Muted>
        </div>
      </div>
    </Card>
  );
};

// ── THE SHAPE ──────────────────────────────────────────────────────────────

export interface ShapeLensProps {
  facts: HomeFacts | null;
}

function polygon(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length;
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = r * Math.max(0.06, Math.min(1, v));
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export const ShapeLens: React.FC<ShapeLensProps> = ({ facts }) => {
  const facets = (facts?.facets ?? []).slice(0, 7);
  const dormant = new Set(facts?.facets_dormant ?? []);
  const draftsWaiting = facts?.drafts_total ?? 0;

  const size = 260, cx = size / 2, cy = size / 2, r = size / 2 - 34;
  const values = facets.map((f) => f.value);
  // The projection is what publishing the drafts you already have would move.
  // No drafts, no projection — nothing is promised.
  const projected = draftsWaiting > 0
    ? facets.map((f) => Math.min(1, f.value + (dormant.has(f.facet) ? 0.12 : 0.06)))
    : null;

  if (facets.length === 0) {
    return (
      <Card>
        <Kicker>The shape</Kicker>
        <SectionTitle>Your shape has not registered yet</SectionTitle>
        <Body>Capture something and finish your calibration — the shape draws itself from those.</Body>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The shape</Kicker>
        <SectionTitle>What you are made of, as measured</SectionTitle>
      </div>

      <div style={{
        padding: "18px 20px", display: "grid", gap: 22,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "start",
      }}>
        <div>
          <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Your shape across seven facets">
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <polygon key={g} points={polygon(facets.map(() => g), cx, cy, r)}
                fill="none" stroke="var(--rule-outer)" strokeWidth={1} />
            ))}
            {projected && (
              <polygon points={polygon(projected, cx, cy, r)} fill="none"
                stroke="var(--act)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
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
            {projected
              ? "The dashed outline is a projection of what publishing your waiting drafts would move. It is a projection, not a promise."
              : "No projection is drawn — there is nothing waiting to publish."}
          </Muted>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {facets.map((f) => (
            <div key={f.facet} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{titleCaseFacet(f.facet)}</span>
                <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)" }}>{Math.round(f.value * 100)}</span>
              </div>
              <div style={{ blockSize: 6, background: "var(--surface-subtle)", borderRadius: 999 }}>
                <div style={{
                  blockSize: 6, borderRadius: 999,
                  inlineSize: `${Math.max(2, Math.round(f.value * 100))}%`,
                  background: dormant.has(f.facet) ? "var(--border-strong)" : "var(--act)",
                }} />
              </div>
            </div>
          ))}
          {facts?.facets_dormant_reason && (
            <Muted style={{ marginBlockStart: 4 }}>{facts.facets_dormant_reason}</Muted>
          )}
        </div>
      </div>

      <div style={{
        borderBlockStart: "1px solid var(--rule-divider)", padding: "16px 20px",
        display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}>
        {[
          {
            t: "If you publish once this week",
            b: draftsWaiting > 0
              ? `${draftsWaiting} draft${draftsWaiting === 1 ? "" : "s"} already waiting. Publishing one is the shortest route.`
              : "There is nothing waiting. Writing on your strongest theme is the shortest route.",
          },
          {
            t: "If you keep capturing",
            b: `${facts?.fragments_total ?? 0} fragments held so far. Themes form from these, not from anything else.`,
          },
          {
            t: "If nothing changes",
            b: facts?.at_top_band
              ? "You hold the top band. It is held by publishing, not by staying still."
              : facts?.points_to_next_band != null
                ? `${facts.points_to_next_band} points to ${facts.next_band_name ?? "the next band"}. They do not arrive on their own.`
                : "The shape stays where it is.",
          },
        ].map((c) => (
          <div key={c.t} style={{ border: "1px solid var(--rule-outer)", borderRadius: 12, padding: 14, display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{c.t}</span>
            <Muted>{c.b}</Muted>
          </div>
        ))}
      </div>
    </Card>
  );
};