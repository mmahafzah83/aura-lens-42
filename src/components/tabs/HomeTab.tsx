import { useState, useRef, useCallback } from "react";
import { RefreshCw, MessageCircle, GitBranch, ArrowRight } from "lucide-react";
import StrategicCommandCenter from "@/components/StrategicCommandCenter";
import StrategicAdvisor from "@/components/StrategicAdvisor";
import SignalsRadar from "@/components/SignalsRadar";
import AuthorityMomentumMap from "@/components/AuthorityMomentumMap";
import DailyStrategicBriefing from "@/components/DailyStrategicBriefing";
import KnowledgeConstellation from "@/components/KnowledgeConstellation";
import CaptureIntelligencePanel from "@/components/CaptureIntelligencePanel";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface HomeTabProps {
  entries?: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

const usePullToRefresh = (onRefresh?: () => Promise<void> | void) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const THRESHOLD = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPullY(Math.min(dy * 0.45, 120));
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      try { await onRefresh(); } catch {}
      setRefreshing(false);
    }
    setPullY(0);
  }, [pullY, onRefresh]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  return { containerRef, pullY, refreshing, progress, onTouchStart, onTouchMove, onTouchEnd };
};

const HomeTab = ({ entries = [], onOpenChat, onRefresh }: HomeTabProps) => {
  const [constellationOpen, setConstellationOpen] = useState(false);
  const { containerRef, pullY, refreshing, progress, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(onRefresh);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="space-y-8 relative"
    >
      {/* Pull-to-refresh */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-300 ease-out"
        style={{ height: pullY > 0 || refreshing ? `${Math.max(pullY, refreshing ? 48 : 0)}px` : '0px' }}
      >
        <RefreshCw
          className={`w-5 h-5 text-primary/60 transition-transform duration-200 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: `rotate(${progress * 360}deg)`, opacity: Math.max(progress, refreshing ? 1 : 0) }}
        />
      </div>

      {/* Strategic Command */}
      <StrategicCommandCenter />

      {/* Visual Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SignalsRadar />
        <AuthorityMomentumMap />
      </div>

      {/* Strategic Advisor */}
      <StrategicAdvisor onOpenChat={onOpenChat} />

      {/* Daily Briefing */}
      <DailyStrategicBriefing onOpenChat={onOpenChat} />

      {/* Knowledge Constellation */}
      <button
        onClick={() => setConstellationOpen(true)}
        className="w-full glass-card rounded-xl border border-border/10 p-4 hover:border-primary/15 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <GitBranch className="w-4 h-4 text-primary/70" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-foreground leading-snug">Knowledge Constellation</p>
            <p className="text-[10px] text-muted-foreground/50">Explore how your ideas connect & evolve</p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
        </div>
      </button>

      <KnowledgeConstellation open={constellationOpen} onClose={() => setConstellationOpen(false)} />

      {/* Ask Aura */}
      <div className="sticky bottom-0 pt-4 pb-2">
        <button
          onClick={() => onOpenChat?.()}
          className="w-full glass-card rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover-lift tactile-press transition-all group aura-search-glow"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300 border border-primary/15">
            <MessageCircle className="w-4.5 h-4.5 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground/60 group-hover:text-foreground transition-colors duration-300">
            Ask Aura anything…
          </span>
        </button>
      </div>
    </div>
  );
};

export default HomeTab;
