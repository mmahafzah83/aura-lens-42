import { useState } from "react";
import {
  Search, Loader2, Crown, Mic2, Target,
  TrendingUp, Globe, Sparkles, ArrowRight, Lightbulb, Save, CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AuthorityTheme {
  theme: string;
  evidence_signals: string[];
  confidence: "high" | "medium" | "low";
  stage: "dominant" | "emerging" | "nascent";
}

interface ToneEntry {
  tone: string;
  strength: "high" | "medium" | "low";
}

interface InfluenceSignals {
  posting_frequency: string;
  topic_consistency: string;
  industry_positioning: string;
}

interface ProfileAnalysis {
  name: string;
  headline: string;
  strategic_positioning: string;
  authority_themes: AuthorityTheme[];
  tone_profile: ToneEntry[];
  content_formats: string[];
  influence_signals: InfluenceSignals;
  industries: string[];
  recommendations: string[];
}

const confidenceColor = (c: string) =>
  c === "high" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
  : c === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/15"
  : "bg-secondary/30 text-muted-foreground/50 border-border/10";

const stageLabel = (s: string) =>
  s === "dominant" ? "Dominant" : s === "emerging" ? "Emerging" : "Nascent";

const LinkedInProfileAnalyzer = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const { toast } = useToast();

  const handleSaveToKnowledge = async () => {
    if (!analysis) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }

      const themeSummary = analysis.authority_themes
        .map(t => `${t.theme} (${t.stage}, ${t.confidence} confidence) — evidence: ${t.evidence_signals.join(", ")}`)
        .join("\n");
      const toneSummary = analysis.tone_profile.map(t => `${t.tone}: ${t.strength}`).join(", ");
      const content = [
        `Strategic Positioning: ${analysis.strategic_positioning}`,
        `\nAuthority Themes:\n${themeSummary}`,
        `\nTone Profile: ${toneSummary}`,
        `\nIndustries: ${analysis.industries.join(", ")}`,
        `\nInfluence Signals: Posting ${analysis.influence_signals.posting_frequency}, Consistency ${analysis.influence_signals.topic_consistency}, ${analysis.influence_signals.industry_positioning}`,
        analysis.content_formats.length ? `\nContent Formats: ${analysis.content_formats.join(", ")}` : "",
        analysis.recommendations.length ? `\nRecommendations:\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : "",
      ].filter(Boolean).join("\n");

      const skillPillars = analysis.authority_themes
        .filter(t => t.confidence !== "low")
        .map(t => t.theme)
        .slice(0, 5);

      const { error } = await supabase.from("learned_intelligence").insert({
        user_id: user.id,
        title: `Profile Analysis: ${analysis.name || "LinkedIn Profile"}`,
        content,
        intelligence_type: "profile_analysis",
        skill_pillars: skillPillars,
        tags: [...analysis.industries, ...analysis.content_formats].slice(0, 10),
        skill_boost_pct: 5,
      });

      if (error) throw error;
      setSaved(true);
      toast({ title: "Saved to Knowledge", description: "Authority themes and insights stored for cross-source analysis." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    if (!url.includes("linkedin.com/in/")) {
      toast({ title: "Invalid URL", description: "Please paste a LinkedIn profile URL (e.g. linkedin.com/in/username)", variant: "destructive" });
      return;
    }

    setLoading(true);
    setAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-linkedin-profile", {
        body: { url: url.trim() },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Analysis failed", description: data.error, variant: "destructive" });
      } else {
        setAnalysis(data);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to analyze profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="animate-fade-in">
      <h2 className="text-section-title text-foreground mb-2">Analyze LinkedIn Profile</h2>
      <p className="text-meta mb-6">Paste a LinkedIn profile URL to extract strategic authority insights — no API connection required.</p>

      {/* Input card */}
      <div className="glass-card rounded-2xl p-6 mb-8">
        <div className="flex gap-3">
          <Input
            placeholder="https://www.linkedin.com/in/username"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-secondary/20 border-border/15"
            onKeyDown={(e) => e.key === "Enter" && !loading && handleAnalyze()}
          />
          <Button
            onClick={handleAnalyze}
            disabled={loading || !url.trim()}
            className="gap-2 px-6"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Analyzing…" : "Analyze Profile"}
          </Button>
        </div>
      </div>

      {/* Results */}
      {analysis && (
        <div className="space-y-8 animate-fade-in">

          {/* Strategic Positioning — Hero */}
          <div className="glass-card-elevated rounded-2xl p-8 gold-glow">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">Strategic Authority Position</h3>
            </div>
            {analysis.name && (
              <p className="text-label text-[11px] mb-3">{analysis.name} · {analysis.headline}</p>
            )}
            <p className="text-body text-foreground/90 leading-relaxed" dir="auto">
              {analysis.strategic_positioning}
            </p>
            {analysis.industries.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border/10">
                <p className="text-label text-[10px] mb-3">Industries</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.industries.map((ind, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/8 text-primary/80 border border-primary/15">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Authority Themes + Tone + Content Formats grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Authority Themes */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Crown className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Authority Themes</h3>
              </div>
              <div className="space-y-3">
                {analysis.authority_themes.map((t, i) => (
                  <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">{t.theme}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${confidenceColor(t.confidence)}`}>
                        {stageLabel(t.stage)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.evidence_signals.map((s, j) => (
                        <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/30 text-muted-foreground/50">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tone Profile */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Mic2 className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Tone Profile</h3>
              </div>
              <div className="space-y-3">
                {analysis.tone_profile.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <span className="text-xs font-medium text-foreground">{t.tone}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${confidenceColor(t.strength)}`}>
                      {t.strength} signal
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Formats + Influence */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Influence Signals</h3>
              </div>
              <div className="space-y-3 mb-5">
                {[
                  { label: "Posting Frequency", value: analysis.influence_signals.posting_frequency },
                  { label: "Topic Consistency", value: analysis.influence_signals.topic_consistency },
                  { label: "Industry Position", value: analysis.influence_signals.industry_positioning },
                ].map((s, i) => (
                  <div key={i} className="p-3 rounded-xl bg-secondary/15 border border-border/10">
                    <p className="text-label text-[10px] mb-1">{s.label}</p>
                    <p className="text-xs font-medium text-foreground/80">{s.value}</p>
                  </div>
                ))}
              </div>
              {analysis.content_formats.length > 0 && (
                <>
                  <p className="text-label text-[10px] mb-3">Detected Formats</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.content_formats.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-secondary/20 text-muted-foreground/60 border border-border/10">
                        {f}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Lightbulb className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground">Strategic Recommendations</h3>
              </div>
              <div className="space-y-3">
                {analysis.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-secondary/15 border border-border/10">
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-primary/50 shrink-0" />
                    <p className="text-sm text-foreground/80 leading-relaxed" dir="auto">{r}</p>
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

export default LinkedInProfileAnalyzer;
