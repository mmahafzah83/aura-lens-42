import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, BarChart3, Crown, Loader2,
  ArrowUpRight, ArrowDownRight, Sparkles, FileText,
  Zap, Eye, Lightbulb
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface InfluenceTabNewProps {
  entries: Entry[];
}

/* ── Shared empty state ── */
const EmptyState = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) => (
  <div className="text-center py-12 space-y-3">
    <Icon className="w-8 h-8 text-primary/20 mx-auto" />
    <p className="text-foreground font-medium">{title}</p>
    <p className="text-sm text-muted-foreground max-w-sm mx-auto">{subtitle}</p>
  </div>
);

/* ── Section wrapper ── */
const Section = ({ children, index }: { children: React.ReactNode; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: index * 0.08 }}
  >
    {children}
  </motion.div>
);

/* ═══════════════════════════════════════════
   AUDIENCE SECTION
   ═══════════════════════════════════════════ */

const AudienceSection = ({ snapshot }: { snapshot: any }) => {
  const followers = snapshot?.followers || 0;
  const growth = snapshot?.follower_growth || 0;
  const audience = snapshot?.audience_breakdown || {};

  return (
    <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-card-title text-foreground">Audience</h3>
          <p className="text-meta">Who is engaging with your authority</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-8">
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{followers.toLocaleString()}</p>
          <p className="text-meta">Followers</p>
        </div>
        {growth !== 0 && (
          <div className="flex items-center gap-1.5">
            {growth > 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
            <span className={`text-lg font-bold ${growth > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {growth > 0 ? "+" : ""}{growth}
            </span>
            <span className="text-meta">last period</span>
          </div>
        )}
      </div>

      {/* Audience segments */}
      {(audience.industries || audience.seniority || audience.geography) ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          {[
            { title: "Industries", data: audience.industries || [] },
            { title: "Seniority", data: audience.seniority || [] },
            { title: "Geography", data: audience.geography || [] },
          ].filter(g => g.data.length > 0).map((group) => (
            <div key={group.title} className="space-y-3">
              <p className="text-label uppercase tracking-widest text-xs font-semibold">{group.title}</p>
              {group.data.map((item: any) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground/80">{item.name}</span>
                    <span className="text-meta tabular-nums">{item.pct}%</span>
                  </div>
                  <Progress value={item.pct} className="h-1" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-meta text-center py-4">Sync your LinkedIn to see audience segments.</p>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   CONTENT PERFORMANCE SECTION
   ═══════════════════════════════════════════ */

interface PostStats {
  postCount: number;
  avgEngagement: number;
  topTheme: string;
  topFormat: string;
  themes: Array<{ theme: string; count: number }>;
  formats: Array<{ format: string; count: number }>;
}

const ContentPerformanceSection = ({ stats }: { stats: PostStats | null }) => {
  if (!stats || stats.postCount === 0) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Content Performance</h3>
            <p className="text-meta">How your published ideas perform</p>
          </div>
        </div>
        <EmptyState icon={BarChart3} title="No content data yet" subtitle="Publish content and sync your LinkedIn to see performance analytics." />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-card-title text-foreground">Content Performance</h3>
          <p className="text-meta">How your published ideas perform</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Posts Analyzed", value: stats.postCount, icon: FileText },
          { label: "Avg Engagement", value: `${stats.avgEngagement}%`, icon: Eye },
          { label: "Top Theme", value: stats.topTheme, icon: Zap },
          { label: "Top Format", value: stats.topFormat, icon: BarChart3 },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="p-4 rounded-xl bg-secondary/15 border border-border/8"
          >
            <m.icon className="w-4 h-4 text-primary/60 mb-2" />
            <p className="text-foreground font-bold text-base capitalize truncate">{m.value}</p>
            <p className="text-meta mt-0.5">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Theme resonance */}
      {stats.themes.length > 0 && (
        <div className="space-y-3">
          <p className="text-label uppercase tracking-widest text-xs font-semibold">Topic Resonance</p>
          {stats.themes.map(t => {
            const maxCount = stats.themes[0].count;
            const pct = Math.round((t.count / maxCount) * 100);
            return (
              <div key={t.theme} className="flex items-center gap-3">
                <span className="text-sm text-foreground capitalize w-36 shrink-0 truncate">{t.theme}</span>
                <div className="flex-1 bg-secondary/20 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6 }}
                    className="h-full bg-primary/40 rounded-full"
                  />
                </div>
                <span className="text-meta tabular-nums w-8 text-right">{t.count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Format breakdown */}
      {stats.formats.length > 0 && (
        <div className="space-y-3">
          <p className="text-label uppercase tracking-widest text-xs font-semibold">Format Performance</p>
          <div className="flex flex-wrap gap-2">
            {stats.formats.map(f => (
              <span key={f.format} className="px-3 py-1.5 rounded-lg bg-secondary/20 border border-border/10 text-xs font-medium text-foreground/80 capitalize">
                {f.format} <span className="text-muted-foreground/50 ml-1">{f.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   AUTHORITY GROWTH SECTION
   ═══════════════════════════════════════════ */

interface AuthorityTheme {
  theme: string;
  strength: string;
  trend: string;
}

const AuthorityGrowthSection = ({ snapshot, themes }: { snapshot: any; themes: AuthorityTheme[] }) => {
  const trajectory = snapshot?.authority_trajectory || null;
  const engagement = Number(snapshot?.engagement_rate) || 0;
  const recommendations = (snapshot?.recommendations || []) as string[];

  return (
    <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-card-title text-foreground">Authority Growth</h3>
          <p className="text-meta">Long-term thought leadership trajectory</p>
        </div>
      </div>

      {/* Trajectory + engagement */}
      <div className="flex items-center gap-6 flex-wrap">
        {trajectory && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground capitalize">{trajectory}</span>
            <span className="text-meta">trajectory</span>
          </div>
        )}
        {engagement > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground tabular-nums">{engagement.toFixed(1)}%</span>
            <span className="text-meta">engagement rate</span>
          </div>
        )}
      </div>

      {/* Authority themes */}
      {themes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-label uppercase tracking-widest text-xs font-semibold">Authority Themes</p>
          <div className="space-y-2">
            {themes.map((t, i) => (
              <motion.div
                key={t.theme}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-4 rounded-xl bg-secondary/15 border border-border/8 hover:border-primary/15 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {i === 0 && <Crown className="w-4 h-4 text-primary shrink-0" />}
                  <span className="text-sm font-medium text-foreground truncate">{t.theme}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    t.strength === "High" ? "bg-primary/10 text-primary" :
                    t.strength === "Medium" ? "bg-secondary/30 text-foreground/70" :
                    "bg-secondary/20 text-muted-foreground"
                  }`}>{t.strength}</span>
                  <span className={`text-xs flex items-center gap-1 ${
                    t.trend === "Increasing" ? "text-emerald-400" :
                    t.trend === "Decreasing" ? "text-red-400" :
                    "text-muted-foreground"
                  }`}>
                    {t.trend === "Increasing" && <ArrowUpRight className="w-3 h-3" />}
                    {t.trend === "Decreasing" && <ArrowDownRight className="w-3 h-3" />}
                    {t.trend}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-meta text-center py-4">Build more content to see authority theme analysis.</p>
      )}

      {/* Strategic recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border/8">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <p className="text-label uppercase tracking-widest text-xs font-semibold text-primary/60">Strategic Feedback</p>
          </div>
          {recommendations.slice(0, 3).map((rec, i) => (
            <div key={i} className="p-4 rounded-xl bg-gradient-to-br from-primary/[0.03] to-transparent border border-primary/8">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/80 leading-relaxed">{rec}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN INFLUENCE TAB
   ═══════════════════════════════════════════ */

const InfluenceTabNew = ({ entries }: InfluenceTabNewProps) => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [postStats, setPostStats] = useState<PostStats | null>(null);
  const [authorityThemes, setAuthorityThemes] = useState<AuthorityTheme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [snapshotRes, postsRes] = await Promise.all([
        supabase.from("influence_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(1),
        supabase.from("linkedin_posts").select("theme, tone, format_type, engagement_score").order("published_at", { ascending: false }).limit(200),
      ]);

      const snap = snapshotRes.data?.[0] || null;
      setSnapshot(snap);

      // Process post stats
      const posts = postsRes.data || [];
      const themeCounts: Record<string, number> = {};
      const formatCounts: Record<string, number> = {};
      posts.forEach((p: any) => {
        if (p.theme) themeCounts[p.theme] = (themeCounts[p.theme] || 0) + 1;
        if (p.format_type) formatCounts[p.format_type] = (formatCounts[p.format_type] || 0) + 1;
      });
      const themes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([theme, count]) => ({ theme, count }));
      const formats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([format, count]) => ({ format, count }));
      const avgEng = posts.length > 0
        ? Math.round(posts.reduce((s: number, p: any) => s + (Number(p.engagement_score) || 0), 0) / posts.length * 10) / 10
        : Number(snap?.engagement_rate) || 0;

      setPostStats({
        postCount: posts.length,
        avgEngagement: avgEng,
        topTheme: themes[0]?.theme || snap?.top_topic || "—",
        topFormat: snap?.top_format || formats[0]?.format || "—",
        themes,
        formats,
      });

      // Authority themes from snapshot
      const rawThemes = (snap?.authority_themes || []) as any[];
      setAuthorityThemes(
        rawThemes.slice(0, 6).map((t: any) => ({
          theme: typeof t === "string" ? t : t.theme || t.name || "Unknown",
          strength: t.strength || "Medium",
          trend: t.trend || "Stable",
        }))
      );
    } catch (err) {
      console.error("Influence load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PageHeader
        icon={TrendingUp}
        title="Influence"
        question="Is your authority turning into audience growth?"
        processLogic="Signal → Content → Audience → Growth"
      />

      {/* Strategic Advisor — influence context */}
      <StrategicAdvisorPanel context="influence" compact />

      {/* Flow: Audience → Content Performance → Authority Growth */}
      <Section index={0}>
        <AudienceSection snapshot={snapshot} />
      </Section>

      {/* Flow arrow */}
      <div className="flex justify-center">
        <div className="w-px h-6 bg-gradient-to-b from-primary/20 to-primary/5" />
      </div>

      <Section index={1}>
        <ContentPerformanceSection stats={postStats} />
      </Section>

      <div className="flex justify-center">
        <div className="w-px h-6 bg-gradient-to-b from-primary/20 to-primary/5" />
      </div>

      <Section index={2}>
        <AuthorityGrowthSection snapshot={snapshot} themes={authorityThemes} />
      </Section>
    </div>
  );
};

export default InfluenceTabNew;
