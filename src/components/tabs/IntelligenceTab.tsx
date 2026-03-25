import { useState, useEffect } from "react";
import { GitBranch, ArrowRight, Sparkles, Layers, FileText, Zap, Lightbulb, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import StrategicIntelligenceEngine from "@/components/StrategicIntelligenceEngine";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";
import { MetricCard } from "@/components/ui/strategic-card";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

const IntelligenceTab = ({ entries, onOpenChat, onRefresh }: IntelligenceTabProps) => {
  const [graphOpen, setGraphOpen] = useState(false);
  const [stats, setStats] = useState({ captures: 0, documents: 0, evidence: 0, signals: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const [entriesRes, docsRes, fragRes, sigRes] = await Promise.all([
      supabase.from("entries").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("evidence_fragments").select("id", { count: "exact", head: true }),
      supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    setStats({
      captures: entriesRes.count || 0,
      documents: docsRes.count || 0,
      evidence: fragRes.count || 0,
      signals: sigRes.count || 0,
    });
    setLoading(false);
  };

  return (
    <div className="space-y-12">
      {/* Page Header */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-section-title text-foreground">Strategic Intelligence</h2>
          <p className="text-meta">Knowledge base, signals, and pattern analysis</p>
        </div>
      </div>

      {/* Knowledge Base Metrics */}
      <div className="glass-card rounded-2xl card-pad">
        <div className="flex items-center gap-2.5 mb-6">
          <Layers className="w-4 h-4 text-primary/60" />
          <h3 className="text-label">Knowledge Base Overview</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              icon={<div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="w-4 h-4 text-primary" /></div>}
              label="Captures"
              value={stats.captures}
            />
            <MetricCard
              icon={<div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-400" /></div>}
              label="Documents"
              value={stats.documents}
            />
            <MetricCard
              icon={<div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Layers className="w-4 h-4 text-emerald-400" /></div>}
              label="Evidence"
              value={stats.evidence}
            />
            <MetricCard
              icon={<div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><Zap className="w-4 h-4 text-amber-400" /></div>}
              label="Signals"
              value={stats.signals}
            />
          </div>
        )}
      </div>

      {/* Intelligence Engine */}
      <StrategicIntelligenceEngine onOpenChat={onOpenChat} />

      {/* Knowledge Library */}
      <KnowledgeLibrary />

      {/* Knowledge Graph */}
      <button
        onClick={() => setGraphOpen(true)}
        className="w-full glass-card rounded-2xl card-pad hover:border-primary/15 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <GitBranch className="w-5 h-5 text-primary/70" />
          </div>
          <div className="flex-1">
            <p className="text-body font-semibold text-foreground leading-snug">Knowledge Graph</p>
            <p className="text-meta">Explore how your ideas connect</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
        </div>
      </button>

      <KnowledgeGraph open={graphOpen} onClose={() => setGraphOpen(false)} />
    </div>
  );
};

export default IntelligenceTab;
