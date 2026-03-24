import { useState, useEffect } from "react";
import {
  Compass, TrendingUp, Sparkles, Crown, Users,
  ArrowUpRight, ChevronRight, Zap, Target, BookOpen,
  BarChart3, Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

/* ── Types ── */
interface SignalSummary {
  title: string;
  confidence: number;
}

interface FrameworkSummary {
  title: string;
  tags: string[];
}

interface CommandData {
  // Strategic Snapshot
  primaryTheme: string;
  emergingSignal: string;
  recommendedMove: string;
  // Development
  insightCount: number;
  frameworkCount: number;
  signalCount: number;
  topThemes: string[];
  // Authority
  contentCreated: number;
  authorityThemes: string[];
  narrativeScore: number;
  // Opportunities
  topSignals: SignalSummary[];
  recentFrameworks: FrameworkSummary[];
}

const EMPTY: CommandData = {
  primaryTheme: "—",
  emergingSignal: "—",
  recommendedMove: "Capture more insights to generate recommendations.",
  insightCount: 0,
  frameworkCount: 0,
  signalCount: 0,
  topThemes: [],
  contentCreated: 0,
  authorityThemes: [],
  narrativeScore: 0,
  topSignals: [],
  recentFrameworks: [],
};

/* ── Sub-components ── */
const SnapshotCard = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="p-4 rounded-xl bg-secondary/15 border border-border/10 space-y-1.5">
    <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">{label}</p>
    <p className={`text-sm font-semibold leading-snug ${accent ? "text-primary" : "text-foreground"}`}>
      {value}
    </p>
  </div>
);

