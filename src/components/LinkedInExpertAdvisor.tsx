import { useState, useEffect, useCallback } from "react";
import {
  Crown, Sparkles, Loader2, RefreshCw, Lightbulb,
  Zap, Target, PenTool, TrendingUp, TrendingDown,
  ArrowRight, Activity, AlertTriangle, Eye, Minus,
  ArrowUpRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/* ── Types ── */
interface EvidenceSources {
  linkedinPosts: number;
  captures: number;
  documents: number;
  frameworks: number;
}

interface ThemeEntry {
  theme: string;
  strength: "dominant" | "emerging" | "nascent";
  insight: string;
  evidenceSources: EvidenceSources;
  trend: "strengthening" | "stable" | "declining";
}

interface ThemeTrend {
  theme: string;
  trend: "strengthening" | "stable" | "declining" | "emerging";
  signalDelta: string;
}

interface StrategicOpportunity {
  type: "emerging_theme" | "declining_topic" | "underutilized_expertise" | "high_engagement_format" | "tone_gap";
  title: string;
  description: string;
  evidence: string;
  priority: "high" | "medium" | "low";
  action: string;
}

interface PriorityMove {
  topic: string;
  format: string;
  tone: string;
  reason: string;
  themeReinforced: string;
}

interface Advisory {
  becomingKnownFor: { headline: string; evidence: string[] };
  strongestThemes: ThemeEntry[];
  tonePerformance: { tone: string; effectiveness: "high" | "medium" | "low"; recommendation: string; usagePercent: number }[];
  bestFormats: { format: string; postCount: number; verdict: string }[];
  authorityEvolution: { trajectory: string; summary: string; themeTrends: ThemeTrend[] };
  strategicOpportunities: StrategicOpportunity[];
  priorityMove: PriorityMove;
  writeNext: { topic: string; angle: string; format: string; reason: string }[];
  weeklyBrief: string;
}

interface Meta {
  snapshotsUsed: number;
  totalPostsAnalyzed: number;
  entriesAnalyzed: number;
  documentsAnalyzed: number;
  frameworksAnalyzed: number;
  dateRange: { from: string; to: string } | null;
  generatedAt: string;
}

/* ── Helpers ── */
const priorityColor: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-secondary/30 text-muted-foreground/60 border-border/15",
};

const strengthColor: Record<string, string> = {
  dominant: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  emerging: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  nascent: "bg-secondary/30 text-muted-foreground/60 border-border/15",
};

const trajectoryIcon: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  accelerating: { icon: TrendingUp, color: "text-emerald-400", label: "Accelerating" },
  steady: { icon: Activity, color: "text-primary/70", label: "Steady Growth" },
  emerging: { icon: Sparkles, color: "text-amber-400", label: "Emerging" },
  pivoting: { icon: ArrowRight, color: "text-blue-400", label: "Pivoting" },
};

const trendIcon = (trend: string) => {
  if (trend === "strengthening" || trend === "emerging") return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="w-3 h-3 text-destructive" />;
  return <Minus className="w-3 h-3 text-muted-foreground/40" />;
};

const opportunityIcon: Record<string, typeof Sparkles> = {
  emerging_theme: Sparkles,
  declining_topic: AlertTriangle,
  underutilized_expertise: Eye,
  high_engagement_format: Zap,
  tone_gap: Lightbulb,
};

type TabKey = "overview" | "themes" | "opportunities" | "content";

interface LinkedInExpertAdvisorProps {
  hasSnapshots: boolean;
  refreshTrigger?: number;
}

