import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Zap, Lightbulb, Layers, ArrowRight, ArrowDown,
  ChevronRight, RefreshCw, Search, PenLine, BookOpen, Save,
  Sparkles, Send, X
} from "lucide-react";
import { SignalActions, InsightActions, FrameworkActions } from "@/components/ui/action-buttons";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";
import { toast } from "sonner";
import SignalExplorer from "@/components/SignalExplorer";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
import SignalGraph from "@/components/SignalGraph";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";

/* ── Types ── */
interface StrategicSignal {
  id: string;
  signal_title: string;
  explanation: string;
  strategic_implications: string;
  supporting_evidence_ids: string[];
  theme_tags: string[];
  skill_pillars: string[];
  confidence: number;
  fragment_count: number;
  framework_opportunity: any;
  content_opportunity: any;
  consulting_opportunity: any;
  created_at: string;
}

interface Insight {
  id: string;
  title: string;
  content: string;
  intelligence_type: string;
  skill_pillars: string[];
  tags: string[];
  created_at: string;
}

interface Framework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  framework_steps: any;
  created_at: string;
}

interface StrategyTabProps {
  onOpenChat?: (msg?: string) => void;
}

/* ── Flow Arrow ── */
const FlowArrow = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center gap-1 py-4 opacity-40">
    <ArrowDown className="w-4 h-4 text-primary" />
    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">{label}</span>
  </div>
);

