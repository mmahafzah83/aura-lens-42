import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Zap, Lightbulb, ArrowRight, Loader2, RefreshCw,
  Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SignalActions, InsightActions, ContentActions, ADVISOR_ACTION_LABELS, ADVISOR_ACTION_ICONS } from "@/components/ui/action-buttons";

interface AdvisorData {
  priority_signal: {
    title: string;
    confidence: number;
    evidence_count?: number;
    explanation: string;
  };
  strategic_insight: {
    title: string;
    interpretation: string;
    linked_framework?: string | null;
  };
  recommended_move: {
    action: string;
    reason: string;
    action_type: string;
  };
}

interface StrategicAdvisorPanelProps {
  /** Which context to request: "full" | "strategy" | "authority" | "influence" */
  context?: string;
  /** Compact mode shows only the recommended move */
  compact?: boolean;
  /** Callback when user clicks an action */
  onOpenChat?: (msg?: string) => void;
  /** External trigger to re-fetch (increment to refresh) */
  refreshTrigger?: number;
}

const ACTION_ICONS: Record<string, typeof PenLine> = {
  draft_content: PenLine,
  build_framework: Layers,
  develop_insight: Lightbulb,
  explore_signal: Search,
  plan_narrative: BookOpen,
};

const ACTION_LABELS: Record<string, string> = {
  draft_content: "Draft Content",
  build_framework: "Build Framework",
  develop_insight: "Develop Insight",
  explore_signal: "Explore Signal",
  plan_narrative: "Plan Narrative",
};

const StrategicAdvisorPanel = ({
  context = "full",
  compact = false,
  onOpenChat,
  refreshTrigger = 0,
}: StrategicAdvisorPanelProps) => {
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAdvisor = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-advisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ context }),
      });

      if (resp.status === 429) {
        toast.error("Rate limited — please try again shortly.");
        return;
      }
      if (resp.status === 402) {
        toast.error("AI credits exhausted. Please add funds.");
        return;
      }
      if (!resp.ok) throw new Error("Advisor failed");

      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      console.error("Advisor error:", e);
      // Don't toast on initial load failures — just show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [context]);

  useEffect(() => { fetchAdvisor(); }, [fetchAdvisor]);
  useEffect(() => { if (refreshTrigger > 0) fetchAdvisor(true); }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad flex items-center justify-center min-h-[120px] border border-border/8">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
          <span className="text-meta">Analyzing intelligence…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card rounded-2xl card-pad text-center min-h-[100px] flex flex-col items-center justify-center gap-2 border border-border/8">
        <Lightbulb className="w-6 h-6 text-primary/20" />
        <p className="text-meta">Capture more knowledge to activate the Strategic Advisor.</p>
      </div>
    );
  }

  const MoveIcon = ACTION_ICONS[data.recommended_move.action_type] || ArrowRight;
  const moveLabel = ACTION_LABELS[data.recommended_move.action_type] || "Take Action";
  const confPct = Math.round((data.priority_signal.confidence || 0.7) * 100);

  // Compact mode — just recommended move
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5 border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-transparent"
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <MoveIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-label uppercase tracking-wider text-xs font-semibold text-primary/60">Recommended Move</span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">{data.recommended_move.action}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{data.recommended_move.reason}</p>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5"
          onClick={() => onOpenChat?.(data.recommended_move.action)}
        >
          <MoveIcon className="w-3.5 h-3.5" /> {moveLabel}
        </Button>
      </motion.div>
    );
  }

  // Full mode — all three outputs
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/15 to-amber-500/10 flex items-center justify-center border border-primary/15">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Strategic Advisor</h3>
            <p className="text-meta">What should you focus on next?</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchAdvisor(true)}
          disabled={refreshing}
          className="text-muted-foreground/40 hover:text-primary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Priority Signal */}
      <div className="p-5 rounded-xl bg-secondary/15 border border-amber-500/10 hover:border-amber-500/20 transition-all space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-label uppercase tracking-wider text-xs font-semibold text-amber-400/70">Priority Signal</span>
          <span className={`ml-auto text-xs px-2.5 py-0.5 rounded-full font-medium tabular-nums ${
            confPct >= 80 ? "text-emerald-400 bg-emerald-500/10" : confPct >= 60 ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground bg-secondary/30"
          }`}>{confPct}%</span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{data.priority_signal.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.priority_signal.explanation}</p>
        {data.priority_signal.evidence_count != null && data.priority_signal.evidence_count > 0 && (
          <p className="text-meta">{data.priority_signal.evidence_count} evidence sources</p>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Explore signal: ${data.priority_signal.title}`)}>
            <Search className="w-3.5 h-3.5" /> Explore
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Create insight from signal: ${data.priority_signal.title}`)}>
            <Lightbulb className="w-3.5 h-3.5" /> Develop Insight
          </Button>
        </div>
      </div>

      {/* Strategic Insight */}
      <div className="p-5 rounded-xl bg-secondary/15 border border-blue-500/10 hover:border-blue-500/20 transition-all space-y-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-blue-400" />
          <span className="text-label uppercase tracking-wider text-xs font-semibold text-blue-400/70">Strategic Insight</span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{data.strategic_insight.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.strategic_insight.interpretation}</p>
        {data.strategic_insight.linked_framework && (
          <div className="flex items-center gap-1.5 pt-1">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-emerald-400/80 font-medium">{data.strategic_insight.linked_framework}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Expand insight: ${data.strategic_insight.title}`)}>
            <Lightbulb className="w-3.5 h-3.5" /> Expand
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Build framework from: ${data.strategic_insight.title}`)}>
            <Layers className="w-3.5 h-3.5" /> Build Framework
          </Button>
        </div>
      </div>

      {/* Recommended Move */}
      <div className="p-5 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.05] to-transparent space-y-2">
        <div className="flex items-center gap-2">
          <MoveIcon className="w-4 h-4 text-primary" />
          <span className="text-label uppercase tracking-wider text-xs font-semibold text-primary/60">Recommended Move</span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{data.recommended_move.action}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.recommended_move.reason}</p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(data.recommended_move.action)}>
            <MoveIcon className="w-3.5 h-3.5" /> {moveLabel}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" /> Save for Later
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default StrategicAdvisorPanel;
