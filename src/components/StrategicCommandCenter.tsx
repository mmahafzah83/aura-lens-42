import { useState, useEffect } from "react";
import {
  Compass, TrendingUp, Sparkles, Crown, Users,
  ArrowUpRight, ChevronRight, Zap, Target, BookOpen,
  BarChart3, Layers, Globe, Loader2, ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */
interface CommandData {
  primaryExpertise: string;
  authorityTheme: string;
  strategicFocus: string;
  emergingSignal: string;
  emergingSignalDetail: string;
  recommendedMove: string;
  moveRationale: string;
  insightCount: number;
  frameworkCount: number;
  signalCount: number;
  opportunities: Array<{ title: string; type: "framework" | "authority" | "market"; detail: string }>;
  marketSignals: Array<{ title: string; confidence: number }>;
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
    <p className="text-label">{label}</p>
    <p className="text-card-title text-foreground">{value}</p>
  </div>
);

const MetricBlock = ({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) => (
  <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-secondary/10 border border-border/8">
    <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center border border-primary/10">
      <Icon className="w-5 h-5 text-primary/70" />
    </div>
    <p className="text-metric text-foreground">{value}</p>
    <p className="text-label">{label}</p>
  </div>
);

const OpportunityRow = ({ title, type, detail }: { title: string; type: string; detail: string }) => {
  const icons = { framework: BookOpen, authority: Crown, market: Globe };
  const colors = { framework: "text-blue-400", authority: "text-primary", market: "text-emerald-400" };
  const Icon = icons[type as keyof typeof icons] || Zap;
  const color = colors[type as keyof typeof colors] || "text-primary";

  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-secondary/10 border border-border/8 hover:border-primary/15 transition-all group">
      <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 border border-primary/10 group-hover:scale-105 transition-transform">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-foreground leading-snug">{title}</p>
        <p className="text-meta mt-1 line-clamp-2">{detail}</p>
      </div>
      <span className="text-meta font-medium px-3 py-1 rounded-full bg-secondary/30 border border-border/10 capitalize shrink-0 mt-0.5">
        {type}
      </span>
    </div>
  );
};

const SignalRow = ({ title, confidence }: { title: string; confidence: number }) => (
  <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/10 border border-border/8">
    <div className="w-8 h-8 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
      <Globe className="w-4 h-4 text-emerald-400" />
    </div>
    <p className="text-body text-foreground/80 flex-1 line-clamp-1">{title}</p>
    <span className="text-meta tabular-nums shrink-0">{Math.round(confidence * 100)}%</span>
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

      const identity = profile?.identity_intelligence || {};
      const primaryExpertise = identity.primary_role || profile?.core_practice || "—";
      const strategicFocus = profile?.sector_focus || identity.industries?.[0] || "—";

      const themeCounts: Record<string, number> = {};
      signals.forEach((s: any) => {
        (s.theme_tags || []).forEach((t: string) => {
          themeCounts[t] = (themeCounts[t] || 0) + 1;
        });
      });
      const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
      const authorityTheme = identity.authority_themes?.[0]?.theme || sortedThemes[0]?.[0] || (profile?.brand_pillars?.[0]) || "—";

      const topSignal = signals[0] as any;
      const emergingSignal = topSignal?.signal_title || "—";
      const emergingSignalDetail = topSignal?.explanation?.substring(0, 200) || "";

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
      <div className="glass-card rounded-2xl card-pad flex items-center justify-center" style={{ padding: 64 }}>
        <div className="flex flex-col items-center gap-4">
          <Compass className="w-8 h-8 text-primary/40 animate-spin" />
          <span className="text-meta">Loading Strategic Command…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
          <Compass className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-section-title text-foreground tracking-tight">
            Strategic Command
          </h2>
          <p className="text-meta">Your daily strategic briefing</p>
        </div>
      </div>

      {/* ── Strategic Identity Snapshot ── */}
      <div className="glass-card rounded-2xl card-pad border border-primary/8">
        <p className="text-label text-primary/60 mb-6">Strategic Identity</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <IdentityCard label="Primary Expertise" value={data.primaryExpertise} />
          <IdentityCard label="Authority Theme" value={data.authorityTheme} />
          <IdentityCard label="Strategic Focus" value={data.strategicFocus} />
        </div>
      </div>

      {/* ── Emerging Signal + Recommended Move ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl card-pad">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-400" />
            <p className="text-label">Emerging Signal</p>
          </div>
          <p className="text-card-title text-foreground mb-3">
            {data.emergingSignal}
          </p>
          {data.emergingSignalDetail && (
            <p className="text-meta leading-relaxed line-clamp-3">{data.emergingSignalDetail}</p>
          )}
        </div>

        <div className="glass-card rounded-2xl card-pad border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="w-5 h-5 text-primary" />
            <p className="text-label text-primary/60">Recommended Move</p>
          </div>
          <p className="text-card-title text-foreground mb-3">
            {data.recommendedMove}
          </p>
          {data.moveRationale && (
            <p className="text-meta leading-relaxed line-clamp-3">{data.moveRationale}</p>
          )}
        </div>
      </div>

      {/* ── Strategic Development ── */}
      <div className="glass-card rounded-2xl card-pad">
        <div className="flex items-center gap-2 mb-6">
          <Layers className="w-5 h-5 text-primary/60" />
          <p className="text-label">Strategic Development</p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <MetricBlock value={data.insightCount} label="Insights" icon={Sparkles} />
          <MetricBlock value={data.frameworkCount} label="Frameworks" icon={BookOpen} />
          <MetricBlock value={data.signalCount} label="Signals" icon={Zap} />
        </div>

        {data.topThemes.length > 0 && (
          <div className="pt-6 border-t border-border/8">
            <p className="text-label mb-4">Emerging Themes</p>
            <div className="flex flex-wrap gap-3">
              {data.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="text-meta font-medium px-4 py-2 rounded-full bg-primary/8 text-primary/70 border border-primary/10"
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
        <div className="glass-card rounded-2xl card-pad">
          <div className="flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-primary/60" />
            <p className="text-label">Strategic Opportunities</p>
          </div>
          <div className="space-y-4">
            {data.opportunities.map((opp, i) => (
              <OpportunityRow key={i} {...opp} />
            ))}
          </div>
        </div>
      )}

      {/* ── Market Signals ── */}
      {data.marketSignals.length > 0 && (
        <div className="glass-card rounded-2xl card-pad">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-emerald-400/60" />
            <p className="text-label">Market Signals</p>
          </div>
          <div className="space-y-3">
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
