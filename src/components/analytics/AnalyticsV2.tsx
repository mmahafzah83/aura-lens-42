import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ButtonGhost, ButtonPrimary, Chip, Tooltip } from "@/components/systemb";
import { Download, Sparkles } from "lucide-react";
import { TIER_BANDS, bandFromScore } from "@/hooks/useTierFromImprint";
import { downloadBlob } from "@/lib/download";
import { countProvenance, provenanceOf, type Provenance } from "@/lib/postProvenance";
import { ProvenanceMark } from "@/components/systemb";

/**
 * AnalyticsV2 — V23 "three questions, not thirty charts".
 * Every chart is hand-rolled from tokens and carries a reading computed
 * from the user's own numbers. Nothing renders without backing data.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

type RangeKey = "30d" | "90d" | "all";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

interface PostRow {
  id: string;
  post_text: string | null;
  title: string | null;
  hook: string | null;
  theme: string | null;
  topic_label: string | null;
  tracking_status: string | null;
  source_type: string | null;
  source_signal_id: string | null;
  source_metadata: any;
  published_at: string | null;
  publish_attempted_at: string | null;
  created_at: string;
  post_url: string | null;
  linkedin_url: string | null;
}

interface SignalRow {
  id: string;
  signal_title: string;
  strength_score: number | null;
  fragment_count: number | null;
  velocity_status: string | null;
  created_at: string;
  status: string;
}

// Counting comes from one place only — see src/lib/postProvenance.ts.

function postDate(p: PostRow) { return p.published_at || p.created_at; }
function postTheme(p: PostRow) {
  return (p.theme || p.topic_label || p.source_metadata?.topic || "").toString().trim() || "Untagged";
}
function postLanguage(p: PostRow): string {
  const l = (p.source_metadata?.language || "").toString().toLowerCase();
  if (l.startsWith("ar")) return "AR";
  if (l.startsWith("en")) return "EN";
  return "—";
}
function postSource(p: PostRow): string {
  const m = p.source_metadata || {};
  if (m.source === "ghost_draft" || m.origin === "ghost_draft") return "Overnight";
  if (p.source_signal_id || (Array.isArray(m.signal_ids) && m.signal_ids.length)) return "Signal";
  if (p.source_type === "linkedin_export" || p.source_type === "linkedin_api") return "Imported";
  if (m.origin === "aura_card") return "Aura card";
  return "Capture";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Card shell with the shared 50ms stagger. */
const Card: React.FC<React.PropsWithChildren<{ index: number; reduced: boolean; style?: React.CSSProperties }>> = ({ index, reduced, children, style }) => (
  <section
    style={{
      background: "var(--surface-card)",
      border: "1px solid var(--rule-outer)",
      borderRadius: 16,
      boxShadow: "var(--v23-card-rest)",
      padding: 18,
      fontFamily: "var(--ff-ui)",
      animation: reduced ? undefined : `v23CardIn 260ms ease both ${index * 50}ms`,
      ...style,
    }}
  >
    {children}
  </section>
);

const CardHead: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{kicker}</div>
    <h2 style={{ fontSize: 15.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{title}</h2>
  </div>
);

const Reading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-secondary)", marginTop: 14 }}>{children}</p>
);

/** Conic imprint gauge — the same object as the Home tile, at hero size. */
const ImprintGauge: React.FC<{ score: number; size?: number; reduced: boolean }> = ({ score, size = 120, reduced }) => {
  const [sweep, setSweep] = useState(reduced ? score : 0);
  useEffect(() => {
    if (reduced) { setSweep(score); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 400);
      setSweep(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduced]);
  const deg = Math.max(0, Math.min(100, sweep)) * 3.6;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `conic-gradient(var(--machine) 0deg, var(--act) ${deg}deg, var(--rule-divider) ${deg}deg 360deg)`,
      }} />
      <div style={{
        position: "absolute", inset: 8, borderRadius: "50%", background: "var(--surface-card)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ ...MONO, fontSize: size * 0.3, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1 }}>{Math.round(score)}</div>
        <div style={{ ...MONO, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 4 }}>out of 100</div>
      </div>
    </div>
  );
};

