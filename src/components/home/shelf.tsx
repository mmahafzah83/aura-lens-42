import React from "react";
import { MONO, Card, Kicker, Body, Muted, ActButton, MachineDot, SectionTitle, ReadFailure } from "./homeAtoms";
import type { HomeFacts, HomeMove } from "@/hooks/useHomeAddress";
import { WIDGET_DEFS } from "@/components/widgets/widgetData";
import type { WidgetLayout, WidgetMetrics } from "@/components/widgets/widgetData";
import { WidgetBody } from "@/components/widgets/WidgetCards";
import { nSignals, nEvidence, nPages, nDrafts, CAPTURE, velocityWord } from "@/constants/vocabulary";
import { useTierFromImprint } from "@/hooks/useTierFromImprint";
import { useLanguage } from "@/contexts/LanguageContext";

type TFn = (key: string, vars?: Record<string, unknown>) => string;
type Lang = "en" | "ar";

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
  layout: WidgetLayout | undefined,
  metrics: WidgetMetrics | null | undefined,
  t: TFn,
  lang: Lang,
): ShelfItem[] {
  const f = facts ?? {};
  const ln = f.last_night;
  const drafts = f.drafts_total ?? 0;
  const widgetsOn = layout ? WIDGET_DEFS.filter((d) => layout[d.key]).length : 0;
  return [
    {
      key: "moves",
      title: t("home.shelf.movesTitle"),
      fact: moves.length
        ? t("home.shelf.movesFact", { count: moves.length, minutes: moves.reduce((a, m) => a + (m.est_minutes || 0), 0) })
        : t("home.shelf.movesEmpty"),
    },
    {
      key: "stand",
      title: t("home.shelf.standTitle"),
      // The band and the points-to-next belong to HomeMasthead. Here: the number only.
      fact: f.imprint != null
        ? t("home.shelf.standFact", { score: f.imprint })
        : t("home.shelf.standEmpty"),
    },
    {
      key: "own",
      title: t("home.shelf.ownTitle"),
      // `signals_active` — rows in `strategic_signals`. The dictionary owns the noun.
      fact: themes > 0
        ? t("home.shelf.ownFact", { signals: nSignals(themes, lang) })
        : t("home.shelf.ownEmpty", { captures: CAPTURE.nounPlural }),
    },
    {
      key: "night",
      title: t("home.shelf.nightTitle"),
      // Bare numbers said nothing. `sources_read` is `agent_findings` rows —
      // PAGES Aura read, never the member's sources (Ruling 1).
      fact: ln
        ? t("home.shelf.nightFact", { pages: nPages(ln.sources_read, lang), drafts: nDrafts(ln.drafts_written, lang) })
        : t("home.shelf.nightEmpty"),
      machine: true,
    },

    {
      key: "widgets",
      title: t("home.shelf.widgetsTitle"),
      // `drafts_total` — draft rows. The dictionary owns that noun too.
      fact: widgetsOn > 0
        ? (drafts
          ? t("home.shelf.widgetsPinnedWaiting", { pinned: widgetsOn, drafts: nDrafts(drafts, lang) })
          : t("home.shelf.widgetsPinned", { pinned: widgetsOn }))
        : t("home.shelf.widgetsEmpty"),
    },
  ];
}

// ── the cards themselves ───────────────────────────────────────────────────

export const MovesCard: React.FC<{ moves: HomeMove[]; onGo: (route: string) => void }> = ({ moves, onGo }) => {
  const { t } = useLanguage();
  return (
  <Card style={{ padding: 0 }}>
    <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
      <Kicker>{t("home.moves.kicker")}</Kicker>
      <SectionTitle as="h2">{t("home.moves.title")}</SectionTitle>
    </div>
    {moves.length === 0 && (
      <div style={{ padding: "18px 20px", display: "grid", gap: 6 }}>
        <Body>{t("home.moves.emptyBody")}</Body>
        <Muted>{t("home.moves.emptyMuted")}</Muted>
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
          <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>{t("home.moves.minutes", { minutes: m.est_minutes })}</span>
        </div>
        <Body>{m.why}</Body>
        <Muted>{m.how}</Muted>
        <Muted><strong style={{ color: "var(--text-secondary)" }}>{t("home.moves.outcome")}</strong> {m.outcome}</Muted>
        <div><ActButton onClick={() => onGo(m.cta_route)}>{t("home.moves.doThis")}</ActButton></div>
      </div>
    ))}
  </Card>
  );
};