/* ── Confidence Badge ── */
const ConfBadge = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-emerald-400 bg-emerald-500/10" : pct >= 60 ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground bg-secondary/30";
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium tabular-nums ${color}`}>{pct}%</span>;
};

/* ── Main Strategy Tab ── */
const StrategyTab = ({ onOpenChat }: StrategyTabProps) => {
  const [signals, setSignals] = useState<StrategicSignal[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showAllSignals, setShowAllSignals] = useState(false);

  // Panels
  const [explorerSignal, setExplorerSignal] = useState<StrategicSignal | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; context?: string } | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [sRes, iRes, fRes] = await Promise.all([
      supabase.from("strategic_signals").select("id, signal_title, explanation, strategic_implications, supporting_evidence_ids, theme_tags, skill_pillars, confidence, fragment_count, framework_opportunity, content_opportunity, consulting_opportunity, created_at").eq("status", "active").order("confidence", { ascending: false }).limit(20),
      supabase.from("learned_intelligence").select("id, title, content, intelligence_type, skill_pillars, tags, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    setSignals((sRes.data || []) as any);
    setInsights(iRes.data || []);
    setFrameworks((fRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const runPatternDetection = async () => {
    setDetecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-patterns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error("Detection failed");
      const data = await resp.json();
      toast.success(`Detected ${data.signals_created || 0} new signals`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  const visibleSignals = showAllSignals ? signals : signals.slice(0, 3);
  const isEmpty = signals.length === 0 && insights.length === 0 && frameworks.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <PageHeader
        icon={Lightbulb}
        title="Strategy"
        question="What do these signals mean strategically?"
        processLogic="Signals → Insights → Frameworks"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGraphOpen(true)}
          className="gap-2"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Signal Graph</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={runPatternDetection}
          disabled={detecting}
          className="gap-2"
        >
          {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Detect Patterns</span>
        </Button>
      </PageHeader>

      {/* Strategic Advisor — compact */}
      <StrategicAdvisorPanel context="strategy" compact onOpenChat={onOpenChat} />

      {/* ── Empty State ── */}
      {isEmpty && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
            <Lightbulb className="w-7 h-7 text-primary/60" />
          </div>
          <h4 className="text-base font-semibold text-foreground">No strategic patterns detected yet</h4>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Capture more notes, articles, and ideas. Aura will detect patterns and surface strategic insights.
          </p>
          <Button onClick={runPatternDetection} disabled={detecting} className="gap-2">
            {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Pattern Detection
          </Button>
        </div>
      )}

      {/* ═══ SIGNALS SECTION ═══ */}
      {signals.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/15">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-label uppercase tracking-wider text-xs font-semibold">Signals</h2>
            <span className="text-xs text-muted-foreground ml-auto">{signals.length} detected</span>
          </div>

          <div className="space-y-3">
            {visibleSignals.map((signal) => {
              const sources = signal.supporting_evidence_ids?.length || 0;
              return (
                 <div
                  key={signal.id}
                  className="glass-card rounded-2xl p-4 sm:p-6 border border-border/8 hover:border-amber-500/15 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-foreground font-semibold text-sm leading-snug">{signal.signal_title}</p>
                    <ConfBadge value={signal.confidence} />
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-3">{signal.explanation}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <span>{sources} source{sources !== 1 ? "s" : ""}</span>
                    {signal.theme_tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/30 border border-border/10">{tag}</span>
                    ))}
                  </div>

                  <SignalActions
                    onExplore={() => { setExplorerSignal(signal); setExplorerOpen(true); }}
                    onCreateInsight={() => onOpenChat?.(`Create a strategic insight from signal: ${signal.signal_title}`)}
                  />
                </div>
              );
            })}
          </div>

          {signals.length > 3 && !showAllSignals && (
            <button
              onClick={() => setShowAllSignals(true)}
              className="w-full glass-card rounded-xl p-4 text-sm font-medium text-primary/70 hover:text-primary hover:border-primary/20 transition-colors flex items-center justify-center gap-2"
            >
              View All {signals.length} Signals <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </motion.section>
      )}

      {/* ── Flow Arrow ── */}
      {signals.length > 0 && insights.length > 0 && <FlowArrow label="interpreted as" />}

      {/* ═══ INSIGHTS SECTION ═══ */}
      {insights.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/15">
              <Lightbulb className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-label uppercase tracking-wider text-xs font-semibold">Insights</h2>
            <span className="text-xs text-muted-foreground ml-auto">{insights.length} extracted</span>
          </div>

          <div className="space-y-3">
            {insights.slice(0, 5).map((insight) => (
              <div
                key={insight.id}
                className="glass-card rounded-2xl p-6 border border-border/8 hover:border-blue-500/15 transition-all"
              >
                <p className="text-foreground font-semibold text-sm leading-snug mb-2">{insight.title}</p>
                <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-3">{insight.content}</p>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 capitalize font-medium">{insight.intelligence_type}</span>
                  {insight.skill_pillars.slice(0, 2).map((p) => (
                    <span key={p} className="px-2 py-0.5 rounded-full bg-secondary/30 border border-border/10">{p}</span>
                  ))}
                  <span className="ml-auto">{formatSmartDate(insight.created_at)}</span>
                </div>

                <InsightActions
                  onExpand={() => onOpenChat?.(`Expand insight: ${insight.title}\n\n${insight.content}`)}
                  onBuildFramework={() => {
                    setBuilderData({ title: insight.title, steps: [], summary: insight.content });
                  }}
                  onDraftContent={() => setDraftData({ title: insight.title, context: insight.content })}
                />
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Flow Arrow ── */}
      {insights.length > 0 && frameworks.length > 0 && <FlowArrow label="codified into" />}

      {/* ═══ FRAMEWORKS SECTION ═══ */}
      {frameworks.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/15">
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-label uppercase tracking-wider text-xs font-semibold">Frameworks</h2>
            <span className="text-xs text-muted-foreground ml-auto">{frameworks.length} created</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {frameworks.slice(0, 6).map((fw) => {
              const steps = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
              return (
                <div
                  key={fw.id}
                  className="glass-card rounded-2xl p-6 border border-border/8 hover:border-emerald-500/15 transition-all"
                >
                  <p className="text-foreground font-semibold text-sm leading-snug mb-2">{fw.title}</p>
                  {fw.summary && (
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-3">{fw.summary}</p>
                  )}

                  {steps.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground font-medium mb-2">Core Pillars</p>
                      <div className="flex flex-wrap gap-1.5">
                        {steps.slice(0, 4).map((step: any, i: number) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/8 text-emerald-400/80 border border-emerald-500/10">
                            {typeof step === "string" ? step : step.title || step.name || `Step ${i + 1}`}
                          </span>
                        ))}
                        {steps.length > 4 && (
                          <span className="text-xs px-2 py-1 text-muted-foreground">+{steps.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                    {fw.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/30 border border-border/10">{tag}</span>
                    ))}
                    <span className="ml-auto">{formatSmartDate(fw.created_at)}</span>
                  </div>

                  <FrameworkActions
                    onOpenFramework={() => {
                      setBuilderData({ title: fw.title, steps: steps.map((s: any) => typeof s === "string" ? s : s.title || s.name || ""), summary: fw.summary || "" });
                    }}
                    onRefineFramework={() => onOpenChat?.(`Refine and improve framework: ${fw.title}`)}
                    onDraftContent={() => {
                      setDraftData({ title: fw.title, context: fw.summary || "" });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Panels ── */}
      <SignalExplorer signal={explorerSignal} open={explorerOpen} onClose={() => { setExplorerOpen(false); setExplorerSignal(null); }} />

      {builderData && (
        <FrameworkBuilder
          initialTitle={builderData.title}
          initialSteps={builderData.steps}
          initialDescription={builderData.summary || ""}
          open={!!builderData}
          onClose={() => setBuilderData(null)}
          onFrameworkCreated={() => { setBuilderData(null); fetchAll(); }}
        />
      )}

      {draftData && (
        <LinkedInDraftPanel
          title={draftData.title}
          hook={draftData.hook}
          context={draftData.context}
          open={!!draftData}
          onClose={() => setDraftData(null)}
        />
      )}

      <SignalGraph open={graphOpen} onClose={() => setGraphOpen(false)} />
    </div>
  );
};

export default StrategyTab;
