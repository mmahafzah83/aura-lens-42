import { useState, useEffect } from "react";
import { Loader2, Zap, Target, Crown, FileText, ArrowRight, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface InsightItem {
  id: string;
  type: "signal" | "framework" | "authority" | "content";
  title: string;
  description: string;
  confidence?: number;
  created_at: string;
}

const ICONS = {
  signal: Zap,
  framework: Target,
  authority: Crown,
  content: FileText,
};

const COLORS = {
  signal: { bg: "from-amber-500/15 to-amber-500/5", text: "text-amber-400", badge: "bg-amber-500/10 text-amber-400" },
  framework: { bg: "from-blue-500/15 to-blue-500/5", text: "text-blue-400", badge: "bg-blue-500/10 text-blue-400" },
  authority: { bg: "from-primary/15 to-primary/5", text: "text-primary", badge: "bg-primary/10 text-primary" },
  content: { bg: "from-emerald-500/15 to-emerald-500/5", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400" },
};

const ExecutiveInsightFeed = () => {
  const [items, setItems] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const [signalsRes, frameworksRes, activationsRes] = await Promise.all([
          supabase
            .from("strategic_signals")
            .select("id, signal_title, explanation, confidence, created_at")
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("master_frameworks")
            .select("id, title, summary, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("framework_activations")
            .select("id, title, output_type, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const combined: InsightItem[] = [];

        signalsRes.data?.forEach(s => combined.push({
          id: s.id, type: "signal",
          title: s.signal_title, description: s.explanation,
          confidence: s.confidence, created_at: s.created_at,
        }));

        frameworksRes.data?.forEach(f => combined.push({
          id: f.id, type: "framework",
          title: f.title, description: f.summary || "Framework ready for activation",
          created_at: f.created_at,
        }));

        activationsRes.data?.forEach(a => combined.push({
          id: a.id, type: "content",
          title: a.title, description: `${a.output_type} generated`,
          created_at: a.created_at,
        }));

        // Sort by date, most recent first
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setItems(combined.slice(0, 10));
      } catch (err) {
        console.error("Insight feed error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, []);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-primary/[0.06]">
        <div className="flex items-center gap-3 justify-center py-3">
          <Loader2 className="w-4 h-4 text-primary/60 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading intelligence feed…</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  const now = Date.now();
  const formatAgo = (dateStr: string) => {
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Intelligence Feed</h3>
          <p className="text-[10px] text-muted-foreground/50">Your evolving strategic landscape</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = ICONS[item.type];
          const colors = COLORS[item.type];

          return (
            <div key={`${item.type}-${item.id}`} className="flex items-start gap-3 p-3 rounded-xl hover:bg-card/60 transition-colors group">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colors.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                  {item.confidence && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${colors.badge}`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50 line-clamp-1 mt-0.5">{item.description}</p>
              </div>
              <span className="text-[9px] text-muted-foreground/30 flex-shrink-0 mt-1">{formatAgo(item.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutiveInsightFeed;
