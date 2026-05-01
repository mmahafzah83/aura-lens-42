import { useState, useEffect } from "react";
import {
  Sparkles, Target, Crown, Globe, ArrowRight, Loader2,
  Check, X, FileText, MessageCircle, RefreshCw, Briefcase
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ── Types ── */
interface Recommendation {
  id: string;
  type: "strategic" | "authority" | "consulting";
  title: string;
  rationale: string;
  recommendedMove: string;
  confidence: number;
  dismissed: boolean;
}

interface DailyBrief {
  signal: string;
  opportunity: string;
  action: string;
}

const TYPE_CONFIG = {
  strategic: { icon: Target, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/15", label: "Strategic" },
  authority: { icon: Crown, color: "text-primary", bg: "bg-primary/8", border: "border-primary/15", label: "Authority" },
  consulting: { icon: Briefcase, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/15", label: "Consulting" },
};

/* ── Recommendation Card ── */
const RecommendationCard = ({
  rec, onAccept, onDismiss, onConvert,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onDismiss: () => void;
  onConvert: (type: "task" | "content") => void;
}) => {
  const config = TYPE_CONFIG[rec.type];
  const Icon = config.icon;

  return (
    <div className={`glass-card rounded-xl p-5 border ${config.border} hover:border-primary/20 transition-all group relative overflow-hidden animate-fade-in`}>
      {/* Glow */}
      <div className={`absolute top-0 right-0 w-20 h-20 ${config.bg} rounded-full blur-2xl -translate-y-4 translate-x-4 opacity-60`} />

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center border ${config.border}`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <span className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${config.color}`}>
              {config.label} Opportunity
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground/50 tabular-nums">
            {Math.round(rec.confidence * 100)}%
          </span>
        </div>

        {/* Title */}
        <h4
          className="text-base font-semibold text-foreground leading-snug"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {rec.title}
        </h4>

        {/* Rationale */}
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{rec.rationale}</p>

        {/* Recommended Move */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/[0.04] border border-primary/8">
          <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-foreground/80 leading-relaxed">{rec.recommendedMove}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 hover:bg-primary/12"
          >
            <Check className="w-3 h-3" /> Accept
          </button>
          <button
            onClick={() => onConvert("content")}
            className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg bg-secondary/20 border border-border/10 hover:bg-secondary/30"
          >
            <FileText className="w-3 h-3" /> Create Content
          </button>
          <button
            onClick={onDismiss}
            className="ml-auto text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors p-1.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Daily Brief Card ── */
const DailyBriefCard = ({ brief }: { brief: DailyBrief }) => (
  <div className="glass-card rounded-2xl p-6 border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent">
    <div className="flex items-center gap-2 mb-5">
      <Sparkles className="w-4 h-4 text-primary" />
      <p className="text-[9px] font-semibold text-primary/60 uppercase tracking-[0.2em]">Today's Strategic Brief</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {[
        { label: "Signal", value: brief.signal, icon: Globe, color: "text-amber-400" },
        { label: "Opportunity", value: brief.opportunity, icon: Target, color: "text-blue-400" },
        { label: "Action", value: brief.action, icon: ArrowRight, color: "text-primary" },
      ].map(({ label, value, icon: I, color }) => (
        <div key={label} className="space-y-2">
          <div className="flex items-center gap-1.5">
            <I className={`w-3 h-3 ${color}`} />
            <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.18em]">{label}</p>
          </div>
          <p
            className="text-sm font-medium text-foreground leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  </div>
);

/* ── Main Component ── */
interface StrategicAdvisorProps {
  onOpenChat?: (msg?: string) => void;
}

const StrategicAdvisor = ({ onOpenChat }: StrategicAdvisorProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadAdvisorData();
  }, []);

  const loadAdvisorData = async () => {
    try {
      const [signalsRes, frameworksRes, suggestionsRes, profileRes] = await Promise.all([
        supabase.from("strategic_signals").select("*").eq("status", "active").order("confidence", { ascending: false }).limit(10),
        supabase.from("master_frameworks").select("title, summary, tags").order("created_at", { ascending: false }).limit(5),
        supabase.from("narrative_suggestions").select("*").eq("status", "suggested").limit(5),
        (supabase.from("diagnostic_profiles" as any) as any).select("sector_focus, brand_pillars, north_star_goal, identity_intelligence").maybeSingle(),
      ]);

      const signals = signalsRes.data || [];
      const frameworks = frameworksRes.data || [];
      const suggestions = suggestionsRes.data || [];
      const profile = profileRes.data;

      const recs: Recommendation[] = [];

      // Strategic opportunities from signals
      signals.slice(0, 3).forEach((s: any) => {
        if (s.framework_opportunity?.title) {
          recs.push({
            id: `strat-${s.id}`,
            type: "strategic",
            title: s.framework_opportunity.title,
            rationale: s.explanation?.substring(0, 200) || s.strategic_implications?.substring(0, 200) || "",
            recommendedMove: s.framework_opportunity.description || "Develop a concise consulting framework and publish a LinkedIn carousel.",
            confidence: Number(s.confidence) || 0.7,
            dismissed: false,
          });
        }
      });

      // Authority opportunities from content_opportunity and suggestions
      signals.slice(0, 3).forEach((s: any) => {
        if (s.content_opportunity?.title && !recs.find(r => r.title === s.content_opportunity.title)) {
          recs.push({
            id: `auth-${s.id}`,
            type: "authority",
            title: s.content_opportunity.title,
            rationale: s.content_opportunity.description || s.explanation?.substring(0, 150) || "",
            recommendedMove: s.content_opportunity.hook
              ? `Write a post with hook: "${s.content_opportunity.hook}"`
              : "Write a short essay defining the concept and positioning it as a signature framework.",
            confidence: Number(s.confidence) || 0.7,
            dismissed: false,
          });
        }
      });

      suggestions.slice(0, 2).forEach((s: any) => {
        if (!recs.find(r => r.title === s.topic)) {
          recs.push({
            id: `narr-${s.id}`,
            type: "authority",
            title: s.topic,
            rationale: s.reason || s.angle || "",
            recommendedMove: `${s.recommended_format === "carousel" ? "Publish a carousel" : "Draft a LinkedIn post"} on this topic.`,
            confidence: 0.75,
            dismissed: false,
          });
        }
      });

      // Consulting opportunities
      signals.slice(0, 3).forEach((s: any) => {
        if (s.consulting_opportunity?.title && !recs.find(r => r.title === s.consulting_opportunity.title)) {
          recs.push({
            id: `cons-${s.id}`,
            type: "consulting",
            title: s.consulting_opportunity.title,
            rationale: s.consulting_opportunity.description || s.strategic_implications?.substring(0, 150) || "",
            recommendedMove: s.consulting_opportunity.action || "Develop a client advisory brief outlining governance models.",
            confidence: Number(s.confidence) || 0.7,
            dismissed: false,
          });
        }
      });

      setRecommendations(recs.sort((a, b) => b.confidence - a.confidence).slice(0, 6));

      // Daily brief
      const topSignal = signals[0] as any;
      const topFrameworkOpp = signals.find((s: any) => s.framework_opportunity?.title) as any;
      const topContentOpp = signals.find((s: any) => s.content_opportunity?.title) as any;

      if (topSignal) {
        setDailyBrief({
          signal: topSignal.signal_title || "No signals detected yet.",
          opportunity: topFrameworkOpp?.framework_opportunity?.title || frameworks[0]?.title || "Capture more insights to surface opportunities.",
          action: topContentOpp?.content_opportunity?.hook
            || (suggestions[0] as any)?.topic
            ? `Publish: ${(suggestions[0] as any)?.topic || topContentOpp?.content_opportunity?.title}`
            : "Continue capturing insights to generate actions.",
        });
      }
    } catch (err) {
      console.error("Advisor load error:", err);
    }
    setLoading(false);
  };

  const generateRecommendations = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-briefing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ user_id: session.user.id }),
      });

      if (!resp.ok) throw new Error("Briefing generation failed");
      const data = await resp.json();

      if (data.briefing) {
        const b = data.briefing;
        setDailyBrief({
          signal: b.strategic_signal?.title || b.headline || "—",
          opportunity: b.framework_opportunity?.title || "—",
          action: b.recommended_action?.action || "—",
        });

        // Add AI-generated recommendations
        const newRecs: Recommendation[] = [];
        if (b.framework_opportunity?.title) {
          newRecs.push({
            id: `ai-fw-${Date.now()}`,
            type: "strategic",
            title: b.framework_opportunity.title,
            rationale: b.framework_opportunity.description || "",
            recommendedMove: "Develop this framework and publish as a thought leadership asset.",
            confidence: 0.85,
            dismissed: false,
          });
        }
        if (b.authority_opportunity?.title) {
          newRecs.push({
            id: `ai-auth-${Date.now()}`,
            type: "authority",
            title: b.authority_opportunity.title,
            rationale: b.authority_opportunity.hook || "",
            recommendedMove: "Write a LinkedIn post establishing your position on this topic.",
            confidence: 0.8,
            dismissed: false,
          });
        }

        if (newRecs.length > 0) {
          setRecommendations(prev => {
            const combined = [...newRecs, ...prev.filter(r => !r.dismissed)];
            const unique = combined.filter((r, i) => combined.findIndex(x => x.title === r.title) === i);
            return unique.slice(0, 8);
          });
        }

        toast.success("Strategic brief updated");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate recommendations");
    }
    setGenerating(false);
  };

  const handleAccept = (id: string) => {
    toast.success("Recommendation accepted");
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  const handleDismiss = (id: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  const handleConvert = (rec: Recommendation, type: "task" | "content") => {
    if (type === "content" && onOpenChat) {
      onOpenChat(`Help me create content about: ${rec.title}. Context: ${rec.rationale}`);
    }
    toast.success(type === "task" ? "Added to tasks" : "Opening content builder");
    setRecommendations(prev => prev.filter(r => r.id !== rec.id));
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  const activeRecs = recommendations.filter(r => !r.dismissed);
  const strategicRecs = activeRecs.filter(r => r.type === "strategic");
  const authorityRecs = activeRecs.filter(r => r.type === "authority");
  const consultingRecs = activeRecs.filter(r => r.type === "consulting");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3
              className="text-lg font-bold text-foreground tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Strategic Advisor
            </h3>
            <p className="text-[10px] text-muted-foreground/40 tracking-wide">Your AI Chief-of-Staff</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={generateRecommendations}
          disabled={generating}
          className="gap-2 border-primary/20 text-primary hover:bg-primary/10"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Generate Brief</span>
        </Button>
      </div>

      {/* Daily Brief */}
      {dailyBrief && <DailyBriefCard brief={dailyBrief} />}

      {/* Recommendation Sections */}
      {strategicRecs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-amber-400" />
            <h4 className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.18em]">Strategic Opportunities</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {strategicRecs.map(rec => (
              <RecommendationCard
                key={rec.id} rec={rec}
                onAccept={() => handleAccept(rec.id)}
                onDismiss={() => handleDismiss(rec.id)}
                onConvert={(type) => handleConvert(rec, type)}
              />
            ))}
          </div>
        </section>
      )}

      {authorityRecs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.18em]">Authority Opportunities</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {authorityRecs.map(rec => (
              <RecommendationCard
                key={rec.id} rec={rec}
                onAccept={() => handleAccept(rec.id)}
                onDismiss={() => handleDismiss(rec.id)}
                onConvert={(type) => handleConvert(rec, type)}
              />
            ))}
          </div>
        </section>
      )}

      {consultingRecs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
            <h4 className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.18em]">Consulting Opportunities</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {consultingRecs.map(rec => (
              <RecommendationCard
                key={rec.id} rec={rec}
                onAccept={() => handleAccept(rec.id)}
                onDismiss={() => handleDismiss(rec.id)}
                onConvert={(type) => handleConvert(rec, type)}
              />
            ))}
          </div>
        </section>
      )}

      {activeRecs.length === 0 && !dailyBrief && (
        <div className="glass-card rounded-2xl p-10 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-primary/30 mx-auto" />
          <p className="text-sm text-muted-foreground/50">
            Capture more insights and signals to activate your Strategic Advisor.
          </p>
          <Button variant="outline" size="sm" onClick={generateRecommendations} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Generate Recommendations
          </Button>
        </div>
      )}
    </div>
  );
};

export default StrategicAdvisor;
