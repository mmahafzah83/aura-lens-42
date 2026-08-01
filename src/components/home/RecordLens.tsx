import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MONO, Card, Kicker, Body, Muted, MachineDot, PublishPill, TextButton, SectionTitle } from "./homeAtoms";
import type { HomeFacts } from "@/hooks/useHomeAddress";
import {
  useRecordTimeline, useThemeTitles,
  type RecordBucket, type RecordMilestone, type RecordPublished,
} from "@/hooks/useRecordTimeline";

/**
 * THE RECORD — what has actually happened, compressed by age.
 *
 * Three events earn a line: you captured, Aura wrote, you published. Themes
 * collapse into one count chip a bucket. Quiet runs collapse into one line.
 * Everything is aggregated in SQL; nothing here counts rows in the browser.
 * No hex literal appears in this file — every colour is a token.
 */

export type RecordZoom = "days" | "weeks" | "months" | "published";

const ZOOMS: Array<{ k: RecordZoom; label: string }> = [
  { k: "days", label: "Days" },
  { k: "weeks", label: "Weeks" },
  { k: "months", label: "Months" },
  { k: "published", label: "Published only" },
];

const PAGE = 40;
const zoomKey = (uid: string) => `aura_record_zoom_${uid}`;

const DAY = 86_400_000;
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const parse = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const dayLabel = (key: string) => {
  const dt = parse(key);
  return `${dt.toLocaleDateString("en-GB", { weekday: "long" })} ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
};
const weekLabel = (key: string) => {
  const a = parse(key), b = new Date(a.getTime() + 6 * DAY);
  return `Week of ${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
};
const monthLabel = (key: string) =>
  parse(key).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const monthShort = (key: string) => parse(key).toLocaleDateString("en-GB", { month: "narrow" });
const monthId = (key: string) => `rec-m-${key.slice(0, 7)}`;

/** First line of a post, tidied and cut at ~90 characters on a word boundary. */
export function postTitle(raw: string | null | undefined): string {
  const first = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!first) return "Untitled";
  if (first.length <= 90) return first;
  const cut = first.slice(0, 90);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[,;:.\-—\s]+$/, "")}…`;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── row model ──────────────────────────────────────────────────────────────

type Grain = "day" | "week" | "month";

type Row =
  | { kind: "bucket"; at: string; grain: Grain; b: RecordBucket; pubs: RecordPublished[] }
  | { kind: "quiet"; at: string; from: string; to: string; n: number }
  | { kind: "milestone"; at: string; m: RecordMilestone }
  | { kind: "publish"; at: string; p: RecordPublished };

const periodEnd = (key: string, grain: Grain) => {
  const a = parse(key);
  if (grain === "day") return key;
  if (grain === "week") return iso(new Date(a.getTime() + 6 * DAY));
  return iso(new Date(a.getFullYear(), a.getMonth() + 1, 0));
};

const isEmpty = (b: RecordBucket) => b.cap + b.themes + b.drafts + b.pub === 0;

function milestoneText(m: RecordMilestone): { head: string; sub: string } {
  if (m.kind === "band") {
    const band = String(m.value ?? "").replace(/_/g, " ");
    const top = /presence/i.test(band);
    return {
      head: `You crossed into ${band}.`,
      sub: top
        ? "The top band. Held by publishing, not by reading."
        : "The band moved because the record moved.",
    };
  }
  if (m.kind === "first_publish") {
    return { head: "Your first published entry.", sub: postTitle(m.value) };
  }
  return {
    head: `A theme reached ${m.n ?? 25} fragments.`,
    sub: postTitle(m.value),
  };
}

// ── the spine rows ─────────────────────────────────────────────────────────

const Knot: React.FC<{ tone: "pub" | "machine" | "plain" | "dark" | "quiet" }> = ({ tone }) => {
  const size = tone === "pub" ? 11 : tone === "dark" ? 10 : 7;
  const bg = tone === "pub" ? "var(--act)"
    : tone === "dark" ? "var(--surface-inverse)"
    : tone === "machine" ? "var(--machine)"
    : tone === "quiet" ? "var(--border-default)"
    : "var(--border-strong)";
  return (
    <span aria-hidden style={{
      position: "absolute", insetInlineStart: -20 - (size - 7) / 2, insetBlockStart: 6 - (size - 7) / 2,
      inlineSize: size, blockSize: size, borderRadius: 999, background: bg,
      boxShadow: tone === "pub" ? "0 0 0 3px var(--act-tint)" : undefined,
    }} />
  );
};

const RowLabel: React.FC<React.PropsWithChildren<{ id?: string }>> = ({ children, id }) => (
  <div id={id} style={{
    ...MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)",
    scrollMarginBlockStart: 90,
  }}>{children}</div>
);

const PublishedLine: React.FC<{ p: RecordPublished }> = ({ p }) => (
  <p style={{ margin: 0, display: "grid", gap: 2 }}>
    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--act)" }}>You published.</span>
    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, color: "var(--text-primary)" }}>
      {postTitle(p.title)}
    </span>
  </p>
);

const ThemeChip: React.FC<{
  n: number; open: boolean; onToggle: () => void;
  titles: string[]; loading: boolean; onOpenSignals: () => void;
}> = ({ n, open, onToggle, titles, loading, onOpenSignals }) => (
  <div style={{ display: "grid", gap: 8 }}>
    <button type="button" onClick={onToggle} aria-expanded={open} style={{
      justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
      borderRadius: 999, padding: "5px 12px", background: "var(--surface-subtle)",
      border: "1px solid var(--rule-outer)", fontFamily: "var(--font-body)",
      fontSize: 12.5, color: "var(--text-secondary)",
    }}>
      <MachineDot size={6} />
      <span aria-hidden style={{ ...MONO, fontSize: 10 }}>{open ? "▾" : "▸"}</span>
      {plural(n, "theme formed", "themes formed")}
    </button>
    {open && (
      <div style={{ display: "grid", gap: 4, paddingInlineStart: 4 }}>
        {loading && <Muted style={{ fontSize: 12.5 }}>Reading the themes…</Muted>}
        {!loading && titles.slice(0, 10).map((t, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>{t}</p>
        ))}
        {!loading && n > titles.length && (
          <TextButton onClick={onOpenSignals} style={{ justifySelf: "start", fontSize: 12.5 }}>
            …and {n - titles.length} more — open the signals board
          </TextButton>
        )}
      </div>
    )}
  </div>
);

// ── the year strip ─────────────────────────────────────────────────────────

const YearStrip: React.FC<{ months: RecordBucket[]; onPick: (key: string) => void }> = ({ months, onPick }) => {
  const asc = useMemo(() => months.slice().sort((a, b) => (a.d < b.d ? -1 : 1)), [months]);
  if (asc.length === 0) return null;
  const max = Math.max(1, ...asc.map((m) => m.cap));
  const nowKey = iso(new Date()).slice(0, 7);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, overflowX: "auto", paddingBlockEnd: 2 }}>
        {asc.map((m) => {
          const current = m.d.slice(0, 7) === nowKey;
          const bg = m.pub > 0 ? "var(--act)" : current ? "var(--surface-inverse)" : "var(--border-strong)";
          return (
            <button
              key={m.d} type="button" onClick={() => onPick(m.d)}
              title={`${monthLabel(m.d)} — ${m.cap} captured, ${m.pub} published`}
              aria-label={`${monthLabel(m.d)}: ${m.cap} captured, ${m.pub} published`}
              style={{
                display: "grid", gap: 5, justifyItems: "center", background: "none", border: 0,
                padding: 0, cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              <span aria-hidden style={{
                inlineSize: 16, blockSize: Math.max(4, Math.round((m.cap / max) * 44)),
                borderRadius: 3, background: bg, display: "block",
              }} />
              <span style={{ ...MONO, fontSize: 9.5, color: "var(--text-muted)" }}>{monthShort(m.d)}</span>
            </button>
          );
        })}
      </div>
      <Muted style={{ fontSize: 12 }}>
        Bar height is what you captured that month. Blue means you published in it.
      </Muted>
    </div>
  );
};

// ── the lens ───────────────────────────────────────────────────────────────

export interface RecordLensProps {
  facts: HomeFacts | null;
  userId: string | null | undefined;
  draftDismissed: boolean;
  onPublishDraft: (id: string) => void;
  onDismissDraft: (id: string) => void;
  onOpenSignals: () => void;
}

const Counter: React.FC<{ n: number | string; label: string; blue?: boolean }> = ({ n, label, blue }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <span style={{ ...MONO, fontSize: 20, fontWeight: 700, color: blue ? "var(--act)" : "var(--text-primary)" }}>{n}</span>
    <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{label}</span>
  </div>
);

export const RecordLens: React.FC<RecordLensProps> = ({
  facts, userId, draftDismissed, onPublishDraft, onDismissDraft, onOpenSignals,
}) => {
  const t = useRecordTimeline(userId);
  const themes = useThemeTitles();
  const uid = userId ?? "anon";
  const draft = facts?.last_night?.newest_signal_draft ?? null;

  const [zoom, setZoom] = useState<RecordZoom>(() => {
    try {
      const v = localStorage.getItem(zoomKey(uid));
      return (v === "weeks" || v === "months" || v === "published" ? v : "days") as RecordZoom;
    } catch { return "days"; }
  });
  const [shown, setShown] = useState(PAGE);
  const [openChip, setOpenChip] = useState<string | null>(null);

  const chooseZoom = useCallback((z: RecordZoom) => {
    setZoom(z); setShown(PAGE); setOpenChip(null);
    try { localStorage.setItem(zoomKey(uid), z); } catch { /* noop */ }
  }, [uid]);

  const pubByDay = useMemo(() => {
    const m = new Map<string, RecordPublished[]>();
    t.published.forEach((p) => {
      const k = String(p.at).slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    return m;
  }, [t.published]);

  const pubsIn = useCallback((from: string, to: string) => {
    const out: RecordPublished[] = [];
    pubByDay.forEach((v, k) => { if (k >= from && k <= to) out.push(...v); });
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [pubByDay]);

  const rows: Row[] = useMemo(() => {
    if (t.loading) return [];
    const today = iso(new Date());
    const d30 = iso(new Date(Date.now() - 30 * DAY));
    const d120 = iso(new Date(Date.now() - 120 * DAY));
    const out: Row[] = [];

    const milestoneRows: Row[] = t.milestones.map((m) => ({
      kind: "milestone" as const, at: String(m.at).slice(0, 10), m,
    }));

    if (zoom === "published") {
      t.published.forEach((p) => out.push({ kind: "publish", at: String(p.at).slice(0, 10), p }));
      out.push(...milestoneRows);
      return out.sort((a, b) => (a.at < b.at ? 1 : -1));
    }

    if (zoom === "days") {
      // last 30 days, calendar-complete so quiet runs can collapse
      const byDay = new Map(t.days.map((b) => [b.d, b]));
      let quiet: string[] = [];
      const flush = () => {
        if (quiet.length === 0) return;
        out.push({ kind: "quiet", at: quiet[0], from: quiet[quiet.length - 1], to: quiet[0], n: quiet.length });
        quiet = [];
      };
      for (let i = 0; i <= 30; i++) {
        const key = iso(new Date(Date.now() - i * DAY));
        if (key > today) continue;
        const b = byDay.get(key);
        if (b && !isEmpty(b)) {
          flush();
          out.push({ kind: "bucket", at: key, grain: "day", b, pubs: pubByDay.get(key) ?? [] });
        } else {
          quiet.push(key);
        }
      }
      flush();
      t.weeks.filter((w) => w.d < d30 && w.d >= d120 && !isEmpty(w)).forEach((w) => {
        const end = periodEnd(w.d, "week");
        out.push({ kind: "bucket", at: w.d, grain: "week", b: w, pubs: pubsIn(w.d, end) });
      });
      t.months.filter((m) => m.d < d120 && !isEmpty(m)).forEach((m) => {
        out.push({ kind: "bucket", at: m.d, grain: "month", b: m, pubs: pubsIn(m.d, periodEnd(m.d, "month")) });
      });
    } else {
      const grain: Grain = zoom === "weeks" ? "week" : "month";
      const src = zoom === "weeks" ? t.weeks : t.months;
      src.filter((b) => !isEmpty(b)).forEach((b) => {
        out.push({ kind: "bucket", at: b.d, grain, b, pubs: pubsIn(b.d, periodEnd(b.d, grain)) });
      });
    }

    out.push(...milestoneRows);
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [t.loading, t.days, t.weeks, t.months, t.published, t.milestones, zoom, pubByDay, pubsIn]);

  const visible = rows.slice(0, shown);

  const pickMonth = useCallback((key: string) => {
    chooseZoom("months");
    window.setTimeout(() => {
      document.getElementById(monthId(key))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }, [chooseZoom]);

  const toggleChip = useCallback((key: string, from: string, to: string) => {
    setOpenChip((cur) => (cur === key ? null : key));
    if (openChip !== key && !themes.cache[key]) void themes.load(key, from, to);
  }, [openChip, themes]);

  useEffect(() => { setShown(PAGE); }, [userId]);

  const daysOnRecord = t.signupAt
    ? Math.max(1, Math.round((Date.now() - new Date(t.signupAt).getTime()) / DAY))
    : facts?.days_since_signup ?? null;

  const nightsProduced = useMemo(() => {
    const since = iso(new Date(Date.now() - 7 * DAY));
    return t.days.filter((d) => d.d >= since && d.drafts > 0).length;
  }, [t.days]);

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "18px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <Kicker>The record</Kicker>
        <SectionTitle>What has actually happened</SectionTitle>
        <Muted>Every line below is an event, not a projection.</Muted>
      </div>

      {/* the year strip */}
      <div style={{ padding: "16px 20px", borderBlockEnd: "1px solid var(--rule-divider)" }}>
        <YearStrip months={t.months} onPick={pickMonth} />
      </div>

      {/* the zoom */}
      <div style={{
        padding: "12px 20px", borderBlockEnd: "1px solid var(--rule-divider)",
        display: "flex", gap: 8, flexWrap: "wrap",
      }}>
        {ZOOMS.map((z) => {
          const on = z.k === zoom;
          return (
            <button
              key={z.k} type="button" onClick={() => chooseZoom(z.k)} aria-pressed={on}
              style={{
                borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font-body)",
                background: on ? "var(--act-tint)" : "transparent",
                color: on ? "var(--act)" : "var(--text-secondary)",
                border: on ? "1px solid var(--act)" : "1px solid var(--rule-outer)",
              }}
            >{z.label}</button>
          );
        })}
      </div>

      <div style={{ padding: "18px 20px" }}>
        <div style={{ position: "relative", paddingInlineStart: 20 }}>
          <span aria-hidden style={{
            position: "absolute", insetInlineStart: 3, insetBlockStart: 6, insetBlockEnd: 6,
            inlineSize: 1, background: "var(--rule-outer)",
          }} />

          {/* today — last night's draft */}
          {zoom !== "published" && (
            <div style={{ position: "relative", marginBlockEnd: 20 }}>
              <Knot tone="plain" />
              <RowLabel>Today</RowLabel>
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
          )}

          {t.loading && <Muted>Reading your record…</Muted>}
          {!t.loading && rows.length === 0 && (
            <Muted>
              {zoom === "published"
                ? "Nothing has been published yet."
                : "Nothing is on the record yet."}
            </Muted>
          )}

          {visible.map((r, idx) => {
            if (r.kind === "quiet") {
              return (
                <div key={`q-${r.at}-${idx}`} style={{ position: "relative", marginBlockEnd: 16 }}>
                  <Knot tone="quiet" />
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
                    {r.n === 1 ? "One quiet night." : `${r.n} quiet nights.`} Aura read and found nothing worth writing.
                  </p>
                </div>
              );
            }

            if (r.kind === "milestone") {
              const { head, sub } = milestoneText(r.m);
              return (
                <div key={`m-${r.at}-${idx}`} style={{ position: "relative", marginBlockEnd: 18 }}>
                  <Knot tone="dark" />
                  <div style={{
                    background: "var(--surface-inverse)", borderRadius: 12, padding: "13px 15px",
                    display: "grid", gap: 5,
                  }}>
                    <span style={{ ...MONO, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--v23-on-night)" }}>
                      {dayLabel(r.at)}
                    </span>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-inverse)" }}>{head}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--v23-on-night)" }}>{sub}</span>
                  </div>
                </div>
              );
            }

            if (r.kind === "publish") {
              return (
                <div key={`p-${r.p.id}`} style={{ position: "relative", marginBlockEnd: 16 }}>
                  <Knot tone="pub" />
                  <RowLabel>{dayLabel(r.at)}</RowLabel>
                  <div style={{ marginBlockStart: 6 }}><PublishedLine p={r.p} /></div>
                </div>
              );
            }

            const { b, grain, pubs } = r;
            const label = grain === "day" ? dayLabel(b.d) : grain === "week" ? weekLabel(b.d) : monthLabel(b.d);
            const from = b.d, to = periodEnd(b.d, grain);
            const chipKey = `${grain}-${b.d}`;
            const chip = themes.cache[chipKey];
            const machine = b.themes > 0 || b.drafts > 0 || b.nights > 0;

            return (
              <div key={`b-${grain}-${b.d}`} style={{ position: "relative", marginBlockEnd: 18 }}>
                <Knot tone={pubs.length > 0 ? "pub" : machine ? "machine" : "plain"} />
                <RowLabel id={grain === "month" ? monthId(b.d) : undefined}>{label}</RowLabel>
                <div style={{ display: "grid", gap: 7, marginBlockStart: 6 }}>
                  {grain === "day" ? (
                    <>
                      {b.cap > 0 && (
                        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                          You captured {plural(b.cap, "thing", "things")}.
                        </p>
                      )}
                      {b.drafts > 0 && (
                        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                          Aura wrote {plural(b.drafts, "draft", "drafts")}.
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                      Captured {b.cap} · Aura wrote {b.drafts} ·{" "}
                      <strong style={{ color: "var(--act)", fontWeight: 700 }}>You published {b.pub}</strong>
                    </p>
                  )}
                  {pubs.slice(0, 4).map((p) => <PublishedLine key={p.id} p={p} />)}
                  {pubs.length > 4 && (
                    <Muted style={{ fontSize: 12.5 }}>…and {pubs.length - 4} more published in this period.</Muted>
                  )}
                  {b.themes > 0 && (
                    <ThemeChip
                      n={b.themes} open={openChip === chipKey}
                      onToggle={() => toggleChip(chipKey, from, to)}
                      titles={chip?.titles ?? []} loading={!!chip?.loading}
                      onOpenSignals={onOpenSignals}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {rows.length > visible.length && (
            <div style={{ position: "relative", marginBlockStart: 4 }}>
              <TextButton onClick={() => setShown((n) => n + PAGE)}>
                Show earlier — {rows.length - visible.length} more
              </TextButton>
            </div>
          )}
        </div>
      </div>

      <div style={{
        borderBlockStart: "1px solid var(--rule-divider)", padding: "16px 20px",
        display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
      }}>
        <Counter n={daysOnRecord ?? "—"} label="days on the record" />
        <Counter n={t.fragmentsTotal} label="fragments held" />
        <Counter n={t.themesTotal} label="themes formed" />
        <Counter n={`${nightsProduced}/7`} label="nights that produced something" />
        <Counter n={t.publishedTotal} label="published in total" blue />
        <Counter n={t.publishedThroughAura} label="published through Aura" blue />
      </div>
    </Card>
  );
};

export default RecordLens;