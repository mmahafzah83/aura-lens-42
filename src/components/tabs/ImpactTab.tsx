import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { safeQuery } from "@/lib/safeQuery";

/* ── Types ── */
interface Snapshot {
  score: number;
  components: {
    capture_score?: number;
    content_score?: number;
    signal_score?: number;
  };
  created_at: string;
}

interface PostMetricRow {
  post_id: string | null;
  impressions: number;
  reactions: number;
  engagement_rate: number;
  snapshot_date: string;
  post?: {
    title: string | null;
    post_text: string | null;
    post_url: string | null;
  } | null;
}

interface FollowerRow {
  snapshot_date: string;
  followers: number;
  follower_growth: number;
}

type RangeDays = 7 | 30 | 90 | 365;

/* ── Helpers ── */
const fmtDateShort = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysBetween = (a: Date, b: Date) => {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const formatCompact = (n: number): string => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
};

const formatNumber = (n: number) => n.toLocaleString("en-US");

const extractPostIdFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // LinkedIn URLs end with long alphanumeric/hyphen ID — grab the trailing token
  const m = url.replace(/\/$/, "").match(/[-_]([A-Za-z0-9]{8,})\/?$/);
  return m ? m[1] : null;
};

/* ── Component ── */
const ImpactTab = () => {
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState<RangeDays>(30);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [captureRows, setCaptureRows] = useState<{ created_at: string }[]>([]);
  const [capturesThisMonth, setCapturesThisMonth] = useState(0);

  const [postMetricsCount, setPostMetricsCount] = useState(0);
  const [topPosts, setTopPosts] = useState<PostMetricRow[]>([]);

  const [followerRows, setFollowerRows] = useState<FollowerRow[]>([]);
  const [latestFollowers, setLatestFollowers] = useState<number | null>(null);
  const [periodImpressions, setPeriodImpressions] = useState<number | null>(null);
  const [periodEngagementRate, setPeriodEngagementRate] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async (rangeDays: RangeDays) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - rangeDays);
    const sinceIso = sinceDate.toISOString();
    const sinceDateOnly = sinceIso.slice(0, 10);

    // Snapshots within range
    const snapRes = await safeQuery(
      () => supabase
        .from("score_snapshots")
        .select("score, components, created_at")
        .eq("user_id", user.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }),
      { context: "Impact: snapshots", silent: true }
    );
    setSnapshots((snapRes.data as Snapshot[]) || []);

    // Captures within range
    const capRes = await safeQuery(
      () => supabase
        .from("entries")
        .select("created_at")
        .eq("user_id", user.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }),
      { context: "Impact: captures", silent: true }
    );
    setCaptureRows((capRes.data as { created_at: string }[]) || []);

    // Captures this calendar month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count: monthCount } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());
    setCapturesThisMonth(monthCount ?? 0);

    // LinkedIn metrics count (overall, to decide whether to show upload card)
    const { count: trueCount } = await supabase
      .from("linkedin_post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setPostMetricsCount(trueCount ?? 0);

    if ((trueCount ?? 0) > 0) {
      const topRes = await supabase
        .from("linkedin_post_metrics")
        .select("post_id, impressions, reactions, engagement_rate, snapshot_date, post:linkedin_posts(title, post_text, post_url)")
        .eq("user_id", user.id)
        .gte("snapshot_date", sinceDateOnly)
        .order("engagement_rate", { ascending: false })
        .limit(20);
      setTopPosts((topRes.data as any) || []);
    } else {
      setTopPosts([]);
    }

    // Follower / influence snapshots from LinkedIn export
    const folRes = await safeQuery(
      () => supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, engagement_rate")
        .eq("user_id", user.id)
        .eq("source_type", "linkedin_export")
        .gte("snapshot_date", sinceDateOnly)
        .order("snapshot_date", { ascending: true }),
      { context: "Impact: influence snapshots", silent: true }
    );
    const folRows = (folRes.data as any[]) || [];
    setFollowerRows(folRows.map(r => ({
      snapshot_date: r.snapshot_date,
      followers: Number(r.followers || 0),
      follower_growth: Number(r.follower_growth || 0),
    })));

    // Hero numbers — latest follower count (most recent snapshot, any date)
    const latestFolRes = await supabase
      .from("influence_snapshots")
      .select("followers")
      .eq("user_id", user.id)
      .eq("source_type", "linkedin_export")
      .gt("followers", 0)
      .order("snapshot_date", { ascending: false })
      .limit(1);
    setLatestFollowers((latestFolRes.data?.[0] as any)?.followers ?? null);

    // Period impressions + avg engagement rate from influence_snapshots
    const totalImp = folRows.reduce((s, r) => s + Number(r.impressions || 0), 0);
    setPeriodImpressions(folRows.length ? totalImp : null);

    const erRows = folRows.filter(r => Number(r.impressions || 0) > 0 && Number(r.engagement_rate || 0) > 0);
    if (erRows.length > 0) {
      const avg = erRows.reduce((s, r) => s + Number(r.engagement_rate || 0), 0) / erRows.length;
      setPeriodEngagementRate(avg);
    } else {
      setPeriodEngagementRate(null);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(selectedDays); /* eslint-disable-next-line */ }, [selectedDays]);

  /* ── Score derivations ── */
  const latest = snapshots[snapshots.length - 1];
  const latestScore = latest?.score ?? 0;
  const captureScore = latest?.components?.capture_score ?? 0;
  const contentScore = latest?.components?.content_score ?? 0;
  const signalScore = latest?.components?.signal_score ?? 0;

  // Score 7 days ago (closest snapshot to that date)
  const score7 = useMemo(() => {
    if (snapshots.length === 0) return null;
    const target = new Date();
    target.setDate(target.getDate() - 7);
    let best: Snapshot | null = null;
    let bestDiff = Infinity;
    for (const s of snapshots) {
      const diff = Math.abs(new Date(s.created_at).getTime() - target.getTime());
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    return best?.score ?? null;
  }, [snapshots]);

  const score3 = useMemo(() => {
    if (snapshots.length === 0) return null;
    const target = new Date();
    target.setDate(target.getDate() - 3);
    let best: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.created_at) <= target) best = s;
    }
    return best?.score ?? snapshots[0].score;
  }, [snapshots]);

  const weekDelta = score7 !== null ? latestScore - score7 : null;

  let trendLabel = "→ Stable";
  let trendColor = "var(--color-text-secondary)";
  if (weekDelta !== null) {
    if (weekDelta > 0) { trendLabel = `↑ +${weekDelta} this week`; trendColor = "#7ab648"; }
    else if (weekDelta < 0) { trendLabel = `↓ ${weekDelta} this week`; trendColor = "#E24B4A"; }
  }

  // Aura interpretation
  let interpretation = "Your score is stable. Consistent captures will push it higher.";
  let interpretationColor = "var(--color-text-secondary)";
  if (score3 !== null && latestScore < score3 && captureScore < 80) {
    const drop = score3 - latestScore;
    interpretation = `Your score dropped ${drop} point${drop === 1 ? "" : "s"} this week. You haven't captured anything recently — resume your capture habit to recover.`;
    interpretationColor = "#E24B4A";
  } else if (score7 !== null && latestScore > score7) {
    interpretation = "Your authority score is growing. Keep capturing and publishing to maintain momentum.";
    interpretationColor = "#7ab648";
  }

  /* ── Capture activity (selectedDays) ── */
  const captureSeries = useMemo(() => {
    const buckets: Record<string, number> = {};
    const today = startOfDay(new Date());
    for (let i = selectedDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const r of captureRows) {
      const key = startOfDay(new Date(r.created_at)).toISOString().slice(0, 10);
      if (key in buckets) buckets[key]++;
    }
    const everyN = selectedDays <= 7 ? 1 : selectedDays <= 30 ? 3 : selectedDays <= 90 ? 7 : 30;
    return Object.entries(buckets).map(([date, captures], i, arr) => ({
      date,
      label: fmtDateShort(date),
      captures,
      showLabel: i % everyN === 0 || i === arr.length - 1,
    }));
  }, [captureRows, selectedDays]);

  const mostActive = captureSeries.reduce(
    (acc, x) => (x.captures > acc.captures ? x : acc),
    { label: "—", captures: 0 } as { label: string; captures: number }
  );
  const lastCaptureDate = captureRows.length
    ? new Date(captureRows[captureRows.length - 1].created_at)
    : null;
  const daysSinceLast = lastCaptureDate ? daysBetween(new Date(), lastCaptureDate) : null;
  const daysColor = daysSinceLast === null
    ? "var(--color-text-muted)"
    : daysSinceLast === 0 ? "#7ab648"
      : daysSinceLast <= 3 ? "#EF9F27"
        : "#E24B4A";

  /* ── Score chart series ── */
  const scoreSeries = useMemo(() => snapshots.map(s => ({
    date: s.created_at,
    label: fmtDateShort(s.created_at),
    score: s.score,
  })), [snapshots]);

  const scoreYDomain = useMemo<[number, number]>(() => {
    if (scoreSeries.length === 0) return [0, 100];
    const min = Math.min(...scoreSeries.map(s => s.score));
    return [Math.max(0, min - 10), 100];
  }, [scoreSeries]);

  /* ── Follower chart series ── */
  const followerSeries = useMemo(() => {
    const everyN = selectedDays <= 7 ? 1 : selectedDays <= 30 ? 3 : selectedDays <= 90 ? 7 : 30;
    return followerRows.map((r, i, arr) => ({
      date: r.snapshot_date,
      label: fmtDateShort(r.snapshot_date),
      followers: r.followers || 0,
      growth: r.follower_growth || 0,
      showLabel: i % everyN === 0 || i === arr.length - 1,
    }));
  }, [followerRows, selectedDays]);

  const followerYDomain = useMemo<[number, number]>(() => {
    const vals = followerSeries.map(f => f.followers).filter(v => v > 0);
    if (vals.length === 0) return [0, 100];
    return [Math.max(0, Math.min(...vals) - 500), Math.max(...vals) + 500];
  }, [followerSeries]);

  const totalNewFollowers = useMemo(
    () => followerRows.reduce((s, r) => s + (r.follower_growth || 0), 0),
    [followerRows]
  );
  const bestDay = useMemo(() => {
    if (followerRows.length === 0) return null;
    return followerRows.reduce((acc, r) => (r.follower_growth > (acc?.follower_growth ?? -1) ? r : acc), followerRows[0]);
  }, [followerRows]);

  /* ── XLSX Upload ── */
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload a .xlsx file");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const { data, error } = await supabase.functions.invoke("import-linkedin-analytics", {
        body: form,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const imp = (data as any)?.imported || {};
      const days = (imp.engagement_rows || 0) + (imp.follower_rows || 0);
      toast.success(`LinkedIn data imported — ${days} days of data loaded`);
      setSelectedFile(null);
      await loadAll(selectedDays);
    } catch (err: any) {
      console.error("XLSX upload failed:", err);
      toast.error(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  const ranges: RangeDays[] = [7, 30, 90, 365];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-8 max-w-5xl"
    >
      {/* Page header */}
      <div className="space-y-1">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}
        >
          Impact
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          How your authority is compounding
        </p>
      </div>

      {/* ─────────── TIME FILTER ─────────── */}
      <div className="flex items-center gap-2">
        {ranges.map((r) => {
          const active = selectedDays === r;
          return (
            <button
              key={r}
              onClick={() => setSelectedDays(r)}
              className="px-3.5 py-1.5 text-xs rounded-full transition-colors"
              style={{
                background: active ? "#F97316" : "transparent",
                color: active ? "#ffffff" : "var(--color-text-secondary)",
                border: active ? "0.5px solid #F97316" : "0.5px solid var(--color-border)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {r}D
            </button>
          );
        })}
      </div>

      {/* ─────────── HERO NUMBERS ─────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HeroStat
          value={latestFollowers !== null ? formatNumber(latestFollowers) : "—"}
          label="LinkedIn followers"
        />
        <HeroStat
          value={periodImpressions !== null ? formatCompact(periodImpressions) : "—"}
          label="Impressions"
        />
        <HeroStat
          value={periodEngagementRate !== null ? `${periodEngagementRate.toFixed(1)}%` : "—"}
          label="Avg engagement rate"
        />
      </div>

      {/* ─────────── SECTION 1: Authority score ─────────── */}
      <section
        className="aura-hero-card rounded-xl p-6"
        style={{
          background: "var(--color-card)",
          border: "0.5px solid var(--color-border)",
          borderLeft: "4px solid var(--color-accent)",
          borderRadius: "0 8px 8px 0",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div
              className="font-bold leading-none"
              style={{ fontSize: 64, color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}
            >
              {latestScore}
            </div>
            <div
              className="text-xs uppercase tracking-widest mt-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Authority score
            </div>
            <div className="mt-3 text-sm font-medium" style={{ color: trendColor }}>
              {trendLabel}
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: "Capture", value: captureScore },
              { label: "Content", value: contentScore },
              { label: "Signal", value: signalScore },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {s.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {Math.round(s.value)}
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--color-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, s.value))}%`,
                      height: "100%",
                      background: "var(--color-accent)",
                      transition: "width 600ms ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {scoreSeries.length < 2 ? (
            <div
              className="text-sm py-8 text-center rounded-lg"
              style={{
                color: "var(--color-text-muted)",
                background: "var(--color-bg-subtle, transparent)",
                border: "0.5px dashed var(--color-border)",
              }}
            >
              Not enough data yet
            </div>
          ) : (
            <div style={{ height: 160, width: "100%" }}>
              <ResponsiveContainer>
                <LineChart data={scoreSeries} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={scoreYDomain}
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "0.5px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-text-primary)",
                    }}
                    labelStyle={{ color: "var(--color-text-secondary)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--color-accent)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: interpretationColor }}>
          {interpretation}
        </p>
      </section>

      {/* ─────────── SECTION 2: Capture activity ─────────── */}
      <section>
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Capture activity — last {selectedDays} days
        </h2>
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
        >
          <div style={{ height: 140, width: "100%" }}>
            <ResponsiveContainer>
              <BarChart data={captureSeries} margin={{ top: 6, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={(p: any) => {
                    const d = captureSeries[p.index];
                    if (!d?.showLabel) return <g />;
                    return (
                      <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
                        {d.label}
                      </text>
                    );
                  }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  allowDataOverflow={false}
                  tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-border)", opacity: 0.3 }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--color-text-primary)",
                  }}
                />
                <Bar dataKey="captures" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-5 pt-5" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <Stat label="Captures this month" value={String(capturesThisMonth)} />
            <Stat label="Most active day" value={mostActive.captures > 0 ? mostActive.label : "—"} />
            <Stat
              label="Days since last capture"
              value={daysSinceLast === null ? "—" : String(daysSinceLast)}
              valueColor={daysColor}
            />
          </div>
        </div>
      </section>

      {/* ─────────── SECTION: Follower growth ─────────── */}
      <section>
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Follower growth
        </h2>
        {followerRows.length === 0 ? (
          <div
            className="rounded-xl p-6 text-sm text-center"
            style={{
              border: "1.5px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
              background: "transparent",
            }}
          >
            <p>Import your LinkedIn analytics to see follower growth</p>
            {postMetricsCount === 0 && (
              <button
                onClick={handleUploadClick}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#ffffff" }}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload LinkedIn .xlsx
              </button>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
          >
            <div style={{ height: 160, width: "100%" }}>
              <ResponsiveContainer>
                <LineChart data={followerSeries} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={(p: any) => {
                      const d = followerSeries[p.index];
                      if (!d?.showLabel) return <g />;
                      return (
                        <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
                          {d.label}
                        </text>
                      );
                    }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    domain={followerYDomain}
                    tickFormatter={(v) => formatCompact(Number(v))}
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "0.5px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-text-primary)",
                    }}
                    labelStyle={{ color: "var(--color-text-secondary)" }}
                    formatter={(value: any, name: any, item: any) => {
                      if (name === "followers") return [`${formatNumber(Number(value))} followers`, ""];
                      return [`+${value} new`, ""];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="followers"
                    stroke="#7ab648"
                    strokeWidth={2}
                    dot={selectedDays <= 30 ? { r: 3, fill: "#7ab648", strokeWidth: 0 } : false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-5 pt-5" style={{ borderTop: "0.5px solid var(--color-border)" }}>
              <Stat
                label="New followers"
                value={`+${formatNumber(totalNewFollowers)}`}
                valueColor="#7ab648"
              />
              <Stat
                label="Best day"
                value={bestDay && bestDay.follower_growth > 0
                  ? `+${bestDay.follower_growth} · ${fmtDateShort(bestDay.snapshot_date)}`
                  : "—"}
                valueColor="#7ab648"
              />
            </div>
          </div>
        )}
      </section>

      {/* ─────────── SECTION: LinkedIn upload (when no metrics) ─────────── */}
      {postMetricsCount === 0 && (
        <section
          className="rounded-xl p-6"
          style={{ border: "1.5px dashed var(--color-border)", background: "transparent" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(249,115,22,0.1)", border: "0.5px solid var(--color-border)" }}
            >
              <Upload className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Import your LinkedIn analytics
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                Download your analytics from LinkedIn and upload here. Aura will import your impression data, follower growth, and top post performance.
              </p>

              <ol
                className="mt-4 text-xs leading-relaxed space-y-1.5 pl-4 list-decimal"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <li>Go to <span style={{ color: "var(--color-text-primary)" }}>linkedin.com/analytics/creator</span></li>
                <li>Click <span style={{ color: "var(--color-text-primary)" }}>Export</span> (top right)</li>
                <li>Select date range → Download</li>
                <li>Upload the downloaded .xlsx file below</li>
              </ol>

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!selectedFile ? (
                  <button
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60"
                    style={{ background: "var(--color-accent)", color: "#ffffff" }}
                  >
                    <Upload className="w-4 h-4" />
                    Upload LinkedIn .xlsx file
                  </button>
                ) : (
                  <>
                    <span className="text-xs px-3 py-1.5 rounded-md" style={{ background: "var(--color-border)", color: "var(--color-text-primary)" }}>
                      {selectedFile.name}
                    </span>
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60"
                      style={{ background: "var(--color-accent)", color: "#ffffff" }}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? "Importing..." : "Import"}
                    </button>
                    {!uploading && (
                      <button
                        onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─────────── SECTION: Post performance ─────────── */}
      {postMetricsCount > 0 && (
        <section>
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Post performance
          </h2>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
          >
            {topPosts.length === 0 ? (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
                No post performance in the selected range.
              </div>
            ) : (
              topPosts.map((p, i) => {
                // Title fallback chain
                let title: string = (p.post?.title || "").trim();
                if (!title) {
                  const text = (p.post?.post_text || "").trim();
                  if (text) {
                    title = text.slice(0, 80) + (text.length > 80 ? "…" : "");
                  } else {
                    title = `Post from ${fmtDateShort(p.snapshot_date)}`;
                  }
                }

                // Engagement rate normalization (some are stored 0-1, some 0-100)
                const rawEr = Number(p.engagement_rate || 0);
                const erPct = rawEr > 1 ? rawEr : rawEr * 100;
                const isTop = i === 0;

                let badge: { label: string; bg: string; color: string; border: string } | null = null;
                if (erPct > 5) badge = { label: "Exceptional", bg: "#7ab64818", color: "#7ab648", border: "#7ab64840" };
                else if (erPct >= 3) badge = { label: "Above avg", bg: "#F9731618", color: "#F97316", border: "#F9731644" };

                return (
                  <div
                    key={`${p.post_id ?? "x"}-${i}`}
                    className="flex items-center gap-4 px-5 py-4"
                    style={{
                      borderBottom: i === topPosts.length - 1 ? "none" : "0.5px solid var(--color-border)",
                      borderLeft: isTop ? "3px solid #F97316" : undefined,
                      background: isTop ? "rgba(249,115,22,0.04)" : undefined,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                        {title}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {fmtDateShort(p.snapshot_date)}
                      </div>
                    </div>
                    <Metric label="Impressions" value={(p.impressions ?? 0).toLocaleString()} />
                    <Metric label="Reactions" value={(p.reactions ?? 0).toLocaleString()} />
                    <div className="text-right shrink-0 w-[110px]">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                          {erPct.toFixed(1)}%
                        </span>
                        {badge && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: badge.bg, color: badge.color, border: `0.5px solid ${badge.border}` }}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        Engagement
                      </div>
                    </div>
                    {p.post?.post_url && (
                      <a
                        href={p.post.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </motion.div>
  );
};

const HeroStat = ({ value, label }: { value: string; label: string }) => (
  <div
    className="rounded-lg"
    style={{
      background: "var(--color-card)",
      border: "0.5px solid var(--color-border)",
      borderRadius: 8,
      padding: "14px 16px",
    }}
  >
    <div
      className="tabular-nums"
      style={{ fontSize: 24, fontWeight: 700, color: "var(--color-accent)", fontFamily: "Inter, sans-serif", lineHeight: 1.1 }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--color-text-secondary)",
        marginTop: 4,
      }}
    >
      {label}
    </div>
  </div>
);

const Stat = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <div>
    <div
      className="text-xl font-semibold tabular-nums"
      style={{ color: valueColor || "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}
    >
      {value}
    </div>
    <div className="text-[11px] uppercase tracking-widest mt-1" style={{ color: "var(--color-text-muted)" }}>
      {label}
    </div>
  </div>
);

const Metric = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="text-right shrink-0 w-[88px]">
    <div
      className="text-sm font-semibold tabular-nums"
      style={{ color: accent ? "var(--color-accent)" : "var(--color-text-primary)" }}
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--color-text-muted)" }}>
      {label}
    </div>
  </div>
);

export default ImpactTab;
