import { useState, useEffect } from "react";
import {
  Compass, Zap, ArrowRight, Loader2, Search, Lightbulb, PenLine,
  BookOpen, Save, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";

/* ── Types ── */
interface CommandData {
  userName: string;
  identityStatement: string;
  expertise: string;
  industry: string;
  signalTitle: string;
  signalConfidence: number;
  signalSources: number;
  recommendedMove: string;
  moveReason: string;
  recentIntelligence: Array<{ title: string; sourceCount: number; confidence: number; created_at: string }>;
}

const EMPTY: CommandData = {
  identityStatement: "",
  expertise: "—",
  industry: "—",
  signalTitle: "",
  signalConfidence: 0,
  signalSources: 0,
  recommendedMove: "",
  moveReason: "",
  recentIntelligence: [],
};

/* ── Main Component ── */
const StrategicCommandCenter = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [data, setData] = useState<CommandData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [signalsRes, profileRes, suggestionsRes, intelligenceRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, supporting_evidence_ids, theme_tags, framework_opportunity, content_opportunity, strategic_implications, explanation").eq("status", "active").order("confidence", { ascending: false }).limit(5),
        (supabase.from("diagnostic_profiles" as any) as any).select("core_practice, sector_focus, brand_pillars, identity_intelligence").maybeSingle(),
        supabase.from("narrative_suggestions").select("topic, recommended_format, reason, angle").eq("status", "suggested").limit(3),
        supabase.from("strategic_signals").select("signal_title, supporting_evidence_ids, confidence, created_at").eq("status", "active").order("created_at", { ascending: false }).limit(3),
      ]);

      const signals = signalsRes.data || [];
      const profile = profileRes.data;
      const suggestions = suggestionsRes.data || [];
      const recentSignals = intelligenceRes.data || [];

      const identity = profile?.identity_intelligence || {};
      const expertise = identity.primary_role || profile?.core_practice || "—";
      const industry = profile?.sector_focus || identity.industries?.[0] || "—";
      const authorityTheme = identity.authority_themes?.[0]?.theme || profile?.brand_pillars?.[0] || "";

      const identityStatement = authorityTheme && industry
        ? `You are building authority at the intersection of ${authorityTheme} and ${industry}.`
        : expertise !== "—"
          ? `You are building authority in ${expertise}.`
          : "";

      const topSignal = signals[0] as any;
      const signalTitle = topSignal?.signal_title || "";
      const signalConfidence = Math.round((Number(topSignal?.confidence) || 0) * 100);
      const signalSources = topSignal?.supporting_evidence_ids?.length || 0;

      let recommendedMove = "";
      let moveReason = "";
      if (suggestions.length > 0) {
        const s = suggestions[0] as any;
        recommendedMove = s.topic;
        moveReason = s.reason || s.angle || "";
      } else if (topSignal?.content_opportunity?.title) {
        recommendedMove = topSignal.content_opportunity.title;
        moveReason = topSignal.content_opportunity.description || topSignal.strategic_implications?.substring(0, 150) || "";
      } else if (topSignal) {
        recommendedMove = `Publish a strategic insight on "${topSignal.signal_title}"`;
        moveReason = topSignal.strategic_implications?.substring(0, 150) || "";
      }

      const recentIntelligence = recentSignals.map((s: any) => ({
        title: s.signal_title,
        sourceCount: s.supporting_evidence_ids?.length || 0,
        confidence: Math.round((Number(s.confidence) || 0) * 100),
        created_at: s.created_at,
      }));

      setData({ identityStatement, expertise, industry, signalTitle, signalConfidence, signalSources, recommendedMove, moveReason, recentIntelligence });
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
    <div className="space-y-10">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight">
          What should you focus on today?
        </h1>
        <p className="text-meta mt-2 text-base">Your strategic briefing</p>
      </div>

      {/* ── Three Primary Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategic Identity */}
        <div className="glass-card rounded-2xl p-7 border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
              <Compass className="w-5 h-5 text-primary" />
            </div>
            <p className="text-label text-primary/60 uppercase tracking-wider text-xs font-semibold">Strategic Identity</p>
          </div>
          {data.identityStatement ? (
            <p className="text-foreground text-base font-medium leading-relaxed">
              {data.identityStatement}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-foreground/80 text-sm">
                <span className="text-muted-foreground text-xs block mb-1">Authority Positioning</span>
                {data.expertise}
              </p>
              <p className="text-foreground/80 text-sm">
                <span className="text-muted-foreground text-xs block mb-1">Industry Focus</span>
                {data.industry}
              </p>
            </div>
          )}
        </div>

        {/* Emerging Signal */}
        <div className="glass-card rounded-2xl p-7 border border-amber-500/10">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/15">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-label text-amber-400/60 uppercase tracking-wider text-xs font-semibold">Emerging Signal</p>
          </div>
          {data.signalTitle ? (
            <>
              <p className="text-foreground text-base font-medium leading-relaxed mb-4">
                "{data.signalTitle}"
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-5">
                <span className="tabular-nums font-medium text-amber-400">{data.signalConfidence}% confidence</span>
                <span>{data.signalSources} evidence source{data.signalSources !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Explore this signal: ${data.signalTitle}`)}>
                  <Search className="w-3.5 h-3.5" /> Explore
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Create an insight from this signal: ${data.signalTitle}`)}>
                  <Lightbulb className="w-3.5 h-3.5" /> Create Insight
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Draft content about: ${data.signalTitle}`)}>
                  <PenLine className="w-3.5 h-3.5" /> Draft Content
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              No signals detected yet. Capture more insights to generate signals.
            </p>
          )}
        </div>

        {/* Recommended Move */}
        <div className="glass-card rounded-2xl p-7 border border-emerald-500/10 bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/15">
              <ArrowRight className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-label text-emerald-400/60 uppercase tracking-wider text-xs font-semibold">Recommended Move</p>
          </div>
          {data.recommendedMove ? (
            <>
              <p className="text-foreground text-base font-medium leading-relaxed mb-3">
                {data.recommendedMove}
              </p>
              {data.moveReason && (
                <p className="text-muted-foreground text-sm leading-relaxed mb-5 line-clamp-3">
                  {data.moveReason}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Draft a LinkedIn post about: ${data.recommendedMove}`)}>
                  <PenLine className="w-3.5 h-3.5" /> Draft Post
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Build a framework about: ${data.recommendedMove}`)}>
                  <BookOpen className="w-3.5 h-3.5" /> Build Framework
                </Button>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
                  <Save className="w-3.5 h-3.5" /> Save for Later
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Capture more insights to generate recommendations.
            </p>
          )}
        </div>
      </div>

      {/* ── Recent Intelligence ── */}
      {data.recentIntelligence.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-label uppercase tracking-wider text-xs font-semibold">Recent Intelligence</p>
          </div>
          <div className="space-y-3">
            {data.recentIntelligence.map((item, i) => (
              <div key={i} className="glass-card rounded-xl p-5 border border-border/8 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-primary/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{item.sourceCount} source{item.sourceCount !== 1 ? "s" : ""}</span>
                    <span className="tabular-nums">{item.confidence}%</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatSmartDate(item.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategicCommandCenter;