const AnalyticsV2: React.FC<{ onOpenChat?: (msg?: string) => void }> = ({ onOpenChat }) => {
  const reduced = usePrefersReducedMotion();
  const [range, setRange] = useState<RangeKey>("all");
  const [loading, setLoading] = useState(true);
  const [imprint, setImprint] = useState<{ score: number; tier: string | null; components: any } | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reach, setReach] = useState<Record<string, number>>({});
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [restingSignals, setRestingSignals] = useState<number>(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [snapRes, postRes, metricRes, sigRes, restRes] = await Promise.all([
        supabase.from("imprint_snapshots").select("imprint, tier, components").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("linkedin_posts")
          .select("id, post_text, title, hook, theme, topic_label, tracking_status, source_type, source_signal_id, source_metadata, published_at, created_at, post_url, linkedin_url")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
        supabase.from("linkedin_post_metrics").select("post_id, impressions, snapshot_date")
          .eq("user_id", user.id).limit(5000),
        supabase.from("strategic_signals")
          .select("id, signal_title, strength_score, fragment_count, velocity_status, created_at, status")
          .eq("user_id", user.id).eq("status", "active").limit(500),
        supabase.from("strategic_signals").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).in("status", ["dormant", "archived"]),
      ]);

      if (!mounted.current) return;
      const comp = (snapRes.data as any)?.components ?? null;
      if (snapRes.data) setImprint({ score: Number((snapRes.data as any).imprint) || 0, tier: (snapRes.data as any).tier ?? null, components: comp });
      setPosts((postRes.data as PostRow[]) ?? []);
      const r: Record<string, number> = {};
      for (const m of (metricRes.data as any[]) ?? []) {
        const v = Number(m.impressions) || 0;
        if (v > (r[m.post_id] ?? 0)) r[m.post_id] = v;
      }
      setReach(r);
      setSignals((sigRes.data as SignalRow[]) ?? []);
      setRestingSignals(restRes.count ?? 0);
      setLoading(false);
    })();
  }, []);

  const cutoff = useMemo(() => {
    const days = RANGES.find(r => r.key === range)!.days;
    return days == null ? null : Date.now() - days * 86400000;
  }, [range]);

  const inRange = useCallback((iso: string | null) => {
    if (!cutoff) return true;
    if (!iso) return false;
    return new Date(iso).getTime() >= cutoff;
  }, [cutoff]);

  const rangedPosts = useMemo(() => posts.filter(p => inRange(postDate(p))), [posts, inRange]);
  // Live on LinkedIn — the canonical definition, imported history included.
  const publishedPosts = useMemo(() => rangedPosts.filter(p => provenanceOf(p) !== null), [rangedPosts]);
  const postCounts = useMemo(() => countProvenance(rangedPosts), [rangedPosts]);
  const rangedSignals = useMemo(() => signals.filter(s => inRange(s.created_at)), [signals, inRange]);
  const hasReach = useMemo(() => Object.keys(reach).length > 0, [reach]);

  // ── theme mix ──
  const mix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of publishedPosts) counts.set(postTheme(p), (counts.get(postTheme(p)) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = publishedPosts.length;
    const top = sorted.slice(0, 3);
    const restCount = total - top.reduce((s, [, c]) => s + c, 0);
    const segs = top.map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0 }));
    if (restCount > 0) segs.push({ label: "Everything else", count: restCount, pct: Math.round((restCount / total) * 100) });
    return { segs, total, topShare: segs.slice(0, 3).reduce((s, x) => s + x.pct, 0) };
  }, [publishedPosts]);

  // ── scatter ──
  const scatter = useMemo(() => {
    const now = Date.now();
    const pts = rangedSignals.map(s => ({
      id: s.id,
      title: s.signal_title,
      days: Math.max(0, Math.round((now - new Date(s.created_at).getTime()) / 86400000)),
      strength: Math.max(0, Math.min(1, Number(s.strength_score) || 0)),
      captures: Math.max(1, Number(s.fragment_count) || 1),
      accelerating: s.velocity_status === "accelerating",
    }));
    const maxDays = Math.max(1, ...pts.map(p => p.days));
    const maxCaptures = Math.max(1, ...pts.map(p => p.captures));
    const best = [...pts].sort((a, b) => b.strength - a.strength)[0] ?? null;
    return { pts, maxDays, maxCaptures, best };
  }, [rangedSignals]);

  // ── table rows ──
  const tableRows = useMemo(() => {
    const rows = rangedPosts.map(p => ({
      id: p.id,
      text:
        (p.hook || p.title || p.post_text || "").replace(/\s+/g, " ").trim().slice(0, 110) ||
        (p.post_url || p.linkedin_url || "").replace(/^https?:\/\/(www\.)?/, "").slice(0, 70) ||
        "No text stored",
      language: postLanguage(p),
      source: postSource(p),
      status: p.tracking_status ?? "—",
      live: provenanceOf(p) !== null,
      provenance: provenanceOf(p) as Provenance | null,
      reach: reach[p.id] ?? null,
      date: postDate(p),
    }));
    return hasReach
      ? rows.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1))
      : rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rangedPosts, reach, hasReach]);

  const exportCsv = useCallback(() => {
    const head = ["Post", "Language", "Source", "Status", ...(hasReach ? ["Reach"] : []), "Date"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = tableRows.map(r => [r.text, r.language, r.source, r.status, ...(hasReach ? [r.reach ?? ""] : []), (r.date || "").slice(0, 10)].map(esc).join(","));
    downloadBlob(new Blob([[head.map(esc).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" }), `aura-posts-${range}.csv`);
  }, [tableRows, hasReach, range]);

  // ── holding you back ──
  const comps = imprint?.components?.score_components ?? null;
  const weakest = useMemo(() => {
    if (!comps) return null;
    const named: { key: string; label: string; value: number }[] = [
      { key: "signal_score", label: "Signal", value: Number(comps.signal_score) || 0 },
      { key: "content_score", label: "Content", value: Number(comps.content_score) || 0 },
      { key: "capture_score", label: "Rhythm", value: Number(comps.capture_score) || 0 },
    ];
    return named.sort((a, b) => a.value - b.value)[0];
  }, [comps]);

  const langCounts = useMemo(() => {
    let ar = 0, en = 0;
    for (const p of publishedPosts) {
      const l = postLanguage(p);
      if (l === "AR") ar++; else if (l === "EN") en++;
    }
    return { ar, en };
  }, [publishedPosts]);

  const band = bandFromScore(imprint?.score ?? null);
  const nextBand = band ? TIER_BANDS[TIER_BANDS.findIndex(b => b.key === band.key) + 1] ?? null : null;
  const pointsToNext = imprint?.components?.points_to_next != null
    ? Number(imprint.components.points_to_next)
    : (nextBand && imprint ? Math.max(0, nextBand.min - Math.round(imprint.score)) : null);

  if (loading) {
    return <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", padding: 24 }}>Reading your numbers…</div>;
  }

  let card = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      {/* HEADER */}
      <header style={{ animation: reduced ? undefined : "v23CardIn 260ms ease both" }}>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--machine-text)" }}>Analytics</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginTop: 6, fontFamily: "var(--ff-ui)" }}>
          Whether the market can actually see you
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Not how many likes you collected. Three questions: am I visible, what am I known for, where is the work sitting.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className="v23-tap v23-focus"
              style={{
                ...MONO, fontSize: 11, padding: "6px 13px", borderRadius: 8, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "1px solid " + (range === r.key ? "var(--act)" : "var(--rule-outer)"),
                background: range === r.key ? "var(--act-tint)" : "var(--surface-card)",
                color: range === r.key ? "var(--act)" : "var(--text-secondary)",
                transition: "background 150ms ease, border-color 150ms ease",
              }}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* IMPRINT */}
      {imprint && (
        <Card index={card++} reduced={reduced}>
          <CardHead kicker="Am I visible" title="Your Imprint" />
          <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <Tooltip title="How it's made" body="Signal 40 · Content 40 · Rhythm 20, scored against your own history.">
              <div tabIndex={0} style={{ borderRadius: "50%", outline: "none" }}>
                <ImprintGauge score={imprint.score} reduced={reduced} />
              </div>
            </Tooltip>
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {imprint.components?.tier_name || band?.name || "—"}
              </div>
              {pointsToNext != null && nextBand && (
                <div style={{ ...MONO, fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {pointsToNext} points to {imprint.components?.next_tier_name || nextBand.name}
                </div>
              )}
              <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 10 }}>
                Signal 40 · Content 40 · Rhythm 20
              </div>
              {comps && (
                <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                  {[["Signal", comps.signal_score], ["Content", comps.content_score], ["Rhythm", comps.capture_score]].map(([l, v]) => (
                    <div key={String(l)}>
                      <div style={{ ...MONO, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>{String(l)}</div>
                      <div style={{ ...MONO, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{Math.round(Number(v) || 0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* THEME MIX */}
      <Card index={card++} reduced={reduced}>
        <CardHead kicker="What am I known for" title="Share of posts live on LinkedIn, by theme" />
        {mix.total === 0 ? (
          <Reading>Nothing published in this range yet, so there is no pattern to read.</Reading>
        ) : (
          <>
            <div style={{ display: "flex", height: 22, borderRadius: 7, overflow: "hidden", border: "1px solid var(--rule-outer)" }}>
              {mix.segs.map((s, i) => (
                <div key={s.label} title={`${s.label} — ${s.pct}%`} style={{
                  width: `${s.pct}%`,
                  background: i === 0 ? "var(--machine)" : i === 1 ? "var(--machine-tint)" : i === 2 ? "var(--surface-subtle)" : "var(--rule-divider)",
                  borderRight: i < mix.segs.length - 1 ? "1px solid var(--surface-card)" : undefined,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
              {mix.segs.map((s, i) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: 3,
                    background: i === 0 ? "var(--machine)" : i === 1 ? "var(--machine-tint)" : i === 2 ? "var(--surface-subtle)" : "var(--rule-divider)",
                    border: "1px solid var(--rule-outer)",
                  }} />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.label}</span>
                  <span style={{ ...MONO, fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>{s.pct}%</span>
                </div>
              ))}
            </div>
            <Reading>
              {mix.total < 3
                ? `Too early to read a pattern — ${mix.total} post${mix.total === 1 ? "" : "s"} live on LinkedIn.`
                : `${Math.min(3, mix.segs.length)} theme${Math.min(3, mix.segs.length) === 1 ? "" : "s"} carry ${mix.topShare}% of the ${mix.total} posts you have live on LinkedIn. "${mix.segs[0].label}" leads at ${mix.segs[0].pct}%.`}
            </Reading>
            <Reading>
              {`Two numbers, never one: ${postCounts.live} live on LinkedIn · ${postCounts.madeWithAura} made with Aura, ${postCounts.sentFromAura} of them sent from here. The rest is your own imported history. Posts by other people that Aura found while searching are not counted.`}
            </Reading>
          </>
        )}
      </Card>

      {/* SCATTER */}
      <Card index={card++} reduced={reduced}>
        <CardHead kicker="Where the work sits" title="Where your signals sit" />
        {scatter.pts.length === 0 ? (
          <Reading>Your live signals show up here as they gather captures. None are active in this range — widen the range, or capture something new.</Reading>
        ) : (
          <>
            <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
              <svg viewBox="0 0 640 260" width="100%" height={260} role="img" aria-label="Signal strength against days live">
                {[0, 0.25, 0.5, 0.75, 1].map(g => (
                  <line key={g} x1={46} x2={620} y1={20 + (1 - g) * 200} y2={20 + (1 - g) * 200}
                    stroke="var(--rule-divider)" strokeWidth={1} />
                ))}
                <line x1={46} x2={620} y1={220} y2={220} stroke="var(--rule-outer)" strokeWidth={1} />
                <line x1={46} x2={46} y1={20} y2={220} stroke="var(--rule-outer)" strokeWidth={1} />
                {[0, 0.5, 1].map(g => (
                  <text key={g} x={38} y={24 + (1 - g) * 200} textAnchor="end"
                    style={{ ...MONO, fontSize: 9, fill: "var(--text-muted)" } as any}>{Math.round(g * 100)}</text>
                ))}
                <text x={333} y={248} textAnchor="middle" style={{ ...MONO, fontSize: 9, fill: "var(--text-muted)" } as any}>
                  DAYS LIVE (0–{scatter.maxDays})
                </text>
                {scatter.pts.map(p => {
                  const x = 46 + (p.days / scatter.maxDays) * 574;
                  const y = 20 + (1 - p.strength) * 200;
                  const r = 4 + (p.captures / scatter.maxCaptures) * 9;
                  return (
                    <circle key={p.id} cx={x} cy={y} r={r}
                      fill={p.accelerating ? "var(--machine)" : "var(--border-strong)"}
                      fillOpacity={0.55} stroke={p.accelerating ? "var(--machine)" : "var(--border-strong)"} strokeWidth={1}>
                      <title>{`${p.title} — strength ${Math.round(p.strength * 100)}, ${p.days}d live, ${p.captures} captures`}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ ...MONO, fontSize: 10.5, color: "var(--machine-text)" }}>● Accelerating</span>
              <span style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)" }}>● Steady</span>
              <span style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)" }}>Bubble size = captures behind it</span>
            </div>
            {scatter.best && (
              <Reading>
                Strongest thing you have not turned into a post: “{scatter.best.title}” — strength {Math.round(scatter.best.strength * 100)},
                live {scatter.best.days} day{scatter.best.days === 1 ? "" : "s"}, {scatter.best.captures} capture{scatter.best.captures === 1 ? "" : "s"} behind it.
              </Reading>
            )}
          </>
        )}
      </Card>

      {/* TABLE */}
      <Card index={card++} reduced={reduced}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <CardHead kicker="Every post" title={hasReach ? "Sorted by reach" : "Sorted by date"} />
          <ButtonGhost onClick={exportCsv} disabled={tableRows.length === 0}>
            <Download size={13} /> Export CSV
          </ButtonGhost>
        </div>
        {tableRows.length === 0 ? (
          <Reading>Every post you have live on LinkedIn is listed here. None fall in this range — try a wider range.</Reading>
        ) : (
          <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid var(--rule-outer)", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  {["Post", "Language", "Source", "Status", ...(hasReach ? ["Reach"] : [])].map(h => (
                    <th key={h} style={{
                      ...MONO, position: "sticky", top: 0, zIndex: 1, textAlign: h === "Reach" ? "right" : "left",
                      fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)",
                      background: "var(--surface-subtle)", padding: "8px 10px", borderBottom: "1px solid var(--rule-outer)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: "9px 10px", fontSize: 12.5, color: "var(--text-primary)", borderBottom: "1px solid var(--rule-divider)", maxWidth: 340 }}>
                      {r.text}
                    </td>
                    <td style={{ ...MONO, padding: "9px 10px", fontSize: 11.5, color: "var(--text-secondary)", borderBottom: "1px solid var(--rule-divider)" }}>{r.language}</td>
                    <td style={{ ...MONO, padding: "9px 10px", fontSize: 11.5, color: "var(--text-secondary)", borderBottom: "1px solid var(--rule-divider)" }}>{r.source}</td>
                    <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--rule-divider)" }}>
                      <Chip variant={r.live ? "published" : r.status === "failed" || r.status === "rejected" ? "failed" : "cooling"}>
                        {r.status}
                      </Chip>
                    </td>
                    {hasReach && (
                      <td style={{ ...MONO, padding: "9px 10px", fontSize: 12, textAlign: "right", color: "var(--text-primary)", borderBottom: "1px solid var(--rule-divider)" }}>
                        {r.reach != null ? r.reach.toLocaleString() : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* HOLDING YOU BACK */}
      <Card index={card++} reduced={reduced}>
        <CardHead kicker="What's holding you back" title="Read from your own numbers" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {weakest && (
            <div style={{ borderLeft: "2px solid var(--rule-outer)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                {weakest.label} is your weakest component — {Math.round(weakest.value)} of 100.
              </div>
              <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                From your latest Imprint snapshot.
              </div>
            </div>
          )}
          {restingSignals > 0 && (
            <div style={{ borderLeft: "2px solid var(--rule-outer)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                {restingSignals} signal{restingSignals === 1 ? " has" : "s have"} gone dormant or been archived.
              </div>
              <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                Work that stopped attracting captures.
              </div>
            </div>
          )}
          {(langCounts.ar > 0 || langCounts.en > 0) && (
            <div style={{ borderLeft: "2px solid var(--rule-outer)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                {langCounts.ar === 0
                  ? `Everything tagged in this range is English — ${langCounts.en} post${langCounts.en === 1 ? "" : "s"}.`
                  : langCounts.en === 0
                    ? `Everything tagged in this range is Arabic — ${langCounts.ar} post${langCounts.ar === 1 ? "" : "s"}.`
                    : `You publish ${(langCounts.ar / langCounts.en).toFixed(1)} Arabic post for every English one (${langCounts.ar} vs ${langCounts.en}).`}
              </div>
              <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                Output ratio, not reach — language is only recorded on posts Aura wrote.
              </div>
            </div>
          )}
          {onOpenChat && (
            <div>
              <ButtonPrimary onClick={() => onOpenChat("Looking at my analytics — what should I fix first?")}>
                <Sparkles size={13} /> Ask Aura what to fix first
              </ButtonPrimary>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AnalyticsV2;
