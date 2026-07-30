import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, HelpCircle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { countPosts, loadPostCounts } from "@/lib/postProvenance";
import { bandFromScore, bandFromKey, type TierBand } from "@/hooks/useTierFromImprint";
import { getTrackSessionId } from "@/lib/track";
import { loadLayout, loadWidgetMetrics, WIDGET_DEFS, DEFAULT_LAYOUT } from "@/components/widgets/widgetData";
import type { WidgetLayout, WidgetMetrics } from "@/components/widgets/widgetData";
import { WidgetBody } from "@/components/widgets/WidgetCards";

/**
 * HomeSpine — everything on Home below the one move.
 *
 * Order is fixed: header strip, three instruments, what changed since a
 * stated time, my widgets. Every number appears exactly once on the page and
 * is read from the canonical source (postProvenance for the two published
 * counts, imprint_snapshots for the score, strategic_signals for themes).
 * Bone surface tokens explicit, mono numerals, logical properties only.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const ADD_TILE_DISMISS = "aura_home_add_widget_dismissed";

const editionDate = (d: Date) =>
  `${d.toLocaleDateString("en-GB", { weekday: "long" })} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`.toUpperCase();

const clockLabel = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const startOfMonthIso = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
};

function visitLabel(iso: string | null): string {
  if (!iso) return "in the last few days";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = clockLabel(iso);
  if (days <= 0) return `earlier today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${time}`;
}

// ── Atoms ──────────────────────────────────────────────────────────

const SectionLabel: React.FC<React.PropsWithChildren<{ right?: React.ReactNode }>> = ({ children, right }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, marginBlockEnd: 10, flexWrap: "wrap",
  }}>
    <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
      {children}
    </span>
    {right}
  </div>
);

const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div style={{
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
    borderRadius: 16, padding: 18, ...style,
  }}>{children}</div>
);

const LinkAction: React.FC<React.PropsWithChildren<{ onClick: () => void }>> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
    border: 0, padding: 0, cursor: "pointer", fontFamily: "var(--font-body)",
    fontSize: 13, fontWeight: 600, color: "var(--act)",
  }}>{children}<ArrowRight size={13} aria-hidden /></button>
);

interface Instrument {
  value: string;
  unit?: string;
  line: string;
  sub: string;
  help?: { href: string; label: string };
}

const InstrumentTile: React.FC<{ i: Instrument }> = ({ i }) => (
  <Card>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ ...MONO, fontSize: 30, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{i.value}</span>
      {i.unit && <span style={{ ...MONO, fontSize: 13, color: "var(--text-muted)" }}>{i.unit}</span>}
      {i.help && (
        <a
          href={i.help.href} target="_blank" rel="noreferrer" aria-label={i.help.label}
          style={{ marginInlineStart: "auto", color: "var(--text-muted)", display: "inline-flex" }}
        >
          <HelpCircle size={15} aria-hidden />
        </a>
      )}
    </div>
    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBlockStart: 10, lineHeight: 1.5 }}>{i.line}</div>
    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBlockStart: 4, lineHeight: 1.5 }}>{i.sub}</div>
  </Card>
);

// ── Types ──────────────────────────────────────────────────────────

interface ChangeRow {
  key: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}

export interface HomeSpineProps {
  userId: string | null | undefined;
  onSwitchTab: (tab: string) => void;
  onStartSignalPost: (p: { topic: string; context: string; signalId: string; signalTitle: string }) => void;
}

interface SpineData {
  overnightAt: string | null;
  imprint: number | null;
  band: TierBand | null;
  bandWeeks: number | null;
  liveSignals: number;
  growingSignals: number;
  publishedMonth: number;
  publishedThroughAura: number;
  lastVisitAt: string | null;
  changes: ChangeRow[];
}

export default function HomeSpine({ userId, onSwitchTab, onStartSignalPost }: HomeSpineProps) {
  const [data, setData] = useState<SpineData | null>(null);
  const [layout, setLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [metrics, setMetrics] = useState<WidgetMetrics | null>(null);
  const [addTileHidden, setAddTileHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(ADD_TILE_DISMISS) === "1"; } catch { return false; }
  });

  const load = useCallback(async () => {
    if (!userId) return;
    const monthIso = startOfMonthIso();
    const sid = getTrackSessionId();

    const [snapRes, sigRes, findRes, sessRes, posts] = await Promise.all([
      supabase.from("imprint_snapshots").select("imprint, tier, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(120),
      (supabase.from("strategic_signals" as any) as any)
        .select("id, signal_title, velocity_status, fragment_count, strategic_implications, explanation, created_at, updated_at")
        .eq("user_id", userId).eq("status", "active").limit(500),
      (supabase.from("agent_findings" as any) as any)
        .select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
      (supabase.from("product_events" as any) as any)
        .select("created_at, session_id").eq("user_id", userId).eq("event", "session_start")
        .order("created_at", { ascending: false }).limit(20),
      loadPostCounts(supabase, userId),
    ]);

    // Imprint + how long this band has been held.
    const snaps = ((snapRes.data as any[]) || []);
    const latest = snaps[0];
    const score = typeof latest?.imprint === "number" ? Math.round(latest.imprint) : null;
    const band = bandFromKey(latest?.tier) ?? bandFromScore(score);
    let bandWeeks: number | null = null;
    if (band && latest?.created_at) {
      let heldSince = latest.created_at as string;
      for (const s of snaps) {
        const b = bandFromKey(s?.tier) ?? bandFromScore(s?.imprint);
        if (b?.key !== band.key) break;
        heldSince = s.created_at;
      }
      bandWeeks = Math.max(1, Math.round((Date.now() - new Date(heldSince).getTime()) / (7 * 86_400_000)));
    }

    const sigs = ((sigRes.data as any[]) || []);
    const growing = sigs.filter((s) => (s.velocity_status || "").toLowerCase() === "accelerating").length;

    const counts = countPosts(posts.rows, monthIso);

    // Previous session — the newest session_start that is not this session.
    const sessions = ((sessRes.data as any[]) || []);
    const prev = sessions.find((r) => !sid || r.session_id !== sid) ?? null;
    const lastVisitAt: string | null = prev?.created_at ?? null;
    const sinceIso = lastVisitAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [entRes, newSigRes, pubRes] = await Promise.all([
      supabase.from("entries").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", sinceIso),
      (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "active").gte("created_at", sinceIso),
      (supabase.from("linkedin_posts" as any) as any)
        .select("source_type, tracking_status, published_at, created_at")
        .eq("user_id", userId).gte("created_at", sinceIso),
    ]);

    const changes: ChangeRow[] = [];
    const newCaptures = entRes.count ?? 0;
    const topSignal = [...sigs].sort((a, b) =>
      new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];

    if (newCaptures > 0 && topSignal) {
      const total = topSignal.fragment_count ?? 0;
      changes.push({
        key: "captures",
        text: `You captured ${newCaptures} more ${newCaptures === 1 ? "source" : "sources"} about ${topSignal.signal_title} — ${total} ${total === 1 ? "source" : "sources"} now back this theme.`,
        actionLabel: "Worth a post — start one",
        onAction: () => onStartSignalPost({
          topic: topSignal.signal_title,
          context: topSignal.strategic_implications || topSignal.explanation || "",
          signalId: topSignal.id,
          signalTitle: topSignal.signal_title,
        }),
      });
    } else if (newCaptures > 0) {
      changes.push({
        key: "captures",
        text: `You captured ${newCaptures} more ${newCaptures === 1 ? "source" : "sources"}. Aura is still reading them for a theme.`,
        actionLabel: "See what you saved",
        onAction: () => onSwitchTab("library"),
      });
    }

    const newThemes = newSigRes.count ?? 0;
    if (newThemes > 0) {
      changes.push({
        key: "themes",
        text: `Your reading opened ${newThemes} new ${newThemes === 1 ? "theme" : "themes"} Aura now tracks for you.`,
        actionLabel: `See the ${newThemes} ${newThemes === 1 ? "theme" : "themes"}`,
        onAction: () => onSwitchTab("intelligence"),
      });
    }

    const publishedSince = countPosts(((pubRes.data as any[]) || []), sinceIso).live;
    if (publishedSince > 0 && changes.length < 3) {
      changes.push({
        key: "published",
        text: `You published ${publishedSince} ${publishedSince === 1 ? "post" : "posts"} on LinkedIn since then.`,
        actionLabel: "See how they are doing",
        onAction: () => onSwitchTab("influence"),
      });
    }

    setData({
      overnightAt: ((findRes.data as any[]) || [])[0]?.created_at ?? null,
      imprint: score,
      band,
      bandWeeks,
      liveSignals: sigs.length,
      growingSignals: growing,
      publishedMonth: counts.live,
      publishedThroughAura: countPosts(posts.rows).throughAura,
      lastVisitAt,
      changes: changes.slice(0, 3),
    });
  }, [userId, onSwitchTab, onStartSignalPost]);

  useEffect(() => { void load().catch(() => {}); }, [load]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [l, m] = await Promise.all([loadLayout(userId), loadWidgetMetrics(userId)]);
      if (!alive) return;
      setLayout(l); setMetrics(m);
    })();
    return () => { alive = false; };
  }, [userId]);

  const overnightFresh = useMemo(() => {
    if (!data?.overnightAt) return false;
    return Date.now() - new Date(data.overnightAt).getTime() < 24 * 3600_000;
  }, [data?.overnightAt]);

  const instruments: Instrument[] = useMemo(() => {
    if (!data) return [];
    const out: Instrument[] = [];
    if (data.imprint != null && data.band) {
      out.push({
        value: String(data.imprint), unit: "/100",
        line: "Your presence score",
        sub: `${data.band.name}${data.bandWeeks ? `, held ${data.bandWeeks} ${data.bandWeeks === 1 ? "week" : "weeks"}` : ""}`,
        help: { href: "/guide", label: "How the presence score works" },
      });
    }
    out.push({
      value: String(data.liveSignals),
      line: "Themes Aura tracks from your reading",
      sub: data.growingSignals > 0 ? `${data.growingSignals} growing now` : "None growing right now",
    });
    out.push({
      value: String(data.publishedMonth),
      line: "Posts live on LinkedIn this month",
      sub: `${data.publishedThroughAura} all-time made with Aura`,
    });
    return out;
  }, [data]);

  // Instruments already carry imprint, live signals and the two published
  // counts. A widget repeating any of them would put the same number on the
  // page twice, so those keys are suppressed here (they stay on Widgets).
  const DUPLICATE_KEYS = new Set(["imprint", "live_signals", "published"]);
  const onWidgets = WIDGET_DEFS.filter((d) => layout[d.key] && !DUPLICATE_KEYS.has(d.key));
  const showWidgetRegion = (metrics && onWidgets.length > 0) || !addTileHidden;

  return (
    <div style={{ display: "grid", gap: 26, marginBlockStart: 26 }}>
      {/* 1 — header strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", borderBlockEnd: "1px solid var(--rule-outer)", paddingBlockEnd: 10,
      }}>
        <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", color: "var(--text-muted)" }}>
          THE BRIEF · {editionDate(new Date())}
        </span>
        {overnightFresh && data?.overnightAt && (
          <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--machine)" }} />
            AURA READ YOUR SIGNALS AT {clockLabel(data.overnightAt)}
          </span>
        )}
      </div>

      {/* 3 — instrument row */}
      {instruments.length > 0 && (
        <section>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {instruments.map((i) => <InstrumentTile key={i.line} i={i} />)}
          </div>
        </section>
      )}

      {/* 4 — since your last visit */}
      {data && data.changes.length > 0 && (
        <section>
          <SectionLabel right={
            <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".08em", color: "var(--text-muted)" }}>
              {visitLabel(data.lastVisitAt)}
            </span>
          }>
            SINCE YOUR LAST VISIT
          </SectionLabel>
          <Card style={{ padding: 0 }}>
            {data.changes.map((c, idx) => (
              <div key={c.key} style={{
                padding: 16,
                borderBlockStart: idx === 0 ? undefined : "1px solid var(--rule-outer)",
                display: "grid", gap: 8,
              }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-primary)" }}>{c.text}</p>
                <LinkAction onClick={c.onAction}>{c.actionLabel}</LinkAction>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* 5 — your widgets */}
      {showWidgetRegion && (
        <section>
          <SectionLabel right={<LinkAction onClick={() => onSwitchTab("widgets")}>Edit widgets</LinkAction>}>
            YOUR WIDGETS
          </SectionLabel>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {metrics && onWidgets.map((d) => <WidgetBody key={d.key} k={d.key} m={metrics} />)}
            {!addTileHidden && (
              <div style={{
                border: "1px dashed var(--rule-outer)", borderRadius: 16, padding: 18,
                display: "grid", gap: 8, alignContent: "center", justifyItems: "start",
                background: "transparent", minBlockSize: 120,
              }}>
                <button type="button" onClick={() => onSwitchTab("widgets")} style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: "transparent",
                  border: 0, padding: 0, cursor: "pointer", fontFamily: "var(--font-body)",
                  fontSize: 13, fontWeight: 600, color: "var(--act)",
                }}><Plus size={14} aria-hidden />Add a widget</button>
                <button type="button" onClick={() => {
                  setAddTileHidden(true);
                  try { localStorage.setItem(ADD_TILE_DISMISS, "1"); } catch { /* noop */ }
                }} style={{
                  background: "transparent", border: 0, padding: 0, cursor: "pointer",
                  fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)",
                  textDecoration: "underline",
                }}>No thanks</button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
