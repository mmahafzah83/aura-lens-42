import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, Loader2, ArrowUpRight,
  Sparkles, FileText, Zap, Eye, Crown, BarChart3,
  Lightbulb, RefreshCw, ChevronDown, ChevronUp,
  Activity, Settings2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

const Fade = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
  >
    {children}
  </motion.div>
);

const SectionHeading = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) => (
  <div className="flex items-center gap-2.5 mb-4">
    <Icon className="w-4 h-4 text-primary/40 flex-shrink-0" />
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-[10px] text-muted-foreground/30">{subtitle}</p>
    </div>
  </div>
);

const InfluenceTabNew = ({ entries, onOpenChat }: InfluenceTabNewProps) => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [systemHealthOpen, setSystemHealthOpen] = useState(false);

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [authorityScore, setAuthorityScore] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasSyncRun, setHasSyncRun] = useState(false);
  const [syncRunCount, setSyncRunCount] = useState(0);
  const [syncErrorCount, setSyncErrorCount] = useState(0);
  const [lastCaptureTime, setLastCaptureTime] = useState<string | null>(null);
  const [totalPostCount, setTotalPostCount] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { loadAll(); }, [range]);

  const getDaysForRange = (r: TimeRange) => r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;

  const loadAll = async () => {
    setLoading(true);
    try {
      const days = getDaysForRange(range);
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

      // Separate count query for accurate "posts tracked" (not capped by limit)
      const postCountQuery = supabase
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .neq("tracking_status", "rejected");

      const [snapRes, postRes, authRes, connRes, syncRes, metricsRes, syncErrorRes, lastCaptureRes, postCountRes] = await Promise.all([
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
          .limit(500),
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
          .select("id, status, completed_at")
          .order("completed_at", { ascending: false })
          .limit(50),
        supabase
          .from("linkedin_post_metrics")
          .select("post_id, impressions, reactions, comments, shares, saves, engagement_rate, snapshot_date, source_type")
          .order("snapshot_date", { ascending: false }),
        supabase
          .from("sync_errors")
          .select("id")
          .limit(100),
        supabase
          .from("sync_runs")
          .select("completed_at")
          .eq("sync_type", "browser_capture")
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1),
        postCountQuery,
      ]);

      setIsConnected((connRes.data || []).length > 0);
      const runs = syncRes.data || [];
      setHasSyncRun(runs.length > 0);
      setSyncRunCount(runs.length);
      setSyncErrorCount((syncErrorRes.data || []).length);
      setLastCaptureTime(lastCaptureRes.data?.[0]?.completed_at || null);
      setTotalPostCount(postCountRes.count || 0);

      const snaps = snapRes.data || [];
      setSnapshots(snaps);
      setLatestSnapshot(snaps.length > 0 ? snaps[snaps.length - 1] : null);

      const metricsMap: Record<string, any> = {};
      (metricsRes.data || []).forEach((m: any) => {
        if (!metricsMap[m.post_id]) metricsMap[m.post_id] = m;
      });

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

  // Derived metrics
  const currentFollowers = latestSnapshot?.followers || 0;
  const totalReactions = snapshots.reduce((s, snap) => s + (snap.reactions || 0), 0);
  const latestEngRate = latestSnapshot ? Number(latestSnapshot.engagement_rate) || 0 : 0;
  const periodGrowth = snapshots.length >= 2
    ? (snapshots[snapshots.length - 1]?.followers || 0) - (snapshots[0]?.followers || 0)
    : 0;

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
    .slice(0, 8);

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
    .slice(0, 6);

  // Topic labels for bar chart
  const topicCounts: Record<string, number> = {};
  posts.forEach(p => {
    if (p.topic_label) topicCounts[p.topic_label] = (topicCounts[p.topic_label] || 0) + 1;
  });
  const topicLabels = Object.entries(topicCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const unlabeledCount = posts.filter(p => !p.topic_label).length;

  // Chart data
  const chartData = snapshots.map(s => ({
    date: s.snapshot_date,
    followers: s.followers || 0,
    engagement: Number(s.engagement_rate) || 0,
  }));

  // Data readiness flags
  const hasPosts = totalPostCount > 0;
  const hasMetrics = posts.some(p => p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0 || p._impressions > 0);
  const hasFollowerData = chartData.length > 1;

  // Sorted posts
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
    <div className="space-y-10 max-w-4xl mx-auto">

      {/* ── PAGE HEADER + RANGE ── */}
      <Fade>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Influence
            </h1>
            <p className="text-sm text-muted-foreground/40 mt-1">
              Is your authority compounding?
            </p>
          </div>
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
        </div>
      </Fade>

      {/* ═══════════════════════════════════════
         1. INFLUENCE OVERVIEW
         ═══════════════════════════════════════ */}
      <Fade delay={0.04}>
        <div>
          <SectionHeading icon={Eye} title="Influence Overview" subtitle="Key metrics from your LinkedIn presence" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Followers", value: currentFollowers > 0 ? currentFollowers.toLocaleString() : "—", icon: Users, sub: periodGrowth !== 0 ? `${periodGrowth > 0 ? "+" : ""}${periodGrowth}` : null },
              { label: "Posts tracked", value: totalPostCount.toString(), icon: FileText, sub: null },
              { label: "Engagement rate", value: latestEngRate > 0 ? `${latestEngRate.toFixed(1)}%` : "—", icon: Activity, sub: null },
              { label: "Total reactions", value: totalReactions > 0 ? totalReactions.toLocaleString() : "—", icon: Zap, sub: null },
            ].map((m, i) => (
              <div key={m.label} className="glass-card rounded-2xl p-5 border border-border/8 space-y-2">
                <div className="flex items-center gap-2">
                  <m.icon className="w-3.5 h-3.5 text-primary/35" />
                  <span className="text-[10px] text-muted-foreground/35 uppercase tracking-wider font-medium">{m.label}</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">{m.value}</p>
                {m.sub && (
                  <span className={`text-[10px] font-medium ${Number(m.sub) > 0 ? "text-emerald-400/60" : "text-red-400/60"}`}>
                    {m.sub} this period
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Fade>

      {/* ── DATA READINESS INDICATOR ── */}
      {(!hasPosts || (hasPosts && !hasMetrics)) && (
        <Fade delay={0.06}>
          <div className="glass-card rounded-2xl card-pad border border-primary/8 bg-gradient-to-br from-primary/[0.02] to-transparent flex items-start gap-3 py-5">
            <Zap className="w-5 h-5 text-primary/30 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/70">
                {!hasPosts
                  ? "Capture your first LinkedIn post to activate performance analytics."
                  : "Post metrics not captured yet. Open the post and run Capture This Page."}
              </p>
              <p className="text-[11px] text-muted-foreground/35 leading-relaxed">
                {!hasPosts
                  ? "Use the Aura browser extension on any LinkedIn analytics page, post, or activity feed."
                  : `${totalPostCount} post${totalPostCount !== 1 ? "s" : ""} discovered — metrics like impressions, reactions, and comments require individual post capture.`}
              </p>
            </div>
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════
         2. AUDIENCE MOMENTUM (only if data exists)
         ═══════════════════════════════════════ */}
      {hasFollowerData && (
        <Fade delay={0.08}>
          <div>
            <SectionHeading icon={TrendingUp} title="Audience Momentum" subtitle="Follower trajectory over time" />
            <div className="glass-card rounded-2xl card-pad border border-border/8">
              <div className="h-[200px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(43, 72%, 52%)" stopOpacity={0.15} />
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

      {/* ═══════════════════════════════════════
         3. CONTENT PERFORMANCE (only if posts exist)
         ═══════════════════════════════════════ */}
      {hasPosts && (
        <Fade delay={0.12}>
          <div>
            <SectionHeading icon={BarChart3} title="Content Performance" subtitle={`${totalPostCount} posts tracked · ${posts.filter(p => p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0).length} with metrics`} />
            <div className="glass-card rounded-2xl card-pad border border-border/8">
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
                      const statusStyles: Record<string, string> = {
                        discovered: "bg-muted-foreground/5 text-muted-foreground/30",
                        confirmed: "bg-emerald-500/5 text-emerald-500/40",
                        metrics_pending: "bg-amber-500/5 text-amber-500/50",
                        metrics_imported: "bg-emerald-500/5 text-emerald-500/50",
                        metrics_unavailable: "bg-muted-foreground/5 text-muted-foreground/20",
                      };
                      const statusLabels: Record<string, string> = {
                        discovered: "Discovery only",
                        confirmed: "Captured",
                        metrics_pending: "Pending",
                        metrics_imported: "Enriched",
                        metrics_unavailable: "Unavailable",
                      };
                      return (
                        <tr key={post.id} className="border-b border-border/[0.03] hover:bg-secondary/5 transition-colors">
                          <td className="text-[11px] text-muted-foreground/40 py-2.5 px-2.5 tabular-nums whitespace-nowrap">
                            {post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="text-[11px] text-foreground/70 py-2.5 px-2.5 max-w-[160px] truncate">
                            {post.hook || post.title || post.post_text?.slice(0, 50) || "—"}
                          </td>
                          <td className="text-[11px] text-muted-foreground/35 py-2.5 px-2.5 capitalize truncate max-w-[90px]">
                            {post.theme || post.topic_label || "—"}
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium border ${sourceStyles[src] || sourceStyles.search_discovery}`}>
                              {sourceLabels[src] || src}
                            </span>
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right">
                            {post._impressions > 0
                              ? <span className="text-foreground/40">{post._impressions.toLocaleString()}</span>
                              : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right">
                            {hasRealMetrics ? <span className="text-foreground/50">{post.like_count}</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right">
                            {hasRealMetrics ? <span className="text-foreground/50">{post.comment_count}</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="text-[11px] py-2.5 px-2.5 tabular-nums text-right font-medium">
                            {hasRealMetrics ? <span className="text-foreground/60">{Number(post.engagement_score || 0).toFixed(1)}%</span> : <span className="text-muted-foreground/15">—</span>}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-medium ${statusStyles[status] || statusStyles.discovered}`}>
                              {statusLabels[status] || "Discovery only"}
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

      {/* ═══════════════════════════════════════
         4. THEME INTELLIGENCE (only if themes exist)
         ═══════════════════════════════════════ */}
      {themes.length > 0 && (
        <Fade delay={0.16}>
          <div>
            <SectionHeading icon={Sparkles} title="Theme Intelligence" subtitle={`Topic distribution across ${totalPostCount} posts`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="glass-card rounded-2xl card-pad border border-border/8">
                <div className="h-[240px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topicLabels} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(0, 0%, 42%)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "hsl(40, 10%, 70%)" }} tickLine={false} axisLine={false} width={110} />
                      <Tooltip contentStyle={{ background: "hsl(0, 0%, 7%)", border: "1px solid hsl(0, 0%, 14%)", borderRadius: "8px", fontSize: "11px", color: "hsl(40, 10%, 92%)" }} formatter={(value: number) => [`${value} posts`, "Count"]} cursor={{ fill: "hsl(0, 0%, 100%, 0.03)" }} />
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
              </div>
              <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-3">
                <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider font-medium">Theme Momentum</p>
                {themes.map((t, i) => {
                  const maxCount = themes[0].count;
                  const pct = Math.round((t.count / maxCount) * 100);
                  return (
                    <div key={t.theme} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground/60 capitalize truncate max-w-[70%]">{t.theme}</span>
                        <span className="text-[10px] text-muted-foreground/30 tabular-nums">{t.count} · {t.avgEng}%</span>
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
            </div>
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════
         5. FORMAT INTELLIGENCE (only if formats exist)
         ═══════════════════════════════════════ */}
      {formats.length > 0 && (
        <Fade delay={0.2}>
          <div>
            <SectionHeading icon={Crown} title="Format Intelligence" subtitle="Which formats perform best" />
            <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-2">
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
          </div>
        </Fade>
      )}

      {/* ═══════════════════════════════════════
         6. SYSTEM HEALTH (collapsible)
         ═══════════════════════════════════════ */}
      <Fade delay={0.24}>
        <div className="border-t border-border/5 pt-6">
          <button
            onClick={() => setSystemHealthOpen(o => !o)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5">
              <Settings2 className="w-4 h-4 text-muted-foreground/30" />
              <div className="text-left">
                <h2 className="text-sm font-semibold text-foreground/70 group-hover:text-foreground/90 transition-colors">System Health</h2>
                <p className="text-[10px] text-muted-foreground/25">
                  Capture status · {syncRunCount} sync runs · {syncErrorCount} errors
                  {lastCaptureTime && ` · Last capture ${new Date(lastCaptureTime).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground/25 transition-transform ${systemHealthOpen ? "rotate-180" : ""}`} />
          </button>

          {systemHealthOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.3 }}
              className="space-y-5 mt-5"
            >
              {/* Capture & Connection */}
              <BrowserCapturePanel />
              <ConnectionStatusPanel />
              <SourceHealthSummary />

              {/* Sync & Discovery */}
              <PostDiscoveryPanel onDiscoveryComplete={loadAll} />
              <DiscoveryHealthCard />
              <ReviewQueuePanel onReviewComplete={loadAll} />
              <PostCleanupPanel onCleanupComplete={loadAll} />

              {/* Fallback Tools */}
              <div className="space-y-3 pt-4 border-t border-border/5">
                <div>
                  <h3 className="text-[11px] font-semibold text-muted-foreground/40 tracking-wide uppercase">Fallback Tools</h3>
                  <p className="text-[10px] text-muted-foreground/25 mt-1 leading-relaxed max-w-sm">
                    Use only if browser capture missed something.
                  </p>
                </div>
                <ManualPostIngestion onIngestionComplete={loadAll} />
                <PostMetricsIngestion onComplete={loadAll} />
                <HistoricalImportHub onImportComplete={loadAll} />
              </div>

              {/* Diagnostics */}
              <DailySnapshotEngine />
              <DataHealthConsole />
              <SourceReviewPanel />
            </motion.div>
          )}
        </div>
      </Fade>
    </div>
  );
};

export default InfluenceTabNew;
