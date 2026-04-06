import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw, Compass } from "lucide-react";
import StrategicCommandCenter from "@/components/StrategicCommandCenter";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import StrategicCompanion from "@/components/StrategicCompanion";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

export interface AuraScore {
  aura_score: number;
  capture_score: number;
  signal_score: number;
  content_score: number;
  score_status: string;
  score_description: string;
  score_trend: number | null;
}

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
  const { containerRef, pullY, refreshing, progress, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(onRefresh);
  const [auraScore, setAuraScore] = useState<AuraScore | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update last_visit_at
      await supabase
        .from("diagnostic_profiles")
        .update({ last_visit_at: new Date().toISOString() } as any)
        .eq("user_id", user.id);

      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;

      // Fetch Aura Score
      supabase.functions.invoke("calculate-aura-score", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(({ data }) => {
        if (data && typeof data.aura_score === "number") {
          setAuraScore(data as AuraScore);
        }
      }).catch(console.error);

      // Check staleness of industry_trends
      const { data: latest } = await supabase
        .from("industry_trends" as any)
        .select("fetched_at")
        .eq("user_id", user.id)
        .order("fetched_at", { ascending: false })
        .limit(1);

      const latestRow = (latest as any)?.[0];
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
      const isStale = !latestRow || new Date(latestRow.fetched_at).getTime() < sixHoursAgo;

      if (isStale) {
        supabase.functions.invoke("fetch-industry-trends", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(console.error);
      }
    };
    run();
  }, []);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="space-y-12 relative"
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

      {/* Page Header */}
      <PageHeader
        icon={Compass}
        title="Home"
        question="What strategic move should you make right now?"
        processLogic="Identity → Intelligence → Strategy → Authority → Influence"
      />

      {/* Strategic Command Center — welcome + opportunity + pipeline + momentum */}
      <StrategicCommandCenter onOpenChat={onOpenChat} />

      {/* Strategic Advisor — AI Chief Strategy Officer */}
      <StrategicAdvisorPanel context="full" onOpenChat={onOpenChat} />

      {/* Strategic Companion — Critique Mode + Alerts */}
      <StrategicCompanion onOpenChat={onOpenChat} />
    </div>
  );
};

export default HomeTab;
