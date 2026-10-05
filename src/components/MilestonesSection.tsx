import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { CollapsibleList } from "@/components/ui/CollapsibleList";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";
import { useTranslation } from "react-i18next";
import { displayDate, arStyle } from "@/lib/arDisplay";

interface Milestone {
  id: string;
  name: string;
  earned: boolean;
  earned_at: string | null;
  context: any;
}

interface AuraScoreResponse {
  milestones?: Milestone[];
}

interface Props {
  userId: string | null;
  data?: AuraScoreResponse | null;
}

const MILESTONE_ICONS: Record<string, string> = {
  profile_complete: "◆",
  first_signal: "✦",
  voice_trained: "✺",
  first_publish: "✍",
  brand_assessment: "❖",
  five_signals: "✦",
  sector_depth: "◎",
  weekly_rhythm_4: "◷",
};

type Tr = (k: string, o?: Record<string, unknown>) => string;

const buildShareContext = (tr: Tr, id: string, name: string, ctx: any, sectorFocus: string | null): string => {
  const sector = sectorFocus || tr("ms.sc.yourSector");
  if (id === "profile_complete") return tr("ms.sc.profile", { sector });
  if (id === "first_signal") return tr("ms.sc.signal", { title: ctx?.signal_title || name });
  if (id === "voice_trained") return tr("ms.sc.voice");
  if (id === "brand_assessment") return tr("ms.sc.brand");
  if (id === "five_signals") return tr("ms.sc.five", { n: ctx?.count ?? 5, sector });
  if (id === "sector_depth") {
    const t = Array.isArray(ctx?.themes) ? ctx.themes.length : (ctx?.theme_count ?? 5);
    return tr("ms.sc.themes", { n: t });
  }
  if (id === "first_publish") return tr("ms.sc.publish");
  if (id === "weekly_rhythm_4") return tr("ms.sc.rhythm");
  return tr("ms.sc.achieved", { name });
};

const NEXT_IDS = new Set(["profile_complete", "first_signal", "voice_trained", "first_publish", "brand_assessment", "five_signals", "sector_depth", "weekly_rhythm_4"]);

const formatDate = (iso: string | null, lang: string) => {
  if (!iso) return "";
  try {
    if (lang === "ar") return displayDate(iso, lang);
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return ""; }
};

const summarizeContext = (tr: Tr, id: string, ctx: any): string | null => {
  if (!ctx) return null;
  if (id === "sector_depth" && Array.isArray(ctx.themes) && ctx.themes.length) {
    const humanize = (t: string) =>
      t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    // Filter out internal identifiers (all-lowercase snake_case slugs like "market_trend")
    const meaningful = ctx.themes.filter(
      (t: string) => typeof t === "string" && !/^[a-z]+(_[a-z]+)+$/.test(t)
    );
    const named = meaningful.slice(0, 2).map(humanize);
    const n = ctx.themes.length;
    if (!named.length) return tr("ms.themes", { n });
    return named.length === 2
      ? tr("ms.themesTwo", { n, a: named[0], b: named[1] })
      : tr("ms.themesOne", { n, a: named[0] });
  }
  if (id === "first_signal" && ctx.signal_title) return ctx.signal_title;
  if (id === "five_signals" && ctx.count) return tr("ms.activeSignals", { n: ctx.count });
  if (id === "weekly_rhythm_4" && ctx.active_in_last_6 != null) return tr("ms.weeks", { n: ctx.active_in_last_6 });
  if (id === "first_publish" && ctx.post_count) return tr("ms.posts", { n: ctx.post_count });
  if (id === "profile_complete" && ctx.sector_focus) return ctx.sector_focus;
  if (id === "voice_trained" && ctx.tone) return tr("ms.tone", { tone: ctx.tone });
  return null;
};

