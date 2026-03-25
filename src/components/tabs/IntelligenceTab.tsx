import { useState, useRef, useCallback } from "react";
import { RefreshCw, GitBranch, ArrowRight, MessageCircle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import StrategicIntelligenceEngine from "@/components/StrategicIntelligenceEngine";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import AccountIntelligence from "@/components/AccountIntelligence";
import RecentEntries from "@/components/RecentEntries";
import DocumentUpload from "@/components/DocumentUpload";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

const IntelligenceTab = ({ entries, onOpenChat, onRefresh }: IntelligenceTabProps) => {
  const [graphOpen, setGraphOpen] = useState(false);

  return (
    <div className="space-y-8">
      {/* Intelligence Engine */}
      <StrategicIntelligenceEngine onOpenChat={onOpenChat} />

      {/* Knowledge Vault */}
      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6 sm:p-10">
          <AccountIntelligence entries={entries} />
        </div>
        <div className="glass-card rounded-2xl p-6 sm:p-10">
          <RecentEntries entries={entries} onRefresh={onRefresh ? async () => { await onRefresh(); } : undefined} />
        </div>
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Upload Document</span>
              <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="mt-3">
              <DocumentUpload onUploaded={onRefresh ? async () => { await onRefresh(); } : undefined} />
            </div>
          </details>
        </div>
      </div>

      {/* Knowledge Graph */}
      <button
        onClick={() => setGraphOpen(true)}
        className="w-full glass-card rounded-xl border border-border/10 p-4 hover:border-primary/15 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <GitBranch className="w-4 h-4 text-primary/70" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-foreground leading-snug">Knowledge Graph</p>
            <p className="text-[10px] text-muted-foreground/50">Explore how your ideas connect</p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
        </div>
      </button>

      <KnowledgeGraph open={graphOpen} onClose={() => setGraphOpen(false)} />
    </div>
  );
};

export default IntelligenceTab;
