import { useState, useEffect } from "react";
import {
  Brain, Loader2, RefreshCw, Sparkles,
  Linkedin, FileText, Mic2, PenTool, BookOpen,
  Layers, Globe, MessageSquare, ArrowRight,
  CheckCircle2, AlertCircle, ChevronRight,
  Target, Lightbulb, Crown, BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

/* ── Types ── */
interface AuthorityTheme {
  name: string;
  stage: "dominant" | "emerging" | "nascent";
  confidence: "high" | "medium" | "low";
  description: string;
  evidence_count: number;
  source_distribution: Record<string, number>;
  linkedin_validated?: boolean;
  linkedin_signal?: string;
}

interface ToneEntry {
  tone: string;
  frequency: string;
  effectiveness: string;
  evidence_source?: string;
}

interface FormatEntry {
  format: string;
  usage_frequency: string;
  engagement_signal: string;
  recommendation?: string;
}

interface AdvisorEntry {
  type: "publish" | "reinforce" | "format" | "gap";
  title: string;
  rationale: string;
}

interface IntelligenceResult {
  authority_themes: AuthorityTheme[];
  tone_intelligence?: ToneEntry[];
  content_format_intelligence?: FormatEntry[];
  industry_focus?: { industry: string; strength: string }[];
  language_signals?: { signal: string; context: string }[];
  strategic_identity_summary?: string;
  strategic_advisor?: AdvisorEntry[];
  pipeline_recommendation?: string;
  pipeline_stats: Record<string, number>;
  total_sources: number;
  linkedin_active: boolean;
  generated_at: string;
  message?: string;
  // Legacy compat
  tone_patterns?: { tone: string; frequency: string; effectiveness?: string }[];
}

/* ── Constants ── */
const stageColor: Record<string, string> = {
  dominant: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  emerging: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  nascent: "bg-secondary/30 text-muted-foreground/60 border-border/15",
};

const confidenceColor: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-muted-foreground/50",
};

const effectivenessColor: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  strong: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  moderate: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  low: "bg-secondary/30 text-muted-foreground/50 border-border/10",
  weak: "bg-secondary/30 text-muted-foreground/50 border-border/10",
  unknown: "bg-secondary/20 text-muted-foreground/30 border-border/5",
};

const advisorIcons: Record<string, any> = {
  publish: PenTool,
  reinforce: Crown,
  format: BarChart3,
  gap: Target,
};

const sourceIcons: Record<string, { icon: any; label: string }> = {
  linkedin_posts: { icon: Linkedin, label: "LinkedIn posts" },
  quick_captures: { icon: PenTool, label: "Quick captures" },
  documents: { icon: FileText, label: "Documents" },
  uploaded_documents: { icon: FileText, label: "Documents" },
  research_notes: { icon: BookOpen, label: "Research notes" },
  voice_insights: { icon: Mic2, label: "Voice insights" },
  draft_content: { icon: MessageSquare, label: "Draft content" },
  frameworks: { icon: Layers, label: "Frameworks" },
  strategic_frameworks: { icon: Layers, label: "Frameworks" },
  evidence_fragments: { icon: Sparkles, label: "Evidence" },
  learned_intelligence: { icon: Brain, label: "Intelligence" },
};

const pipelineStages = [
  { label: "Capture", key: "captures" },
  { label: "Signals", key: "signals" },
  { label: "Insights", key: "insights" },
  { label: "Frameworks", key: "frameworks" },
  { label: "Authority", key: "authority" },
  { label: "Influence", key: "influence" },
];

type Section = "themes" | "patterns" | "advisor" | "pipeline";

