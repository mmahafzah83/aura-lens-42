import { useState, useEffect } from "react";
import {
  Compass, TrendingUp, Sparkles, Crown, Users,
  ArrowUpRight, ChevronRight, Zap, Target, BookOpen,
  BarChart3, Layers, Globe, Loader2, ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */
interface CommandData {
  // Identity Snapshot
  primaryExpertise: string;
  authorityTheme: string;
  strategicFocus: string;
  // Emerging Signal
  emergingSignal: string;
  emergingSignalDetail: string;
  // Recommended Move
  recommendedMove: string;
  moveRationale: string;
  // Development Metrics
  insightCount: number;
  frameworkCount: number;
  signalCount: number;
  // Opportunities
  opportunities: Array<{ title: string; type: "framework" | "authority" | "market"; detail: string }>;
  // Market Signals
  marketSignals: Array<{ title: string; confidence: number }>;
  // Top Themes
  topThemes: string[];
}

const EMPTY: CommandData = {
  primaryExpertise: "—",
  authorityTheme: "—",
  strategicFocus: "—",
  emergingSignal: "—",
  emergingSignalDetail: "",
  recommendedMove: "Capture more insights to generate recommendations.",
  moveRationale: "",
  insightCount: 0,
  frameworkCount: 0,
  signalCount: 0,
  opportunities: [],
  marketSignals: [],
  topThemes: [],
};

/* ── Sub-components ── */

const IdentityCard = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-2">
    <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">{label}</p>
    <p className="text-base font-semibold text-foreground leading-snug" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
      {value}
    </p>
  </div>
);

