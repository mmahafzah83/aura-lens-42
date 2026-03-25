import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Users, BarChart3, Target,
  ArrowUpRight, ArrowDownRight,
  Lightbulb, Crown, Loader2,
  Sparkles, Activity,
  Mic2, PenTool, MessageSquare
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

type ConnectionState = "disconnected" | "connected_no_sync" | "syncing" | "synced" | "stale" | "sync_failed";

interface Props {
  linkedInConnected: boolean;
  connectionInfo?: { display_name?: string; last_synced_at?: string | null; connected_at?: string } | null;
  syncing?: boolean;
  syncFailed?: boolean;
  onSnapshotsLoaded?: (count: number) => void;
}

/* ── Empty placeholder ── */
const EmptyPanel = ({ icon: Icon, message }: { icon: any; message: string }) => (
  <div className="text-center py-10">
    <Icon className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
    <p className="text-sm text-muted-foreground/40">{message}</p>
  </div>
);

const InfluenceIntelligence = ({ linkedInConnected, connectionInfo, syncing = false, syncFailed = false, onSnapshotsLoaded }: Props) => {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [performanceTab, setPerformanceTab] = useState<"authority" | "posts" | "audience">("authority");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data } = await (supabase.from("influence_snapshots" as any) as any)
      .select("*").order("snapshot_date", { ascending: false }).limit(30);
    setSnapshots(data || []);
    onSnapshotsLoaded?.((data || []).length);
    setLoadingSnapshots(false);
  };

  const connectionState: ConnectionState = useMemo(() => {
    if (!linkedInConnected) return "disconnected";
    if (syncing) return "syncing";
    if (syncFailed) return "sync_failed";
    if (snapshots.length === 0) return "connected_no_sync";
    const latest = snapshots[0];
    if (latest?.snapshot_date) {
      const daysSince = Math.floor((Date.now() - new Date(latest.snapshot_date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) return "stale";
    }
    return "synced";
  }, [linkedInConnected, snapshots, syncing, syncFailed]);

  const latest = snapshots[0] || null;
  const followers = latest?.followers || 0;
  const growth = latest?.follower_growth || 0;
  const engagement = Number(latest?.engagement_rate) || 0;
  const postCount = latest?.post_count || 0;
  const authorityTrajectory = latest?.authority_trajectory as string | null;
  const authorityThemes = (latest?.authority_themes || []) as string[];
  const toneAnalysis = (latest?.tone_analysis || []) as { tone: string; score: number; impact: string }[];
  const formatBreakdown = (latest?.format_breakdown || {}) as Record<string, number>;
  const recommendations = (latest?.recommendations || []) as string[];
  const audienceBreakdown = latest?.audience_breakdown || null;

  const writeNextRecs = recommendations.filter(r => r.startsWith("📝")).map(r => r.replace("📝 Write next: ", ""));
  const strategicRecs = recommendations.filter(r => !r.startsWith("📝"));

  const chartData = useMemo(() =>
    [...snapshots].reverse().map((s: any) => ({
      date: s.snapshot_date?.slice(5) || "",
      followers: s.followers || 0,
    })),
  [snapshots]);

  const formatData = Object.entries(formatBreakdown).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const formatTotal = formatData.reduce((sum, i) => sum + i.count, 0);

  const hasRealData = snapshots.length > 0;

  if (loadingSnapshots) {
    return (
      <div className="glass-card rounded-2xl p-10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
      </div>
    );
  }

  /* No data states */
  if (!hasRealData) {
    if (connectionState === "syncing") {
      return (
        <div className="glass-card rounded-2xl p-10 text-center animate-fade-in">
          <Loader2 className="w-10 h-10 text-primary/25 mx-auto mb-4 animate-spin" />
          <p className="text-sm font-medium text-foreground mb-1">Syncing LinkedIn analytics…</p>
          <p className="text-xs text-muted-foreground/40">Classifying content and generating insights.</p>
        </div>
      );
    }
    if (connectionState === "connected_no_sync") {
      return (
        <div className="glass-card rounded-2xl p-10 text-center animate-fade-in">
          <Activity className="w-10 h-10 text-primary/15 mx-auto mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">LinkedIn connected — awaiting first analytics sync.</p>
          <p className="text-xs text-muted-foreground/40">Click "Sync Now" above to pull your first analytics snapshot.</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-12">

      {/* ════════════════════════════════════════════════════
          SECTION 2 — Authority Identity (Hero Card)
         ════════════════════════════════════════════════════ */}
      <section className="animate-fade-in">
        <h2 className="text-section-title text-foreground mb-2">What You're Becoming Known For</h2>
        <p className="text-meta mb-6">Your authority positioning derived from LinkedIn activity.</p>

        <div className="glass-card-elevated rounded-2xl p-8 gold-glow">
          {authorityTrajectory ? (
            <p className="text-body text-foreground/90 leading-relaxed" dir="auto">
              {authorityTrajectory}
            </p>
          ) : (
            <p className="text-body text-muted-foreground/50">
              Sync more LinkedIn data to surface your authority positioning.
            </p>
          )}

          {authorityThemes.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border/10">
              <p className="text-label text-[11px] mb-4">Supporting signals</p>
              <div className="flex flex-wrap gap-2">
                {authorityThemes.map((theme, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/8 text-primary/80 border border-primary/15 capitalize"
                  >
                    {String(theme).replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          SECTION 3 — Influence Performance
         ════════════════════════════════════════════════════ */}
      <section className="animate-fade-in">
        <h2 className="text-section-title text-foreground mb-2">Influence Performance</h2>
        <p className="text-meta mb-6">Real metrics from your synced LinkedIn data.</p>

        {/* Metric row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Followers", value: followers.toLocaleString() },
            { label: "Growth", value: `${growth > 0 ? "+" : ""}${growth}`, color: growth > 0 ? "text-emerald-400" : growth < 0 ? "text-destructive" : undefined },
            { label: "Engagement", value: engagement > 0 ? `${engagement.toFixed(1)}%` : "—" },
            { label: "Posts Analyzed", value: postCount.toString() },
          ].map((m) => (
            <div key={m.label} className="glass-card rounded-2xl p-5 text-center">
              <p className={`text-2xl font-bold tabular-nums ${m.color || "text-foreground"}`}>{m.value}</p>
              <p className="text-label text-[10px] mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {([
            { key: "authority" as const, label: "Authority", icon: Crown },
            { key: "posts" as const, label: "Posts", icon: BarChart3 },
            { key: "audience" as const, label: "Audience", icon: Users },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setPerformanceTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 tactile-press ${
                performanceTab === t.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary/20"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="animate-fade-in">
          {performanceTab === "authority" && (
            <div className="glass-card rounded-2xl p-8 space-y-5">
              {chartData.length > 1 ? (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.1)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.4)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.4)" }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.15)", borderRadius: 12, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="followers" stroke="hsl(var(--primary))" fill="url(#followerGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel icon={TrendingUp} message="Sync LinkedIn at least twice to see follower trends." />
              )}
            </div>
          )}

          {performanceTab === "posts" && (
            <div className="glass-card rounded-2xl p-8 space-y-5">
              {latest?.top_topic || latest?.top_format ? (
                <div className="space-y-3">
                  {latest.top_topic && (
                    <div className="p-4 rounded-xl bg-secondary/15 border border-border/10">
                      <p className="text-label text-[10px] mb-1">Strongest Topic</p>
                      <p className="text-sm font-medium text-foreground">{latest.top_topic}</p>
                    </div>
                  )}
                  {latest.top_format && (
                    <div className="p-4 rounded-xl bg-secondary/15 border border-border/10">
                      <p className="text-label text-[10px] mb-1">Strongest Format</p>
                      <p className="text-sm font-medium text-foreground">{latest.top_format}</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyPanel icon={BarChart3} message="No content performance data synced yet." />
              )}
            </div>
          )}

          {performanceTab === "audience" && (
            <div className="glass-card rounded-2xl p-8 space-y-5">
              {audienceBreakdown && (audienceBreakdown.industries || audienceBreakdown.seniority || audienceBreakdown.geography) ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { title: "Industries", data: audienceBreakdown.industries || [] },
                    { title: "Seniority", data: audienceBreakdown.seniority || [] },
                    { title: "Geography", data: audienceBreakdown.geography || [] },
                  ].filter(g => g.data.length > 0).map((group) => (
                    <div key={group.title} className="space-y-3">
                      <p className="text-label text-[10px]">{group.title}</p>
                      {group.data.map((item: any) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-foreground/80">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{item.pct}%</span>
                          </div>
                          <Progress value={item.pct} className="h-1" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel icon={Users} message="No audience data available. Requires LinkedIn Community Management API access." />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          SECTION 4 — Content Intelligence
         ════════════════════════════════════════════════════ */}
      <section className="animate-fade-in">
        <h2 className="text-section-title text-foreground mb-2">Content Intelligence</h2>
        <p className="text-meta mb-6">Classified analysis of your LinkedIn content.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Authority Themes */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Authority Themes</h3>
            </div>
            {authorityThemes.length > 0 ? (
              <div className="space-y-3">
                {authorityThemes.map((theme, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <span className="text-xs font-medium text-foreground capitalize">{String(theme).replace(/_/g, " ")}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-medium">
                      {i === 0 ? "Dominant" : i <= 1 ? "Emerging" : "Nascent"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Sparkles} message="No themes identified yet." />
            )}
          </div>

          {/* Tone Performance */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Mic2 className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Tone Performance</h3>
            </div>
            {toneAnalysis.length > 0 ? (
              <div className="space-y-3">
                {[...toneAnalysis].sort((a, b) => b.score - a.score).map((t, i) => {
                  const impactStyle = t.impact === "high"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
                    : t.impact === "medium"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/15"
                    : "bg-secondary/30 text-muted-foreground/50 border-border/10";
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/10">
                      <span className="text-xs font-medium text-foreground capitalize">{t.tone}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${impactStyle}`}>
                        {t.impact} effectiveness
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel icon={Mic2} message="No tone analysis available." />
            )}
          </div>

          {/* Best Formats */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <MessageSquare className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Best Formats</h3>
            </div>
            {formatData.length > 0 ? (
              <div className="space-y-3">
                {formatData.map((item) => {
                  const pct = formatTotal > 0 ? Math.round((item.count / formatTotal) * 100) : 0;
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground/80">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel icon={MessageSquare} message="No format data available." />
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default InfluenceIntelligence;
