import { useCallback, useEffect, useMemo, useState } from "react";
import { Moon, CalendarDays, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { TIER_BANDS, bandFromKey, bandFromScore } from "@/hooks/useTierFromImprint";

/**
 * MOMENTUM — V23 `s-mo`.
 *
 * Read-only. Every figure comes from a row that exists:
 *  - funnel        → public.momentum_funnel() (captures → in a signal → signals → published)
 *  - weekly grid   → entries.created_at + linkedin_posts (published) per ISO week
 *  - tier          → score_snapshots (latest score + EF-computed tier key)
 *  - milestones    → user_milestones (earned rows only)
 *  - daily loop    → real pg_cron times + the user's own overnight setting
 *
 * Deliberately NOT rendered: the weekly plan and the monthly page. The moves
 * engine was retired and the monthly page was never built, so both are shown
 * as "not built yet" with no times and no buttons rather than implied to work.
 * Tier unlocks are omitted entirely — nothing on this product is tier-gated
 * today, and promising a locked feature that will never arrive is a lie.
 *
 * Colour law: cyan (--machine) = the machine is awake, never on a button.
 * Blue (--act) = your turn. Amber appears zero times — nothing here has a
 * deadline. The grid density scale is one hue's tints (cyan), no rainbow.
 */

const HUNT_UTC = "00:00";
const DRAFT_UTC = "00:20";
const WEEKS = 13;

const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontVariantNumeric: "tabular-nums",
};

