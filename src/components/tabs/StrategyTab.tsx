import { useState, useEffect } from "react";
import {
  Loader2, Zap, Target, Lightbulb, Layers, MessageCircle, RefreshCw,
  ChevronRight, Send, Sparkles, ArrowRight, Crown, BookOpen, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";
import { toast } from "sonner";
import SignalExplorer from "@/components/SignalExplorer";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
import StrategicEvolutionMap from "@/components/StrategicEvolutionMap";

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
  status: string;
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

interface FrameworkOpp {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  created_at: string;
}

type ViewMode = "overview" | "signals" | "insights" | "frameworks";

interface StrategyTabProps {
  onOpenChat?: (msg?: string) => void;
}

/* ── Stat Card ── */
const StatCard = ({ icon: Icon, label, count, color, active, onClick }: {
  icon: any; label: string; count: number; color: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex-1 p-4 rounded-xl border transition-all duration-200 tactile-press ${
      active
        ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5"
        : "bg-secondary/20 border-border/10 hover:border-border/30"
    }`}
  >
    <div className="flex items-center gap-2.5 mb-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-2xl font-bold text-foreground tabular-nums">{count}</span>
    </div>
    <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</span>
  </button>
);

/* ── Confidence Badge ── */
const ConfidenceBadge = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-emerald-400 bg-emerald-500/10" : pct >= 60 ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground bg-secondary/30";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${color}`}>{pct}%</span>;
};

/* ── AI Strategy Advisor Panel ── */
const StrategyAdvisor = ({ onClose }: { onClose: () => void }) => {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user" as const, content: input };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    setStreaming(true);

    let assistantSoFar = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-aura`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
          context: "strategy-advisor",
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "I couldn't connect right now. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-primary/15 flex flex-col h-[500px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Strategy Advisor</h4>
            <p className="text-[10px] text-muted-foreground">Ask strategic questions about your knowledge</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Sparkles className="w-8 h-8 text-primary/40 mx-auto" />
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Ask strategic questions — I'll analyze your signals, insights, and frameworks to advise you.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["What patterns are emerging?", "Where should I build authority?", "What framework should I develop next?"].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-[10px] px-3 py-1.5 rounded-full bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/10 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-primary/15 text-foreground border border-primary/20"
                : "bg-secondary/30 text-foreground/90 border border-border/10"
            }`}>
              {m.content}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border/10">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask a strategic question…"
            className="flex-1 bg-secondary/30 border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <Button size="sm" onClick={sendMessage} disabled={!input.trim() || streaming} className="rounded-xl h-10 w-10 p-0">
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Strategy Tab ── */
const StrategyTab = ({ onOpenChat }: StrategyTabProps) => {
  const [signals, setSignals] = useState<StrategicSignal[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Signal Explorer / Framework Builder / Draft panel state
  const [explorerSignal, setExplorerSignal] = useState<StrategicSignal | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string; signalId?: string } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; context?: string } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [sRes, iRes, fRes] = await Promise.all([
      supabase.from("strategic_signals").select("*").eq("status", "active").order("confidence", { ascending: false }).limit(20),
      supabase.from("learned_intelligence").select("id, title, content, intelligence_type, skill_pillars, tags, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("master_frameworks").select("id, title, summary, tags, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    setSignals((sRes.data || []) as any);
    setInsights(iRes.data || []);
    setFrameworks(fRes.data || []);
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

  const openFrameworkBuilder = (signal: StrategicSignal) => {
    const opp = signal.framework_opportunity || {};
    setBuilderData({
      title: opp.title || signal.signal_title,
      steps: opp.steps || [],
      summary: opp.description || signal.explanation,
      signalId: signal.id,
    });
  };

  const openDraftPanel = (signal: StrategicSignal) => {
    const opp = signal.content_opportunity || {};
    setDraftData({
      title: opp.title || signal.signal_title,
      hook: opp.hook,
      context: signal.explanation,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const filteredSignals = viewMode === "signals" || viewMode === "overview" ? signals : [];
  const filteredInsights = viewMode === "insights" || viewMode === "overview" ? insights : [];
  const filteredFrameworks = viewMode === "frameworks" || viewMode === "overview" ? frameworks : [];

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Strategy Workspace</h2>
            <p className="text-xs text-muted-foreground">Patterns, insights, and framework opportunities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdvisorOpen(!advisorOpen)}
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Strategy Advisor</span>
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
        </div>
      </div>

      {/* Evolution Map */}
      <StrategicEvolutionMap onOpenChat={onOpenChat} />

      {/* Stats Row */}
      <div className="flex gap-3">
        <StatCard icon={Zap} label="Signals" count={signals.length} color="bg-amber-500/10 text-amber-400" active={viewMode === "signals"} onClick={() => setViewMode(viewMode === "signals" ? "overview" : "signals")} />
        <StatCard icon={Lightbulb} label="Insights" count={insights.length} color="bg-blue-500/10 text-blue-400" active={viewMode === "insights"} onClick={() => setViewMode(viewMode === "insights" ? "overview" : "insights")} />
        <StatCard icon={Layers} label="Frameworks" count={frameworks.length} color="bg-emerald-500/10 text-emerald-400" active={viewMode === "frameworks"} onClick={() => setViewMode(viewMode === "frameworks" ? "overview" : "frameworks")} />
      </div>

      {/* AI Strategy Advisor */}
      {advisorOpen && (
        <div className="animate-fade-in">
          <StrategyAdvisor onClose={() => setAdvisorOpen(false)} />
        </div>
      )}

      {/* Strategic Signals Section */}
      {filteredSignals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground tracking-wide">Strategic Signals</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{signals.length} detected</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(viewMode === "overview" ? filteredSignals.slice(0, 4) : filteredSignals).map((signal) => (
              <div
                key={signal.id}
                className="glass-card rounded-xl p-5 border border-border/10 hover:border-amber-500/20 transition-all group relative overflow-hidden"
              >
                {/* Subtle glow */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -translate-y-6 translate-x-6" />

                <div className="relative space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground leading-snug">{signal.signal_title}</h4>
                    <ConfidenceBadge value={signal.confidence} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{signal.explanation}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {signal.theme_tags.slice(0, 3).map((tag, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground border border-border/10">{tag}</span>
                    ))}
                    {signal.fragment_count > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{signal.fragment_count} evidence</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => { setExplorerSignal(signal); setExplorerOpen(true); }}
                      className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                    >
                      Explore <ChevronRight className="w-3 h-3" />
                    </button>
                    {signal.framework_opportunity?.title && (
                      <button
                        onClick={() => openFrameworkBuilder(signal)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
                      >
                        Build Framework <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {signal.content_opportunity?.title && (
                      <button
                        onClick={() => openDraftPanel(signal)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
                      >
                        Draft Post <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {viewMode === "overview" && signals.length > 4 && (
            <button onClick={() => setViewMode("signals")} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mx-auto">
              View all {signals.length} signals <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </section>
      )}

      {/* Insights Section */}
      {filteredInsights.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground tracking-wide">Strategic Insights</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{insights.length} extracted</span>
          </div>
          <div className="space-y-2">
            {(viewMode === "overview" ? filteredInsights.slice(0, 5) : filteredInsights).map((insight) => (
              <div key={insight.id} className="glass-card rounded-xl p-4 border border-border/10 hover:border-blue-500/15 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-foreground">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{insight.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 capitalize">{insight.intelligence_type}</span>
                      {insight.skill_pillars.slice(0, 2).map((p, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">{p}</span>
                      ))}
                      <span className="text-[10px] text-muted-foreground/50 ml-auto">{formatSmartDate(insight.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {viewMode === "overview" && insights.length > 5 && (
            <button onClick={() => setViewMode("insights")} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mx-auto">
              View all {insights.length} insights <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </section>
      )}

      {/* Framework Opportunities Section */}
      {filteredFrameworks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-foreground tracking-wide">Framework Opportunities</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{frameworks.length} available</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(viewMode === "overview" ? filteredFrameworks.slice(0, 4) : filteredFrameworks).map((fw) => (
              <div key={fw.id} className="glass-card rounded-xl p-4 border border-border/10 hover:border-emerald-500/15 transition-all">
                <h4 className="text-sm font-semibold text-foreground">{fw.title}</h4>
                {fw.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{fw.summary}</p>}
                <div className="flex items-center gap-2 mt-3">
                  {fw.tags.slice(0, 3).map((tag, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">{tag}</span>
                  ))}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">{formatSmartDate(fw.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
          {viewMode === "overview" && frameworks.length > 4 && (
            <button onClick={() => setViewMode("frameworks")} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mx-auto">
              View all {frameworks.length} frameworks <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </section>
      )}

      {/* Empty State */}
      {signals.length === 0 && insights.length === 0 && frameworks.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
            <Lightbulb className="w-7 h-7 text-primary/60" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground">No strategic patterns detected yet</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Capture more notes, articles, and ideas. Aura will detect patterns and surface strategic insights.
            </p>
          </div>
          <Button onClick={runPatternDetection} disabled={detecting} className="gap-2">
            {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Pattern Detection
          </Button>
        </div>
      )}

      {/* Ask Aura — bottom dock */}
      {!advisorOpen && (
        <div className="sticky bottom-0 pt-4 pb-2 -mx-5 sm:-mx-10 px-5 sm:px-10 bg-gradient-to-t from-background via-background/95 to-transparent">
          <button
            onClick={() => setAdvisorOpen(true)}
            className="w-full glass-card rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover-lift tactile-press transition-all group aura-search-glow"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300 border border-primary/15">
              <Sparkles className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground/60 group-hover:text-foreground transition-colors duration-300">
              Ask Strategy Advisor…
            </span>
          </button>
        </div>
      )}

      {/* Signal Explorer Sheet */}
      <SignalExplorer signal={explorerSignal} open={explorerOpen} onClose={() => { setExplorerOpen(false); setExplorerSignal(null); }} />

      {/* Framework Builder */}
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

      {/* LinkedIn Draft Panel */}
      {draftData && (
        <LinkedInDraftPanel
          title={draftData.title}
          hook={draftData.hook}
          context={draftData.context}
          open={!!draftData}
          onClose={() => setDraftData(null)}
        />
      )}
    </div>
  );
};

export default StrategyTab;