const LinkedInExpertAdvisor = ({ hasSnapshots, refreshTrigger = 0 }: LinkedInExpertAdvisorProps) => {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { toast } = useToast();

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-expert-advisor");
      if (error || data?.error) {
        toast({ title: "Advisory generation failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setAdvisory(data.advisory);
        setMeta(data.meta);
      }
    } catch {
      toast({ title: "Error", description: "Could not generate advisory.", variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  // Auto-load on mount and when refreshTrigger changes
  useEffect(() => {
    generate();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "themes", label: "Authority Themes" },
    { key: "opportunities", label: "Opportunities" },
    { key: "content", label: "Content Ideas" },
  ];

  return (
    <section className="animate-fade-in">
      <h2 className="text-section-title text-foreground mb-2">Strategic Advisor</h2>
      <p className="text-meta mb-6">Continuous intelligence from your complete knowledge ecosystem.</p>

      {loading && !advisory ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-primary/30 mx-auto mb-4 animate-spin" />
          <p className="text-sm text-muted-foreground/50">Analyzing all knowledge sources…</p>
        </div>
      ) : advisory ? (
        <div className="space-y-4">
          {/* Meta + Refresh */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {meta && (
                <p className="text-xs text-muted-foreground/40">
                  {meta.snapshotsUsed > 0 && `${meta.snapshotsUsed} snapshots · `}
                  {meta.totalPostsAnalyzed > 0 && `${meta.totalPostsAnalyzed} posts · `}
                  {meta.entriesAnalyzed} captures · {meta.documentsAnalyzed} docs · {meta.frameworksAnalyzed} frameworks
                </p>
              )}
            </div>
            <Button onClick={generate} disabled={loading} variant="ghost" size="sm" className="text-xs gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {loading ? "Updating…" : "Refresh"}
            </Button>
          </div>

          {/* Priority Move Hero */}
          {advisory.priorityMove && (
            <div className="glass-card-elevated rounded-2xl p-8 gold-glow">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-primary" />
                <p className="text-label text-[11px]">Priority Strategic Move</p>
              </div>
              <p className="text-lg font-semibold text-foreground leading-snug mb-3" style={{ fontFamily: "var(--font-display)" }}>
                {advisory.priorityMove.topic}
              </p>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4" dir="auto">{advisory.priorityMove.reason}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-primary/8 text-primary/70 border border-primary/15">
                  {advisory.priorityMove.format}
                </span>
                <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-secondary/30 text-muted-foreground/60 border border-border/10">
                  {advisory.priorityMove.tone} tone
                </span>
                {advisory.priorityMove.themeReinforced && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/15">
                    Reinforces: {advisory.priorityMove.themeReinforced}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Authority Evolution */}
          {advisory.authorityEvolution && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary/70" />
                  <h3 className="text-sm font-semibold text-foreground">Authority Evolution</h3>
                </div>
                {(() => {
                  const t = trajectoryIcon[advisory.authorityEvolution.trajectory] || trajectoryIcon.steady;
                  const Icon = t.icon;
                  return (
                    <span className={`flex items-center gap-1.5 text-[10px] font-medium ${t.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed mb-5" dir="auto">
                {advisory.authorityEvolution.summary}
              </p>
              <div className="space-y-2">
                {advisory.authorityEvolution.themeTrends.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <div className="flex items-center gap-2">
                      {trendIcon(t.trend)}
                      <span className="text-xs font-medium text-foreground">{t.theme}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">{t.signalDelta}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-secondary/15 border border-border/10">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-secondary/40 text-foreground border border-border/20"
                    : "text-muted-foreground/50 hover:text-muted-foreground/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Becoming Known For */}
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-4 h-4 text-primary/70" />
                  <h3 className="text-sm font-semibold text-foreground">What You're Becoming Known For</h3>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed mb-4" dir="auto">{advisory.becomingKnownFor.headline}</p>
                <div className="space-y-2">
                  {advisory.becomingKnownFor.evidence.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground/60">
                      <ArrowUpRight className="w-3 h-3 mt-0.5 text-primary/40 shrink-0" />
                      <span dir="auto">{e}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Brief */}
              {advisory.weeklyBrief && (
                <div className="glass-card rounded-2xl p-6">
                  <p className="text-label text-[11px] mb-3">Strategic Brief</p>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line" dir="auto">
                    {advisory.weeklyBrief}
                  </p>
                </div>
              )}

              {/* Tone + Format Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Tone Performance */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Tone Performance</h3>
                  <div className="space-y-3">
                    {advisory.tonePerformance.map((t, i) => (
                      <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-foreground">{t.tone}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground/40">{t.usagePercent}% of posts</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${priorityColor[t.effectiveness] || priorityColor.low}`}>
                              {t.effectiveness}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 leading-relaxed" dir="auto">{t.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Format Performance */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Format Intelligence</h3>
                  <div className="space-y-3">
                    {advisory.bestFormats.map((f, i) => (
                      <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-foreground">{f.format}</span>
                          <span className="text-[9px] text-muted-foreground/40">{f.postCount} posts</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 leading-relaxed" dir="auto">{f.verdict}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "themes" && (
            <div className="space-y-3">
              {advisory.strongestThemes.map((t, i) => (
                <div key={i} className="glass-card rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t.theme}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${strengthColor[t.strength]}`}>
                        {t.strength}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {trendIcon(t.trend)}
                      <span className="text-[10px] text-muted-foreground/50">{t.trend}</span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/70 leading-relaxed mb-4" dir="auto">{t.insight}</p>
                  {/* Evidence Sources */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-border/10">
                    {t.evidenceSources.linkedinPosts > 0 && (
                      <span className="text-[9px] text-muted-foreground/40">
                        <span className="text-foreground/60 font-medium">{t.evidenceSources.linkedinPosts}</span> LinkedIn posts
                      </span>
                    )}
                    {t.evidenceSources.captures > 0 && (
                      <span className="text-[9px] text-muted-foreground/40">
                        <span className="text-foreground/60 font-medium">{t.evidenceSources.captures}</span> captures
                      </span>
                    )}
                    {t.evidenceSources.documents > 0 && (
                      <span className="text-[9px] text-muted-foreground/40">
                        <span className="text-foreground/60 font-medium">{t.evidenceSources.documents}</span> documents
                      </span>
                    )}
                    {t.evidenceSources.frameworks > 0 && (
                      <span className="text-[9px] text-muted-foreground/40">
                        <span className="text-foreground/60 font-medium">{t.evidenceSources.frameworks}</span> frameworks
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "opportunities" && (
            <div className="space-y-3">
              {advisory.strategicOpportunities.map((opp, i) => {
                const OppIcon = opportunityIcon[opp.type] || Lightbulb;
                return (
                  <div key={i} className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <OppIcon className="w-4 h-4 text-primary/60" />
                        <span className="text-sm font-semibold text-foreground">{opp.title}</span>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${priorityColor[opp.priority]}`}>
                        {opp.priority} priority
                      </span>
                    </div>
                    <p className="text-xs text-foreground/70 leading-relaxed mb-3" dir="auto">{opp.description}</p>
                    {/* Evidence */}
                    <div className="p-3 rounded-xl bg-secondary/10 border border-border/8 mb-3">
                      <p className="text-[10px] text-muted-foreground/50">
                        <span className="text-muted-foreground/70 font-medium">Evidence: </span>
                        <span dir="auto">{opp.evidence}</span>
                      </p>
                    </div>
                    {/* Action */}
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-primary/50 shrink-0" />
                      <p className="text-xs text-primary/70 font-medium leading-relaxed" dir="auto">{opp.action}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "content" && (
            <div className="space-y-3">
              {advisory.writeNext.map((w, i) => (
                <div key={i} className="glass-card rounded-2xl p-6 hover:border-primary/15 transition-all duration-200">
                  <p className="text-sm font-semibold text-foreground leading-snug mb-2" dir="auto">{w.topic}</p>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed mb-3" dir="auto">{w.reason}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/8 text-primary/70 border border-primary/15">{w.format}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-secondary/30 text-muted-foreground/60 border border-border/10">{w.angle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Crown className="w-10 h-10 text-primary/20 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground/60 mb-6 max-w-md mx-auto leading-relaxed">
            Generate a strategic advisory from your knowledge ecosystem — captures, documents, frameworks, and LinkedIn performance.
          </p>
          <Button onClick={generate} disabled={loading} variant="outline" className="min-w-[220px]">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? "Looking…" : "Generate Strategic Advisory"}
          </Button>
        </div>
      )}
    </section>
  );
};

export default LinkedInExpertAdvisor;
