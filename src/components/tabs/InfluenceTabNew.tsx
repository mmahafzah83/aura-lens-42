import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, Loader2, ArrowUpRight, ArrowDownRight,
  Sparkles, FileText, Zap, Eye, Crown, BarChart3,
  Lightbulb, RefreshCw, Calendar, ChevronDown, ChevronUp,
  WifiOff, AlertCircle, CloudOff, Search, Activity, Database as DatabaseIcon,
  Grid3X3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import ConnectionStatusPanel from "@/components/influence/ConnectionStatusPanel";
import HistoricalImportHub from "@/components/influence/HistoricalImportHub";
import DailySnapshotEngine from "@/components/influence/DailySnapshotEngine";
import DataHealthConsole from "@/components/influence/DataHealthConsole";
import SourceReviewPanel from "@/components/influence/SourceReviewPanel";
import StrategicAttribution from "@/components/influence/StrategicAttribution";
import WeeklyInfluenceBrief from "@/components/influence/WeeklyInfluenceBrief";

import PostDiscoveryPanel from "@/components/influence/PostDiscoveryPanel";
import DiscoveryHealthCard from "@/components/influence/DiscoveryHealthCard";
import BrowserCapturePanel from "@/components/influence/BrowserCapturePanel";
import ManualPostIngestion from "@/components/influence/ManualPostIngestion";
import SourceHealthSummary from "@/components/influence/SourceHealthSummary";
import PostCleanupPanel from "@/components/influence/PostCleanupPanel";
import PostMetricsIngestion from "@/components/influence/PostMetricsIngestion";
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

/* ── Section wrapper ── */
const Fade = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
  >
    {children}
  </motion.div>
);

/* ═══════════════════════════════════════════
   MAIN INFLUENCE DASHBOARD
   ═══════════════════════════════════════════ */

