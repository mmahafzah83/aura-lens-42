import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Compass, Zap, ArrowRight, Loader2, Search, Lightbulb, PenLine,
  BookOpen, Target, Brain, Crown, TrendingUp, Sparkles, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";

/* ── Types ── */
interface CommandData {
  userName: string;
  identityStatement: string;
  northStar: string;
  opportunityTitle: string;
  opportunityExplanation: string;
  confidence: number;
  sourceCount: number;
  pipeline: { label: string; icon: React.ElementType; count: number }[];
  momentum: Array<{ title: string; type: string; created_at: string }>;
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const EMPTY: CommandData = {
  userName: "",
  identityStatement: "",
  northStar: "",
  opportunityTitle: "",
  opportunityExplanation: "",
  confidence: 0,
  sourceCount: 0,
  pipeline: [],
  momentum: [],
};

/* ── Main Component ── */
const StrategicCommandCenter = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [data, setData] = useState<CommandData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "";

      const [signalsRes, profileRes, frameworksRes, intelligenceRes, suggestionsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, supporting_evidence_ids, strategic_implications, explanation, content_opportunity").eq("status", "active").order("confidence", { ascending: false }).limit(5),
        (supabase.from("diagnostic_profiles" as any) as any).select("core_practice, sector_focus, brand_pillars, identity_intelligence, north_star_goal").maybeSingle(),
        supabase.from("master_frameworks").select("id", { count: "exact", head: true }),
        supabase.from("learned_intelligence").select("id", { count: "exact", head: true }),
        supabase.from("narrative_suggestions").select("topic, reason, angle").eq("status", "suggested").limit(1),
      ]);

      const signals = signalsRes.data || [];
      const profile = profileRes.data;
      const suggestions = suggestionsRes.data || [];

      // Identity
      const identity = profile?.identity_intelligence || {};
      const expertise = identity.primary_role || profile?.core_practice || "";
      const industry = profile?.sector_focus || identity.industries?.[0] || "";
      const authorityTheme = identity.authority_themes?.[0]?.theme || profile?.brand_pillars?.[0] || "";
      const northStar = profile?.north_star_goal || "";

      let identityStatement = "";
      if (authorityTheme && industry) {
        identityStatement = `You are building authority in ${authorityTheme} in ${industry}.`;
      } else if (expertise) {
        identityStatement = `You are building authority in ${expertise}.`;
      }

      // Primary opportunity
      const topSignal = signals[0] as any;
      let opportunityTitle = "";
      let opportunityExplanation = "";
      let confidence = 0;
      let sourceCount = 0;

      if (suggestions.length > 0) {
        const s = suggestions[0] as any;
        opportunityTitle = s.topic;
        opportunityExplanation = s.reason || s.angle || "";
      }

      if (topSignal) {
        if (!opportunityTitle) {
          opportunityTitle = topSignal.signal_title;
        }
        if (!opportunityExplanation) {
          opportunityExplanation = topSignal.strategic_implications?.substring(0, 200) || topSignal.explanation?.substring(0, 200) || "";
        }
        confidence = Math.round((Number(topSignal.confidence) || 0) * 100);
        sourceCount = topSignal.supporting_evidence_ids?.length || 0;
      }

      // Pipeline counts
      const signalCount = signals.length;
      const insightCount = intelligenceRes.count || 0;
      const frameworkCount = frameworksRes.count || 0;

      // Content count
      const { count: contentCount } = await supabase.from("narrative_suggestions").select("id", { count: "exact", head: true });

      // Influence (latest snapshot)
      const { data: snap } = await supabase.from("influence_snapshots").select("followers").order("snapshot_date", { ascending: false }).limit(1);
      const followers = snap?.[0]?.followers || 0;

      const pipeline = [
        { label: "Signals", icon: Zap, count: signalCount },
        { label: "Insights", icon: Brain, count: insightCount },
        { label: "Frameworks", icon: BookOpen, count: frameworkCount },
        { label: "Content", icon: Crown, count: contentCount || 0 },
        { label: "Audience", icon: TrendingUp, count: followers },
      ];

      // Recent momentum
      const { data: recentSignals } = await supabase.from("strategic_signals").select("signal_title, created_at").eq("status", "active").order("created_at", { ascending: false }).limit(3);
      const { data: recentFrameworks } = await supabase.from("master_frameworks").select("title, created_at").order("created_at", { ascending: false }).limit(2);

      const momentum = [
        ...(recentSignals || []).map((s: any) => ({ title: s.signal_title, type: "signal", created_at: s.created_at })),
        ...(recentFrameworks || []).map((f: any) => ({ title: f.title, type: "framework", created_at: f.created_at })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);

      setData({ userName, identityStatement, northStar, opportunityTitle, opportunityExplanation, confidence, sourceCount, pipeline, momentum });
    } catch (err) {
      console.error("Command center load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Compass className="w-8 h-8 text-primary/40 animate-spin" />
          <span className="text-meta">Loading your briefing…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* ── Section 1: Welcome & Strategic Orientation ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-3"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight">
          {getGreeting()}{data.userName ? `, ${data.userName}` : ""}
        </h1>
        {data.identityStatement && (
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
            {data.identityStatement}
          </p>
        )}
        {data.northStar && (
          <div className="flex items-center gap-2 text-sm text-primary/70">
            <Target className="w-4 h-4" />
            <span className="font-medium">{data.northStar}</span>
          </div>
        )}
      </motion.div>

      {/* ── Section 2: Strategic Opportunity (Primary Focus) ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="glass-card rounded-2xl border border-primary/10 overflow-hidden"
      >
        <div className="h-1 bg-gradient-to-r from-primary/40 via-primary/60 to-primary/20" />
        <div className="p-8 sm:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <p className="text-label text-primary/60 uppercase tracking-wider text-xs font-semibold">Strategic Opportunity</p>
          </div>

          {data.opportunityTitle ? (
            <>
              <h2
                className="text-xl sm:text-2xl font-bold text-foreground leading-snug tracking-tight max-w-2xl"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {data.opportunityTitle}
              </h2>

              <div className="flex items-center gap-5 text-sm text-muted-foreground">
                {data.confidence > 0 && (
                  <span className="tabular-nums font-medium text-primary">{data.confidence}% confidence</span>
                )}
                {data.sourceCount > 0 && (
                  <span>{data.sourceCount} evidence source{data.sourceCount !== 1 ? "s" : ""}</span>
                )}
              </div>

              {data.opportunityExplanation && (
                <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
                  {data.opportunityExplanation}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Explore this signal: ${data.opportunityTitle}`)}>
                  <Search className="w-3.5 h-3.5" /> Explore Signal
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Create an insight from: ${data.opportunityTitle}`)}>
                  <Lightbulb className="w-3.5 h-3.5" /> Develop Insight
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Build a framework about: ${data.opportunityTitle}`)}>
                  <BookOpen className="w-3.5 h-3.5" /> Build Framework
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Draft authority content about: ${data.opportunityTitle}`)}>
                  <PenLine className="w-3.5 h-3.5" /> Draft Content
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3 py-4">
              <p className="text-muted-foreground text-base">
                No strategic opportunities detected yet.
              </p>
              <p className="text-muted-foreground/60 text-sm">
                Capture knowledge and insights to activate Aura's intelligence engine.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Section 3: Authority Progress Pipeline ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="space-y-5"
      >
        <p className="text-label uppercase tracking-wider text-xs font-semibold">Authority Progress</p>
        <div className="grid grid-cols-5 gap-3">
          {data.pipeline.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="relative">
                <div className="glass-card rounded-xl p-4 text-center border border-border/10 hover:border-primary/15 transition-colors">
                  <Icon className="w-4 h-4 text-primary/50 mx-auto mb-2" />
                  <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{step.count}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-1 uppercase tracking-wide">{step.label}</p>
                </div>
                {i < data.pipeline.length - 1 && (
                  <ArrowRight className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-border/40 hidden lg:block" />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Section 4: Strategic Momentum ── */}
      {data.momentum.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="space-y-4"
        >
          <p className="text-label uppercase tracking-wider text-xs font-semibold">Recent Momentum</p>
          <div className="space-y-2">
            {data.momentum.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-4 rounded-xl glass-card border border-border/6">
                <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center shrink-0">
                  {item.type === "signal" ? <Zap className="w-3 h-3 text-primary/50" /> : <BookOpen className="w-3 h-3 text-primary/50" />}
                </div>
                <p className="text-sm text-foreground truncate flex-1">{item.title}</p>
                <span className="text-xs text-muted-foreground/50 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatSmartDate(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default StrategicCommandCenter;