const MilestonesSection = ({ userId, data: provided }: Props) => {
  const [data, setData] = useState<AuraScoreResponse | null>(provided ?? null);
  const [loading, setLoading] = useState(!provided);
  const [profile, setProfile] = useState<{ first_name: string | null; level: string | null; sector_focus: string | null } | null>(null);
  const [shareData, setShareData] = useState<MilestoneShareData | null>(null);
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language;
  const ar = lang === "ar";

  useEffect(() => {
    if (provided) { setData(provided); setLoading(false); }
  }, [provided]);

  useEffect(() => {
    if (!userId || provided) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await supabase.auth.getSession();
        const { data: res, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (!cancelled && !error && res) setData(res as AuraScoreResponse);
      } catch (e) {
        console.error("MilestonesSection load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, provided]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("diagnostic_profiles")
      .select("first_name, level, sector_focus")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data: p }) => {
        if (p) setProfile({
          first_name: (p as any).first_name || null,
          level: (p as any).level || null,
          sector_focus: (p as any).sector_focus || null,
        });
      });
  }, [userId]);

  if (loading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  const milestones = data?.milestones || [];
  if (!milestones.length) return null;

  const earned = milestones.filter(m => m.earned);
  const unearned = milestones.filter(m => !m.earned);

  const isNewlyEarned = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < 2 * 60 * 1000; // <2 minutes ago
  };

  return (
    <section aria-label={tr("ms.aria")} className="space-y-4">
      <div>
        <div style={arStyle(lang, { fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink)", marginBottom: 3, textTransform: "uppercase" })}>
          {tr("ms.kicker")}
        </div>
        <div style={arStyle(lang, { fontFamily: "var(--font-display)", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 6, lineHeight: 1.5 })}>
          {tr("ms.sub")}
        </div>
        <h2 style={arStyle(lang, {
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 500,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
        })}>
          {tr("ms.title")}
          <InfoTooltip
            label={tr("ms.aria")}
            text={tr("ms.tip")}
          />
        </h2>
        <p style={arStyle(lang, {
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "hsl(var(--muted-foreground))",
          marginTop: 4,
        })}>
          {tr("ms.count", { earned: earned.length, total: milestones.length })}
        </p>
      </div>

      {earned.length > 0 && (
        <CollapsibleList
          items={earned}
          visibleCount={3}
          label="milestones"
          renderItem={(m) => {
            const summary = summarizeContext(tr, m.id, m.context);
            const isNew = isNewlyEarned(m.earned_at);
            return (
              <div
                className={isNew ? "aura-milestone-pulse" : undefined}
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border) / 0.5)",
                  borderInlineStart: "3px solid hsl(var(--primary))",
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <Check size={16} strokeWidth={2.25} style={{ color: "hsl(var(--primary))", marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>
                    {m.name}
                  </div>
                  {m.earned_at && (
                    <div style={arStyle(lang, { fontFamily: "var(--font-body)", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 })}>
                      {tr("ms.earnedOn", { date: formatDate(m.earned_at, lang) })}
                    </div>
                  )}
                  {summary && (
                    <div style={arStyle(lang, { fontFamily: "var(--font-body)", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 })}>
                      {summary}
                    </div>
                  )}
                </div>
                {celebrationsEnabled && (
                  <button
                    type="button"
                    aria-label={tr("ms.shareAria", { name: m.name })}
                    onClick={() => setShareData({
                      name: m.name,
                      context: buildShareContext(tr, m.id, m.name, m.context, profile?.sector_focus || null),
                      earnedAt: m.earned_at,
                      icon: MILESTONE_ICONS[m.id] || "✦",
                      firstName: profile?.first_name || null,
                      level: profile?.level || null,
                      sectorFocus: profile?.sector_focus || null,
                    })}
                    style={{
                      background: "transparent",
                      border: "1px solid hsl(var(--border) / 0.6)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      cursor: "pointer",
                      color: "hsl(var(--muted-foreground))",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                    title={tr("ms.shareTitle")}
                  >
                    <Share2 size={12} />
                    <span style={arStyle(lang)}>{tr("ms.share")}</span>
                  </button>
                )}
              </div>
            );
          }}
        />
      )}

      {unearned.length > 0 && (
        <div className="space-y-2">
          <div style={arStyle(lang, { fontSize: 12, letterSpacing: 2, color: "var(--ink-3)", textTransform: "uppercase", marginTop: 8 })}>
            {tr("ms.next")}
          </div>
          <ul className="space-y-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {unearned.map((m, idx) => {
              const isNext = idx === 0; // first unearned = next achievable
              return (
                <li
                  key={m.id}
                  style={{
                    border: isNext
                      ? "1px solid hsl(var(--primary) / 0.45)"
                      : "1px solid hsl(var(--border) / 0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    background: isNext ? "hsl(var(--primary) / 0.04)" : "transparent",
                    boxShadow: isNext ? "0 0 0 3px hsl(var(--primary) / 0.08)" : "none",
                    opacity: isNext ? 1 : 0.75,
                    transition: "all 200ms ease",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: isNext ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: isNext ? 500 : 400 }}>
                    {isNext && !ar && <span style={{ color: "hsl(var(--primary))", marginInlineEnd: 6 }}>›</span>}
                    {m.name}
                  </div>
                  <div style={arStyle(lang, { fontFamily: "var(--font-body)", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 })}>
                    {NEXT_IDS.has(m.id) ? tr(`ms.desc.${m.id}`) : tr("ms.keepGoing")}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {celebrationsEnabled && shareData && (
        <MilestoneShareModal
          open={!!shareData}
          onClose={() => setShareData(null)}
          data={shareData}
        />
      )}
    </section>
  );
};

export default MilestonesSection;
