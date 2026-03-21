import { useState, useEffect } from "react";
import { BookOpen, ExternalLink, Loader2, RefreshCw, Brain, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Recommendation {
  title: string;
  author: string;
  type: string;
  url: string | null;
  skill_gap: string;
  intelligence_value: string;
  estimated_read_minutes: number;
}

interface SkillGap {
  name: string;
  currentRating: number;
  gap: number;
}

const SovereignReadingList = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [skillGaps, setSkillGaps] = useState<SkillGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("sovereign-reading-list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      setRecommendations(data.recommendations || []);
      setSkillGaps(data.skill_gaps || []);
      setLoaded(true);
    } catch (err) {
      console.error("Failed to fetch reading list:", err);
    } finally {
      setLoading(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "whitepaper": return "📄";
      case "book": return "📚";
      case "article": return "📰";
      case "toolkit": return "🛠";
      default: return "📄";
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Sovereign Reading List</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">AI-curated to close your largest skill gaps</p>
          </div>
        </div>
        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="text-muted-foreground/50 hover:text-primary transition-colors tactile-press"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {!loaded && !loading && (
        <button
          onClick={fetchRecommendations}
          className="w-full py-8 rounded-xl border border-dashed border-border/20 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/20 transition-all duration-200 flex flex-col items-center gap-2"
        >
          <BookOpen className="w-5 h-5" />
          <span>Generate your personalized reading list</span>
        </button>
      )}

      {loaded && skillGaps.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {skillGaps.map((gap) => (
            <div key={gap.name} className="px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/15 text-[10px] text-destructive">
              <span className="font-semibold">{gap.name}</span>
              <span className="text-destructive/60 ml-1">({gap.gap}% gap)</span>
            </div>
          ))}
        </div>
      )}

      {loaded && recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendations.map((rec, i) => (
            <div key={i} className="rounded-xl bg-muted/5 border border-border/10 p-4 hover:border-primary/15 transition-all">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{typeIcon(rec.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground/90 truncate">{rec.title}</h4>
                    {rec.url && (
                      <a
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary/60 hover:text-primary shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{rec.author}</p>
                  <p className="text-xs text-foreground/60 mt-2 leading-relaxed">{rec.intelligence_value}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-primary/60 px-2 py-0.5 rounded-md bg-primary/5 border border-primary/10">
                      Closes: {rec.skill_gap}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rec.estimated_read_minutes} min
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && recommendations.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground/40 text-center py-6">
          Complete the Executive Diagnostic to get personalized recommendations.
        </p>
      )}
    </div>
  );
};

export default SovereignReadingList;
