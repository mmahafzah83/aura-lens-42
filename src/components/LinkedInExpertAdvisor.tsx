import { useState } from "react";
import {
  Crown, Sparkles, Loader2, RefreshCw, Lightbulb,
  Zap, Target, PenTool
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Advisory {
  becomingKnownFor: { headline: string; evidence: string[] };
  strongestThemes: { theme: string; strength: "dominant" | "emerging" | "nascent"; insight: string }[];
  tonePerformance: { tone: string; effectiveness: "high" | "medium" | "low"; recommendation: string }[];
  bestFormats: { format: string; postCount: number; verdict: string }[];
  growthOpportunities: { opportunity: string; rationale: string; priority: "high" | "medium" | "low" }[];
  writeNext: { topic: string; angle: string; format: string; reason: string }[];
  weeklyBrief: string;
}

interface Meta {
  snapshotsUsed: number;
  totalPostsAnalyzed: number;
  dateRange: { from: string; to: string };
  generatedAt: string;
}

const priorityColor: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-secondary/30 text-muted-foreground/60 border-border/15",
};

const LinkedInExpertAdvisor = ({ hasSnapshots }: { hasSnapshots: boolean }) => {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
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
      }
    } catch {
      toast({ title: "Error", description: "Could not generate advisory.", variant: "destructive" });
    }
    setLoading(false);
  };

  if (!hasSnapshots) return null;

  return (
    <section className="animate-fade-in">
      <h2 className="text-section-title text-foreground mb-2">Strategic Advisor</h2>
      <p className="text-meta mb-6">AI-generated recommendations from your real LinkedIn performance.</p>

      {!advisory ? (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Crown className="w-10 h-10 text-primary/20 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground/60 mb-6 max-w-md mx-auto leading-relaxed">
            Generate a strategic advisory from your synced data — authority themes, tone analysis, format performance, and specific content recommendations.
          </p>
          <Button onClick={generate} disabled={loading} variant="outline" className="min-w-[220px]">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? "Analyzing…" : "Generate Strategic Advisory"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Refresh header */}
          <div className="flex items-center justify-between">
            {meta && (
              <p className="text-xs text-muted-foreground/40">
                {meta.snapshotsUsed} snapshots · {meta.totalPostsAnalyzed} posts · {meta.dateRange.from} → {meta.dateRange.to}
              </p>
            )}
            <Button onClick={generate} disabled={loading} variant="ghost" size="sm" className="text-xs">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {/* Priority Move (Hero) */}
          {advisory.writeNext.length > 0 && (
            <div className="glass-card-elevated rounded-2xl p-8 gold-glow">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-primary" />
                <p className="text-label text-[11px]">Priority Move</p>
              </div>
              <p className="text-lg font-semibold text-foreground leading-snug mb-3" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {advisory.writeNext[0].topic}
              </p>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">{advisory.writeNext[0].reason}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-primary/8 text-primary/70 border border-primary/15">
                  {advisory.writeNext[0].format}
                </span>
                <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-secondary/30 text-muted-foreground/60 border border-border/10">
                  {advisory.writeNext[0].angle}
                </span>
              </div>
            </div>
          )}

          {/* Weekly Brief */}
          {advisory.weeklyBrief && (
            <div className="glass-card rounded-2xl p-6">
              <p className="text-label text-[11px] mb-3">Weekly Brief</p>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line" dir="auto">
                {advisory.weeklyBrief}
              </p>
            </div>
          )}

          {/* Content Ideas */}
          {advisory.writeNext.length > 1 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <PenTool className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Content Ideas</h3>
              </div>
              <div className="space-y-3">
                {advisory.writeNext.slice(1).map((w, i) => (
                  <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all duration-200">
                    <p className="text-xs font-semibold text-foreground leading-snug mb-2">{w.topic}</p>
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-2">{w.reason}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-primary/8 text-primary/70 border border-primary/15">{w.format}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-secondary/30 text-muted-foreground/60 border border-border/10">{w.angle}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Growth Opportunities */}
          {advisory.growthOpportunities.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Growth Opportunities</h3>
              </div>
              <div className="space-y-3">
                {advisory.growthOpportunities.map((g, i) => (
                  <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-foreground">{g.opportunity}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${priorityColor[g.priority] || priorityColor.low}`}>
                        {g.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{g.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default LinkedInExpertAdvisor;
