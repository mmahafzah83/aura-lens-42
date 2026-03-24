import { useState, useEffect } from "react";
import { Loader2, Zap, Target, FileText, Pen, ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  status: string;
  created_at: string;
}

interface StrategicSignalsProps {
  onOpenChat?: (msg?: string) => void;
}

const StrategicSignals = ({ onOpenChat }: StrategicSignalsProps) => {
  const [signals, setSignals] = useState<StrategicSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSignals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("strategic_signals")
      .select("*")
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(10);

    if (!error && data) setSignals(data as unknown as StrategicSignal[]);
    setLoading(false);
  };

  useEffect(() => { fetchSignals(); }, []);

  const runPatternScan = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("detect-patterns", {
        body: { user_id: user.id },
      });

      if (error) throw error;

      if (data?.signals_detected > 0) {
        toast.success(`${data.signals_detected} strategic signal${data.signals_detected > 1 ? "s" : ""} detected`);
        await fetchSignals();
      } else {
        toast.info(data?.message || "No new patterns detected yet. Keep capturing insights!");
      }
    } catch (err: any) {
      toast.error(err.message || "Pattern detection failed");
    } finally {
      setScanning(false);
    }
  };

  const dismissSignal = async (id: string) => {
    await supabase
      .from("strategic_signals")
      .update({ status: "dismissed" } as any)
      .eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    toast.success("Signal dismissed");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center">
        <Loader2 className="w-4 h-4 text-primary/60 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading strategic signals…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Strategic Signals</h3>
          {signals.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {signals.length}
            </span>
          )}
        </div>
        <button
          onClick={runPatternScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "Scanning…" : "Detect Patterns"}
        </button>
      </div>

      {signals.length === 0 ? (
        <div className="glass-card rounded-xl p-6 text-center">
          <Zap className="w-8 h-8 text-primary/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/60 mb-3">No strategic signals detected yet.</p>
          <button
            onClick={runPatternScan}
            disabled={scanning}
            className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            {scanning ? "Scanning evidence fragments…" : "Run Pattern Detection"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => {
            const isExpanded = expandedId === signal.id;
            const fw = signal.framework_opportunity || {};
            const ct = signal.content_opportunity || {};

            return (
              <div
                key={signal.id}
                className="glass-card rounded-xl border border-primary/10 overflow-hidden transition-all duration-300"
              >
                {/* Signal Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                  className="w-full p-4 flex items-start gap-3 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-foreground truncate">{signal.signal_title}</h4>
                      <span className="text-[9px] bg-primary/10 text-primary/80 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {Math.round(signal.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 line-clamp-2">{signal.explanation}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {signal.theme_tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[9px] bg-muted/50 text-muted-foreground/60 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                      <span className="text-[9px] text-muted-foreground/40">
                        {signal.fragment_count} fragments
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-primary/5 pt-3">
                    {/* Strategic Implications */}
                    <div>
                      <h5 className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold mb-1.5">
                        Strategic Implications
                      </h5>
                      <p className="text-xs text-foreground/80 leading-relaxed">{signal.strategic_implications}</p>
                    </div>

                    {/* Skill Pillars */}
                    {signal.skill_pillars.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {signal.skill_pillars.map((pillar, i) => (
                          <span key={i} className="text-[9px] bg-primary/8 text-primary/70 px-2 py-0.5 rounded-full border border-primary/10">
                            {pillar}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Framework Opportunity */}
                    {fw.title && (
                      <div className="bg-muted/30 rounded-lg p-3 border border-muted/50">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Target className="w-3 h-3 text-primary/70" />
                          <h5 className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold">
                            Framework Opportunity
                          </h5>
                        </div>
                        <p className="text-xs font-medium text-foreground/90 mb-1">{fw.title}</p>
                        <p className="text-[11px] text-muted-foreground/70 mb-2">{fw.description}</p>
                        {fw.potential_steps?.length > 0 && (
                          <ol className="space-y-0.5">
                            {fw.potential_steps.map((step: string, i: number) => (
                              <li key={i} className="text-[10px] text-muted-foreground/60 flex gap-1.5">
                                <span className="text-primary/50 font-medium">{i + 1}.</span> {step}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}

                    {/* Content Opportunity */}
                    {ct.title && (
                      <div className="bg-muted/30 rounded-lg p-3 border border-muted/50">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Pen className="w-3 h-3 text-primary/70" />
                          <h5 className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold">
                            Content Opportunity
                          </h5>
                        </div>
                        <p className="text-xs font-medium text-foreground/90 mb-1">{ct.title}</p>
                        {ct.hook && <p className="text-[11px] text-primary/70 italic mb-1">"{ct.hook}"</p>}
                        {ct.angle && <p className="text-[11px] text-muted-foreground/70">{ct.angle}</p>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => onOpenChat?.(`Build a framework based on this strategic signal: "${signal.signal_title}" — ${signal.explanation}`)}
                        className="flex-1 text-[11px] bg-primary/10 hover:bg-primary/20 text-primary rounded-lg py-2 px-3 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Target className="w-3 h-3" /> Build Framework
                      </button>
                      <button
                        onClick={() => onOpenChat?.(`Draft a LinkedIn authority post about: "${signal.signal_title}" — Hook: ${ct.hook || signal.explanation}`)}
                        className="flex-1 text-[11px] bg-primary/10 hover:bg-primary/20 text-primary rounded-lg py-2 px-3 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3 h-3" /> Draft Post
                      </button>
                      <button
                        onClick={() => dismissSignal(signal.id)}
                        className="text-[11px] text-muted-foreground/40 hover:text-destructive/70 rounded-lg py-2 px-2 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrategicSignals;
