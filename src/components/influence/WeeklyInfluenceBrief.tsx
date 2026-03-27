import { useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, TrendingUp, TrendingDown, Minus, FileText,
  Lightbulb, Shield, ArrowUpRight, ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface WhatChanged {
  signal: string;
  direction: "up" | "down" | "stable";
  magnitude: "strong" | "moderate" | "subtle";
}

interface RecommendedMove {
  action: string;
  reasoning: string;
  format_suggestion: string;
  theme_suggestion: string;
}

interface Brief {
  summary: string;
  what_changed: WhatChanged[];
  strategic_implication: string;
  recommended_move: RecommendedMove;
  confidence: number;
  generated_at: string;
  period_start: string;
  period_end: string;
  posts_analyzed: number;
  follower_delta: number;
  current_followers: number;
}

const Fade = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }}>
    {children}
  </motion.div>
);

const DirectionIcon = ({ dir, mag }: { dir: string; mag: string }) => {
  const opacity = mag === "strong" ? "text-foreground/60" : mag === "moderate" ? "text-foreground/40" : "text-foreground/25";
  if (dir === "up") return <TrendingUp className={`w-3.5 h-3.5 ${opacity}`} />;
  if (dir === "down") return <TrendingDown className={`w-3.5 h-3.5 ${opacity}`} />;
  return <Minus className={`w-3.5 h-3.5 ${opacity}`} />;
};

interface WeeklyInfluenceBriefProps {
  onOpenChat?: (msg?: string) => void;
}

const WeeklyInfluenceBrief = ({ onOpenChat }: WeeklyInfluenceBriefProps) => {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-influence-brief");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBrief(data as Brief);
      setGenerated(true);
    } catch (e: any) {
      toast({ title: "Brief generation failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleDraft = () => {
    if (!brief?.recommended_move) return;
    const msg = `Draft a ${brief.recommended_move.format_suggestion} on "${brief.recommended_move.theme_suggestion}". ${brief.recommended_move.action}`;
    onOpenChat?.(msg);
  };

  // Not yet generated — show trigger
  if (!generated) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
            <Shield className="w-4 h-4 text-primary/50" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Weekly Influence Brief</h3>
            <p className="text-[10px] text-muted-foreground/30">AI-generated strategic advisory memo</p>
          </div>
        </div>
        <p className="text-sm text-foreground/40 leading-relaxed">
          Aura will analyze your publishing activity, audience response, and authority trajectory to produce a calm, evidence-based advisory brief.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all tactile-press"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          {loading ? "Analyzing…" : "Generate Brief"}
        </button>
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Fade>
        <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
                <Shield className="w-4 h-4 text-primary/50" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Weekly Influence Brief</h3>
                <p className="text-[10px] text-muted-foreground/25">
                  {brief.period_start} → {brief.period_end} · {brief.posts_analyzed} assets analyzed
                </p>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground/20 tabular-nums">
              {Math.round(brief.confidence * 100)}% confidence
            </div>
          </div>

          <p
            className="text-base text-foreground/70 leading-relaxed"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {brief.summary}
          </p>

          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/25 pt-1 border-t border-border/5">
            <span>{brief.current_followers.toLocaleString()} followers</span>
            <span>{brief.follower_delta >= 0 ? "+" : ""}{brief.follower_delta} this week</span>
          </div>
        </div>
      </Fade>

      {/* What Changed */}
      <Fade delay={0.06}>
        <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-3">
          <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-widest">What Changed</h4>
          <div className="space-y-2">
            {brief.what_changed.map((change, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-secondary/6 border border-border/[0.03]"
              >
                <DirectionIcon dir={change.direction} mag={change.magnitude} />
                <div className="min-w-0">
                  <p className="text-xs text-foreground/55 leading-relaxed">{change.signal}</p>
                  <p className="text-[10px] text-muted-foreground/20 mt-0.5 capitalize">
                    {change.magnitude} {change.direction === "up" ? "increase" : change.direction === "down" ? "decline" : "hold"}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Fade>

      {/* Strategic Implication */}
      <Fade delay={0.12}>
        <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-3">
          <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-widest">Strategic Implication</h4>
          <p className="text-sm text-foreground/50 leading-relaxed">{brief.strategic_implication}</p>
          <p className="text-[10px] text-muted-foreground/15 italic pt-1 border-t border-border/5">
            Here is the pattern beneath the numbers.
          </p>
        </div>
      </Fade>

      {/* Recommended Move */}
      <Fade delay={0.18}>
        <div className="glass-card rounded-2xl card-pad border border-primary/8 bg-gradient-to-br from-primary/[0.02] to-transparent space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary/40" />
            <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-widest">Recommended Move</h4>
          </div>
          <p className="text-sm text-foreground/60 leading-relaxed font-medium">{brief.recommended_move.action}</p>
          <p className="text-xs text-foreground/35 leading-relaxed">{brief.recommended_move.reasoning}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/25 pt-1">
            <span className="capitalize">Format: {brief.recommended_move.format_suggestion}</span>
            <span>·</span>
            <span className="capitalize">Theme: {brief.recommended_move.theme_suggestion}</span>
          </div>
          <button
            onClick={handleDraft}
            className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all tactile-press mt-1"
          >
            <FileText className="w-3.5 h-3.5" />
            Draft Content
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </Fade>

      {/* Regenerate */}
      <Fade delay={0.24}>
        <div className="text-center">
          <button
            onClick={generate}
            disabled={loading}
            className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
          >
            {loading ? "Regenerating…" : "Regenerate brief"}
          </button>
        </div>
      </Fade>
    </div>
  );
};

export default WeeklyInfluenceBrief;
