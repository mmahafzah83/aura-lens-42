import { BookOpen, BarChart3, Zap, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import PotentialUnleashed from "@/components/PotentialUnleashed";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const BriefingTab = ({ entries }: { entries: Entry[] }) => {
  const { t } = useLanguage();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEntries = entries.filter(e => new Date(e.created_at) >= weekAgo);

  const pillarCounts: Record<string, number> = {};
  weekEntries.forEach(e => {
    if (e.skill_pillar) pillarCounts[e.skill_pillar] = (pillarCounts[e.skill_pillar] || 0) + 1;
  });
  const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];

  const strategicInsights = entries.filter(e => e.has_strategic_insight === true).length;
  const weeklyCaptures = weekEntries.length;
  const voiceNotes = entries.filter(e => e.type === "voice").length;

  return (
    <div className="space-y-6">
      {/* Strategic Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-6 col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t("briefing.strategicFocus")}</h2>
          </div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-3xl font-bold text-gradient-gold">
              {topPillar ? topPillar[0] : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("briefing.focusDesc")}</p>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-border/20">
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
          </div>
        </div>

        {/* Brand Mirror */}
        <PotentialUnleashed entries={entries} />
      </div>

      {/* Weekly Pillar Breakdown */}
      {Object.keys(pillarCounts).length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">{t("briefing.pillarBreakdown")}</h3>
          <div className="space-y-3">
            {Object.entries(pillarCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([pillar, count]) => {
                const maxCount = Math.max(...Object.values(pillarCounts));
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={pillar} className="flex items-center gap-4">
                    <span className="text-xs text-foreground w-48 truncate">{pillar}</span>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-end">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BriefingTab;
