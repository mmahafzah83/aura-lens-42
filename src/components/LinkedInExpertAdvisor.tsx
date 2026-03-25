import { useState } from "react";
import {
  Crown, Sparkles, Mic2, MessageSquare, Rocket,
  PenTool, FileText, Loader2, RefreshCw, Lightbulb,
  ArrowUpRight, Shield, Zap, TrendingUp, ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Advisory {
  becomingKnownFor: {
    headline: string;
    evidence: string[];
  };
  strongestThemes: {
    theme: string;
    strength: "dominant" | "emerging" | "nascent";
    insight: string;
  }[];
  tonePerformance: {
    tone: string;
    effectiveness: "high" | "medium" | "low";
    recommendation: string;
  }[];
  bestFormats: {
    format: string;
    postCount: number;
    verdict: string;
  }[];
  growthOpportunities: {
    opportunity: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }[];
  writeNext: {
    topic: string;
    angle: string;
    format: string;
    reason: string;
  }[];
  weeklyBrief: string;
}

interface Meta {
  snapshotsUsed: number;
  totalPostsAnalyzed: number;
  dateRange: { from: string; to: string };
  generatedAt: string;
}

const strengthStyles = {
  dominant: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  emerging: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  nascent: "bg-primary/10 text-primary/70 border-primary/20",
};

const effectivenessStyles = {
  high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-muted text-muted-foreground/60 border-border/20",
};

const priorityStyles = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-secondary text-muted-foreground/60 border-border/20",
};

const LinkedInExpertAdvisor = ({ hasSnapshots }: { hasSnapshots: boolean }) => {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("brief");
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-expert-advisor");
      if (error || data?.error) {
        toast({ title: "Advisory generation failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setAdvisory(data.advisory);
        setMeta(data.meta);
        setExpandedSection("brief");
      }
    } catch {
      toast({ title: "Error", description: "Could not generate advisory.", variant: "destructive" });
    }
    setLoading(false);
  };

  const toggle = (key: string) => setExpandedSection(prev => prev === key ? null : key);

  if (!hasSnapshots) return null;

  if (!advisory) {
    return (
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              LinkedIn Expert Advisor
            </h2>
            <p className="text-[10px] text-muted-foreground/50 tracking-wide">
              AI-powered strategic analysis of your real LinkedIn data
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/60 mb-4 leading-relaxed">
          Generate a comprehensive advisory from your synced LinkedIn snapshots — including authority themes, tone performance, format analysis, growth opportunities, and specific content recommendations.
        </p>
        <Button onClick={generate} disabled={loading} className="w-full" variant="outline">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {loading ? "Analyzing your LinkedIn data…" : "Generate Expert Advisory"}
        </Button>
      </div>
    );
  }

  const sections = [
    { key: "brief", icon: FileText, label: "Weekly Brief", color: "text-primary" },
    { key: "known", icon: Crown, label: "What You're Becoming Known For", color: "text-primary" },
    { key: "themes", icon: Sparkles, label: "Strongest Authority Themes", color: "text-amber-400" },
    { key: "tones", icon: Mic2, label: "Tone Performance Analysis", color: "text-emerald-400" },
    { key: "formats", icon: MessageSquare, label: "Best-Performing Formats", color: "text-blue-400" },
    { key: "growth", icon: Rocket, label: "Growth Opportunities", color: "text-red-400" },
    { key: "write", icon: PenTool, label: "What to Write Next", color: "text-violet-400" },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                LinkedIn Expert Advisor
              </h2>
              <p className="text-[10px] text-muted-foreground/50 tracking-wide">
                {meta ? `${meta.snapshotsUsed} snapshots · ${meta.totalPostsAnalyzed} posts · ${meta.dateRange.from} → ${meta.dateRange.to}` : "Strategic advisory"}
              </p>
            </div>
          </div>
          <Button onClick={generate} disabled={loading} variant="ghost" size="sm" className="text-xs">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Accordion sections */}
      {sections.map(({ key, icon: Icon, label, color }) => {
        const isOpen = expandedSection === key;
        return (
          <div key={key} className="glass-card rounded-2xl overflow-hidden border border-border/10 hover:border-primary/15 transition-all">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 p-4 sm:p-5 text-left tactile-press"
            >
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <span className="text-sm font-semibold text-foreground flex-1">{label}</span>
              <ChevronRight className={`w-4 h-4 text-muted-foreground/40 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
            </button>

            {isOpen && (
              <div className="px-4 sm:px-5 pb-5 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
                {key === "brief" && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/10">
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line" dir="auto">{advisory.weeklyBrief}</p>
                  </div>
                )}

                {key === "known" && (
                  <div className="space-y-3">
                    <div className="p-5 rounded-xl bg-gradient-to-br from-primary/8 to-transparent border border-primary/15">
                      <p className="text-sm font-medium text-foreground leading-relaxed" dir="auto">
                        "{advisory.becomingKnownFor.headline}"
                      </p>
                    </div>
                    {advisory.becomingKnownFor.evidence.length > 0 && (
                      <div className="space-y-2 pl-1">
                        <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-semibold">Supporting Evidence</p>
                        {advisory.becomingKnownFor.evidence.map((e, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <Shield className="w-3 h-3 text-primary/50 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{e}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {key === "themes" && (
                  <div className="space-y-2.5">
                    {advisory.strongestThemes.map((t, i) => (
                      <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground capitalize">{t.theme}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${strengthStyles[t.strength]}`}>
                            {t.strength}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{t.insight}</p>
                      </div>
                    ))}
                  </div>
                )}

                {key === "tones" && (
                  <div className="space-y-2.5">
                    {advisory.tonePerformance.map((t, i) => (
                      <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground capitalize">{t.tone}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${effectivenessStyles[t.effectiveness]}`}>
                            {t.effectiveness} effectiveness
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{t.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {key === "formats" && (
                  <div className="space-y-2.5">
                    {advisory.bestFormats.map((f, i) => (
                      <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground">{f.format}</span>
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{f.postCount} posts</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{f.verdict}</p>
                      </div>
                    ))}
                  </div>
                )}

                {key === "growth" && (
                  <div className="space-y-2.5">
                    {advisory.growthOpportunities.map((g, i) => (
                      <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all">
                        <div className="flex items-start gap-3">
                          <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-foreground">{g.opportunity}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium shrink-0 ml-2 ${priorityStyles[g.priority]}`}>
                                {g.priority}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{g.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {key === "write" && (
                  <div className="space-y-3">
                    {advisory.writeNext.map((w, i) => (
                      <div key={i} className="p-4 rounded-xl bg-gradient-to-br from-secondary/20 to-transparent border border-border/10 hover:border-primary/15 transition-all">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-primary/50 mt-0.5 tabular-nums w-5 shrink-0">{i + 1}.</span>
                          <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-xs font-semibold text-foreground leading-snug">{w.topic}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/8 text-primary/70 border border-primary/15">{w.format}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground/60 border border-border/10">{w.angle}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{w.reason}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LinkedInExpertAdvisor;
