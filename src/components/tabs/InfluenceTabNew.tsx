import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, Loader2,
  Sparkles, FileText, Eye, Crown, BarChart3,
  ChevronDown, ChevronUp,
  Activity, Settings2, Monitor, Wifi, WifiOff,
  CheckCircle2, AlertTriangle, Bug
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from "recharts";
import { formatSmartDate } from "@/lib/formatDate";
import StrategicAttribution from "@/components/influence/StrategicAttribution";
import PostDiscoveryPanel from "@/components/influence/PostDiscoveryPanel";
import ManualPostIngestion from "@/components/influence/ManualPostIngestion";
import HistoricalImportHub from "@/components/influence/HistoricalImportHub";
import PostMetricsIngestion from "@/components/influence/PostMetricsIngestion";
import PostCleanupPanel from "@/components/influence/PostCleanupPanel";
import ReviewQueuePanel from "@/components/influence/ReviewQueuePanel";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface InfluenceTabNewProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
}

type TimeRange = "7d" | "30d" | "90d" | "all";
type SortKey = "published_at" | "engagement_score" | "like_count" | "comment_count";
type SortDir = "asc" | "desc";

/* ── Utility components ── */

const Fade = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }}>
    {children}
  </motion.div>
);

const SectionHeading = ({ icon: Icon, title, subtitle, right }: { icon: any; title: string; subtitle: string; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-primary/40 flex-shrink-0" />
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[10px] text-muted-foreground/30 mt-0.5">{subtitle}</p>
      </div>
    </div>
    {right}
  </div>
);

const KpiCard = ({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string | null; icon: any }) => (
  <div className="rounded-2xl p-5 bg-secondary/[0.04] border border-border/6 space-y-2">
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-primary/30" />
      <span className="text-[10px] text-muted-foreground/35 uppercase tracking-wider font-medium">{label}</span>
    </div>
    <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">{value}</p>
    {sub && (
      <span className={`text-[10px] font-medium ${Number(sub) > 0 ? "text-emerald-400/60" : Number(sub) < 0 ? "text-red-400/60" : "text-muted-foreground/30"}`}>
        {Number(sub) > 0 ? "+" : ""}{sub} this period
      </span>
    )}
  </div>
);

/* ── Main component ── */

const InfluenceTabNew = ({ entries, onOpenChat }: InfluenceTabNewProps) => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [systemOpen, setSystemOpen] = useState(false);

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [totalPostCount, setTotalPostCount] = useState(0);
  const [syncRunCount, setSyncRunCount] = useState(0);
  const [syncErrorCount, setSyncErrorCount] = useState(0);
  const [lastCaptureTime, setLastCaptureTime] = useState<string | null>(null);
  const [capturePostCount, setCapturePostCount] = useState(0);
  const [captureSnapCount, setCaptureSnapCount] = useState(0);
  const [hasExtension, setHasExtension] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { loadAll(); }, [range]);

  const getDays = (r: TimeRange) => r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;

  const loadAll = async () => {
    setLoading(true);
    setQueryError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const uid = user?.id || null;
      setCurrentUserId(uid);
      const email = user?.email || "";
      setIsAdmin(email.includes("@ey.com") || email.includes("admin") || email === user?.email);

      if (!uid) {
        setQueryError("Not authenticated. Please sign in.");
        setLoading(false);
        return;
      }

      const since = new Date(Date.now() - getDays(range) * 86400000).toISOString().split("T")[0];

      // Primary query: influence_dashboard_view (exact columns)
      const [viewRes, snapRes, syncRes, syncErrRes, lastCapRes, capSnapRes] = await Promise.all([
        supabase
          .from("influence_dashboard_view")
          .select("id, user_id, post_url, post_text, hook, topic_label, format_type, media_type, published_at, impressions, like_count, comment_count, repost_count, engagement_rate, followers, snapshot_date, tracking_status")
          .eq("user_id", uid)
          .neq("tracking_status", "rejected")
          .order("published_at", { ascending: false }),
        supabase.from("influence_snapshots")
          .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
          .gte("snapshot_date", range === "all" ? "2020-01-01" : since)
          .order("snapshot_date", { ascending: true }).limit(365),
        supabase.from("sync_runs").select("id").limit(100),
        supabase.from("sync_errors").select("id").limit(100),
        supabase.from("sync_runs")
          .select("completed_at")
          .eq("sync_type", "browser_capture").eq("status", "completed")
          .order("completed_at", { ascending: false }).limit(1),
        supabase.from("influence_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("source_type", "browser_capture"),
      ]);

      if (viewRes.error) {
        setQueryError(`influence_dashboard_view: ${viewRes.error.message}`);
        setLoading(false);
        return;
      }

      const viewData = (viewRes.data || []) as any[];
      setPosts(viewData);
      setTotalPostCount(viewData.length);
      setCapturePostCount(viewData.filter((p: any) => p.source_type === "browser_capture").length);

      setSyncRunCount((syncRes.data || []).length);
      setSyncErrorCount((syncErrRes.data || []).length);
      setLastCaptureTime(lastCapRes.data?.[0]?.completed_at || null);
      setCaptureSnapCount(capSnapRes.count || 0);
      setHasExtension((lastCapRes.data || []).length > 0);

      const snaps = snapRes.data || [];
      setSnapshots(snaps);
      setLatestSnapshot(snaps.length > 0 ? snaps[snaps.length - 1] : null);

      // Debug data
      setDebugData({
        snapshotTotal: snaps.length,
        postTotal: viewData.length,
        metricsTotal: viewData.filter((p: any) => p.metrics_date).length,
        latestCaptureSnapshot: snaps.filter((s: any) => s.source_type === "browser_capture").slice(-1)[0] || null,
        latestCapturePost: viewData.filter((p: any) => p.source_type === "browser_capture")[0] || null,
        latestMetricRow: viewData.find((p: any) => p.metrics_date) || null,
        snapshotsInRange: snaps.length,
        postsInRange: viewData.length,
        metricsInRange: viewData.filter((p: any) => p.metrics_date).length,
        rangeFilter: range === "all" ? "2020-01-01" : since,
        postFilter: 'influence_dashboard_view (excludes rejected)',
        querySource: "influence_dashboard_view",
      });
    } catch (e: any) {
      console.error("Influence load error:", e);
      setQueryError(e?.message || "Unknown error loading influence data");
    }
    setLoading(false);
  };

  /* ── Derived ── */
  const currentFollowers = latestSnapshot?.followers || 0;
  const latestEngRate = latestSnapshot ? Number(latestSnapshot.engagement_rate) || 0 : 0;
  const periodGrowth = snapshots.length >= 2
    ? (snapshots[snapshots.length - 1]?.followers || 0) - (snapshots[0]?.followers || 0) : 0;
  const postsWithMetrics = posts.filter(p => (p.like_count || 0) > 0 || (p.comment_count || 0) > 0 || Number(p.engagement_rate) > 0 || (p.impressions || 0) > 0).length;

  const hasPosts = totalPostCount > 0;
  const hasMetrics = postsWithMetrics > 0;
  const hasFollowerData = snapshots.length > 1;

  /* ── Theme & Format analysis ── */
  const themeCounts: Record<string, { count: number; totalEng: number }> = {};
  const formatCounts: Record<string, { count: number; totalEng: number }> = {};
  posts.forEach(p => {
    const theme = p.theme || p.topic_label;
    if (theme) {
      if (!themeCounts[theme]) themeCounts[theme] = { count: 0, totalEng: 0 };
      themeCounts[theme].count++;
      themeCounts[theme].totalEng += Number(p.engagement_score) || 0;
    }
    const fmt = p.format_type || p.content_type || p.media_type || "text";
    if (!formatCounts[fmt]) formatCounts[fmt] = { count: 0, totalEng: 0 };
    formatCounts[fmt].count++;
    formatCounts[fmt].totalEng += Number(p.engagement_score) || 0;
  });
  const themes = Object.entries(themeCounts)
    .map(([t, d]) => ({ theme: t, count: d.count, avgEng: Math.round(d.totalEng / d.count * 10) / 10 }))
    .sort((a, b) => b.count - a.count).slice(0, 8);
  const formats = Object.entries(formatCounts)
    .map(([f, d]) => ({ format: f, count: d.count, avgEng: Math.round(d.totalEng / d.count * 10) / 10 }))
    .sort((a, b) => b.avgEng - a.avgEng).slice(0, 6);

  const topicLabels = Object.entries(
    posts.reduce((acc, p) => { if (p.topic_label) acc[p.topic_label] = (acc[p.topic_label] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([label, count]) => ({ label, count: count as number })).sort((a, b) => b.count - a.count).slice(0, 10);

  const chartData = snapshots.map(s => ({ date: s.snapshot_date, followers: s.followers || 0 }));

  /* ── Sorting ── */
  const sortedPosts = [...posts].sort((a, b) => {
    const aVal = sortKey === "published_at" ? new Date(a[sortKey] || 0).getTime() : (Number(a[sortKey]) || 0);
    const bVal = sortKey === "published_at" ? new Date(b[sortKey] || 0).getTime() : (Number(b[sortKey]) || 0);
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  }).slice(0, 30);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  };

  const ranges: { key: TimeRange; label: string }[] = [
    { key: "7d", label: "7d" }, { key: "30d", label: "30d" },
    { key: "90d", label: "90d" }, { key: "all", label: "All" },
  ];

  const sourceStyles: Record<string, string> = {
    browser_capture: "bg-emerald-500/8 text-emerald-400/70 border-emerald-500/10",
    manual_import: "bg-primary/5 text-primary/50 border-primary/10",
    manual_url: "bg-primary/5 text-primary/50 border-primary/10",
    search_discovery: "bg-muted-foreground/5 text-muted-foreground/30 border-border/5",
  };
  const sourceLabels: Record<string, string> = {
    browser_capture: "Capture", manual_import: "Import",
    manual_url: "Manual", search_discovery: "Search",
  };
  const statusStyles: Record<string, string> = {
    discovered: "bg-muted-foreground/5 text-muted-foreground/30",
    confirmed: "bg-emerald-500/5 text-emerald-500/40",
    metrics_pending: "bg-amber-500/5 text-amber-500/50",
    metrics_imported: "bg-emerald-500/5 text-emerald-500/50",
    metrics_unavailable: "bg-muted-foreground/5 text-muted-foreground/20",
  };
  const statusLabels: Record<string, string> = {
    discovered: "Discovery", confirmed: "Captured",
    metrics_pending: "Pending", metrics_imported: "Enriched",
    metrics_unavailable: "N/A",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
          <p className="text-sm text-destructive font-medium">Query Error</p>
          <p className="text-xs text-destructive/80 mt-1">{queryError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto">

      {/* ── PAGE HEADER ── */}
      <Fade>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Influence
            </h1>
            <p className="text-sm text-muted-foreground/40 mt-1">Is your authority compounding?</p>
          </div>
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-secondary/12 border border-border/5">
            {ranges.map(r => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${range === r.key ? "bg-secondary/40 text-foreground" : "text-muted-foreground/35 hover:text-muted-foreground/60"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Fade>

      {/* ── DEBUG PANEL (admin only) ── */}
      {isAdmin && (
        <Fade delay={0.02}>
          <div className="rounded-2xl border border-destructive/15 bg-destructive/[0.02] overflow-hidden">
            <button onClick={() => setDebugOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 group">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-destructive/40" />
                <span className="text-xs font-semibold text-destructive/60 uppercase tracking-wider">Debug Summary</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-destructive/30 transition-transform ${debugOpen ? "rotate-180" : ""}`} />
            </button>
            {debugOpen && (
              <div className="px-5 pb-5 space-y-4 text-[11px] font-mono">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "influence_snapshots (total)", value: debugData.snapshotTotal },
                    { label: "linkedin_posts (total, non-rejected)", value: debugData.postTotal },
                    { label: "linkedin_post_metrics (total)", value: debugData.metricsTotal },
                    { label: "Snapshots in range", value: debugData.snapshotsInRange },
                    { label: "Posts in range query", value: debugData.postsInRange },
                    { label: "Metrics in range query", value: debugData.metricsInRange },
                  ].map(d => (
                    <div key={d.label} className="p-2.5 rounded-lg bg-secondary/8 border border-border/5">
                      <p className="text-foreground/70 font-bold tabular-nums">{d.value ?? "—"}</p>
                      <p className="text-muted-foreground/30 mt-0.5 font-sans text-[9px]">{d.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2 border-t border-border/5">
                  <p className="text-muted-foreground/40 font-sans text-[9px] uppercase tracking-wider font-semibold">Filters</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Current user</p>
                      <p className="text-foreground/50 break-all">{currentUserId || "not authenticated"}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Range filter (snapshots ≥)</p>
                      <p className="text-foreground/50">{debugData.rangeFilter || "—"}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Post filter</p>
                      <p className="text-foreground/50">{debugData.postFilter || "—"}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Sort</p>
                      <p className="text-foreground/50">{sortKey} {sortDir}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/5">
                  <p className="text-muted-foreground/40 font-sans text-[9px] uppercase tracking-wider font-semibold">Latest Records</p>
                  {debugData.latestCaptureSnapshot && (
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Latest browser_capture snapshot</p>
                      <p className="text-foreground/50">
                        {debugData.latestCaptureSnapshot.snapshot_date} · {debugData.latestCaptureSnapshot.followers} followers · {Number(debugData.latestCaptureSnapshot.engagement_rate).toFixed(1)}% eng
                      </p>
                    </div>
                  )}
                  {debugData.latestCapturePost && (
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Latest browser_capture post</p>
                      <p className="text-foreground/50 break-all">
                        {debugData.latestCapturePost.post_url || "no URL"} · {debugData.latestCapturePost.tracking_status} · {debugData.latestCapturePost.published_at ? new Date(debugData.latestCapturePost.published_at).toLocaleDateString() : "no date"}
                      </p>
                    </div>
                  )}
                  {debugData.latestMetricRow && (
                    <div className="p-2.5 rounded-lg bg-secondary/5 border border-border/5">
                      <p className="text-muted-foreground/25 font-sans text-[9px]">Latest metrics row</p>
                      <p className="text-foreground/50">
                        post_id: {debugData.latestMetricRow.post_id?.slice(0, 8)}… · {debugData.latestMetricRow.snapshot_date} · {debugData.latestMetricRow.impressions} impr · {debugData.latestMetricRow.reactions} react · {debugData.latestMetricRow.source_type}
                      </p>
                    </div>
                  )}
                  {!debugData.latestCaptureSnapshot && !debugData.latestCapturePost && !debugData.latestMetricRow && (
                    <p className="text-muted-foreground/20 italic font-sans">No browser_capture or metric records found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════════
         § 1  OVERVIEW
         ═══════════════════════════════════════════ */}
      <Fade delay={0.04}>
        <div>
          <SectionHeading icon={Eye} title="Overview" subtitle="Key metrics from your LinkedIn presence" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Followers" value={currentFollowers > 0 ? currentFollowers.toLocaleString() : "—"} icon={Users}
              sub={periodGrowth !== 0 ? String(periodGrowth) : null} />
            <KpiCard label="Posts tracked" value={totalPostCount.toString()} icon={FileText} />
            <KpiCard label="With metrics" value={postsWithMetrics.toString()} icon={BarChart3} />
            <KpiCard label="Engagement rate" value={latestEngRate > 0 ? `${latestEngRate.toFixed(1)}%` : "—"} icon={Activity} />
          </div>

          {/* Readiness nudge */}
          {(!hasPosts || !hasMetrics) && (
            <div className="mt-4 rounded-xl border border-primary/8 bg-primary/[0.02] px-5 py-4 flex items-start gap-3">
              <Monitor className="w-4 h-4 text-primary/30 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                {!hasPosts
                  ? "Capture your first LinkedIn post to activate performance analytics. Use the Aura browser extension on any LinkedIn page."
                  : `${totalPostCount} post${totalPostCount !== 1 ? "s" : ""} discovered — open individual posts and run Capture This Page to import metrics.`}
              </p>
            </div>
          )}
        </div>
      </Fade>

      {/* ═══════════════════════════════════════════
         § 2  AUDIENCE MOMENTUM
         ═══════════════════════════════════════════ */}
      {hasFollowerData && (
        <Fade delay={0.08}>
          <div>
            <SectionHeading icon={TrendingUp} title="Audience Momentum" subtitle="Follower trajectory over time" />
            <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5">
              <div className="h-[200px] -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(43, 72%, 52%)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="hsl(43, 72%, 52%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }} tickLine={false} axisLine={false} width={45} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                    <Tooltip contentStyle={{ background: "hsl(0, 0%, 7%)", border: "1px solid hsl(0, 0%, 14%)", borderRadius: "8px", fontSize: "11px", color: "hsl(40, 10%, 92%)" }} labelStyle={{ color: "hsl(0, 0%, 42%)" }} />
                    <Area type="monotone" dataKey="followers" stroke="hsl(43, 72%, 52%)" strokeWidth={1.5} fill="url(#followerGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════════
         § 3  CONTENT PERFORMANCE
         ═══════════════════════════════════════════ */}
      {hasPosts && (
        <Fade delay={0.12}>
          <div>
            <SectionHeading icon={BarChart3} title="Content Performance"
              subtitle={`${totalPostCount} posts · ${postsWithMetrics} with metrics`} />
            <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left min-w-[680px]">
                  <thead>
                    <tr className="border-b border-border/5">
                      {[
                        { key: "published_at" as SortKey, label: "Date", align: "left", sortable: true, w: "w-[72px]" },
                        { key: null, label: "Hook", align: "left", sortable: false, w: "" },
                        { key: null, label: "Topic", align: "left", sortable: false, w: "max-w-[80px]" },
                        { key: null, label: "Src", align: "left", sortable: false, w: "w-[52px]" },
                        { key: null, label: "Impr.", align: "right", sortable: false, w: "" },
                        { key: "like_count" as SortKey, label: "React.", align: "right", sortable: true, w: "" },
                        { key: "comment_count" as SortKey, label: "Comm.", align: "right", sortable: true, w: "" },
                        { key: "engagement_score" as SortKey, label: "Eng %", align: "right", sortable: true, w: "" },
                        { key: null, label: "Status", align: "center", sortable: false, w: "w-[72px]" },
                      ].map((col, i) => (
                        <th key={i}
                          className={`text-[9px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2 ${col.w} ${col.sortable ? "cursor-pointer" : ""} text-${col.align}`}
                          onClick={col.sortable && col.key ? () => toggleSort(col.key as SortKey) : undefined}>
                          <span className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                            {col.label} {col.key && <SortIcon col={col.key} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPosts.map(post => {
                      const hasReal = !!(post.like_count > 0 || post.comment_count > 0 || Number(post.engagement_score) > 0);
                      const status = post.tracking_status || (hasReal ? "metrics_imported" : "discovered");
                      const src = post.source_type || "search_discovery";
                      return (
                        <tr key={post.id} className="border-b border-border/[0.03] hover:bg-secondary/5 transition-colors">
                          <td className="text-[11px] text-muted-foreground/40 py-2.5 px-2 tabular-nums whitespace-nowrap">
                            {post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="text-[11px] text-foreground/70 py-2.5 px-2 max-w-[160px] truncate">
                            {post.hook || post.title || post.post_text?.slice(0, 50) || "—"}
                          </td>
                          <td className="text-[11px] text-muted-foreground/35 py-2.5 px-2 capitalize truncate max-w-[80px]">
                            {post.theme || post.topic_label || "—"}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[8px] font-medium border ${sourceStyles[src] || sourceStyles.search_discovery}`}>
                              {sourceLabels[src] || src}
                            </span>
                          </td>
                          <td className="text-[11px] py-2.5 px-2 tabular-nums text-right">
                            {post._impressions > 0 ? <span className="text-foreground/40">{post._impressions.toLocaleString()}</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2 tabular-nums text-right">
                            {hasReal ? <span className="text-foreground/50">{post.like_count}</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2 tabular-nums text-right">
                            {hasReal ? <span className="text-foreground/50">{post.comment_count}</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2 tabular-nums text-right font-medium">
                            {hasReal ? <span className="text-foreground/60">{Number(post.engagement_score || 0).toFixed(1)}%</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-medium ${statusStyles[status] || statusStyles.discovered}`}>
                              {statusLabels[status] || "Discovery"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════════
         § 4  INTELLIGENCE
         ═══════════════════════════════════════════ */}
      {(themes.length > 0 || formats.length > 0) && (
        <Fade delay={0.16}>
          <div>
            <SectionHeading icon={Sparkles} title="Intelligence" subtitle="Theme and format patterns from your content" />

            <div className="space-y-6">
              {/* Theme Intelligence */}
              {themes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5">
                    <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider font-medium mb-3">Topic Distribution</p>
                    <div className="h-[200px] -mx-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topicLabels} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "hsl(40, 10%, 70%)" }} tickLine={false} axisLine={false} width={100} />
                          <Tooltip contentStyle={{ background: "hsl(0, 0%, 7%)", border: "1px solid hsl(0, 0%, 14%)", borderRadius: "8px", fontSize: "11px", color: "hsl(40, 10%, 92%)" }} formatter={(value: number) => [`${value} posts`, "Count"]} cursor={{ fill: "hsl(0, 0%, 100%, 0.03)" }} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16}>
                            {topicLabels.map((_, i) => (
                              <Cell key={i} fill={`hsl(43, 72%, ${52 - i * 3}%)`} fillOpacity={0.45 - i * 0.03} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5 space-y-3">
                    <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider font-medium">Theme Momentum</p>
                    {themes.map((t, i) => {
                      const pct = Math.round((t.count / themes[0].count) * 100);
                      return (
                        <div key={t.theme} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-foreground/60 capitalize truncate max-w-[70%]">{t.theme}</span>
                            <span className="text-[10px] text-muted-foreground/30 tabular-nums">{t.count} · {t.avgEng}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-secondary/15 overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, delay: 0.2 + i * 0.04 }}
                              className="h-full rounded-full bg-primary/25" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Format Intelligence */}
              {formats.length > 0 && (
                <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5 space-y-2">
                  <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider font-medium mb-3">Format Performance</p>
                  {formats.map((f, i) => (
                    <div key={f.format} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/5 transition-colors">
                      <div className="flex items-center gap-2.5">
                        {i === 0 && <Crown className="w-3 h-3 text-primary/40" />}
                        <span className="text-xs text-foreground/60 capitalize">{f.format}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-muted-foreground/30 tabular-nums">{f.count} posts</span>
                        <span className="text-xs text-foreground/50 tabular-nums font-medium">{f.avgEng}% avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategic Attribution */}
              <StrategicAttribution />
            </div>
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════════
         § 5  CAPTURE & SYSTEM HEALTH
         ═══════════════════════════════════════════ */}
      <Fade delay={0.2}>
        <div className="border-t border-border/5 pt-6">
          <button onClick={() => setSystemOpen(o => !o)} className="w-full flex items-center justify-between group">
            <div className="flex items-center gap-2.5">
              <Settings2 className="w-4 h-4 text-muted-foreground/25" />
              <div className="text-left">
                <h2 className="text-sm font-semibold text-foreground/70 group-hover:text-foreground/90 transition-colors">Capture & System Health</h2>
                <p className="text-[10px] text-muted-foreground/25">
                  {hasExtension ? "Extension connected" : "Extension not connected"}
                  {lastCaptureTime && ` · Last capture ${formatSmartDate(lastCaptureTime)}`}
                  {` · ${syncRunCount} runs · ${syncErrorCount} errors`}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground/25 transition-transform ${systemOpen ? "rotate-180" : ""}`} />
          </button>

          {systemOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
              className="space-y-6 mt-6">

              {/* Capture summary — inline, no sub-component */}
              <div className="rounded-2xl bg-secondary/[0.03] border border-border/6 p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-primary/40" />
                  <h3 className="text-sm font-semibold text-foreground">LinkedIn Capture</h3>
                  <div className={`ml-auto flex items-center gap-1.5 text-[10px] font-medium ${hasExtension ? "text-emerald-400/60" : "text-muted-foreground/30"}`}>
                    {hasExtension ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {hasExtension ? "Connected" : "Not connected"}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Posts captured", value: capturePostCount },
                    { label: "Snapshots", value: captureSnapCount },
                    { label: "Sync runs", value: syncRunCount },
                    { label: "Errors", value: syncErrorCount },
                  ].map(m => (
                    <div key={m.label} className="p-3 rounded-xl bg-secondary/8 border border-border/5">
                      <p className="text-lg font-bold tabular-nums text-foreground">{m.value}</p>
                      <p className="text-[10px] text-muted-foreground/30 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                {lastCaptureTime && (
                  <p className="text-[10px] text-muted-foreground/25">
                    Last capture: {formatSmartDate(lastCaptureTime)}
                  </p>
                )}
                {syncErrorCount > 0 && (
                  <p className="text-[10px] text-destructive/50 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    {syncErrorCount} error{syncErrorCount !== 1 ? "s" : ""} logged — review sync history for details.
                  </p>
                )}
              </div>

              {/* Discovery & cleanup */}
              <PostDiscoveryPanel onDiscoveryComplete={loadAll} />
              <ReviewQueuePanel onReviewComplete={loadAll} />
              <PostCleanupPanel onCleanupComplete={loadAll} />

              {/* Fallback tools */}
              <div className="space-y-3 pt-4 border-t border-border/5">
                <div>
                  <h3 className="text-[11px] font-semibold text-muted-foreground/35 tracking-wide uppercase">Fallback Tools</h3>
                  <p className="text-[10px] text-muted-foreground/20 mt-1 leading-relaxed max-w-sm">
                    Use only if browser capture missed something.
                  </p>
                </div>
                <ManualPostIngestion onIngestionComplete={loadAll} />
                <PostMetricsIngestion onComplete={loadAll} />
                <HistoricalImportHub onImportComplete={loadAll} />
              </div>
            </motion.div>
          )}
        </div>
      </Fade>
    </div>
  );
};

export default InfluenceTabNew;
