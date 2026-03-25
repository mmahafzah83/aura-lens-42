import { useState, useEffect } from "react";
import {
  Loader2, Zap, Target, ChevronDown, ChevronUp,
  RefreshCw, Sparkles, Briefcase, Crown, ArrowRight, X, Search,
  LayoutGrid, Globe, FileText, BookOpen, Lightbulb, Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SignalExplorer from "./SignalExplorer";
import FrameworkBuilder from "./FrameworkBuilder";
import LinkedInDraftPanel from "./LinkedInDraftPanel";
import CarouselGenerator from "./CarouselGenerator";

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

interface EvidenceSummary {
  totalFragments: number;
  totalEntries: number;
  totalDocuments: number;
  topTypes: { type: string; count: number }[];
}

interface StrategicIntelligenceEngineProps {
  onOpenChat?: (msg?: string) => void;
}

/* ── Sub-components ── */
const SectionHeader = ({ icon: Icon, label, count, color = "text-primary" }: { icon: any; label: string; count?: number; color?: string }) => (
  <div className="flex items-center gap-2.5">
    <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
    </div>
    <h4 className="text-xs font-semibold text-foreground tracking-tight">{label}</h4>
    {count !== undefined && count > 0 && (
      <span className="text-[9px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">{count}</span>
    )}
  </div>
);

const EvidenceBar = ({ label, count, max, color }: { label: string; count: number; max: number; color: string }) => (
  <div className="flex items-center gap-3">
    <span className="text-[10px] text-muted-foreground/60 w-20 truncate">{label}</span>
    <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.round((count / Math.max(max, 1)) * 100)}%` }} />
    </div>
    <span className="text-[10px] text-muted-foreground/40 tabular-nums w-6 text-right">{count}</span>
  </div>
);

const OpportunitySection = ({ icon: Icon, label, children, accentClass = "text-primary/70" }: { icon: any; label: string; children: React.ReactNode; accentClass?: string }) => (
  <div className="rounded-xl bg-card/60 backdrop-blur-sm p-4 border border-primary/[0.06] hover:border-primary/15 transition-colors duration-300">
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center">
        <Icon className={`w-3.5 h-3.5 ${accentClass}`} />
      </div>
      <h5 className="text-[10px] uppercase tracking-[0.15em] text-primary/60 font-semibold">{label}</h5>
    </div>
    {children}
  </div>
);

/* ── Main Component ── */
const StrategicIntelligenceEngine = ({ onOpenChat }: StrategicIntelligenceEngineProps) => {
  const [signals, setSignals] = useState<StrategicSignal[]>([]);
  const [evidence, setEvidence] = useState<EvidenceSummary>({ totalFragments: 0, totalEntries: 0, totalDocuments: 0, topTypes: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"signals" | "evidence">("signals");

  // Panel states
  const [explorerSignal, setExplorerSignal] = useState<StrategicSignal | null>(null);
  const [builderData, setBuilderData] = useState<{ title: string; description: string; steps: string[] } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string } | null>(null);
  const [carouselData, setCarouselData] = useState<{ title: string; description?: string; context?: string } | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    await Promise.all([fetchSignals(), fetchEvidence()]);
    setLoading(false);
  };

  const fetchSignals = async () => {
    const { data } = await supabase
      .from("strategic_signals")
      .select("*")
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(15);
    if (data) setSignals(data as unknown as StrategicSignal[]);
  };

  const fetchEvidence = async () => {
    const [fragmentsRes, entriesRes, docsRes] = await Promise.all([
      supabase.from("evidence_fragments").select("fragment_type").limit(500),
      supabase.from("entries").select("id").limit(500),
      supabase.from("documents").select("id").limit(100),
    ]);

    const fragments = fragmentsRes.data || [];
    const typeCounts: Record<string, number> = {};
    fragments.forEach((f: any) => {
      typeCounts[f.fragment_type] = (typeCounts[f.fragment_type] || 0) + 1;
    });

    setEvidence({
      totalFragments: fragments.length,
      totalEntries: entriesRes.data?.length || 0,
      totalDocuments: docsRes.data?.length || 0,
      topTypes: Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([type, count]) => ({ type, count })),
    });
  };

  const runPatternScan = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("detect-patterns", { body: { user_id: user.id } });
      if (error) throw error;
      if (data?.signals_detected > 0) {
        toast.success(`${data.signals_detected} strategic signal${data.signals_detected > 1 ? "s" : ""} detected`);
        await fetchSignals();
      } else {
        toast.info(data?.message || "No new patterns detected. Keep capturing insights!");
      }
    } catch (err: any) {
      toast.error(err.message || "Pattern detection failed");
    } finally {
      setScanning(false);
    }
  };

  const dismissSignal = async (id: string) => {
    await supabase.from("strategic_signals").update({ status: "dismissed" } as any).eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    toast.success("Signal dismissed");
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-12 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-primary/40 animate-spin" />
          <span className="text-sm text-muted-foreground/40">Loading Strategic Intelligence…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-section-title text-foreground">
              Strategic Intelligence
            </h2>
            <p className="text-[10px] text-muted-foreground/40 tracking-wide">Converting knowledge into strategic signals</p>
          </div>
        </div>
        <button
          onClick={runPatternScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10 rounded-lg px-3.5 py-2 transition-colors disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "Scanning…" : "Detect Patterns"}
        </button>
      </div>

      {/* ── Evidence Overview ── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Layers className="w-4 h-4 text-primary/60" />
          <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.2em]">Knowledge Base</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="text-center">
            <p className="text-2xl font-light text-foreground tabular-nums">{evidence.totalEntries}</p>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mt-1">Captures</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-light text-foreground tabular-nums">{evidence.totalDocuments}</p>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mt-1">Documents</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-light text-foreground tabular-nums">{evidence.totalFragments}</p>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mt-1">Evidence</p>
          </div>
        </div>

        {evidence.topTypes.length > 0 && (
          <div className="pt-4 border-t border-border/8 space-y-2">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2">Evidence Distribution</p>
            {evidence.topTypes.map(({ type, count }) => (
              <EvidenceBar
                key={type}
                label={type.replace(/_/g, " ")}
                count={count}
                max={evidence.topTypes[0].count}
                color="bg-gradient-to-r from-primary/60 to-primary/30"
              />
            ))}
          </div>
        )}
      </div>

      {/* ── View Toggle ── */}
      <div className="flex gap-2 border-b border-border/10 pb-0">
        {[
          { key: "signals" as const, label: "Strategic Signals", icon: Zap, count: signals.length },
          { key: "evidence" as const, label: "Insight Generation", icon: Lightbulb },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveView(key)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all duration-300 ${
              activeView === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium tracking-wide">{label}</span>
            {count !== undefined && count > 0 && (
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Signals View ── */}
      {activeView === "signals" && (
        <div className="space-y-4">
          {signals.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 text-center border border-primary/[0.06]">
              <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-primary/30" />
              </div>
              <p className="text-sm text-muted-foreground/60 mb-1">No strategic signals detected yet.</p>
              <p className="text-[11px] text-muted-foreground/40 mb-4">Capture more insights to fuel pattern detection.</p>
              <button
                onClick={runPatternScan}
                disabled={scanning}
                className="text-xs text-primary hover:text-primary/80 bg-primary/8 hover:bg-primary/15 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                {scanning ? "Scanning evidence…" : "Run Pattern Detection"}
              </button>
            </div>
          ) : (
            signals.map((signal) => {
              const isExpanded = expandedId === signal.id;
              const fw = signal.framework_opportunity || {};
              const ct = signal.content_opportunity || {};
              const co = signal.consulting_opportunity || {};
              const confidencePct = Math.round(signal.confidence * 100);

              return (
                <div key={signal.id} className="glass-card rounded-2xl border border-primary/10 overflow-hidden transition-all duration-300 hover:border-primary/20">
                  {/* Confidence Bar */}
                  <div className="h-0.5 bg-muted/30">
                    <div className="h-full bg-gradient-to-r from-primary/60 to-primary/30 transition-all duration-500" style={{ width: `${confidencePct}%` }} />
                  </div>

                  {/* Signal Header */}
                  <button onClick={() => setExpandedId(isExpanded ? null : signal.id)} className="w-full p-5 flex items-start gap-4 text-left">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/10">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h4 className="text-sm font-bold text-foreground">{signal.signal_title}</h4>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                          confidencePct >= 80 ? "bg-emerald-500/15 text-emerald-400" :
                          confidencePct >= 60 ? "bg-primary/15 text-primary" :
                          "bg-muted/50 text-muted-foreground/60"
                        }`}>
                          {confidencePct}% match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{signal.explanation}</p>

                      {/* Evidence Summary */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="text-[9px] bg-secondary/40 text-muted-foreground/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <FileText className="w-2.5 h-2.5" /> {signal.fragment_count} evidence
                        </span>
                        {signal.theme_tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-[9px] bg-muted/30 text-muted-foreground/40 px-2 py-0.5 rounded-md">{tag}</span>
                        ))}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-1" />}
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-primary/[0.06] pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Strategic Insight */}
                      <OpportunitySection icon={Sparkles} label="Strategic Insight">
                        <p className="text-xs text-foreground/80 leading-relaxed mb-3">{signal.strategic_implications}</p>
                        {signal.skill_pillars.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {signal.skill_pillars.map((pillar, i) => (
                              <span key={i} className="text-[9px] bg-primary/8 text-primary/60 px-2.5 py-1 rounded-full border border-primary/10 font-medium">{pillar}</span>
                            ))}
                          </div>
                        )}
                      </OpportunitySection>

                      {/* Framework Opportunity */}
                      {fw.title && (
                        <OpportunitySection icon={Target} label="Framework Opportunity" accentClass="text-blue-400/80">
                          <p className="text-xs font-semibold text-foreground/90 mb-1">{fw.title}</p>
                          <p className="text-[11px] text-muted-foreground/60 mb-2.5 leading-relaxed">{fw.description}</p>
                          {fw.potential_steps?.length > 0 && (
                            <div className="space-y-1 mb-3">
                              {fw.potential_steps.map((step: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground/55">
                                  <span className="w-4 h-4 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0 text-primary/60 font-bold text-[8px] mt-0.5">{i + 1}</span>
                                  <span className="leading-relaxed">{step}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <button onClick={() => setBuilderData({ title: fw.title, description: fw.description || "", steps: fw.potential_steps || [] })} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors">
                            <ArrowRight className="w-3 h-3" /> Build Framework
                          </button>
                        </OpportunitySection>
                      )}

                      {/* Authority Opportunity */}
                      {ct.title && (
                        <OpportunitySection icon={Crown} label="Authority Opportunity" accentClass="text-amber-400/80">
                          <p className="text-xs font-semibold text-foreground/90 mb-1">{ct.title}</p>
                          {ct.hook && <p className="text-[11px] text-primary/60 italic leading-relaxed mb-1.5 pl-3 border-l-2 border-primary/15">"{ct.hook}"</p>}
                          {ct.angle && <p className="text-[11px] text-muted-foreground/55 leading-relaxed mb-2.5">{ct.angle}</p>}
                          <button onClick={() => setDraftData({ title: ct.title, hook: ct.hook || signal.explanation, angle: ct.angle || "Strategic thought leadership", context: signal.strategic_implications })} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors">
                            <ArrowRight className="w-3 h-3" /> Draft Post
                          </button>
                        </OpportunitySection>
                      )}

                      {/* Consulting Opportunity */}
                      {co.service_name && (
                        <OpportunitySection icon={Briefcase} label="Consulting Opportunity" accentClass="text-emerald-400/80">
                          <p className="text-xs font-semibold text-foreground/90 mb-1">{co.service_name}</p>
                          {co.problem && <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-1.5"><span className="text-foreground/50 font-medium">Problem:</span> {co.problem}</p>}
                          {co.target_clients && <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-1.5"><span className="text-foreground/50 font-medium">Target:</span> {co.target_clients}</p>}
                          {co.value_proposition && <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-2.5"><span className="text-foreground/50 font-medium">Value:</span> {co.value_proposition}</p>}
                          <button onClick={() => onOpenChat?.(`Develop a consulting proposal: "${co.service_name}" — Problem: ${co.problem}. Target: ${co.target_clients}. Value: ${co.value_proposition}`)} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors">
                            <ArrowRight className="w-3 h-3" /> Develop Proposal
                          </button>
                        </OpportunitySection>
                      )}

                      {/* Action Bar */}
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setExplorerSignal(signal)} className="flex-1 text-[11px] bg-primary/10 hover:bg-primary/20 text-primary rounded-xl py-2.5 px-4 transition-colors flex items-center justify-center gap-1.5 font-medium">
                          <Search className="w-3.5 h-3.5" /> Explore Evidence
                        </button>
                        <button onClick={() => setCarouselData({ title: signal.signal_title, description: signal.explanation, context: signal.strategic_implications })} className="text-[11px] bg-primary/5 hover:bg-primary/10 text-primary/70 rounded-xl py-2.5 px-3 transition-colors flex items-center gap-1.5 font-medium">
                          <LayoutGrid className="w-3.5 h-3.5" /> Carousel
                        </button>
                        <button onClick={() => dismissSignal(signal.id)} className="text-[11px] text-muted-foreground/30 hover:text-destructive/60 rounded-xl py-2.5 px-3 transition-colors flex items-center gap-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Insight Generation View ── */}
      {activeView === "evidence" && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 border border-primary/[0.06]">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-primary/60" />
              <p className="text-xs font-semibold text-foreground">How Intelligence Works</p>
            </div>
            <div className="space-y-4">
              {[
                { step: "1", title: "Capture", desc: "Notes, articles, voice notes, and research are stored as knowledge inputs.", icon: FileText },
                { step: "2", title: "Extract", desc: "AI breaks each capture into structured evidence fragments — claims, signals, frameworks, and insights.", icon: Layers },
                { step: "3", title: "Detect", desc: "Pattern detection scans all evidence to find recurring themes and emerging signals.", icon: Search },
                { step: "4", title: "Signal", desc: "Strong patterns become Strategic Signals with framework, authority, and consulting opportunities.", icon: Zap },
              ].map(({ step, title, desc, icon: Icon }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0 border border-primary/10">
                    <span className="text-[10px] font-bold text-primary">{step}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{title}</p>
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={runPatternScan}
              disabled={scanning}
              className="glass-card rounded-xl p-5 text-left hover:border-primary/15 border border-border/10 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <RefreshCw className={`w-4 h-4 text-primary ${scanning ? "animate-spin" : ""}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Run Pattern Detection</p>
                  <p className="text-[10px] text-muted-foreground/50">Scan all evidence for new signals</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => onOpenChat?.("Analyze my knowledge vault and identify the strongest strategic patterns")}
              className="glass-card rounded-xl p-5 text-left hover:border-primary/15 border border-border/10 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Ask Aura for Insights</p>
                  <p className="text-[10px] text-muted-foreground/50">Deep analysis of your knowledge</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <SignalExplorer signal={explorerSignal} open={!!explorerSignal} onClose={() => setExplorerSignal(null)} />
      <FrameworkBuilder open={!!builderData} onClose={() => setBuilderData(null)} initialTitle={builderData?.title || ""} initialDescription={builderData?.description || ""} initialSteps={builderData?.steps || []} />
      <LinkedInDraftPanel open={!!draftData} onClose={() => setDraftData(null)} title={draftData?.title || ""} hook={draftData?.hook} angle={draftData?.angle} context={draftData?.context} />
      <CarouselGenerator open={!!carouselData} onClose={() => setCarouselData(null)} title={carouselData?.title || ""} description={carouselData?.description} context={carouselData?.context} />
    </div>
  );
};

export default StrategicIntelligenceEngine;
