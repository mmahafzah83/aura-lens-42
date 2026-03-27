import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, Loader2, ArrowUpRight, ArrowDownRight,
  Sparkles, FileText, Zap, Eye, Crown, BarChart3,
  Lightbulb, RefreshCw, Calendar, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import ConnectionStatusPanel from "@/components/influence/ConnectionStatusPanel";
import HistoricalImportHub from "@/components/influence/HistoricalImportHub";
import DailySnapshotEngine from "@/components/influence/DailySnapshotEngine";
import DataHealthConsole from "@/components/influence/DataHealthConsole";
import SourceReviewPanel from "@/components/influence/SourceReviewPanel";
import StrategicAttribution from "@/components/influence/StrategicAttribution";
import WeeklyInfluenceBrief from "@/components/influence/WeeklyInfluenceBrief";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface InfluenceTabNewProps {
  entries: Entry[];
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

const InfluenceTabNew = ({ entries }: InfluenceTabNewProps) => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [view, setView] = useState<"dashboard" | "attribution" | "data">("dashboard");

  // Data
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [authorityScore, setAuthorityScore] = useState<any>(null);

  // Table sort
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { loadAll(); }, [range]);

  const getDaysForRange = (r: TimeRange) => r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;

  const loadAll = async () => {
    setLoading(true);
    try {
      const days = getDaysForRange(range);
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

      const [snapRes, postRes, authRes] = await Promise.all([
        supabase
          .from("influence_snapshots")
          .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
          .gte("snapshot_date", range === "all" ? "2020-01-01" : since)
          .order("snapshot_date", { ascending: true })
          .limit(365),
        supabase
          .from("linkedin_posts")
          .select("id, post_text, hook, title, theme, tone, format_type, content_type, topic_label, engagement_score, like_count, comment_count, repost_count, published_at, media_type")
          .order("published_at", { ascending: false })
          .limit(200),
        supabase
          .from("authority_scores")
          .select("*")
          .order("snapshot_date", { ascending: false })
          .limit(1),
      ]);

      const snaps = snapRes.data || [];
      setSnapshots(snaps);
      setLatestSnapshot(snaps.length > 0 ? snaps[snaps.length - 1] : null);
      setPosts(postRes.data || []);
      setAuthorityScore(authRes.data?.[0] || null);
    } catch (e) {
      console.error("Influence load error:", e);
    }
    setLoading(false);
  };

  // Derived metrics
  const currentFollowers = latestSnapshot?.followers || 0;
  const periodGrowth = snapshots.length >= 2
    ? (snapshots[snapshots.length - 1]?.followers || 0) - (snapshots[0]?.followers || 0)
    : 0;
  const avgEngagement = posts.length > 0
    ? Math.round(posts.reduce((s, p) => s + (Number(p.engagement_score) || 0), 0) / posts.length * 10) / 10
    : 0;

  // Publishing cadence: posts per week in range
  const daysInRange = getDaysForRange(range);
  const weeksInRange = Math.max(1, daysInRange / 7);
  const postsInRange = posts.filter(p => {
    if (!p.published_at) return false;
    const d = new Date(p.published_at).getTime();
    return d >= Date.now() - daysInRange * 86400000;
  }).length;
  const cadence = Math.round((postsInRange / weeksInRange) * 10) / 10;

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
            Aura is building your strategic memory. Every metric preserved here strengthens trend analysis over time.
          </p>
          <ConnectionStatusPanel />
          <HistoricalImportHub />
          <DailySnapshotEngine />
          <DataHealthConsole />
          <SourceReviewPanel />
        </div>
      ) : (
        <>
          {/* ── CONNECTION STATUS (compact) ── */}
          <Fade delay={0.04}>
            <ConnectionStatusPanel />
          </Fade>

          {/* ── AUTHORITY SNAPSHOT CARDS ── */}
          <Fade delay={0.08}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Followers", value: currentFollowers.toLocaleString(), icon: Users },
                {
                  label: `${range} Growth`,
                  value: `${periodGrowth >= 0 ? "+" : ""}${periodGrowth}`,
                  icon: periodGrowth >= 0 ? ArrowUpRight : ArrowDownRight,
                  accent: periodGrowth > 0,
                },
                { label: "Avg Engagement", value: `${avgEngagement}%`, icon: Eye },
                { label: "Weekly Cadence", value: `${cadence}/wk`, icon: Calendar },
                {
                  label: "Top Asset",
                  value: topPost ? (topPost.hook || topPost.title || topPost.post_text?.slice(0, 20) || "—") : "—",
                  icon: Crown,
                  truncate: true,
                },
                {
                  label: "Authority Score",
                  value: authorityScore ? `${Math.round(Number(authorityScore.authority_score))}` : "—",
                  icon: Sparkles,
                },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.04 }}
                  className="p-4 rounded-xl bg-secondary/8 border border-border/5 space-y-2"
                >
                  <card.icon className={`w-3.5 h-3.5 ${card.accent ? "text-primary/60" : "text-muted-foreground/25"}`} />
                  <p className={`text-lg font-bold tabular-nums text-foreground ${card.truncate ? "truncate text-sm" : ""}`}>
                    {card.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground/35">{card.label}</p>
                </motion.div>
              ))}
            </div>
          </Fade>

          {/* ── AUDIENCE MOMENTUM CHART ── */}
          {chartData.length > 1 && (
            <Fade delay={0.14}>
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
            </Fade>
          )}

          {/* ── CONTENT PERFORMANCE TABLE ── */}
          {sortedPosts.length > 0 && (
            <Fade delay={0.18}>
              <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Content Performance</h3>
                  <p className="text-meta mt-0.5">{posts.length} published assets analyzed</p>
                </div>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border/5">
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 w-20 cursor-pointer" onClick={() => toggleSort("published_at")}>
                          <span className="flex items-center gap-1">Date <SortIcon col="published_at" /></span>
                        </th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Hook</th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Topic</th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5">Format</th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("like_count")}>
                          <span className="flex items-center gap-1 justify-end">Reactions <SortIcon col="like_count" /></span>
                        </th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("comment_count")}>
                          <span className="flex items-center gap-1 justify-end">Comments <SortIcon col="comment_count" /></span>
                        </th>
                        <th className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium py-2 px-2.5 text-right cursor-pointer" onClick={() => toggleSort("engagement_score")}>
                          <span className="flex items-center gap-1 justify-end">Eng % <SortIcon col="engagement_score" /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPosts.map(post => (
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
                          <td className="text-[11px] text-foreground/50 py-2.5 px-2.5 tabular-nums text-right">
                            {post.like_count || 0}
                          </td>
                          <td className="text-[11px] text-foreground/50 py-2.5 px-2.5 tabular-nums text-right">
                            {post.comment_count || 0}
                          </td>
                          <td className="text-[11px] text-foreground/60 py-2.5 px-2.5 tabular-nums text-right font-medium">
                            {Number(post.engagement_score || 0).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Fade>
          )}

          {/* ── STRATEGIC THEME MOMENTUM + FORMAT INTELLIGENCE ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Theme Momentum */}
            {themes.length > 0 && (
              <Fade delay={0.22}>
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
                  {themes.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/20 pt-2 border-t border-border/5">
                      "{themes[0].theme}" is earning the strongest audience response.
                    </p>
                  )}
                </div>
              </Fade>
            )}

            {/* Format Intelligence */}
            {formats.length > 0 && (
              <Fade delay={0.26}>
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
                  {formats.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/20 pt-2 border-t border-border/5">
                      Your most credible content is outperforming commentary.
                    </p>
                  )}
                </div>
              </Fade>
            )}
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

          {/* Empty state if no data */}
          {posts.length === 0 && snapshots.length === 0 && (
            <Fade delay={0.1}>
              <div className="text-center py-16 space-y-3">
                <TrendingUp className="w-8 h-8 text-primary/15 mx-auto" />
                <p className="text-foreground font-medium">No influence data yet</p>
                <p className="text-sm text-muted-foreground/40 max-w-sm mx-auto">
                  Connect your LinkedIn and sync your data, or switch to the Data tab to import historical metrics.
                </p>
              </div>
            </Fade>
          )}
        </>
      )}
    </div>
  );
};

export default InfluenceTabNew;
