import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, ChevronDown, Zap, Mic, Lightbulb, FileText, TrendingUp, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface BriefingTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

/* ── Pull-to-Refresh Hook ─────────────────────────── */
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
    if (dy > 0) {
      setPullY(Math.min(dy * 0.45, 120));
    }
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

/* ── Stat Card ─────────────────────────────────────── */
const StatCard = ({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) => (
  <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-3 hover-lift transition-all">
    <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center border border-primary/10">
      <Icon className="w-4.5 h-4.5 text-primary/70" />
    </div>
    <p className="text-3xl sm:text-4xl font-light text-foreground tracking-tight tabular-nums">{value}</p>
    <p className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.18em] text-center">{label}</p>
  </div>
);

/* ── Executive Headline (2-line clamp + expand) ───── */
const InsightBlock = ({ text, loading }: { text: string; loading: boolean }) => {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8">
        <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
        <span className="text-sm text-muted-foreground">Synthesizing your strategic pulse…</span>
      </div>
    );
  }

  if (!text) {
    return <p className="text-lg text-muted-foreground/40 italic font-light py-6">Capture insights to generate your Director's briefing.</p>;
  }

  return (
    <div>
      <blockquote
        className={`text-xl sm:text-2xl text-foreground/90 leading-relaxed font-light tracking-tight ${!expanded ? "line-clamp-2" : ""}`}
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        "{text}"
      </blockquote>
      {text.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mt-3 text-xs text-primary/60 hover:text-primary transition-colors tactile-press"
        >
          <span>{expanded ? "Collapse" : "View Deep Insight"}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
};

/* ── Main BriefingTab ─────────────────────────────── */
const BriefingTab = ({ entries, onOpenChat, onRefresh }: BriefingTabProps) => {
  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [showCaptures, setShowCaptures] = useState(false);
  const { containerRef, pullY, refreshing, progress, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(onRefresh);

  // Unique entries from last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEntriesMap = new Map<string, Entry>();
  entries.forEach(e => {
    if (new Date(e.created_at) >= weekAgo && !weekEntriesMap.has(e.id)) {
      weekEntriesMap.set(e.id, e);
    }
  });
  const weekEntries = Array.from(weekEntriesMap.values());

  const weeklyCaptures = weekEntries.length;
  const voiceNotes = weekEntries.filter(e => e.type === "voice").length;
  const strategicInsights = weekEntries.filter(e => e.has_strategic_insight === true && e.type !== "voice").length;
  const otherCount = weeklyCaptures - voiceNotes - strategicInsights;

  // Top pillar
  const pillarCounts: Record<string, number> = {};
  weekEntries.forEach(e => {
    if (e.skill_pillar) pillarCounts[e.skill_pillar] = (pillarCounts[e.skill_pillar] || 0) + 1;
  });
  const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];

  useEffect(() => {
    const generateInsight = async () => {
      const latest = entries.slice(0, 5);
      if (latest.length === 0) return;

      const fingerprint = latest.map(e => e.id).join(",");
      const prevFingerprint = sessionStorage.getItem("aura-insight-fp");
      const cachedInsight = sessionStorage.getItem("aura-insight");
      if (prevFingerprint === fingerprint && cachedInsight) {
        setInsight(cachedInsight);
        return;
      }

      setLoadingInsight(true);
      try {
        const capturesSummary = latest
          .map((e, i) => `${i + 1}. [${e.type}] ${e.title || ""}: ${e.summary || e.content.slice(0, 200)}`)
          .join("\n");

        const { data, error } = await supabase.functions.invoke("draft-post", {
          body: {
            title: "Director's Insight",
            summary: capturesSummary,
            content: "",
            type: "directors-insight-en",
          },
        });

        if (!error && data?.post) {
          setInsight(data.post);
          sessionStorage.setItem("aura-insight", data.post);
          sessionStorage.setItem("aura-insight-fp", fingerprint);
        }
      } catch {
        // Silently fail
      }
      setLoadingInsight(false);
    };

    if (entries.length > 0) generateInsight();
  }, [entries]);

  const recentFive = entries.slice(0, 5);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="space-y-8 relative"
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-300 ease-out"
        style={{ height: pullY > 0 || refreshing ? `${Math.max(pullY, refreshing ? 48 : 0)}px` : '0px' }}
      >
        <RefreshCw
          className={`w-5 h-5 text-primary/60 transition-transform duration-200 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: `rotate(${progress * 360}deg)`, opacity: Math.max(progress, refreshing ? 1 : 0) }}
        />
      </div>
      {/* Hero — Strategic Pulse */}
      <div className="glass-card-elevated rounded-2xl p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium">Strategic Pulse</p>
        </div>

        <InsightBlock text={insight} loading={loadingInsight} />
      </div>

      {/* Stats — Minimalist icon cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} value={weeklyCaptures} label="This Week" />
        <StatCard icon={Mic} value={voiceNotes} label="Voice Notes" />
        <StatCard icon={Lightbulb} value={strategicInsights} label="Insights" />
        <StatCard icon={FileText} value={otherCount} label="Other" />
      </div>

      {/* Strategic Focus */}
      <div className="glass-card rounded-2xl p-8">
        <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] mb-3">Strategic Focus</p>
        <h2
          className="text-4xl sm:text-5xl font-bold text-gradient-gold leading-none tracking-tighter mb-4"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {topPillar ? topPillar[0] : "—"}
        </h2>
        <p className="text-xs text-muted-foreground/40 mb-6">Most active pillar based on this week's captures</p>

        {Object.keys(pillarCounts).length > 0 && (
          <div className="space-y-3 pt-6 border-t border-border/10">
            {Object.entries(pillarCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([pillar, count]) => {
                const maxCount = Math.max(...Object.values(pillarCounts));
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={pillar} className="flex items-center gap-4">
                    <span className="text-xs text-foreground/70 w-48 truncate">{pillar}</span>
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground/50 w-6 text-end tabular-nums">{count}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Recent Captures — collapsed */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowCaptures(!showCaptures)}
          className="w-full flex items-center justify-between px-8 py-5 hover:bg-card-hover transition-colors duration-200 tactile-press"
        >
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">Recent Captures</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground/40 transition-transform duration-300 ${showCaptures ? "rotate-180" : ""}`} />
        </button>

        {showCaptures && (
          <div className="px-8 pb-6 space-y-3 animate-fade-in">
            {recentFive.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic py-3">No entries yet</p>
            ) : (
              recentFive.map((entry, i) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-secondary/20 border border-border/10 hover-lift transition-all animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {entry.title || entry.content.slice(0, 60)}
                    </p>
                    {entry.summary && (
                      <p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">{entry.summary}</p>
                    )}
                    <div className="flex items-center gap-2.5 mt-2">
                      {entry.skill_pillar && (
                        <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/8 text-primary/80 border border-primary/10">
                          {entry.skill_pillar}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                        {formatSmartDate(entry.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Ask Aura — docked at bottom, separate from content */}
      <div className="sticky bottom-0 pt-4 pb-2 -mx-5 sm:-mx-10 px-5 sm:px-10 bg-gradient-to-t from-background via-background/95 to-transparent">
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

export default BriefingTab;