const MetricBlock = ({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) => (
  <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-secondary/10 border border-border/8">
    <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center border border-primary/10">
      <Icon className="w-4.5 h-4.5 text-primary/70" />
    </div>
    <p className="text-3xl font-light text-foreground tracking-tight tabular-nums">{value}</p>
    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-[0.18em]">{label}</p>
  </div>
);

const OpportunityRow = ({ title, type, detail }: { title: string; type: string; detail: string }) => {
  const icons = { framework: BookOpen, authority: Crown, market: Globe };
  const colors = { framework: "text-blue-400", authority: "text-primary", market: "text-emerald-400" };
  const Icon = icons[type as keyof typeof icons] || Zap;
  const color = colors[type as keyof typeof colors] || "text-primary";

  return (
    <div className="flex items-start gap-3.5 p-4 rounded-xl bg-secondary/10 border border-border/8 hover:border-primary/15 transition-all group">
      <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 border border-primary/10 group-hover:scale-105 transition-transform">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
        <p className="text-[11px] text-muted-foreground/50 mt-1 line-clamp-2">{detail}</p>
      </div>
      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground/40 border border-border/10 capitalize shrink-0 mt-0.5">
        {type}
      </span>
    </div>
  );
};

const SignalRow = ({ title, confidence }: { title: string; confidence: number }) => (
  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary/10 border border-border/8">
    <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
      <Globe className="w-3 h-3 text-emerald-400" />
    </div>
    <p className="text-xs font-medium text-foreground/80 flex-1 line-clamp-1">{title}</p>
    <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0">{Math.round(confidence * 100)}%</span>
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
      const [signalsRes, frameworksRes, intelligenceRes, suggestionsRes, profileRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, theme_tags, framework_opportunity, content_opportunity, consulting_opportunity, explanation, strategic_implications").eq("status", "active").order("confidence", { ascending: false }).limit(10),
        supabase.from("master_frameworks").select("title, tags, created_at").order("created_at", { ascending: false }).limit(10),
        supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars").order("created_at", { ascending: false }).limit(50),
        supabase.from("narrative_suggestions").select("topic, recommended_format, reason, angle").eq("status", "suggested").limit(5),
        (supabase.from("diagnostic_profiles" as any) as any).select("core_practice, sector_focus, brand_pillars, identity_intelligence, north_star_goal").maybeSingle(),
      ]);

      const signals = signalsRes.data || [];
      const frameworks = frameworksRes.data || [];
      const intelligence = intelligenceRes.data || [];
      const suggestions = suggestionsRes.data || [];
      const profile = profileRes.data;

      // Identity snapshot from profile
      const identity = profile?.identity_intelligence || {};
      const primaryExpertise = identity.primary_role || profile?.core_practice || "—";
      const strategicFocus = profile?.sector_focus || identity.industries?.[0] || "—";

      // Derive themes
      const themeCounts: Record<string, number> = {};
      signals.forEach((s: any) => {
        (s.theme_tags || []).forEach((t: string) => {
          themeCounts[t] = (themeCounts[t] || 0) + 1;
        });
      });
      const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
      const authorityTheme = identity.authority_themes?.[0]?.theme || sortedThemes[0]?.[0] || (profile?.brand_pillars?.[0]) || "—";

      // Emerging signal
      const topSignal = signals[0] as any;
      const emergingSignal = topSignal?.signal_title || "—";
      const emergingSignalDetail = topSignal?.explanation?.substring(0, 200) || "";

      // Recommended move
      let recommendedMove = "Capture more insights to generate recommendations.";
      let moveRationale = "";
      if (suggestions.length > 0) {
        const top = suggestions[0] as any;
        recommendedMove = `${top.recommended_format === "carousel" ? "Publish carousel" : top.recommended_format === "post" ? "Draft LinkedIn post" : "Create"}: ${top.topic}`;
        moveRationale = top.reason || top.angle || "";
      } else if (topSignal?.framework_opportunity) {
        const fo = topSignal.framework_opportunity as any;
        recommendedMove = fo.title ? `Build framework: ${fo.title}` : "Explore your strongest signal and develop a framework.";
        moveRationale = fo.description || topSignal.strategic_implications?.substring(0, 150) || "";
      }

      // Opportunities
      const opportunities: CommandData["opportunities"] = [];
      signals.slice(0, 3).forEach((s: any) => {
        if (s.framework_opportunity?.title) {
          opportunities.push({ title: s.framework_opportunity.title, type: "framework", detail: s.framework_opportunity.description || s.strategic_implications?.substring(0, 120) || "" });
        }
        if (s.content_opportunity?.title) {
          opportunities.push({ title: s.content_opportunity.title, type: "authority", detail: s.content_opportunity.description || "" });
        }
      });
      suggestions.slice(0, 2).forEach((s: any) => {
        if (!opportunities.find(o => o.title === s.topic)) {
          opportunities.push({ title: s.topic, type: "authority", detail: s.reason || s.angle || "" });
        }
      });

      // Market signals
      const marketSignals = signals.slice(0, 5).map((s: any) => ({
        title: s.signal_title,
        confidence: Number(s.confidence) || 0.7,
      }));

      setData({
        primaryExpertise,
        authorityTheme,
        strategicFocus,
        emergingSignal,
        emergingSignalDetail,
        recommendedMove,
        moveRationale,
        insightCount: intelligence.length,
        frameworkCount: frameworks.length,
        signalCount: signals.length,
        opportunities: opportunities.slice(0, 4),
        marketSignals,
        topThemes: sortedThemes.slice(0, 6).map(([t]) => t),
      });
    } catch (err) {
      console.error("Command center load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-16 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Compass className="w-8 h-8 text-primary/40 animate-spin" />
          <span className="text-sm text-muted-foreground/40">Loading Strategic Command…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
          <Compass className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Strategic Command
          </h2>
          <p className="text-[10px] text-muted-foreground/40 tracking-wide">Your daily strategic briefing</p>
        </div>
      </div>

      {/* ── Strategic Identity Snapshot ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-primary/8">
        <p className="text-[9px] font-semibold text-primary/60 uppercase tracking-[0.2em] mb-5">Strategic Identity</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <IdentityCard label="Primary Expertise" value={data.primaryExpertise} />
          <IdentityCard label="Authority Theme" value={data.authorityTheme} />
          <IdentityCard label="Strategic Focus" value={data.strategicFocus} />
        </div>
      </div>

      {/* ── Emerging Signal + Recommended Move ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Emerging Signal */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-amber-400" />
            <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Emerging Signal</p>
          </div>
          <p className="text-base font-semibold text-foreground leading-snug mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {data.emergingSignal}
          </p>
          {data.emergingSignalDetail && (
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed line-clamp-3">{data.emergingSignalDetail}</p>
          )}
        </div>

        {/* Recommended Move */}
        <div className="glass-card rounded-2xl p-6 border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="w-4 h-4 text-primary" />
            <p className="text-[9px] font-semibold text-primary/60 uppercase tracking-[0.2em]">Recommended Move</p>
          </div>
          <p className="text-base font-semibold text-foreground leading-snug mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {data.recommendedMove}
          </p>
          {data.moveRationale && (
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed line-clamp-3">{data.moveRationale}</p>
          )}
        </div>
      </div>

      {/* ── Strategic Development ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Layers className="w-4 h-4 text-primary/60" />
          <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Strategic Development</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricBlock value={data.insightCount} label="Insights" icon={Sparkles} />
          <MetricBlock value={data.frameworkCount} label="Frameworks" icon={BookOpen} />
          <MetricBlock value={data.signalCount} label="Signals" icon={Zap} />
        </div>

        {data.topThemes.length > 0 && (
          <div className="pt-5 border-t border-border/8">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-3">Emerging Themes</p>
            <div className="flex flex-wrap gap-2">
              {data.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="text-[10px] font-medium px-3 py-1.5 rounded-full bg-primary/8 text-primary/70 border border-primary/10"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Strategic Opportunities ── */}
      {data.opportunities.length > 0 && (
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-5">
            <Target className="w-4 h-4 text-primary/60" />
            <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Strategic Opportunities</p>
          </div>
          <div className="space-y-3">
            {data.opportunities.map((opp, i) => (
              <OpportunityRow key={i} {...opp} />
            ))}
          </div>
        </div>
      )}

      {/* ── Market Signals ── */}
      {data.marketSignals.length > 0 && (
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-5">
            <Globe className="w-4 h-4 text-emerald-400/60" />
            <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Market Signals</p>
          </div>
          <div className="space-y-2">
            {data.marketSignals.map((s, i) => (
              <SignalRow key={i} {...s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategicCommandCenter;