const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div
    style={{
      background: "var(--surface-card)",
      border: "1px solid var(--rule-outer)",
      borderRadius: 16,
      boxShadow: "var(--v23-card-rest)",
      padding: 18,
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{
      ...MONO,
      fontSize: 10.5,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Funnel {
  captures: number;
  used_in_signal: number;
  signals: number;
  published: number;
}

interface WeekCell {
  start: Date;
  captures: number;
  posts: number;
}

interface MilestoneRow {
  id: string;
  milestone_name: string;
  earned_at: string;
}

export default function MomentumPage() {
  const { user, isReady } = useAuthReady();
  const uid = user?.id ?? null;

  const [loaded, setLoaded] = useState(false);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [weeks, setWeeks] = useState<WeekCell[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [tierKey, setTierKey] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [overnightOn, setOvernightOn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const since = startOfWeek(new Date());
    since.setDate(since.getDate() - (WEEKS - 1) * 7);

    const [funnelRes, entriesRes, postsRes, scoreRes, msRes, prefRes] = await Promise.all([
      supabase.rpc("momentum_funnel" as any),
      supabase.from("entries").select("created_at").eq("user_id", uid).gte("created_at", since.toISOString()),
      supabase
        .from("linkedin_posts")
        .select("created_at, published_at")
        .eq("user_id", uid)
        .eq("tracking_status", "published")
        .gte("created_at", new Date(since.getTime() - 1000 * 60 * 60 * 24 * 120).toISOString()),
      supabase
        .from("score_snapshots")
        .select("score, tier, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("user_milestones")
        .select("id, milestone_name, earned_at")
        .eq("user_id", uid)
        .order("earned_at", { ascending: false }),
      supabase.from("diagnostic_profiles").select("notification_prefs").eq("user_id", uid).maybeSingle(),
    ]);

    const f = (funnelRes.data as any)?.[0] ?? null;
    setFunnel(
      f
        ? {
            captures: Number(f.captures) || 0,
            used_in_signal: Number(f.used_in_signal) || 0,
            signals: Number(f.signals) || 0,
            published: Number(f.published) || 0,
          }
        : null,
    );

    const cells: WeekCell[] = [];
    for (let i = 0; i < WEEKS; i++) {
      const s = new Date(since);
      s.setDate(s.getDate() + i * 7);
      cells.push({ start: s, captures: 0, posts: 0 });
    }
    const bucket = (iso: string): WeekCell | null => {
      const t = startOfWeek(new Date(iso)).getTime();
      return cells.find((c) => c.start.getTime() === t) ?? null;
    };
    (entriesRes.data || []).forEach((r: any) => {
      const c = bucket(r.created_at);
      if (c) c.captures += 1;
    });
    (postsRes.data || []).forEach((r: any) => {
      const c = bucket(r.published_at || r.created_at);
      if (c) c.posts += 1;
    });
    setWeeks(cells);

    const snap = (scoreRes.data || [])[0] as any;
    setScore(snap?.score ?? null);
    setTierKey(snap?.tier ?? null);

    setMilestones(((msRes.data || []) as any[]).map((m) => ({
      id: m.id,
      milestone_name: m.milestone_name,
      earned_at: m.earned_at,
    })));

    const prefs = ((prefRes.data as any)?.notification_prefs || {}) as Record<string, unknown>;
    setOvernightOn(prefs.overnight_reading_enabled !== false);

    setLoaded(true);
  }, [uid]);

  useEffect(() => {
    if (isReady) void load();
  }, [isReady, load]);

  const band = useMemo(() => bandFromKey(tierKey) ?? bandFromScore(score), [tierKey, score]);
  const nextBand = useMemo(() => {
    if (!band) return null;
    const i = TIER_BANDS.findIndex((b) => b.key === band.key);
    return i >= 0 && i < TIER_BANDS.length - 1 ? TIER_BANDS[i + 1] : null;
  }, [band]);

  const maxWeek = useMemo(
    () => Math.max(1, ...weeks.map((w) => w.captures + w.posts)),
    [weeks],
  );

  const quietWeeks = useMemo(() => weeks.filter((w) => w.captures + w.posts === 0), [weeks]);

  const hasAnything =
    (funnel?.captures ?? 0) > 0 || milestones.length > 0 || score != null;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  if (!isReady || !loaded) {
    return (
      <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", padding: "40px 0" }}>
        Loading momentum…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 26, paddingTop: 4 }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{ display: "grid", gap: 6 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Momentum
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, maxWidth: 620 }}>
          What you've built, how often you show up, and what's next.
        </p>
      </header>

      {!hasAnything && (
        <Card>
          <SectionLabel>Nothing to measure yet</SectionLabel>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
            Momentum fills in once you capture something. There is no score, no streak and no
            history to show you yet — and we would rather show you nothing than something invented.
          </p>
        </Card>
      )}

      {/* ── 1 · The three loops ──────────────────────────────── */}
      <section style={{ display: "grid", gap: 12 }}>
        <SectionLabel>The three loops</SectionLabel>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {/* Daily — real */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Moon size={15} style={{ color: "var(--machine)" }} aria-hidden />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>Daily</span>
              <span
                style={{
                  ...MONO,
                  marginInlineStart: "auto",
                  fontSize: 10,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--machine-text)",
                }}
              >
                Live
              </span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ ...MONO, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Aura does · {HUNT_UTC} and {DRAFT_UTC} UTC
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  Hunts for what changed in your field, then drafts one post from the best of it.
                  {overnightOn === false && " Currently off in your settings."}
                </p>
              </div>
              <div style={{ height: 1, background: "var(--rule-divider)" }} />
              <div>
                <div style={{ ...MONO, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  You do · about two minutes
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  Read one thing and press one button.
                </p>
              </div>
            </div>
          </Card>

          {/* Weekly — not built */}
          <NotBuiltCard
            icon={<CalendarDays size={15} style={{ color: "var(--text-muted)" }} aria-hidden />}
            title="Weekly"
            body="A Sunday evening plan does not exist. The moves engine that would have produced it was retired, so there is no time and no button here."
          />

          {/* Monthly — not built */}
          <NotBuiltCard
            icon={<CalendarRange size={15} style={{ color: "var(--text-muted)" }} aria-hidden />}
            title="Monthly"
            body="A one-page monthly standing report was never built. When it exists it will appear here with a real time attached."
          />
        </div>
      </section>

      {/* ── 2 · Showing up ───────────────────────────────────── */}
      <section style={{ display: "grid", gap: 12 }}>
        <SectionLabel>Showing up · last {WEEKS} weeks</SectionLabel>
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {weeks.map((w) => {
              const total = w.captures + w.posts;
              const strength = total === 0 ? 0 : Math.max(0.16, total / maxWeek);
              return (
                <div
                  key={w.start.toISOString()}
                  title={`Week of ${weekLabel(w.start)} — ${w.captures} captures, ${w.posts} published`}
                  aria-label={`Week of ${weekLabel(w.start)}: ${w.captures} captures, ${w.posts} published`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    flexShrink: 0,
                    background:
                      total === 0
                        ? "var(--surface-subtle)"
                        : `color-mix(in srgb, var(--machine) ${Math.round(strength * 100)}%, var(--surface-card))`,
                    border: "1px solid var(--rule-outer)",
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              ...MONO,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 8,
            }}
          >
            <span>{weeks.length ? weekLabel(weeks[0].start) : ""}</span>
            <span>{weeks.length ? weekLabel(weeks[weeks.length - 1].start) : ""}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "12px 0 0" }}>
            {quietWeeks.length === 0
              ? `You showed up in all ${weeks.length} of the last ${weeks.length} weeks.`
              : `${quietWeeks.length} of the last ${weeks.length} weeks were quiet — nothing captured and nothing published. The most recent was the week of ${weekLabel(quietWeeks[quietWeeks.length - 1].start)}.`}
          </p>
        </Card>
      </section>

      {/* ── 3 · What you've built ────────────────────────────── */}
      {funnel && (
        <section style={{ display: "grid", gap: 12 }}>
          <SectionLabel>What you've built</SectionLabel>
          <Card>
            <div style={{ display: "grid", gap: 10 }}>
              <FunnelRow label="Captures" value={funnel.captures} note="everything you've saved" width={100} />
              <FunnelRow
                label="Used in a signal"
                value={funnel.used_in_signal}
                note={`${pct(funnel.used_in_signal, funnel.captures)}% of captures`}
                width={pct(funnel.used_in_signal, funnel.captures)}
              />
              <FunnelRow
                label="Signals formed"
                value={funnel.signals}
                note="patterns across your captures"
                width={Math.min(100, pct(funnel.signals, Math.max(funnel.captures, funnel.signals)))}
              />
              <FunnelRow
                label="Posts published"
                value={funnel.published}
                note={`${pct(funnel.published, funnel.signals)}% of signals`}
                width={pct(funnel.published, Math.max(funnel.signals, 1))}
              />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "14px 0 0" }}>
              Every capture you've ever made is still working.
            </p>
          </Card>
        </section>
      )}

      {/* ── 4 · Where you are ────────────────────────────────── */}
      {score != null && band && (
        <section style={{ display: "grid", gap: 12 }}>
          <SectionLabel>Where you are</SectionLabel>
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <span style={{ ...MONO, fontSize: 32, fontWeight: 700, color: "var(--text-primary)" }}>
                {score}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{band.name}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                {nextBand
                  ? `${Math.max(0, nextBand.min - score)} points to ${nextBand.name}`
                  : "Top band"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {TIER_BANDS.map((b) => {
                const current = b.key === band.key;
                return (
                  <div
                    key={b.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: current ? "var(--act-tint)" : "transparent",
                      border: `1px solid ${current ? "var(--act)" : "var(--rule-divider)"}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: current ? 700 : 500,
                        color: current ? "var(--text-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {b.name}
                    </span>
                    <span style={{ ...MONO, marginInlineStart: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>
                      {b.min}–{b.max}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "12px 0 0" }}>
              Tiers describe where you stand. Nothing in Aura is locked behind them — every feature
              is available at every tier.
            </p>
          </Card>
        </section>
      )}

      {/* ── 5 · Moments worth keeping ────────────────────────── */}
      {milestones.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <SectionLabel>Moments worth keeping</SectionLabel>
          <Card>
            <div style={{ display: "grid", gap: 2 }}>
              {milestones.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--rule-divider)",
                  }}
                >
                  <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{m.milestone_name}</span>
                  <span style={{ ...MONO, marginInlineStart: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>
                    {new Date(m.earned_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

const NotBuiltCard: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({
  icon,
  title,
  body,
}) => (
  <Card style={{ background: "var(--surface-subtle)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon}
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-secondary)" }}>{title}</span>
      <span
        style={{
          ...MONO,
          marginInlineStart: "auto",
          fontSize: 10,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        Not built yet
      </span>
    </div>
    <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{body}</p>
  </Card>
);

const FunnelRow: React.FC<{ label: string; value: number; note: string; width: number }> = ({
  label,
  value,
  note,
  width,
}) => (
  <div style={{ display: "grid", gap: 5 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
      <span style={{ ...MONO, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{value}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", marginInlineStart: "auto" }}>{note}</span>
    </div>
    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-subtle)", overflow: "hidden", display: "flex" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.max(2, Math.min(100, width))}%`,
          background: "var(--act)",
          borderRadius: 999,
        }}
      />
    </div>
  </div>
);