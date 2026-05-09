import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Zap, Lightbulb, Layers, Crown, TrendingUp,
  ChevronRight, ChevronDown, Loader2, ArrowRight, X,
  FileText, MessageSquare, BarChart3, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

/* ── Types ── */
interface StageData {
  key: string;
  label: string;
  icon: React.ElementType;
  count: number;
  items: any[];
  color: string;
  glowColor: string;
}

interface EvolutionMapProps {
  onOpenChat?: (msg: string) => void;
}

const StrategicEvolutionMap = ({ onOpenChat }: EvolutionMapProps) => {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageData[]>([]);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [pulseStage, setPulseStage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [entriesRes, signalsRes, intelligenceRes, frameworksRes, activationsRes, snapshotsRes] = await Promise.all([
        supabase.from("entries").select("id, title, type, skill_pillar, created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("strategic_signals").select("id, signal_title, confidence, theme_tags, fragment_count, created_at").eq("status", "active").order("confidence", { ascending: false }).limit(20),
        supabase.from("learned_intelligence").select("id, title, intelligence_type, skill_pillars, created_at").order("created_at", { ascending: false }).limit(30),
        supabase.from("master_frameworks").select("id, title, tags, summary, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("framework_activations").select("id, title, output_type, created_at").order("created_at", { ascending: false }).limit(20),
        (supabase.from("influence_snapshots" as any) as any).select("id, followers, follower_growth, engagement_rate, authority_themes, snapshot_date").order("snapshot_date", { ascending: false }).limit(5),
      ]);

      setStages([
        {
          key: "capture", label: "Capture", icon: BookOpen,
          count: entriesRes.data?.length || 0,
          items: (entriesRes.data || []).slice(0, 8),
          color: "text-violet-400", glowColor: "shadow-violet-500/20",
        },
        {
          key: "signals", label: "Signals", icon: Zap,
          count: signalsRes.data?.length || 0,
          items: (signalsRes.data || []).slice(0, 8),
          color: "text-amber-400", glowColor: "shadow-amber-500/20",
        },
        {
          key: "insights", label: "Insights", icon: Lightbulb,
          count: intelligenceRes.data?.length || 0,
          items: (intelligenceRes.data || []).slice(0, 8),
          color: "text-cyan-400", glowColor: "shadow-cyan-500/20",
        },
        {
          key: "frameworks", label: "Frameworks", icon: Layers,
          count: frameworksRes.data?.length || 0,
          items: (frameworksRes.data || []).slice(0, 8),
          color: "text-blue-400", glowColor: "shadow-blue-500/20",
        },
        {
          key: "authority", label: "Authority", icon: Crown,
          count: activationsRes.data?.length || 0,
          items: (activationsRes.data || []).slice(0, 8),
          color: "text-primary", glowColor: "shadow-primary/20",
        },
        {
          key: "influence", label: "Influence", icon: TrendingUp,
          count: snapshotsRes.data?.length || 0,
          items: (snapshotsRes.data || []).slice(0, 5),
          color: "text-emerald-400", glowColor: "shadow-emerald-500/20",
        },
      ]);
    } catch (e) {
      console.error("Evolution map error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Simulate pulse animation on load
  useEffect(() => {
    if (!loading && stages.length > 0) {
      const keys = stages.map(s => s.key);
      let i = 0;
      const interval = setInterval(() => {
        setPulseStage(keys[i]);
        i++;
        if (i >= keys.length) clearInterval(interval);
      }, 300);
      const cleanup = setTimeout(() => setPulseStage(null), 2500);
      return () => { clearInterval(interval); clearTimeout(cleanup); };
    }
  }, [loading, stages]);

  const renderItemDetail = (stage: StageData, item: any) => {
    switch (stage.key) {
      case "capture":
        return (
          <div className="flex items-center gap-2">
            <FileText className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            <span className="text-[11px] text-foreground/80 truncate">{item.title || "Untitled capture"}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">{item.type}</span>
          </div>
        );
      case "signals":
        return (
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-amber-400/60 shrink-0" />
            <span className="text-[11px] text-foreground/80 truncate">{item.signal_title}</span>
            <span className="ml-auto text-[9px] text-emerald-400/70 tabular-nums shrink-0">{Math.round((item.confidence || 0.7) * 100)}%</span>
          </div>
        );
      case "insights":
        return (
          <div className="flex items-center gap-2">
            <Lightbulb className="w-3 h-3 text-cyan-400/60 shrink-0" />
            <span className="text-[11px] text-foreground/80 truncate">{item.title}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">{item.intelligence_type}</span>
          </div>
        );
      case "frameworks":
        return (
          <div className="flex items-center gap-2">
            <Layers className="w-3 h-3 text-blue-400/60 shrink-0" />
            <span className="text-[11px] text-foreground/80 truncate">{item.title}</span>
          </div>
        );
      case "authority":
        return (
          <div className="flex items-center gap-2">
            <Crown className="w-3 h-3 text-primary/60 shrink-0" />
            <span className="text-[11px] text-foreground/80 truncate">{item.title}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">{item.output_type}</span>
          </div>
        );
      case "influence":
        return (
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3 h-3 text-emerald-400/60 shrink-0" />
            <span className="text-[11px] text-foreground/80">{item.followers?.toLocaleString()} followers</span>
            {item.follower_growth > 0 && (
              <span className="text-[9px] text-emerald-400">+{item.follower_growth}</span>
            )}
            <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">{item.snapshot_date}</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-12 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
        <span className="text-sm text-muted-foreground/60">Loading evolution map…</span>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Strategic Evolution Map
          </h2>
          <p className="text-[10px] text-muted-foreground/50 tracking-wide">
            Knowledge → Strategy → Authority → Influence
          </p>
        </div>
      </div>

      {/* Horizontal Pipeline */}
      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-[44px] left-[40px] right-[40px] h-[2px] bg-gradient-to-r from-violet-500/30 via-primary/20 to-emerald-500/30 hidden sm:block" />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-2">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const isExpanded = expandedStage === stage.key;
            const isPulsing = pulseStage === stage.key;

            return (
              <button
                key={stage.key}
                onClick={() => setExpandedStage(isExpanded ? null : stage.key)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-500 tactile-press group ${
                  isExpanded
                    ? `bg-secondary/40 border-primary/20 ${stage.glowColor} shadow-lg`
                    : "bg-secondary/15 border-border/10 hover:border-primary/10 hover:bg-secondary/25"
                } ${isPulsing ? "scale-105" : ""}`}
              >
                {/* Node */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-500 ${
                  isExpanded
                    ? "bg-primary/15 border-primary/30 shadow-lg shadow-primary/10"
                    : "bg-secondary/30 border-border/15 group-hover:border-primary/15"
                } ${isPulsing ? "animate-ring-pulse" : ""}`}>
                  <Icon className={`w-5 h-5 transition-colors duration-300 ${isExpanded ? stage.color : "text-muted-foreground/50 group-hover:text-foreground/70"}`} />
                </div>

                {/* Label & Count */}
                <span className={`text-[11px] font-semibold transition-colors ${isExpanded ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {stage.label}
                </span>
                <span className={`text-lg font-bold tabular-nums transition-colors ${isExpanded ? stage.color : "text-foreground/80"}`}>
                  {stage.count}
                </span>

                {/* Expand indicator */}
                <div className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/30" />
                </div>

                {/* Arrow connector (mobile hidden) */}
                {i < stages.length - 1 && (
                  <div className="absolute -right-2 top-[44px] hidden lg:block z-10">
                    <ArrowRight className={`w-3.5 h-3.5 transition-colors duration-500 ${isPulsing ? stage.color : "text-muted-foreground/20"}`} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {expandedStage && (() => {
        const stage = stages.find(s => s.key === expandedStage);
        if (!stage) return null;
        const Icon = stage.icon;

        return (
          <div className="animate-fade-in rounded-2xl border border-primary/10 bg-secondary/15 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${stage.color}`} />
                <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
                <span className="text-[10px] text-muted-foreground/40">({stage.count} items)</span>
              </div>
              <button onClick={() => setExpandedStage(null)} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {stage.items.length > 0 ? (
              <div className="space-y-2">
                {stage.items.map((item: any, idx: number) => (
                  <div
                    key={item.id || idx}
                    className="p-3 rounded-xl bg-card/40 border border-border/10 hover:border-primary/10 transition-all duration-300"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    {renderItemDetail(stage, item)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Icon className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/40">No {stage.label.toLowerCase()} yet. Paste a link → to start building your pipeline.</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Pipeline Summary */}
      <div className="flex items-center justify-center gap-2 pt-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold border transition-all ${
              s.count > 0 ? `${s.color} bg-secondary/30 border-border/15` : "text-muted-foreground/30 bg-secondary/10 border-border/5"
            }`}>
              {s.count}
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className={`w-3 h-3 ${s.count > 0 ? "text-muted-foreground/30" : "text-muted-foreground/15"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategicEvolutionMap;
