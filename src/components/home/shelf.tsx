import React from "react";
import { MONO, Card, Kicker, Body, Muted, ActButton, MachineDot, SectionTitle, ReadFailure } from "./homeAtoms";
import type { HomeFacts, HomeMove } from "@/hooks/useHomeAddress";
import { WIDGET_DEFS } from "@/components/widgets/widgetData";
import type { WidgetLayout, WidgetMetrics } from "@/components/widgets/widgetData";
import { WidgetBody } from "@/components/widgets/WidgetCards";
import { nSignals, nEvidence, velocityWord } from "@/constants/vocabulary";
import { useTierFromImprint } from "@/hooks/useTierFromImprint";

export type ShelfKey = "moves" | "stand" | "own" | "night" | "widgets";

export interface ShelfItem {
  key: ShelfKey;
  title: string;
  /** the single most useful fact — never a bare title. */
  fact: string;
  machine?: boolean;
}

export function buildShelf(
  facts: HomeFacts | null,
  moves: HomeMove[],
  themes: number,
  layout?: WidgetLayout,
  metrics?: WidgetMetrics | null,
): ShelfItem[] {
  const f = facts ?? {};
  const ln = f.last_night;
  const drafts = f.drafts_total ?? 0;
  const widgetsOn = layout ? WIDGET_DEFS.filter((d) => layout[d.key]).length : 0;
  return [
    {
      key: "moves",
      title: "Today in order",
      fact: moves.length
        ? `${moves.length} move${moves.length === 1 ? "" : "s"} · about ${moves.reduce((a, m) => a + (m.est_minutes || 0), 0)} minutes`
        : "Nothing today. Keep something you read and one will appear.",
    },
    {
      key: "stand",
      title: "Where you stand",
      // The band and the points-to-next belong to HomeMasthead. Here: the number only.
      fact: f.imprint != null
        ? `${f.imprint}/100`
        : "No number yet. Capturing and publishing both feed it.",
    },
    {
      key: "own",
      title: "What you own",
      fact: themes > 0
        ? `${themes} live ${themes === 1 ? "signal" : "signals"}`
        : "No signals yet. They form once you have captured a handful of things.",
    },
    {
      key: "night",
      title: "While you slept",
      fact: ln
        ? `${ln.sources_read} read · ${ln.drafts_written} written`
        : "Aura has not run for you yet. It reads overnight.",
      machine: true,
    },
    {
      key: "widgets",
      title: "Your widgets",
      fact: widgetsOn > 0
        ? `${widgetsOn} number${widgetsOn === 1 ? "" : "s"} on the shelf${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"} waiting` : ""}`
        : "Nothing pinned yet. Choose the numbers you want to watch.",
    },
  ];
}

// ── the cards themselves ───────────────────────────────────────────────────

export const MovesCard: React.FC<{ moves: HomeMove[]; onGo: (route: string) => void }> = ({ moves, onGo }) => (
  <Card style={{ padding: 0 }}>
    <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
      <Kicker>Today in order</Kicker>
      <SectionTitle as="h2">What to do, in the order that matters</SectionTitle>
    </div>
    {moves.length === 0 && (
      <div style={{ padding: "18px 20px", display: "grid", gap: 6 }}>
        <Body>Nothing worth your time today.</Body>
        <Muted>Keep one thing you read and Aura writes tomorrow's list from it.</Muted>
      </div>
    )}
    {moves.map((m, i) => (
      <div key={`${m.what}-${i}`} style={{
        padding: "18px 20px", borderBlockStart: i === 0 ? undefined : "1px solid var(--rule-divider)",
        display: "grid", gap: 8, borderInlineStart: "3px solid var(--act)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: 11, color: "var(--act)" }}>{String(i + 1).padStart(2, "0")}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{m.what}</span>
          <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>{m.est_minutes} min</span>
        </div>
        <Body>{m.why}</Body>
        <Muted>{m.how}</Muted>
        <Muted><strong style={{ color: "var(--text-secondary)" }}>Outcome:</strong> {m.outcome}</Muted>
        <div><ActButton onClick={() => onGo(m.cta_route)}>Do this</ActButton></div>
      </div>
    ))}
  </Card>
);

export const StandCard: React.FC<{ facts: HomeFacts | null; userId: string | null | undefined }> = ({ facts, userId }) => {
  // The verdict (band, points to next) is owned by HomeMasthead and is not
  // repeated here. This card is the *why*: the number and its three parts.
  const tier = useTierFromImprint(userId);
  const c = facts?.components ?? { signal: null, content: null, capture: null };
  const rows: Array<{ label: string; value: number | null; weight: string }> = [
    { label: "Signal", value: c.signal, weight: "signals you hold" },
    { label: "Content", value: c.content, weight: "what you published" },
    { label: "Capture", value: c.capture, weight: "what you feed it" },
  ];
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>Where you stand</Kicker>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ ...MONO, fontSize: 34, fontWeight: 700, color: "var(--text-primary)" }}>
            {facts?.imprint ?? "—"}
          </span>
          <span style={{ ...MONO, fontSize: 13, color: "var(--text-muted)" }}>/100</span>
        </div>
        <Muted style={{ marginBlockStart: 6 }}>
          {facts?.imprint == null
            ? "No number yet — capture and publish and Aura can measure it"
            : "What the number is made of."}
        </Muted>
      </div>
      <div style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.label}</span>
              <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)" }}>{r.value ?? "—"}</span>
            </div>
            <div style={{ blockSize: 8, background: "var(--surface-subtle)", borderRadius: 999 }}>
              <div style={{
                blockSize: 8, borderRadius: 999, background: "var(--act)",
                inlineSize: `${Math.max(0, Math.min(100, r.value ?? 0))}%`,
              }} />
            </div>
            <Muted>{r.weight}</Muted>
          </div>
        ))}
        {tier.failed && !tier.loading && <ReadFailure onRetry={tier.refresh} />}
      </div>
    </Card>
  );
};

export interface OwnedTheme { id: string; title: string; fragments: number; velocity: string | null }

export const OwnCard: React.FC<{
  themes: OwnedTheme[]; onOpen: () => void;
  loading?: boolean; failed?: boolean; onRetry?: () => void;
}> = ({ themes, onOpen, loading, failed, onRetry }) => (
  <Card style={{ padding: 0 }}>
    <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
      <Kicker>What you own</Kicker>
      <SectionTitle as="h2">The signals your reading holds up</SectionTitle>
    </div>
    <div style={{ padding: "8px 0" }}>
      {loading && themes.length === 0 && (
        <div style={{ padding: "12px 20px" }}>
          <Muted>Reading your signals…</Muted>
        </div>
      )}
      {!loading && !failed && themes.length === 0 && (
        <div style={{ padding: "12px 20px", display: "grid", gap: 6 }}>
          <Body>No signals yet.</Body>
          <Muted>A signal forms when several things you capture point the same way.</Muted>
        </div>
      )}
      {themes.map((t) => (
        <div key={t.id} style={{
          padding: "12px 20px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
        }}>
          <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{t.title}</span>
          <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {nEvidence(t.fragments)} · {velocityWord(t.velocity)} this week
          </span>
        </div>
      ))}
      {failed && (
        <div style={{ padding: "12px 20px" }}>
          <ReadFailure onRetry={onRetry} />
        </div>
      )}
    </div>
    <div style={{ padding: "14px 20px", borderBlockStart: "1px solid var(--rule-divider)" }}>
      <ActButton onClick={onOpen}>Open your signals</ActButton>
    </div>
  </Card>
);

export const NightCard: React.FC<{ facts: HomeFacts | null; onOpen: () => void }> = ({ facts, onOpen }) => {
  const ln = facts?.last_night;
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>While you slept</Kicker>
        {/* The "Prepared HH:MM" clock is owned by the night address header. */}
        <SectionTitle as="h2">What Aura did overnight</SectionTitle>
      </div>
      <div style={{ padding: "18px 20px", display: "grid", gap: 10 }}>
        {ln ? (
          <>
            <Body>Read {ln.sources_read} {ln.sources_read === 1 ? "source" : "sources"}.</Body>
            <Body>Strengthened {nSignals(ln.themes_strengthened)}.</Body>
            <Body>
              {ln.drafts_written > 0
                ? `Wrote ${ln.drafts_written} draft${ln.drafts_written === 1 ? "" : "s"}.`
                : "Wrote nothing — there was nothing worth writing."}
            </Body>
          </>
        ) : (
          <>
            <Body>Aura has not run for you yet.</Body>
            <Muted>It reads overnight and writes only when something is worth writing.</Muted>
          </>
        )}
        <div><ActButton onClick={onOpen}>See what Aura read</ActButton></div>
      </div>
    </Card>
  );
};

export const WidgetsCard: React.FC<{
  layout: WidgetLayout; metrics: WidgetMetrics | null; onEdit: () => void;
  failed?: boolean; onRetry?: () => void;
}> = ({ layout, metrics, onEdit, failed, onRetry }) => {
  const on = WIDGET_DEFS.filter((d) => layout[d.key]);
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>Your widgets</Kicker>
        <SectionTitle as="h2">The numbers you chose to keep</SectionTitle>
      </div>
      <div style={{ padding: 18, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {metrics && on.map((d) => <WidgetBody key={d.key} k={d.key} m={metrics} />)}
        {failed && <ReadFailure onRetry={onRetry} />}
        {!failed && on.length === 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <Body>Nothing is pinned here yet.</Body>
            <Muted>Choose the numbers you want to watch and they appear on this card.</Muted>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px", borderBlockStart: "1px solid var(--rule-divider)" }}>
        <ActButton onClick={onEdit}>Choose your widgets</ActButton>
      </div>
    </Card>
  );
};