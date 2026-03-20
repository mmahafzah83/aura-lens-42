import { useState, useEffect } from "react";
import { BookOpen, MessageCircle, Loader2, ChevronDown, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import PotentialUnleashed from "@/components/PotentialUnleashed";
import { formatSmartDate } from "@/lib/formatDate";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface BriefingTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
}

const BriefingTab = ({ entries, onOpenChat }: BriefingTabProps) => {
  const { t } = useLanguage();
  const [insight, setInsight] = useState<string>("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [showCaptures, setShowCaptures] = useState(false);

  // Unique entries from last 7 days (deduplicated by id)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEntriesMap = new Map<string, Entry>();
  entries.forEach(e => {
    if (new Date(e.created_at) >= weekAgo && !weekEntriesMap.has(e.id)) {
      weekEntriesMap.set(e.id, e);
    }
  });
  const weekEntries = Array.from(weekEntriesMap.values());

  const pillarCounts: Record<string, number> = {};
  weekEntries.forEach(e => {
    if (e.skill_pillar) pillarCounts[e.skill_pillar] = (pillarCounts[e.skill_pillar] || 0) + 1;
  });
  const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];

  // Stats that add up: voice + insights + other = weeklyCaptures
  const weeklyCaptures = weekEntries.length;
  const voiceNotes = weekEntries.filter(e => e.type === "voice").length;
  const strategicInsights = weekEntries.filter(e => e.has_strategic_insight === true && e.type !== "voice").length;
  const otherCount = weeklyCaptures - voiceNotes - strategicInsights;

  // Generate Director's Insight from last 5 captures
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
    <div className="space-y-6">
      {/* Strategic Pulse */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
          boxShadow: "inset 0 0 0 1px hsl(43 72% 52% / 0.15)",
        }} />

        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t("briefing.strategicPulse")}</h2>
        </div>

        {/* Director's Insight */}
        <div className="mb-5">
          {loadingInsight ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">{t("briefing.generatingInsight")}</span>
            </div>
          ) : insight ? (
            <p className="text-sm text-foreground/90 leading-relaxed italic">
              "{insight}"
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("briefing.noInsight")}</p>
          )}
        </div>

        {/* Stats row — Voice + Insights + Other = This Week */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border/20">
          <div>
            <p className="text-2xl font-bold text-foreground">{weeklyCaptures}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("briefing.weekCaptures")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{voiceNotes}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("briefing.voiceNotes")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{strategicInsights}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("briefing.insights")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{otherCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Other</p>
          </div>
        </div>
      </div>

      {/* Ask Aura bar */}
      <button
        onClick={() => onOpenChat?.()}
        className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-card-hover transition-all group aura-search-glow"
      >
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          {t("chat.placeholder")}
        </span>
      </button>

      {/* Two-column: Brand Mirror + Pillar Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PotentialUnleashed entries={entries} />

        <div className="glass-card rounded-2xl p-6 col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("briefing.strategicFocus")}</h3>
          </div>
          <span className="text-4xl sm:text-5xl font-bold text-gradient-gold leading-tight tracking-tight">
            {topPillar ? topPillar[0] : "—"}
          </span>
          <p className="text-xs text-muted-foreground mt-1 mb-4">{t("briefing.focusDesc")}</p>

          {Object.keys(pillarCounts).length > 0 && (
            <div className="space-y-2.5 pt-4 border-t border-border/20">
              {Object.entries(pillarCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([pillar, count]) => {
                  const maxCount = Math.max(...Object.values(pillarCounts));
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={pillar} className="flex items-center gap-4">
                      <span className="text-xs text-foreground w-44 truncate">{pillar}</span>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-end">{count}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Captures — collapsed by default */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowCaptures(!showCaptures)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-card-hover transition-colors"
        >
          <span className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("briefing.recentCaptures")}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showCaptures ? "rotate-180" : ""}`} />
        </button>

        {showCaptures && (
          <div className="px-6 pb-5 space-y-2.5 animate-fade-in">
            {recentFive.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">{t("entries.noEntries")}</p>
            ) : (
              recentFive.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/15"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {entry.title || entry.content.slice(0, 60)}
                    </p>
                    {entry.summary && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {entry.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {entry.skill_pillar && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                          {entry.skill_pillar}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
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
    </div>
  );
};

export default BriefingTab;