const MetricRing = ({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative w-16 h-16 rounded-full border-2 border-border/15 flex items-center justify-center">
      <span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center border border-primary/15">
        <Icon className="w-2.5 h-2.5 text-primary" />
      </div>
    </div>
    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest text-center">{label}</span>
  </div>
);

const OpportunityCard = ({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: React.ElementType }) => (
  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-secondary/10 border border-border/8 hover:border-primary/15 transition-all group">
    <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 border border-primary/10 group-hover:scale-105 transition-transform">
      <Icon className="w-3.5 h-3.5 text-primary/70" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-foreground leading-snug">{title}</p>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5 line-clamp-1">{subtitle}</p>
    </div>
    <ChevronRight className="w-3 h-3 text-muted-foreground/20 shrink-0 mt-1 group-hover:text-primary/40 transition-colors" />
  </div>
);

/* ── Main Component ── */
const StrategicCommandCenter = () => {
  const [data, setData] = useState<CommandData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommandData();
  }, []);

  const loadCommandData = async () => {
    try {
      const [signalsRes, frameworksRes, intelligenceRes, entriesRes, suggestionsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, theme_tags, framework_opportunity, content_opportunity, consulting_opportunity").eq("status", "active").order("confidence", { ascending: false }).limit(10),
        supabase.from("master_frameworks").select("title, tags, created_at").order("created_at", { ascending: false }).limit(10),
        supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars").order("created_at", { ascending: false }).limit(50),
        supabase.from("entries").select("type, skill_pillar, has_strategic_insight, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("narrative_suggestions").select("topic, recommended_format, reason").eq("status", "suggested").limit(5),
      ]);

      const signals = signalsRes.data || [];
      const frameworks = frameworksRes.data || [];
      const intelligence = intelligenceRes.data || [];
      const entries = entriesRes.data || [];
      const suggestions = suggestionsRes.data || [];

      // Derive themes from signals
      const themeCounts: Record<string, number> = {};
      signals.forEach((s: any) => {
        (s.theme_tags || []).forEach((t: string) => {
          themeCounts[t] = (themeCounts[t] || 0) + 1;
        });
      });
      const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
      const primaryTheme = sortedThemes[0]?.[0] || (signals[0] as any)?.signal_title || "—";
      const emergingSignal = signals[1]?.signal_title || signals[0]?.signal_title || "—";

      // Recommended move
      let recommendedMove = "Capture more insights to generate recommendations.";
      if (suggestions.length > 0) {
        const top = suggestions[0] as any;
        recommendedMove = `${top.recommended_format === "carousel" ? "Publish" : "Create"} ${top.recommended_format}: ${top.topic}`;
      } else if (signals.length > 0 && (signals[0] as any).framework_opportunity) {
        const fo = (signals[0] as any).framework_opportunity as any;
        recommendedMove = fo.title ? `Build framework: ${fo.title}` : "Explore your strongest signal and build a framework.";
      }

      // Authority themes from frameworks
      const authorityThemes = [...new Set(frameworks.flatMap((f: any) => f.tags || []))].slice(0, 5);

      // Content created (entries that are posts/carousels)
      const contentCreated = entries.filter((e: any) => e.type === "post" || e.type === "carousel" || e.type === "essay").length;

      // Narrative consistency score (simple heuristic: theme overlap)
      const narrativeScore = Math.min(100, Math.round((authorityThemes.length / Math.max(sortedThemes.length, 1)) * 100 + frameworks.length * 5));

      // Opportunities
      const topSignals: SignalSummary[] = signals.slice(0, 4).map((s: any) => ({
        title: s.signal_title,
        confidence: Number(s.confidence) || 0.7,
      }));

      const recentFrameworks: FrameworkSummary[] = frameworks.slice(0, 3).map((f: any) => ({
        title: f.title,
        tags: f.tags || [],
      }));

      setData({
        primaryTheme,
        emergingSignal,
        recommendedMove,
        insightCount: intelligence.length,
        frameworkCount: frameworks.length,
        signalCount: signals.length,
        topThemes: sortedThemes.slice(0, 5).map(([t]) => t),
        contentCreated,
        authorityThemes,
        narrativeScore,
        topSignals,
        recentFrameworks,
      });
    } catch (err) {
      console.error("Command center load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-10 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Compass className="w-5 h-5 text-primary/60 animate-spin" />
          <span className="text-sm text-muted-foreground/60">Loading command center…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Strategic Snapshot ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Compass className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h2
              className="text-lg font-bold text-foreground tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Strategic Command
            </h2>
            <p className="text-[10px] text-muted-foreground/40 tracking-wide">Your daily strategic snapshot</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SnapshotCard label="Primary Theme" value={data.primaryTheme} accent />
          <SnapshotCard label="Emerging Signal" value={data.emergingSignal} />
          <SnapshotCard label="Recommended Move" value={data.recommendedMove} />
        </div>
      </div>

      {/* ── Strategic Development ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Layers className="w-4 h-4 text-primary/60" />
          <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Strategic Development</p>
        </div>

        <div className="flex items-center justify-center gap-8 sm:gap-12 mb-6">
          <MetricRing value={data.insightCount} label="Insights" icon={Sparkles} />
          <MetricRing value={data.frameworkCount} label="Frameworks" icon={BookOpen} />
          <MetricRing value={data.signalCount} label="Signals" icon={Zap} />
        </div>

        {data.topThemes.length > 0 && (
          <div className="pt-4 border-t border-border/8">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2.5">Emerging Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {data.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/8 text-primary/70 border border-primary/10"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Authority + Influence Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Authority Progress */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Crown className="w-4 h-4 text-primary/60" />
            <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Authority Progress</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground/50">Content Created</span>
                <span className="text-xs font-bold text-foreground tabular-nums">{data.contentCreated}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground/50">Narrative Consistency</span>
                <span className="text-xs font-bold text-foreground tabular-nums">{data.narrativeScore}%</span>
              </div>
              <Progress value={data.narrativeScore} className="h-1.5" />
            </div>
            {data.authorityThemes.length > 0 && (
              <div className="pt-3 border-t border-border/8">
                <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2">Authority Themes</p>
                <div className="flex flex-wrap gap-1">
                  {data.authorityThemes.slice(0, 4).map((t) => (
                    <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground/60 border border-border/10">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Influence Signals (simulated) */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users className="w-4 h-4 text-primary/60" />
            <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Influence Signals</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-foreground/80">+312 followers</span>
              <span className="text-[10px] text-muted-foreground/40">last 30d</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-xs text-foreground/80">8.4% avg engagement</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-foreground/80">Top: Framework posts</span>
            </div>
            <p className="text-[9px] text-muted-foreground/30 italic pt-1">Simulated data</p>
          </div>
        </div>
      </div>

      {/* ── Strategic Opportunities ── */}
      {(data.topSignals.length > 0 || data.recentFrameworks.length > 0) && (
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-5">
            <Target className="w-4 h-4 text-primary/60" />
            <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Strategic Opportunities</p>
          </div>

          <div className="space-y-2.5">
            {data.topSignals.slice(0, 3).map((s, i) => (
              <OpportunityCard
                key={i}
                title={s.title}
                subtitle={`Confidence: ${Math.round(s.confidence * 100)}%`}
                icon={Zap}
              />
            ))}
            {data.recentFrameworks.slice(0, 2).map((f, i) => (
              <OpportunityCard
                key={`fw-${i}`}
                title={f.title}
                subtitle={f.tags.slice(0, 3).join(" · ") || "Framework in development"}
                icon={BookOpen}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategicCommandCenter;