const KnowledgeIntelligenceEngine = () => {
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("themes");
  const { toast } = useToast();

  const analyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("knowledge-intelligence");
      if (error || data?.error) {
        toast({ title: "Analysis failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setResult(data);
        if (data.message) {
          toast({ title: "Not enough data", description: data.message });
        }
      }
    } catch {
      toast({ title: "Error", description: "Could not run knowledge intelligence.", variant: "destructive" });
    }
    setLoading(false);
  };

  // Auto-load on mount
  useEffect(() => { analyze(); }, []);

  const tones: ToneEntry[] = result?.tone_intelligence || result?.tone_patterns?.map(t => ({ tone: t.tone, frequency: t.frequency, effectiveness: t.effectiveness || "unknown", evidence_source: undefined })) || [];
  const formats = result?.content_format_intelligence || [];
  const advisor = result?.strategic_advisor || [];

  /* ── Loading state ── */
  if (loading && !result) {
    return (
      <section className="animate-fade-in">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-section-title text-foreground">Authority Intelligence</h2>
            <p className="text-meta">Cross-source authority pattern analysis</p>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-10 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary/25 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted-foreground/50">Analyzing all knowledge sources…</p>
          </div>
        </div>
      </section>
    );
  }

  /* ── Empty / not enough data ── */
  if (!result || result.message) {
    return (
      <section className="animate-fade-in">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-section-title text-foreground">Authority Intelligence</h2>
            <p className="text-meta">Cross-source authority pattern analysis</p>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-8 text-center">
          <Brain className="w-12 h-12 text-primary/15 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground/60 mb-2 max-w-lg mx-auto leading-relaxed">
            {result?.message || "Analyze all your knowledge sources — LinkedIn posts, captures, documents, research, voice notes, and frameworks — to detect recurring authority themes."}
          </p>
          <Button onClick={analyze} disabled={loading} variant="outline" className="min-w-[220px] mt-4">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? "Analyzing…" : "Run Authority Intelligence"}
          </Button>
        </div>
      </section>
    );
  }

  const themes = result.authority_themes || [];
  const maxEvidence = Math.max(...themes.map(t => t.evidence_count), 1);

  return (
    <section className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-section-title text-foreground">Authority Intelligence</h2>
            <p className="text-meta">{result.total_sources} sources · {themes.length} themes · {tones.length} tones · {formats.length} formats</p>
          </div>
        </div>
        <Button onClick={analyze} disabled={loading} variant="ghost" size="sm" className="text-xs">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Strategic Identity Summary — Hero */}
      {result.strategic_identity_summary && (
        <div className="glass-card-elevated rounded-2xl p-8 gold-glow">
          <p className="text-label text-[11px] mb-3">Strategic Authority Position</p>
          <p className="text-body text-foreground/90 leading-relaxed" dir="auto">
            {result.strategic_identity_summary}
          </p>
          {result.linkedin_active && (
            <div className="mt-4 pt-4 border-t border-border/10 flex items-center gap-2">
              <Linkedin className="w-3.5 h-3.5 text-[hsl(207_100%_62%)]" />
              <span className="text-[10px] text-muted-foreground/50">LinkedIn audience validation active</span>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Visualization */}
      <div className="glass-card rounded-2xl p-6">
        <p className="text-label text-[11px] mb-5">Intelligence Pipeline</p>
        <div className="flex items-center gap-1">
          {pipelineStages.map((stage, i) => {
            const stats = result.pipeline_stats;
            const stageCount = stage.key === "captures"
              ? (stats.quick_captures || 0) + (stats.voice_insights || 0) + (stats.research_notes || 0) + (stats.draft_content || 0)
              : stage.key === "signals" ? (stats.evidence_fragments || 0)
              : stage.key === "insights" ? (stats.learned_intelligence || 0)
              : stage.key === "frameworks" ? (stats.strategic_frameworks || 0)
              : stage.key === "authority" ? themes.length
              : stage.key === "influence" ? (stats.linkedin_posts || 0)
              : 0;
            const active = stageCount > 0;

            return (
              <div key={stage.key} className="flex items-center flex-1">
                <div className={`flex-1 text-center p-3 rounded-xl transition-all ${
                  active ? "bg-primary/8 border border-primary/15" : "bg-secondary/10 border border-border/5"
                }`}>
                  <p className={`text-lg font-bold tabular-nums ${active ? "text-foreground" : "text-muted-foreground/25"}`}>
                    {stageCount}
                  </p>
                  <p className="text-[9px] text-muted-foreground/40 font-medium mt-0.5">{stage.label}</p>
                </div>
                {i < pipelineStages.length - 1 && (
                  <ChevronRight className={`w-3 h-3 mx-0.5 flex-shrink-0 ${active ? "text-primary/30" : "text-muted-foreground/10"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 flex-wrap">
        {([
          { key: "themes" as Section, label: "Authority Themes", icon: Sparkles },
          { key: "patterns" as Section, label: "Patterns & Signals", icon: Globe },
          { key: "advisor" as Section, label: "Strategic Advisor", icon: Lightbulb },
          { key: "pipeline" as Section, label: "Sources", icon: Layers },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSection(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 tactile-press ${
              activeSection === t.key
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary/20"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ AUTHORITY THEMES ═══════ */}
      {activeSection === "themes" && (
        <div className="space-y-4">
          {themes.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/40">Not enough data to detect authority themes yet.</p>
            </div>
          ) : (
            themes.map((theme, i) => (
              <div key={i} className="glass-card rounded-2xl p-6 hover:border-primary/15 transition-all duration-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-bold text-foreground">{theme.name}</h3>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium capitalize ${stageColor[theme.stage]}`}>
                        {theme.stage}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/60 leading-relaxed">{theme.description}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className={`text-lg font-bold tabular-nums ${confidenceColor[theme.confidence]}`}>{theme.evidence_count}</p>
                    <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">evidence</p>
                  </div>
                </div>

                <div className="mb-4">
                  <Progress value={(theme.evidence_count / maxEvidence) * 100} className="h-1" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {Object.entries(theme.source_distribution || {}).filter(([, v]) => v > 0).map(([key, count]) => {
                    const src = sourceIcons[key];
                    const Icon = src?.icon || FileText;
                    const label = src?.label || key.replace(/_/g, " ");
                    return (
                      <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/10 border border-border/5">
                        <Icon className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                        <span className="text-[10px] text-muted-foreground/50 truncate">{label}</span>
                        <span className="text-[10px] font-bold text-foreground tabular-nums ml-auto">{count}</span>
                      </div>
                    );
                  })}
                </div>

                {theme.linkedin_validated && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-[hsl(207_100%_62%/0.05)] border border-[hsl(207_100%_62%/0.1)]">
                    <Linkedin className="w-3.5 h-3.5 text-[hsl(207_100%_62%)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-medium text-[hsl(207_100%_62%/0.8)]">LinkedIn Validated</p>
                      {theme.linkedin_signal && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{theme.linkedin_signal}</p>}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className={`w-3 h-3 ${confidenceColor[theme.confidence]}`} />
                  <span className="text-[10px] text-muted-foreground/40 capitalize">{theme.confidence} confidence</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════ PATTERNS & SIGNALS ═══════ */}
      {activeSection === "patterns" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tone Intelligence */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Mic2 className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Tone Intelligence</h3>
            </div>
            {tones.length > 0 ? (
              <div className="space-y-3">
                {tones.map((t, i) => (
                  <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground capitalize">{t.tone}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${effectivenessColor[t.effectiveness] || effectivenessColor.unknown}`}>
                        {t.effectiveness !== "unknown" ? `${t.effectiveness} effectiveness` : t.frequency}
                      </span>
                    </div>
                    {t.evidence_source && (
                      <p className="text-[9px] text-muted-foreground/40 mt-1">{t.evidence_source}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 text-center py-6">No tone patterns detected yet.</p>
            )}
          </div>

          {/* Content Format Intelligence */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Content Formats</h3>
            </div>
            {formats.length > 0 ? (
              <div className="space-y-3">
                {formats.map((f, i) => (
                  <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{f.format}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${effectivenessColor[f.engagement_signal] || effectivenessColor.unknown}`}>
                        {f.engagement_signal !== "unknown" ? `${f.engagement_signal} engagement` : f.usage_frequency}
                      </span>
                    </div>
                    {f.recommendation && (
                      <p className="text-[9px] text-muted-foreground/40 mt-1">{f.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 text-center py-6">No content format data yet.</p>
            )}
          </div>

          {/* Industry Focus + Language Signals */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Globe className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Industry Focus</h3>
              </div>
              {(result.industry_focus || []).length > 0 ? (
                <div className="space-y-3">
                  {(result.industry_focus || []).map((ind, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/10">
                      <span className="text-xs font-medium text-foreground">{ind.industry}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${stageColor[ind.strength] || stageColor.nascent}`}>
                        {ind.strength}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/30 text-center py-4">No industry focus detected.</p>
              )}
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Language Signals</h3>
              </div>
              {(result.language_signals || []).length > 0 ? (
                <div className="space-y-3">
                  {(result.language_signals || []).slice(0, 5).map((s, i) => (
                    <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                      <p className="text-xs font-semibold text-foreground mb-1">"{s.signal}"</p>
                      <p className="text-[10px] text-muted-foreground/50">{s.context}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/30 text-center py-4">No language signals detected.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ STRATEGIC ADVISOR ═══════ */}
      {activeSection === "advisor" && (
        <div className="space-y-4">
          {advisor.length > 0 ? (
            advisor.map((a, i) => {
              const Icon = advisorIcons[a.type] || Lightbulb;
              return (
                <div key={i} className="glass-card rounded-2xl p-6 hover:border-primary/15 transition-all duration-200">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/15">
                      <Icon className="w-4 h-4 text-primary/70" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                          a.type === "publish" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
                          : a.type === "reinforce" ? "bg-primary/10 text-primary border-primary/15"
                          : a.type === "format" ? "bg-blue-500/10 text-blue-400 border-blue-500/15"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/15"
                        }`}>
                          {a.type === "publish" ? "Priority Publish" : a.type === "reinforce" ? "Reinforce Theme" : a.type === "format" ? "Format Strategy" : "Strategic Gap"}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-foreground mb-2">{a.title}</h3>
                      <p className="text-xs text-muted-foreground/60 leading-relaxed" dir="auto">{a.rationale}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="glass-card rounded-2xl p-10 text-center">
              <Lightbulb className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/40">No strategic recommendations yet. Add more content to generate advisor insights.</p>
            </div>
          )}

          {result.pipeline_recommendation && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <Sparkles className="w-4 h-4 text-primary/60 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-label text-[10px] mb-1">Pipeline Insight</p>
                  <p className="text-xs text-foreground/70 leading-relaxed">{result.pipeline_recommendation}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ SOURCE DISTRIBUTION ═══════ */}
      {activeSection === "pipeline" && (
        <div className="glass-card rounded-2xl p-6">
          <p className="text-label text-[11px] mb-5">Content Sources Powering Your Intelligence</p>
          <div className="space-y-3">
            {Object.entries(result.pipeline_stats)
              .filter(([, v]) => v > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => {
                const src = sourceIcons[key];
                const Icon = src?.icon || FileText;
                const label = src?.label || key.replace(/_/g, " ");
                const pct = Math.round((count / result.total_sources) * 100);
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground/40" />
                        <span className="text-xs font-medium text-foreground/80 capitalize">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground tabular-nums">{count}</span>
                        <span className="text-[10px] text-muted-foreground/30 tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1" />
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
};

export default KnowledgeIntelligenceEngine;