export const StandCard: React.FC<{ facts: HomeFacts | null; userId: string | null | undefined }> = ({ facts, userId }) => {
  // The verdict (band, points to next) is owned by HomeMasthead and is not
  // repeated here. This card is the *why*: the number and its three parts.
  const tier = useTierFromImprint(userId);
  const { t } = useLanguage();
  const c = facts?.components ?? { signal: null, content: null, capture: null };
  const rows: Array<{ label: string; value: number | null; weight: string }> = [
    { label: t("home.stand.signal"), value: c.signal, weight: t("home.stand.signalWeight") },
    { label: t("home.stand.content"), value: c.content, weight: t("home.stand.contentWeight") },
    { label: t("home.stand.capture"), value: c.capture, weight: t("home.stand.captureWeight") },
  ];
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker as="h2">{t("home.stand.kicker")}</Kicker>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ ...MONO, fontSize: 34, fontWeight: 700, color: "var(--text-primary)" }}>
            {facts?.imprint ?? "—"}
          </span>
          <span style={{ ...MONO, fontSize: 13, color: "var(--text-muted)" }}>{t("home.stand.outOf")}</span>
        </div>
        <Muted style={{ marginBlockStart: 6 }}>
          {facts?.imprint == null
            ? t("home.stand.noNumber")
            : t("home.stand.madeOf")}
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
}> = ({ themes, onOpen, loading, failed, onRetry }) => {
  const { t, lang } = useLanguage();
  return (
  <Card style={{ padding: 0 }}>
    <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
      <Kicker>{t("home.own.kicker")}</Kicker>
      <SectionTitle as="h2">{t("home.own.title")}</SectionTitle>
    </div>
    <div style={{ padding: "8px 0" }}>
      {loading && themes.length === 0 && (
        <div style={{ padding: "12px 20px" }}>
          <Muted>{t("home.own.loading")}</Muted>
        </div>
      )}
      {!loading && !failed && themes.length === 0 && (
        <div style={{ padding: "12px 20px", display: "grid", gap: 6 }}>
          <Body>{t("home.own.emptyBody")}</Body>
          <Muted>{t("home.own.emptyMuted")}</Muted>
        </div>
      )}
      {themes.map((th) => (
        <div key={th.id} style={{
          padding: "12px 20px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
        }}>
          <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{th.title}</span>
          <span style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {t("home.own.row", { evidence: nEvidence(th.fragments, lang), velocity: velocityWord(th.velocity) })}
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
      <ActButton onClick={onOpen}>{t("home.own.open")}</ActButton>
    </div>
  </Card>
  );
};

export const NightCard: React.FC<{
  facts: HomeFacts | null;
  onOpen: () => void;
  /** Distinct signals the night's pages actually join to (Ruling 2). Null while
      unknown; 0 means the line does not render at all. */
  strengthened?: number | null;
}> = ({ facts, onOpen, strengthened }) => {
  const ln = facts?.last_night;
  const { t, lang } = useLanguage();
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>{t("home.night.kicker")}</Kicker>
        {/* The "Prepared HH:MM" clock is owned by the night address header. */}
        <SectionTitle as="h2">{t("home.night.title")}</SectionTitle>
      </div>
      <div style={{ padding: "18px 20px", display: "grid", gap: 10 }}>
        {ln ? (
          <>
            {/* `sources_read` counts `agent_findings` rows: pages Aura read. */}
            <Body>{t("home.night.read", { pages: nPages(ln.sources_read, lang) })}</Body>
            {/* Only real, openable signals earn this line. No join, no line. */}
            {!!strengthened && strengthened > 0 && (
              <Body>{t("home.night.strengthened", { signals: nSignals(strengthened, lang) })}</Body>
            )}
            <Body>
              {ln.drafts_written > 0
                ? t("home.night.wrote", { drafts: nDrafts(ln.drafts_written, lang) })
                : t("home.night.wroteNothing")}
            </Body>
          </>

        ) : (
          <>
            <Body>{t("home.night.notRunBody")}</Body>
            <Muted>{t("home.night.notRunMuted")}</Muted>
          </>
        )}
        <div><ActButton onClick={onOpen}>{t("home.night.open")}</ActButton></div>
      </div>
    </Card>
  );
};

export const WidgetsCard: React.FC<{
  layout: WidgetLayout; metrics: WidgetMetrics | null; onEdit: () => void;
  failed?: boolean; onRetry?: () => void;
}> = ({ layout, metrics, onEdit, failed, onRetry }) => {
  const on = WIDGET_DEFS.filter((d) => layout[d.key]);
  const { t } = useLanguage();
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>{t("home.widgets.kicker")}</Kicker>
        <SectionTitle as="h2">{t("home.widgets.title")}</SectionTitle>
      </div>
      <div style={{ padding: 18, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {metrics && on.map((d) => <WidgetBody key={d.key} k={d.key} m={metrics} />)}
        {failed && <ReadFailure onRetry={onRetry} />}
        {!failed && on.length === 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <Body>{t("home.widgets.emptyBody")}</Body>
            <Muted>{t("home.widgets.emptyMuted")}</Muted>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px", borderBlockStart: "1px solid var(--rule-divider)" }}>
        <ActButton onClick={onEdit}>{t("home.widgets.choose")}</ActButton>
      </div>
    </Card>
  );
};