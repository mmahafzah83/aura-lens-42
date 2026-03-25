import { useState } from "react";
import { GitBranch, ArrowRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import StrategicIntelligenceEngine from "@/components/StrategicIntelligenceEngine";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

const IntelligenceTab = ({ entries, onOpenChat, onRefresh }: IntelligenceTabProps) => {
  const [graphOpen, setGraphOpen] = useState(false);

  return (
    <div className="space-y-12">
      {/* Intelligence Engine */}
      <StrategicIntelligenceEngine onOpenChat={onOpenChat} />

      {/* Knowledge Library */}
      <KnowledgeLibrary />

      {/* Knowledge Graph */}
      <button
        onClick={() => setGraphOpen(true)}
        className="w-full glass-card rounded-xl border border-border/10 p-5 hover:border-primary/15 transition-colors text-left group"
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
