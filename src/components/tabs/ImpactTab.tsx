import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
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
  post_id: string;
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

/* ── Component ── */
const ImpactTab = () => {
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [captureRows, setCaptureRows] = useState<{ created_at: string }[]>([]);
  const [postMetricsCount, setPostMetricsCount] = useState(0);
  const [topPosts, setTopPosts] = useState<PostMetricRow[]>([]);
  const [howOpen, setHowOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Snapshots
    const snapRes = await safeQuery(
      () => supabase
        .from("score_snapshots")
        .select("score, components, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      { context: "Impact: snapshots", silent: true }
    );
    setSnapshots((snapRes.data as Snapshot[]) || []);

    // Captures (entries) last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const capRes = await safeQuery(
      () => supabase
        .from("entries")
        .select("created_at")
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true }),
      { context: "Impact: captures", silent: true }
    );
    setCaptureRows((capRes.data as { created_at: string }[]) || []);

    // LinkedIn metrics count
    const cntRes = await safeQuery(
      () => supabase
        .from("linkedin_post_metrics")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      { context: "Impact: metrics count", silent: true }
    );
    const count = (cntRes as any).count ?? (cntRes.data as any)?.length ?? 0;
    // safeQuery returns supabase shape; for head:true, count comes on the raw result.
    // We re-run a tiny query to be safe:
    const { count: trueCount } = await supabase
      .from("linkedin_post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setPostMetricsCount(trueCount ?? count ?? 0);

    if ((trueCount ?? 0) > 0) {
      const topRes = await supabase
        .from("linkedin_post_metrics")
        .select("post_id, impressions, reactions, engagement_rate, snapshot_date, post:linkedin_posts(title, post_text, post_url)")
        .eq("user_id", user.id)
        .order("engagement_rate", { ascending: false })
        .limit(10);
      setTopPosts((topRes.data as any) || []);
    } else {
      setTopPosts([]);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  /* ── Score derivations ── */
  const latest = snapshots[snapshots.length - 1];
  const latestScore = latest?.score ?? 0;
  const captureScore = latest?.components?.capture_score ?? 0;
  const contentScore = latest?.components?.content_score ?? 0;
  const signalScore = latest?.components?.signal_score ?? 0;

  const scoreNDaysAgo = (n: number): number | null => {
    if (snapshots.length === 0) return null;
    const target = new Date();
    target.setDate(target.getDate() - n);
    let best: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.created_at) <= target) best = s;
    }
    return best?.score ?? snapshots[0].score;
  };

  const score7 = scoreNDaysAgo(7);
  const score3 = scoreNDaysAgo(3);
  const weekDelta = score7 !== null ? latestScore - score7 : null;

  let trendLabel = "→ Stable this week";
  let trendColor = "var(--color-text-muted)";
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

  /* ── Capture activity (30d) ── */
  const captureSeries = useMemo(() => {
    const buckets: Record<string, number> = {};
    const today = startOfDay(new Date());
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const r of captureRows) {
      const key = startOfDay(new Date(r.created_at)).toISOString().slice(0, 10);
      if (key in buckets) buckets[key]++;
    }
    return Object.entries(buckets).map(([date, captures], i) => ({
      date,
      label: fmtDateShort(date),
      captures,
      showLabel: i % 3 === 0,
    }));
  }, [captureRows]);

  const totalCaptures = captureRows.length;
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
  const scoreSeries = snapshots.map(s => ({
    date: s.created_at,
    label: fmtDateShort(s.created_at),
    score: s.score,
  }));

  /* ── XLSX Upload ── */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      await loadAll();
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
          {/* Left: big number */}
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

          {/* Right: 3 sub-score bars */}
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
                <div
                  style={{
                    height: 4,
                    background: "var(--color-border)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
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

        {/* Line chart */}
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
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
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

        {/* Interpretation */}
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
          Capture activity — last 30 days
        </h2>
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--color-card)",
            border: "0.5px solid var(--color-border)",
          }}
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

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <Stat label="Captures this month" value={String(totalCaptures)} />
            <Stat label="Most active day" value={mostActive.captures > 0 ? mostActive.label : "—"} />
            <Stat
              label="Days since last capture"
              value={daysSinceLast === null ? "—" : String(daysSinceLast)}
              valueColor={daysColor}
            />
          </div>
        </div>
      </section>

      {/* ─────────── SECTION 3: LinkedIn data ─────────── */}
      {postMetricsCount === 0 ? (
        <section
          className="rounded-xl p-6"
          style={{
            border: "1.5px dashed var(--color-border)",
            background: "transparent",
          }}
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
      ) : (
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
                No post performance data yet.
              </div>
            ) : (
              topPosts.map((p, i) => {
                const title = p.post?.title || (p.post?.post_text || "").slice(0, 80) || "Untitled post";
                return (
                  <div
                    key={`${p.post_id}-${i}`}
                    className="flex items-center gap-4 px-5 py-4"
                    style={{ borderBottom: i === topPosts.length - 1 ? "none" : "0.5px solid var(--color-border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {title}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {fmtDateShort(p.snapshot_date)}
                      </div>
                    </div>
                    <Metric label="Impressions" value={p.impressions?.toLocaleString() ?? "0"} />
                    <Metric label="Reactions" value={p.reactions?.toLocaleString() ?? "0"} />
                    <Metric
                      label="Engagement"
                      value={`${(Number(p.engagement_rate || 0) * (p.engagement_rate > 1 ? 1 : 100)).toFixed(1)}%`}
                      accent
                    />
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
