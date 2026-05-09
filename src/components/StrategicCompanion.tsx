import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, Brain, HelpCircle, ArrowRight, Loader2, RefreshCw,
  Zap, AlertTriangle, TrendingUp, Target, Compass, Sparkles,
  ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ── Types ── */
interface CritiqueData {
  observation: {
    summary: string;
    key_themes: string[];
    signal_count?: number;
  };
  synthesis: {
    insight: string;
    emerging_thesis: string;
  };
  challenge: {
    assumption_gap: string;
    question: string;
  };
  recommendation: {
    action: string;
    reason: string;
    action_type: string;
  };
  alerts: Array<{
    type: string;
    title: string;
    message: string;
    urgency: string;
  }>;
}

const ALERT_ICONS: Record<string, typeof Zap> = {
  strategic_opportunity: Zap,
  idea_maturity: Brain,
  pattern_detection: Eye,
  authority_momentum: TrendingUp,
  strategic_drift: AlertTriangle,
};

const ALERT_COLORS: Record<string, string> = {
  strategic_opportunity: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  idea_maturity: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  pattern_detection: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  authority_momentum: "text-[#B08D3A] bg-[#B08D3A]/10 border-[#B08D3A]/20",
  strategic_drift: "text-red-400 bg-red-500/10 border-red-500/20",
};

const SECTION_ICONS = [
  { key: "observation", icon: Eye, label: "Observation", color: "text-emerald-400" },
  { key: "synthesis", icon: Brain, label: "Synthesis", color: "text-blue-400" },
  { key: "challenge", icon: HelpCircle, label: "Challenge", color: "text-amber-400" },
  { key: "recommendation", icon: ArrowRight, label: "Recommendation", color: "text-primary" },
];

/* ── Component ── */
const StrategicCompanion = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [critique, setCritique] = useState<CritiqueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchCritique = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-critique`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });

      if (resp.status === 429) { toast.error("Give it a second. Aura's catching up."); return; }
      if (resp.status === 402) { toast.error("Taking a breather. Back in a moment."); return; }
      if (!resp.ok) throw new Error("Critique failed");

      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      if (result.critique) setCritique(result.critique);
    } catch (e) {
      console.error("Critique error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCritique(); }, [fetchCritique]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center min-h-[140px] border border-border/8">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
          <span className="text-sm text-muted-foreground">Analyzing your strategic position…</span>
        </div>
      </div>
    );
  }

  if (!critique) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center min-h-[100px] flex flex-col items-center justify-center gap-2 border border-border/8">
        <Compass className="w-6 h-6 text-primary/20" />
        <p className="text-sm text-muted-foreground">Capture more knowledge to activate strategic critique.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* ── Strategic Alerts ── */}
      {(critique.alerts || []).length > 0 && (
        <div className="space-y-2">
          {critique.alerts.map((alert, i) => {
            const Icon = ALERT_ICONS[alert.type] || Zap;
            const colorClass = ALERT_COLORS[alert.type] || "text-primary bg-primary/10 border-primary/20";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-start gap-3 p-4 rounded-xl border ${colorClass}`}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-current/10">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
                </div>
                {alert.urgency === "high" && (
                  <span className="text-[9px] uppercase font-bold tracking-wider text-red-400/70 shrink-0">Urgent</span>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Strategic Critique Card ── */}
      <div className="glass-card rounded-2xl border border-border/8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-amber-500/10 flex items-center justify-center border border-primary/15">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Strategic Critique</h3>
              <p className="text-xs text-muted-foreground">Aura's analysis of your strategic position</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => fetchCritique(true)}
              disabled={refreshing}
              className="text-muted-foreground/40 hover:text-primary h-8 w-8 p-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground/40 hover:text-primary h-8 w-8 p-0"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Emerging Thesis — always visible */}
        <div className="px-6 pb-4">
          <p
            className="text-base font-semibold text-foreground leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            "{critique.synthesis.emerging_thesis}"
          </p>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-5">
                {/* Observation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400/70">Observation</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{critique.observation.summary}</p>
                  {(critique.observation.key_themes || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {critique.observation.key_themes.map((t, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/80 font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Synthesis */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400/70">Strategic Synthesis</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{critique.synthesis.insight}</p>
                </div>

                {/* Challenge */}
                <div className="space-y-2 p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/10">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400/70">Strategic Challenge</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{critique.challenge.assumption_gap}</p>
                  <p className="text-sm text-foreground font-medium italic leading-snug">
                    "{critique.challenge.question}"
                  </p>
                  <Button
                    variant="outline" size="sm" className="text-xs gap-1.5 mt-1"
                    onClick={() => onOpenChat?.(critique.challenge.question)}
                  >
                    <HelpCircle className="w-3.5 h-3.5" /> Discuss with Aura
                  </Button>
                </div>

                {/* Recommendation */}
                <div className="space-y-2 p-4 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.05] to-transparent">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-primary/60">Highest Leverage Move</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">{critique.recommendation.action}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{critique.recommendation.reason}</p>
                  <Button
                    size="sm" className="text-xs gap-1.5 mt-1"
                    onClick={() => onOpenChat?.(critique.recommendation.action)}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Take This Action
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default StrategicCompanion;