const InfluenceTabNew = ({ entries, onOpenChat }: InfluenceTabNewProps) => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [view, setView] = useState<"dashboard" | "attribution" | "data">("dashboard");

  // Data
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [authorityScore, setAuthorityScore] = useState<any>(null);

  // Connection & sync state
  const [isConnected, setIsConnected] = useState(false);
  const [hasSyncRun, setHasSyncRun] = useState(false);

  // Table sort
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { loadAll(); }, [range]);

  const getDaysForRange = (r: TimeRange) => r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;

  /** Determine the right empty-state message for a metric area */
  const emptyReason = (hasData: boolean): string | null => {
    if (hasData) return null;
    if (!isConnected) return "LinkedIn not connected";
    if (!hasSyncRun) return "No browser capture has run yet";
    return "No analytics records captured yet";
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const days = getDaysForRange(range);
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

      const [snapRes, postRes, authRes, connRes, syncRes, metricsRes] = await Promise.all([
        supabase
          .from("influence_snapshots")
          .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
          .gte("snapshot_date", range === "all" ? "2020-01-01" : since)
          .order("snapshot_date", { ascending: true })
          .limit(365),
        supabase
          .from("linkedin_posts")
          .select("id, post_text, hook, title, theme, tone, format_type, content_type, topic_label, engagement_score, like_count, comment_count, repost_count, published_at, media_type, tracking_status, rejection_reason, source_type, enriched_by, source_trust, post_url")
          .neq("tracking_status", "rejected")
          .order("published_at", { ascending: false })
          .limit(200),
        supabase
          .from("authority_scores")
          .select("*")
          .order("snapshot_date", { ascending: false })
          .limit(1),
        supabase
          .from("linkedin_connections")
          .select("id, status")
          .eq("status", "active")
          .limit(1),
        supabase
          .from("sync_runs")
          .select("id")
          .limit(1),
        supabase
          .from("linkedin_post_metrics")
          .select("post_id, impressions, reactions, comments, shares, saves, engagement_rate, snapshot_date, source_type")
          .order("snapshot_date", { ascending: false })
          .limit(1000),
      ]);

      setIsConnected((connRes.data || []).length > 0);
      setHasSyncRun((syncRes.data || []).length > 0);

      const snaps = snapRes.data || [];
      setSnapshots(snaps);
      setLatestSnapshot(snaps.length > 0 ? snaps[snaps.length - 1] : null);

      // Build latest metrics map per post (latest snapshot_date wins)
      const metricsMap: Record<string, any> = {};
      (metricsRes.data || []).forEach((m: any) => {
        if (!metricsMap[m.post_id]) metricsMap[m.post_id] = m;
      });

      // Merge metrics into posts
      const rawPosts = postRes.data || [];
      const mergedPosts = rawPosts.map((p: any) => {
        const m = metricsMap[p.id];
        if (!m) return p;
        return {
          ...p,
          like_count: m.reactions ?? p.like_count,
          comment_count: m.comments ?? p.comment_count,
          repost_count: m.shares ?? p.repost_count,
          engagement_score: m.engagement_rate ?? p.engagement_score,
          _impressions: m.impressions ?? 0,
          _saves: m.saves ?? 0,
          _metrics_source: m.source_type,
        };
      });

      setPosts(mergedPosts);
      setAuthorityScore(authRes.data?.[0] || null);
    } catch (e) {
      console.error("Influence load error:", e);
    }
    setLoading(false);
  };

  // Derived metrics — only from posts with real metrics
  const enrichedPostsList = posts.filter(p =>
    p.tracking_status === "metrics_imported" || p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0
  );
  const currentFollowers = latestSnapshot?.followers || 0;
  const periodGrowth = snapshots.length >= 2
    ? (snapshots[snapshots.length - 1]?.followers || 0) - (snapshots[0]?.followers || 0)
    : 0;

  // Top post
  const topPost = posts.length > 0
    ? [...posts].sort((a, b) => (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0))[0]
    : null;

  // Theme analysis
  const themeCounts: Record<string, { count: number; totalEng: number }> = {};
  posts.forEach(p => {
    const theme = p.theme || p.topic_label;
    if (!theme) return;
    if (!themeCounts[theme]) themeCounts[theme] = { count: 0, totalEng: 0 };
    themeCounts[theme].count++;
    themeCounts[theme].totalEng += Number(p.engagement_score) || 0;
  });
  const themes = Object.entries(themeCounts)
    .map(([theme, d]) => ({ theme, count: d.count, avgEng: Math.round(d.totalEng / d.count * 10) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Format analysis
  const formatCounts: Record<string, { count: number; totalEng: number }> = {};
  posts.forEach(p => {
    const fmt = p.format_type || p.content_type || p.media_type || "text";
    if (!formatCounts[fmt]) formatCounts[fmt] = { count: 0, totalEng: 0 };
    formatCounts[fmt].count++;
    formatCounts[fmt].totalEng += Number(p.engagement_score) || 0;
  });
  const formats = Object.entries(formatCounts)
    .map(([format, d]) => ({ format, count: d.count, avgEng: Math.round(d.totalEng / d.count * 10) / 10 }))
    .sort((a, b) => b.avgEng - a.avgEng)
    .slice(0, 5);

  // Topic label breakdown
  const topicCounts: Record<string, number> = {};
  posts.forEach(p => {
    if (p.topic_label) {
      topicCounts[p.topic_label] = (topicCounts[p.topic_label] || 0) + 1;
    }
  });
  const topicLabels = Object.entries(topicCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const unlabeledCount = posts.filter(p => !p.topic_label).length;

  // Content type breakdown
  const contentTypeCounts: Record<string, number> = {};
  posts.forEach(p => {
    if (p.content_type) {
      contentTypeCounts[p.content_type] = (contentTypeCounts[p.content_type] || 0) + 1;
    }
  });
  const contentTypes = Object.entries(contentTypeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Engagement heatmap: topic × content_type matrix (only enriched posts)
  const heatmapTopics = topicLabels.slice(0, 8).map(t => t.label);
  const heatmapTypes = contentTypes.slice(0, 5).map(ct => ct.type);
  const heatmapData: { topic: string; type: string; count: number; avgEng: number; hasMetrics: boolean }[] = [];
  heatmapTopics.forEach(topic => {
    heatmapTypes.forEach(type => {
      const matching = posts.filter(p => p.topic_label === topic && p.content_type === type);
      const withMetrics = matching.filter(p => p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0);
      const avgEng = withMetrics.length > 0
        ? Math.round(withMetrics.reduce((s, p) => s + (Number(p.engagement_score) || 0), 0) / withMetrics.length * 10) / 10
        : 0;
      heatmapData.push({ topic, type, count: matching.length, avgEng, hasMetrics: withMetrics.length > 0 });
    });
  });
  const maxHeatmapEng = Math.max(...heatmapData.map(h => h.avgEng), 1);
  const hasAnyHeatmapMetrics = heatmapData.some(h => h.hasMetrics);

  // Chart data
  const chartData = snapshots.map(s => ({
    date: s.snapshot_date,
    followers: s.followers || 0,
    engagement: Number(s.engagement_rate) || 0,
  }));

  // Sorted posts for table
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
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "all", label: "All" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">

      {/* ── HERO + Controls ── */}
      <Fade>
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                Is your authority compounding?
              </h1>
              <p className="text-sm text-muted-foreground/40 mt-1.5 max-w-md">
                Authority compounds through repeated strategic clarity. This page tracks whether your influence is growing.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Range selector */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-secondary/15 border border-border/5">
                {ranges.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      range === r.key
                        ? "bg-secondary/40 text-foreground"
                        : "text-muted-foreground/40 hover:text-muted-foreground/70"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {/* View toggle */}
              <div className="flex gap-3 ml-2">
                {[
                  { key: "dashboard" as const, label: "Dashboard" },
                  { key: "attribution" as const, label: "Attribution" },
                  { key: "data" as const, label: "Data" },
                ].map(v => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={`text-[11px] font-medium transition-all pb-0.5 border-b ${
                      view === v.key
                        ? "text-foreground/70 border-primary/30"
                        : "text-muted-foreground/30 border-transparent hover:text-muted-foreground/50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Fade>

      {view === "attribution" ? (
        <StrategicAttribution />
      ) : view === "data" ? (
        <div className="space-y-5">
          <p className="text-[11px] text-muted-foreground/25 tracking-wide max-w-md">
            Uses your logged-in LinkedIn session via the Aura browser extension. More reliable for fresh posts than search discovery.
          </p>
          <BrowserCapturePanel />
          <ConnectionStatusPanel />
          <SourceHealthSummary />
          <PostCleanupPanel onCleanupComplete={loadAll} />

          {/* ── Background Support: Historical Discovery ── */}
          <div className="space-y-3 pt-4 border-t border-border/5">
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground/40 tracking-wide uppercase">Background Support</h3>
              <p className="text-[10px] text-muted-foreground/25 mt-1 leading-relaxed max-w-sm">
                Search-based discovery runs in the background to recover older publicly-indexed posts. Not the primary source — browser capture is more reliable for fresh content.
              </p>
            </div>
            <PostDiscoveryPanel onDiscoveryComplete={loadAll} />
            <DiscoveryHealthCard />
            <ReviewQueuePanel onReviewComplete={loadAll} />
          </div>

          {/* ── Fallback Tools ── */}
          <div className="space-y-3 pt-4 border-t border-border/5">
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground/40 tracking-wide uppercase">Fallback Tools</h3>
              <p className="text-[10px] text-muted-foreground/25 mt-1 leading-relaxed max-w-sm">
                Use only if browser capture missed something. For historical backfill, missing analytics, or rare same-day corrections.
              </p>
            </div>
            <ManualPostIngestion onIngestionComplete={loadAll} />
            <PostMetricsIngestion onComplete={loadAll} />
            <HistoricalImportHub onImportComplete={loadAll} />
          </div>
          <DailySnapshotEngine />
          <DataHealthConsole />
          <SourceReviewPanel />
        </div>
      ) : (
        <>
          {/* ── NO DATA BANNER ── */}
          {isConnected && snapshots.length === 0 && posts.length === 0 && (
            <Fade delay={0.04}>
              <div className="glass-card rounded-2xl card-pad border border-primary/8 bg-gradient-to-br from-primary/[0.02] to-transparent space-y-3 text-center py-8">
                <Zap className="w-6 h-6 text-primary/25 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-foreground/70">LinkedIn connected — no analytics captured yet</p>
                  <p className="text-[11px] text-muted-foreground/40 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Install the Aura browser extension to capture analytics directly from your logged-in LinkedIn session.
                    More reliable for fresh posts than search discovery.
                  </p>
                </div>
                <button
                  onClick={() => setView("data")}
                  className="inline-flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all tactile-press"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Set Up Browser Capture
                </button>
              </div>
            </Fade>
          )}

          {/* ── WEEKLY INFLUENCE BRIEF ── */}
          <Fade delay={0.04}>
            <WeeklyInfluenceBrief onOpenChat={onOpenChat} />
          </Fade>

          {/* ── CONNECTION STATUS (compact) ── */}
          <Fade delay={0.06}>
            <ConnectionStatusPanel />
          </Fade>

          {/* ── TWO-LAYER COVERAGE SUMMARY ── */}
          <Fade delay={0.08}>
            {(() => {
              const totalDiscovered = posts.length;
              const enrichedPosts = posts.filter(p =>
                p.tracking_status === "metrics_imported" ||
                (p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0)
              ).length;
              const classifiedPosts = posts.filter(p => p.topic_label).length;
              const hasFollowerHistory = snapshots.length >= 2;
              const followerDataPoints = snapshots.length;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Layer 1: Post Discovery */}
                  <div className="p-5 rounded-2xl bg-secondary/8 border border-border/5 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <Search className="w-4 h-4 text-primary/40" />
                      <div>
                        <h3 className="text-xs font-semibold text-foreground/80">Post Discovery</h3>
                        <p className="text-[10px] text-muted-foreground/30">What content exists</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <p className="text-lg font-bold tabular-nums text-foreground">{totalDiscovered}</p>
                        <p className="text-[10px] text-muted-foreground/35">Discovered</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-lg font-bold tabular-nums text-foreground">{classifiedPosts}</p>
                        <p className="text-[10px] text-muted-foreground/35">Classified</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-lg font-bold tabular-nums text-foreground/50">
                          {totalDiscovered > 0 ? Math.round((classifiedPosts / totalDiscovered) * 100) : 0}%
                        </p>
                        <p className="text-[10px] text-muted-foreground/35">Coverage</p>
                      </div>
                    </div>
                    {totalDiscovered === 0 && (
                      <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
                        Use the Data tab to discover posts via search or manual entry.
                      </p>
                    )}
                  </div>

                  {/* Layer 2: Performance Analytics */}
                  <div className="p-5 rounded-2xl bg-secondary/8 border border-border/5 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <Activity className="w-4 h-4 text-primary/40" />
                      <div>
                        <h3 className="text-xs font-semibold text-foreground/80">Performance Analytics</h3>
                        <p className="text-[10px] text-muted-foreground/30">Metrics & follower history</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <p className="text-lg font-bold tabular-nums text-foreground">{enrichedPosts}</p>
                        <p className="text-[10px] text-muted-foreground/35">With metrics</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-lg font-bold tabular-nums text-foreground">{followerDataPoints}</p>
                        <p className="text-[10px] text-muted-foreground/35">Follower snapshots</p>
                      </div>
                      <div className="space-y-1">
                        <p className={`text-lg font-bold tabular-nums ${hasFollowerHistory ? "text-foreground" : "text-muted-foreground/30"}`}>
                          {hasFollowerHistory ? `${currentFollowers.toLocaleString()}` : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground/35">Followers</p>
                      </div>
                    </div>
                    {enrichedPosts === 0 && totalDiscovered > 0 && (
                      <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
                        {totalDiscovered} post{totalDiscovered !== 1 ? "s" : ""} discovered but none have metrics yet. Import analytics from the Data tab.
                      </p>
                    )}
                    {!hasFollowerHistory && (
                      <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
                        No follower history imported. Use the Data tab to add historical snapshots.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </Fade>

          {/* ── ANALYTICS ENRICHMENT PROGRESS ── */}
          {posts.length > 0 && (() => {
            const totalDiscovered = posts.length;
            const enrichedPosts = posts.filter(p =>
              p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0
            ).length;
            const pct = Math.round((enrichedPosts / totalDiscovered) * 100);
            return (
              <Fade delay={0.12}>
                <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary/40" />
                      <h3 className="text-xs font-semibold text-foreground/80">Analytics Enrichment</h3>
                    </div>
                    <span className="text-xs tabular-nums font-semibold text-foreground/60">
                      {enrichedPosts}/{totalDiscovered} posts
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-secondary/20 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: pct === 0
                            ? "hsl(var(--muted-foreground) / 0.15)"
                            : pct < 50
                              ? "linear-gradient(90deg, hsl(43, 72%, 52% / 0.6), hsl(43, 72%, 52% / 0.8))"
                              : "linear-gradient(90deg, hsl(43, 72%, 52% / 0.7), hsl(43, 72%, 52%))"
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, pct === 0 ? 0 : 3)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/35">
                      {pct === 0
                        ? "No posts enriched yet — import metrics from the Data tab to activate performance insights."
                        : pct === 100
                          ? "All discovered posts have analytics data."
                          : `${pct}% of discovered posts have performance metrics.`}
                    </p>
                  </div>
                </div>
              </Fade>
            );
          })()}

          {/* ── AUDIENCE MOMENTUM CHART ── */}
          <Fade delay={0.14}>
            {chartData.length > 1 ? (
              <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Audience Momentum</h3>
                  <p className="text-meta mt-0.5">Follower trajectory over time</p>
                </div>
                <div className="h-[200px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(43, 72%, 52%)" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="hsl(43, 72%, 52%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => v.slice(5)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }}
                        tickLine={false}
                        axisLine={false}
                        width={45}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(0, 0%, 7%)",
                          border: "1px solid hsl(0, 0%, 14%)",
                          borderRadius: "8px",
                          fontSize: "11px",
                          color: "hsl(40, 10%, 92%)",
                        }}
                        labelStyle={{ color: "hsl(0, 0%, 42%)" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="followers"
                        stroke="hsl(43, 72%, 52%)"
                        strokeWidth={1.5}
                        fill="url(#followerGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl card-pad border border-border/8 text-center py-10 space-y-2">
                <TrendingUp className="w-6 h-6 text-muted-foreground/15 mx-auto" />
                <p className="text-sm text-foreground/60">Audience Momentum</p>
                <p className="text-[11px] text-muted-foreground/35 max-w-xs mx-auto leading-relaxed">
                  {!isConnected
                    ? "Connect LinkedIn to begin tracking audience growth."
                    : "No historical data yet. Import history or trigger a sync to unlock this chart."}
                </p>
              </div>
            )}
          </Fade>

          {/* ── CONTENT PERFORMANCE TABLE ── */}
          <Fade delay={0.18}>
            {sortedPosts.length > 0 ? (
              <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Content Performance</h3>
                    <p className="text-meta mt-0.5">
                      {posts.length} discovered · {posts.filter(p => p.tracking_status === "metrics_imported" || p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0).length} with metrics
                    </p>
                  </div>
                  {posts.length > 0 && posts.filter(p => p.tracking_status === "metrics_imported" || p.like_count > 0 || p.comment_count > 0).length === 0 && (
                    <span className="text-[10px] text-muted-foreground/25 bg-secondary/15 px-2.5 py-1 rounded-full">
                      Discovery only — no analytics imported yet
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border/5">
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 w-20 cursor-pointer" onClick={() => toggleSort("published_at")}>
                          <span className="flex items-center gap-1">Date <SortIcon col="published_at" /></span>
                        </th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Hook</th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Topic</th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Source</th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right">Impr.</th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("like_count")}>
                           <span className="flex items-center gap-1 justify-end">React. <SortIcon col="like_count" /></span>
                         </th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("comment_count")}>
                           <span className="flex items-center gap-1 justify-end">Comm. <SortIcon col="comment_count" /></span>
                         </th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("engagement_score")}>
                           <span className="flex items-center gap-1 justify-end">Eng % <SortIcon col="engagement_score" /></span>
                         </th>
                         <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPosts.map(post => {
                        const hasRealMetrics = !!(post.like_count > 0 || post.comment_count > 0 || Number(post.engagement_score) > 0);
                        const status = post.tracking_status || (hasRealMetrics ? "metrics_imported" : "discovered");
                        return (
                        <tr key={post.id} className="border-b border-border/[0.03] hover:bg-secondary/5 transition-colors">
                          <td className="text-[11px] text-muted-foreground/40 py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                            {post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="text-[11px] text-foreground/70 py-2.5 px-2.5 max-w-[180px] truncate">
                            {post.hook || post.title || post.post_text?.slice(0, 50) || "—"}
                          </td>
                          <td className="text-[11px] text-muted-foreground/35 py-2.5 px-2.5 capitalize truncate max-w-[100px]">
                            {post.theme || post.topic_label || "—"}
                          </td>
                          <td className="text-[11px] text-muted-foreground/30 py-2.5 px-2.5 capitalize">
                            {post.format_type || post.content_type || "—"}
                          </td>
                          <td className="py-2.5 px-2.5">
                            {(() => {
                              const src = post.source_type || "search_discovery";
                              const sourceStyles: Record<string, string> = {
                                browser_capture: "bg-emerald-500/8 text-emerald-400/70 border-emerald-500/10",
                                manual_import: "bg-primary/5 text-primary/50 border-primary/10",
                                manual_url: "bg-primary/5 text-primary/50 border-primary/10",
                                search_discovery: "bg-muted-foreground/5 text-muted-foreground/30 border-border/5",
                              };
                              const sourceLabels: Record<string, string> = {
                                browser_capture: "Capture",
                                manual_import: "Import",
                                manual_url: "Manual",
                                search_discovery: "Search",
                              };
                              const enriched = (post.enriched_by || []).length > 1;
                              return (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium border ${sourceStyles[src] || sourceStyles.search_discovery}`}>
                                  {sourceLabels[src] || src}
                                  {enriched && <span className="text-primary/40">+</span>}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right">
                            {hasRealMetrics
                              ? <span className="text-foreground/50">{post.like_count}</span>
                              : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right">
                            {hasRealMetrics
                              ? <span className="text-foreground/50">{post.comment_count}</span>
                              : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right font-medium">
                            {hasRealMetrics
                              ? <span className="text-foreground/60">{Number(post.engagement_score || 0).toFixed(1)}%</span>
                              : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            {(() => {
                              const styles: Record<string, string> = {
                                discovered: "bg-muted-foreground/5 text-muted-foreground/30",
                                metrics_pending: "bg-amber-500/5 text-amber-500/50",
                                metrics_imported: "bg-emerald-500/5 text-emerald-500/50",
                                metrics_unavailable: "bg-muted-foreground/5 text-muted-foreground/20",
                              };
                              const labels: Record<string, string> = {
                                discovered: "Discovery only",
                                metrics_pending: "Pending",
                                metrics_imported: "Enriched",
                                metrics_unavailable: "Unavailable",
                              };
                              return (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-medium ${styles[status] || styles.discovered}`}>
                                  {labels[status] || "Discovery only"}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl card-pad border border-border/8 text-center py-10 space-y-2">
                <BarChart3 className="w-6 h-6 text-muted-foreground/15 mx-auto" />
                <p className="text-sm text-foreground/60">Content Performance</p>
                <p className="text-[11px] text-muted-foreground/35 max-w-xs mx-auto leading-relaxed">
                  {!isConnected
                    ? "Connect LinkedIn to analyze post performance."
                    : "Import history to unlock this section. No post data has been synced yet."}
                </p>
              </div>
            )}
          </Fade>

          {/* ── TOPIC LABELS + CONTENT TYPES ── */}
          {(topicLabels.length > 0 || contentTypes.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Topic Labels */}
              <Fade delay={0.2}>
                <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary/50" />
                      Topic Breakdown
                    </h3>
                    <p className="text-meta mt-0.5">AI-classified topics across {posts.length} posts</p>
                  </div>
                  {topicLabels.length > 0 ? (
                    <>
                      <div className="h-[220px] -mx-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={topicLabels}
                            layout="vertical"
                            margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
                          >
                            <XAxis
                              type="number"
                              tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }}
                              tickLine={false}
                              axisLine={false}
                              allowDecimals={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="label"
                              tick={{ fontSize: 10, fill: "hsl(40, 10%, 70%)" }}
                              tickLine={false}
                              axisLine={false}
                              width={110}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(0, 0%, 7%)",
                                border: "1px solid hsl(0, 0%, 14%)",
                                borderRadius: "8px",
                                fontSize: "11px",
                                color: "hsl(40, 10%, 92%)",
                              }}
                              formatter={(value: number) => [`${value} posts`, "Count"]}
                              cursor={{ fill: "hsl(0, 0%, 100%, 0.03)" }}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                              {topicLabels.map((_, i) => (
                                <Cell key={i} fill={`hsl(43, 72%, ${52 - i * 3}%)`} fillOpacity={0.5 - i * 0.03} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {unlabeledCount > 0 && (
                        <p className="text-[10px] text-muted-foreground/20 pt-2 border-t border-border/5">
                          {unlabeledCount} post{unlabeledCount !== 1 ? "s" : ""} not yet classified
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/30 py-4 text-center">
                      No topics classified yet. Run classification from Data view.
                    </p>
                  )}
                </div>
              </Fade>

              {/* Content Types */}
              <Fade delay={0.24}>
                <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-primary/50" />
                      Content Types
                    </h3>
                    <p className="text-meta mt-0.5">How your content is structured</p>
                  </div>
                  {contentTypes.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="h-[200px] w-[200px] flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={contentTypes.map((ct, i) => ({
                                name: ct.type,
                                value: ct.count,
                                fill: `hsl(${43 + i * 35}, ${72 - i * 5}%, ${52 + i * 4}%)`,
                              }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              strokeWidth={1}
                              stroke="hsl(0, 0%, 7%)"
                            >
                              {contentTypes.map((_, i) => (
                                <Cell key={i} fill={`hsl(${43 + i * 35}, ${72 - i * 5}%, ${52 + i * 4}%)`} fillOpacity={0.7 - i * 0.05} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "hsl(0, 0%, 7%)",
                                border: "1px solid hsl(0, 0%, 14%)",
                                borderRadius: "8px",
                                fontSize: "11px",
                                color: "hsl(40, 10%, 92%)",
                              }}
                              formatter={(value: number, name: string) => [`${value} posts (${Math.round((value / posts.length) * 100)}%)`, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {contentTypes.map((ct, i) => (
                          <div key={ct.type} className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: `hsl(${43 + i * 35}, ${72 - i * 5}%, ${52 + i * 4}%)`, opacity: 0.7 - i * 0.05 }}
                            />
                            <span className="text-[11px] text-foreground/60 capitalize flex-1 truncate">{ct.type}</span>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{ct.count}</span>
                            <span className="text-[10px] text-foreground/30 tabular-nums w-8 text-right">{Math.round((ct.count / posts.length) * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/30 py-4 text-center">
                      No content types detected yet.
                    </p>
                  )}
                </div>
              </Fade>
            </div>
          )}

          {/* ── ENGAGEMENT HEATMAP ── */}
          {heatmapTopics.length > 0 && heatmapTypes.length > 0 && (
            <Fade delay={0.26}>
              <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Grid3X3 className="w-3.5 h-3.5 text-primary/50" />
                      Engagement Heatmap
                    </h3>
                    <p className="text-meta mt-0.5">
                      {hasAnyHeatmapMetrics
                        ? "Topic × content type performance matrix"
                        : "Topic × content type — import metrics to reveal engagement intensity"}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto -mx-2">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr>
                        <th className="text-[10px] text-muted-foreground/25 font-medium py-2 px-2.5 text-left w-[140px]" />
                        {heatmapTypes.map(type => (
                          <th key={type} className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium py-2 px-2 text-center capitalize">
                            {type}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapTopics.map((topic, ti) => (
                        <tr key={topic}>
                          <td className="text-[11px] text-foreground/50 py-1.5 px-2.5 truncate max-w-[140px] capitalize">
                            {topic}
                          </td>
                          {heatmapTypes.map(type => {
                            const cell = heatmapData.find(h => h.topic === topic && h.type === type);
                            if (!cell || cell.count === 0) {
                              return (
                                <td key={type} className="py-1.5 px-1.5 text-center">
                                  <div className="w-full h-9 rounded-lg bg-secondary/[0.03] border border-border/[0.02]" />
                                </td>
                              );
                            }
                            const intensity = cell.hasMetrics
                              ? Math.max(0.1, cell.avgEng / maxHeatmapEng)
                              : 0;
                            return (
                              <td key={type} className="py-1.5 px-1.5 text-center">
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.3 + ti * 0.03 }}
                                  className="relative w-full h-9 rounded-lg border border-border/[0.04] flex items-center justify-center cursor-default group"
                                  style={{
                                    background: cell.hasMetrics
                                      ? `hsla(43, 72%, 52%, ${intensity * 0.35})`
                                      : "hsla(0, 0%, 50%, 0.03)",
                                  }}
                                  title={`${topic} × ${type}: ${cell.count} post${cell.count !== 1 ? "s" : ""}${cell.hasMetrics ? ` · ${cell.avgEng}% avg engagement` : " · no metrics"}`}
                                >
                                  <span className={`text-[10px] tabular-nums font-medium ${
                                    cell.hasMetrics
                                      ? "text-primary/70"
                                      : "text-muted-foreground/20"
                                  }`}>
                                    {cell.hasMetrics ? `${cell.avgEng}%` : cell.count}
                                  </span>
                                  {/* Tooltip on hover */}
                                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                                    <div className="bg-[hsl(0,0%,7%)] border border-border/15 rounded-lg px-2.5 py-1.5 text-[10px] text-foreground/80 whitespace-nowrap shadow-lg">
                                      {cell.count} post{cell.count !== 1 ? "s" : ""}
                                      {cell.hasMetrics ? ` · ${cell.avgEng}% avg` : " · no metrics yet"}
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between pt-2 border-t border-border/5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[hsla(43,72%,52%,0.08)]" />
                      <span className="text-[9px] text-muted-foreground/25">Low</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[hsla(43,72%,52%,0.2)]" />
                      <span className="text-[9px] text-muted-foreground/25">Mid</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[hsla(43,72%,52%,0.35)]" />
                      <span className="text-[9px] text-muted-foreground/25">High</span>
                    </div>
                  </div>
                  {!hasAnyHeatmapMetrics && (
                    <span className="text-[9px] text-muted-foreground/20">
                      Post counts shown · import metrics for engagement intensity
                    </span>
                  )}
                </div>
              </div>
            </Fade>
          )}

          {/* ── STRATEGIC THEME MOMENTUM + FORMAT INTELLIGENCE ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Theme Momentum */}
            <Fade delay={0.22}>
              {themes.length > 0 ? (
                <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Theme Momentum</h3>
                    <p className="text-meta mt-0.5">Which authority themes are earning response</p>
                  </div>
                  <div className="space-y-3">
                    {themes.map((t, i) => {
                      const maxCount = themes[0].count;
                      const pct = Math.round((t.count / maxCount) * 100);
                      return (
                        <div key={t.theme} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-foreground/60 capitalize truncate max-w-[70%]">{t.theme}</span>
                            <span className="text-[10px] text-muted-foreground/30 tabular-nums">{t.count} posts · {t.avgEng}% avg</span>
                          </div>
                          <div className="h-1 rounded-full bg-secondary/15 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, delay: 0.3 + i * 0.05 }}
                              className="h-full rounded-full bg-primary/25"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground/20 pt-2 border-t border-border/5">
                    "{themes[0].theme}" is earning the strongest audience response.
                  </p>
                </div>
              ) : (
                <div className="glass-card rounded-2xl card-pad border border-border/8 text-center py-10 space-y-2">
                  <Lightbulb className="w-6 h-6 text-muted-foreground/15 mx-auto" />
                  <p className="text-sm text-foreground/60">Theme Momentum</p>
                  <p className="text-[11px] text-muted-foreground/35 leading-relaxed">
                    Import history to unlock this section
                  </p>
                </div>
              )}
            </Fade>

            {/* Format Intelligence */}
            <Fade delay={0.26}>
              {formats.length > 0 ? (
                <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Format Intelligence</h3>
                    <p className="text-meta mt-0.5">Which formats perform best</p>
                  </div>
                  <div className="space-y-2">
                    {formats.map((f, i) => (
                      <motion.div
                        key={f.format}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-secondary/8 border border-border/[0.03]"
                      >
                        <div className="flex items-center gap-2.5">
                          {i === 0 && <Crown className="w-3 h-3 text-primary/40" />}
                          <span className="text-xs text-foreground/60 capitalize">{f.format}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{f.count} posts</span>
                          <span className="text-xs text-foreground/50 tabular-nums font-medium">{f.avgEng}% avg</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/20 pt-2 border-t border-border/5">
                    Your most credible content is outperforming commentary.
                  </p>
                </div>
              ) : (
                <div className="glass-card rounded-2xl card-pad border border-border/8 text-center py-10 space-y-2">
                  <Crown className="w-6 h-6 text-muted-foreground/15 mx-auto" />
                  <p className="text-sm text-foreground/60">Format Intelligence</p>
                  <p className="text-[11px] text-muted-foreground/35 leading-relaxed">
                    Import history to unlock this section
                  </p>
                </div>
              )}
            </Fade>
          </div>

          {/* ── RECOMMENDED MOVE ── */}
          {(themes.length > 0 || formats.length > 0) && (
            <Fade delay={0.3}>
              <div className="glass-card rounded-2xl card-pad border border-primary/8 bg-gradient-to-br from-primary/[0.02] to-transparent space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary/40" />
                  <h3 className="text-sm font-semibold text-foreground">Recommended Move</h3>
                </div>
                <p className="text-sm text-foreground/60 leading-relaxed">
                  {themes.length > 0 && formats.length > 0
                    ? `Publish a ${formats[0].format} post on "${themes[0].theme}" — this combination of your strongest theme and best-performing format has the highest likelihood of resonance.`
                    : themes.length > 0
                      ? `Double down on "${themes[0].theme}" — it's your strongest authority theme with ${themes[0].avgEng}% average engagement.`
                      : `Experiment with ${formats[0].format} content — it's generating ${formats[0].avgEng}% average engagement.`
                  }
                </p>
                <button className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all tactile-press mt-1">
                  <FileText className="w-3.5 h-3.5" />
                  Draft Content
                </button>
              </div>
            </Fade>
          )}
        </>
      )}
    </div>
  );
};

export default InfluenceTabNew;
