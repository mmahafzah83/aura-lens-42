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

  const weeklyCaptures = weekEntries.length;
  const voiceNotes = weekEntries.filter(e => e.type === "voice").length;
  const strategicInsights = weekEntries.filter(e => e.has_strategic_insight === true && e.type !== "voice").length;
  const otherCount = weeklyCaptures - voiceNotes - strategicInsights;

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

  const statItems = [
    { value: weeklyCaptures, label: t("briefing.weekCaptures") },
    { value: voiceNotes, label: t("briefing.voiceNotes") },
    { value: strategicInsights, label: t("briefing.insights") },
    { value: otherCount, label: "Other" },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Strategic Pulse */}
      <div className="glass-card-elevated rounded-2xl p-8 sm:p-12 relative overflow-hidden">
        {/* Decorative gold line */}
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium">{t("briefing.strategicPulse")}</p>
        </div>

        {/* Director's Insight — Editorial Hero */}
        <div className="mb-8">
          {loadingInsight ? (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <span className="text-sm text-muted-foreground">{t("briefing.generatingInsight")}</span>
            </div>
          ) : insight ? (
            <blockquote className="text-xl sm:text-2xl lg:text-3xl text-foreground/90 leading-relaxed font-light tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              "{insight}"
            </blockquote>
          ) : (
            <p className="text-lg text-muted-foreground/60 italic font-light">{t("briefing.noInsight")}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-6 pt-6 border-t border-border/10">
          {statItems.map((stat, i) => (
            <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
              <p className="text-3xl sm:text-4xl font-light text-foreground tracking-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.15em] mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ask Aura bar */}
      <button
        onClick={() => onOpenChat?.()}
        className="w-full glass-card rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover-lift tactile-press transition-all group aura-search-glow"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300 border border-primary/15">
          <MessageCircle className="w-4.5 h-4.5 text-primary" />
        </div>
        <span className="text-sm text-muted-foreground/60 group-hover:text-foreground transition-colors duration-300">
          {t("chat.placeholder")}
        </span>
      </button>

      {/* Two-column: Brand Mirror + Pillar Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PotentialUnleashed entries={entries} />

        <div className="glass-card rounded-2xl p-8 col-span-1 md:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <BookOpen className="w-5 h-5 text-primary/70" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">{t("briefing.strategicFocus")}</h3>
          </div>
          <span className="text-4xl sm:text-6xl font-bold text-gradient-gold leading-none tracking-tighter block mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {topPillar ? topPillar[0] : "—"}
          </span>
          <p className="text-xs text-muted-foreground/50 mb-6">{t("briefing.focusDesc")}</p>

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
      </div>

      {/* Recent Captures — collapsed by default */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowCaptures(!showCaptures)}
          className="w-full flex items-center justify-between px-8 py-5 hover:bg-card-hover transition-colors duration-200 tactile-press"
        >
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">{t("briefing.recentCaptures")}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground/40 transition-transform duration-300 ${showCaptures ? "rotate-180" : ""}`} />
        </button>

        {showCaptures && (
          <div className="px-8 pb-6 space-y-3 animate-fade-in">
            {recentFive.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic py-3">{t("entries.noEntries")}</p>
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
                      <p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">
                        {entry.summary}
                      </p>
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
    </div>
  );
};

export default BriefingTab;
