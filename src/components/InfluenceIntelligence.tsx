import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Users, BarChart3, Target,
  ArrowUpRight, ArrowDownRight,
  Lightbulb, Crown, Loader2,
  Linkedin, Sparkles, Calendar, Activity, AlertTriangle,
  Clock, CheckCircle2, WifiOff, XCircle, RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { formatSmartDate } from "@/lib/formatDate";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ── Empty state ── */
const EmptyState = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="glass-card rounded-2xl p-6 sm:p-8 text-center py-12 animate-fade-in">
    <Icon className="w-10 h-10 text-primary/20 mx-auto mb-3" />
    <p className="text-sm font-medium text-foreground mb-1">{title}</p>
    <p className="text-xs text-muted-foreground/50 max-w-md mx-auto">{description}</p>
  </div>
);

type ConnectionState = "disconnected" | "connected_no_sync" | "syncing" | "synced" | "stale" | "sync_failed";

interface Props {
  linkedInConnected: boolean;
  connectionInfo?: {
    display_name?: string;
    last_synced_at?: string | null;
    connected_at?: string;
  } | null;
  syncing?: boolean;
  syncFailed?: boolean;
}

const InfluenceIntelligence = ({ linkedInConnected, connectionInfo, syncing = false, syncFailed = false }: Props) => {
  const [activeSection, setActiveSection] = useState<"trajectory" | "history" | "audience" | "content" | "strategy">("trajectory");
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [authorityThemes, setAuthorityThemes] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [snapshotsRes, signalsRes] = await Promise.all([
      (supabase.from("influence_snapshots" as any) as any).select("*").order("snapshot_date", { ascending: false }).limit(30),
      supabase.from("strategic_signals").select("signal_title, theme_tags, confidence").eq("status", "active").gte("confidence", 0.7).order("confidence", { ascending: false }).limit(10),
    ]);
    setSnapshots(snapshotsRes.data || []);

    const themes: Record<string, number> = {};
    (signalsRes.data || []).forEach((s: any) => {
      (s.theme_tags || []).forEach((t: string) => {
        themes[t] = (themes[t] || 0) + 1;
      });
    });
    setAuthorityThemes(
      Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
    );
    setLoadingSnapshots(false);
  };

  // Determine connection state
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

  const latestSnapshot = snapshots[0] || null;
  const audienceBreakdown = latestSnapshot?.audience_breakdown || null;
  const latestFollowers = latestSnapshot?.followers || 0;
  const latestGrowth = latestSnapshot?.follower_growth || 0;
  const latestEngagement = Number(latestSnapshot?.engagement_rate) || 0;
  const recommendations = latestSnapshot?.recommendations || [];
  const authorityThemesFromSnapshot = latestSnapshot?.authority_themes || [];

  const sections = [
    { key: "trajectory" as const, label: "Authority Trajectory", icon: Crown },
    { key: "history" as const, label: "Analytics History", icon: Activity },
    { key: "audience" as const, label: "Audience", icon: Users },
    { key: "content" as const, label: "Content", icon: BarChart3 },
    { key: "strategy" as const, label: "Strategy", icon: Target },
  ];

  const chartData = useMemo(() => {
    return [...snapshots].reverse().map((s: any) => ({
      date: s.snapshot_date?.slice(5) || "",
      followers: s.followers || 0,
      growth: s.follower_growth || 0,
      engagement: Number(s.engagement_rate) || 0,
    }));
  }, [snapshots]);

  const growthPct = latestFollowers > 0 ? ((latestGrowth / latestFollowers) * 100).toFixed(1) : "0";

  if (loadingSnapshots) {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  const statusBannerConfig: Record<ConnectionState, { icon: any; iconClass: string; bgClass: string; title: string; subtitle: string }> = {
    disconnected: {
      icon: WifiOff, iconClass: "text-muted-foreground/50",
      bgClass: "bg-muted/20 border-border/10",
      title: "LinkedIn not connected",
      subtitle: "Connect your account above to sync analytics",
    },
    connected_no_sync: {
      icon: Linkedin, iconClass: "text-[#0A66C2]",
      bgClass: "bg-[#0A66C2]/5 border-[#0A66C2]/15",
      title: "LinkedIn connected — awaiting first analytics sync",
      subtitle: "Click \"Sync Now\" above to pull your analytics",
    },
    syncing: {
      icon: Loader2, iconClass: "text-primary animate-spin",
      bgClass: "bg-primary/5 border-primary/15",
      title: "Syncing LinkedIn analytics…",
      subtitle: "Fetching posts, classifying content, and generating insights",
    },
    synced: {
      icon: CheckCircle2, iconClass: "text-emerald-400",
      bgClass: "bg-emerald-500/5 border-emerald-500/15",
      title: "Live LinkedIn data",
      subtitle: connectionInfo?.last_synced_at
        ? `Last synced: ${formatSmartDate(connectionInfo.last_synced_at)}`
        : latestSnapshot?.snapshot_date
        ? `Last synced: ${formatSmartDate(latestSnapshot.snapshot_date)}`
        : "Recently synced",
    },
    stale: {
      icon: AlertTriangle, iconClass: "text-amber-400",
      bgClass: "bg-amber-500/5 border-amber-500/15",
      title: "Data may be outdated",
      subtitle: latestSnapshot?.snapshot_date
        ? `Last synced: ${formatSmartDate(latestSnapshot.snapshot_date)} · Click \"Sync Now\" to refresh`
        : "Click \"Sync Now\" to refresh",
    },
    sync_failed: {
      icon: XCircle, iconClass: "text-red-400",
      bgClass: "bg-red-500/5 border-red-500/15",
      title: "LinkedIn sync failed",
      subtitle: "Check your connection and try again with \"Sync Now\"",
    },
  };

  const banner = statusBannerConfig[connectionState];
  const BannerIcon = banner.icon;

  const hasRealData = snapshots.length > 0;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`rounded-xl p-4 flex items-center gap-3 border ${banner.bgClass}`}>
        <BannerIcon className={`w-4 h-4 shrink-0 ${banner.iconClass}`} />
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">{banner.title}</p>
          <p className="text-[10px] text-muted-foreground/50">{banner.subtitle}</p>
        </div>
        {connectionState === "connected_no_sync" && <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </div>

      {/* Empty states for no-data scenarios */}
      {connectionState === "disconnected" && !hasRealData && (
        <EmptyState
          icon={Linkedin}
          title="No influence data available"
          description="Connect your LinkedIn account to start tracking your authority development with real analytics."
        />
      )}

      {connectionState === "connected_no_sync" && (
        <EmptyState
          icon={Activity}
          title="LinkedIn connected — analytics not synced yet"
          description="Use the Sync Now button to pull your first analytics snapshot. All insights will be generated from real LinkedIn data."
        />
      )}

      {connectionState === "syncing" && !hasRealData && (
        <div className="glass-card rounded-2xl p-8 text-center py-12 animate-fade-in">
          <Loader2 className="w-10 h-10 text-primary/30 mx-auto mb-3 animate-spin" />
          <p className="text-sm font-medium text-foreground mb-1">Pulling LinkedIn analytics…</p>
          <p className="text-xs text-muted-foreground/50">This may take a moment while we classify your content.</p>
        </div>
      )}

      {connectionState === "sync_failed" && !hasRealData && (
        <EmptyState
          icon={XCircle}
          title="Sync failed — no data available"
          description="We couldn't retrieve your LinkedIn analytics. Please check your connection and try syncing again."
        />
      )}

      {/* Real data panels — only render when we have snapshots */}
      {hasRealData && connectionState !== "connected_no_sync" && (
        <>
          {/* Header with real metrics */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    Influence Intelligence
                  </h2>
                  <p className="text-[10px] text-muted-foreground/50 tracking-wide">
                    Strategic analysis from synced LinkedIn data
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{latestFollowers.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground/50">Followers</p>
              </div>
              {latestGrowth !== 0 && (
                <div className="flex items-center gap-1.5">
                  {latestGrowth > 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
                  <span className={`text-sm font-semibold ${latestGrowth > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {latestGrowth > 0 ? "+" : ""}{latestGrowth}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">last period ({growthPct}%)</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
                <Calendar className="w-3 h-3" />
                {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="flex gap-1.5 mt-6 overflow-x-auto pb-1 -mx-1 px-1">
              {sections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap tactile-press ${
                    activeSection === s.key ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30"
                  }`}
                >
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Authority Trajectory */}
          {activeSection === "trajectory" && (
            <div className="space-y-5 animate-fade-in">
              <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Crown className="w-4 h-4 text-primary/70" />
                  What You're Becoming Known For
                </h3>
                {authorityThemes.length > 0 || (authorityThemesFromSnapshot as string[]).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-semibold">Authority Themes (from signals & analytics)</p>
                    {(authorityThemes.length > 0 ? authorityThemes : (authorityThemesFromSnapshot as string[])).map((theme: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/15 border border-border/10">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-foreground capitalize">{String(theme).replace(/_/g, " ")}</span>
                        <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-medium">emerging</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Lightbulb className="w-8 h-8 text-primary/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/50">No authority themes identified yet. Sync more LinkedIn data to surface patterns.</p>
                  </div>
                )}
              </div>

              {snapshots.length > 0 && (
                <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary/70" />
                      Recent Snapshots
                    </h3>
                    <button onClick={() => setActiveSection("history")} className="text-[10px] text-primary/70 hover:text-primary font-medium transition-colors">
                      View full history →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {snapshots.slice(0, 3).map((snap: any) => (
                      <div key={snap.id} className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums w-20 shrink-0">{snap.snapshot_date}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-foreground tabular-nums">{snap.followers?.toLocaleString()} followers</span>
                            {snap.follower_growth > 0 && (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                <ArrowUpRight className="w-2.5 h-2.5" />+{snap.follower_growth}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{Number(snap.engagement_rate).toFixed(1)}% eng.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Analytics History */}
          {activeSection === "history" && (
            <div className="space-y-5 animate-fade-in">
              {chartData.length > 1 ? (
                <>
                  <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary/70" />
                      Follower Growth
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.15)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} width={50} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.2)", borderRadius: 12, fontSize: 12 }} />
                          <Area type="monotone" dataKey="followers" stroke="hsl(var(--primary))" fill="url(#followerGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary/70" />
                      Engagement Rate
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.15)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} width={40} unit="%" />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.2)", borderRadius: 12, fontSize: 12 }} formatter={(value: number) => [`${value.toFixed(1)}%`, "Engagement"]} />
                          <Line type="monotone" dataKey="engagement" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: "#34d399" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary/70" />
                      Follower Growth per Period
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.15)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.5)" }} axisLine={false} tickLine={false} width={40} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.2)", borderRadius: 12, fontSize: 12 }} formatter={(value: number) => [`+${value}`, "New Followers"]} />
                          <Bar dataKey="growth" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState icon={Activity} title="Not enough data yet" description="Sync your LinkedIn analytics at least twice to see trend charts." />
              )}

              {snapshots.length > 0 && (
                <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary/70" />
                    All Snapshots ({snapshots.length})
                  </h3>
                  <div className="space-y-2">
                    {snapshots.map((snap: any) => (
                      <div key={snap.id} className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums w-20 shrink-0">{snap.snapshot_date}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-foreground tabular-nums">{snap.followers?.toLocaleString()} followers</span>
                            {snap.follower_growth > 0 && (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                <ArrowUpRight className="w-2.5 h-2.5" />+{snap.follower_growth}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {snap.top_topic && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/70 border border-primary/10">{snap.top_topic}</span>}
                            {snap.top_format && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/30 text-muted-foreground/60 border border-border/10">{snap.top_format}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{Number(snap.engagement_rate).toFixed(1)}% eng.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audience */}
          {activeSection === "audience" && (
            <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-6">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary/70" />
                Audience Intelligence
              </h3>
              {audienceBreakdown && (audienceBreakdown.industries || audienceBreakdown.seniority || audienceBreakdown.geography) ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {[
                    { title: "Industries", data: audienceBreakdown.industries || [] },
                    { title: "Seniority", data: audienceBreakdown.seniority || [] },
                    { title: "Geography", data: audienceBreakdown.geography || [] },
                  ].filter(g => g.data.length > 0).map((group) => (
                    <div key={group.title} className="space-y-3">
                      <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase">{group.title}</p>
                      {group.data.map((item: any) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-foreground/80">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground/50 tabular-nums">{item.pct}%</span>
                          </div>
                          <Progress value={item.pct} className="h-1" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-8 h-8 text-primary/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/50">No audience data synced yet. Audience breakdown requires LinkedIn Community Management API access.</p>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          {activeSection === "content" && (
            <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary/70" />
                Content Performance
              </h3>
              {latestSnapshot?.top_topic || latestSnapshot?.top_format ? (
                <div className="space-y-3">
                  {latestSnapshot.top_topic && (
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">Top Topic</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{latestSnapshot.top_topic}</p>
                      </div>
                      {latestEngagement > 0 && (
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground tabular-nums">{latestEngagement.toFixed(1)}%</p>
                          <p className="text-[9px] text-muted-foreground/40">engagement</p>
                        </div>
                      )}
                    </div>
                  )}
                  {latestSnapshot.top_format && (
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">Top Format</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{latestSnapshot.top_format}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="w-8 h-8 text-primary/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/50">No content performance data synced yet. Sync LinkedIn to see which topics and formats perform best.</p>
                </div>
              )}
            </div>
          )}

          {/* Strategy */}
          {activeSection === "strategy" && (
            <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary/70" />
                Strategic Recommendations
              </h3>
              {(recommendations as string[]).length > 0 ? (
                <div className="space-y-3">
                  {(recommendations as string[]).map((rec: string, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all duration-300">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs text-foreground/80 leading-relaxed">{rec}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Target className="w-8 h-8 text-primary/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/50">No strategic recommendations generated yet. Sync more LinkedIn data to receive actionable insights.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InfluenceIntelligence;
