import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { CollapsibleList } from "@/components/ui/CollapsibleList";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";

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

const buildShareContext = (id: string, name: string, ctx: any, sectorFocus: string | null): string => {
  const sector = sectorFocus || "your sector";
  if (id === "profile_complete") return `Professional identity configured for ${sector}`;
  if (id === "first_signal") return `First strategic signal: ${ctx?.signal_title || name}`;
  if (id === "voice_trained") return "AI voice model trained on my writing style";
  if (id === "brand_assessment") return "Professional brand archetype identified";
  if (id === "five_signals") return `${ctx?.count ?? 5} active signals across ${sector}`;
  if (id === "sector_depth") {
    const t = Array.isArray(ctx?.themes) ? ctx.themes.length : (ctx?.theme_count ?? 5);
    return `${t} intelligence themes tracked`;
  }
  if (id === "first_publish") return "First AI-assisted post published";
  if (id === "weekly_rhythm_4") return "4+ active capture weeks in the last 6 weeks";
  return name;
};

const NEXT_DESCRIPTIONS: Record<string, string> = {
  profile_complete: "Earned when your profile and sector focus are set.",
  first_signal: "Earned when Aura detects your first strategic signal.",
  voice_trained: "Earned when your voice profile has been distilled.",
  first_publish: "Earned when you publish your first post.",
  brand_assessment: "Earned when you complete the brand assessment.",
  five_signals: "Earned when you have 5+ active signals.",
  sector_depth: "Earned when 5+ themes appear across your captures.",
  weekly_rhythm_4: "Earned when you capture in 4+ of the last 6 weeks.",
};

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return ""; }
};

const summarizeContext = (id: string, ctx: any): string | null => {
  if (!ctx) return null;
  if (id === "sector_depth" && Array.isArray(ctx.themes) && ctx.themes.length) {
    return `${ctx.themes.length} themes: ${ctx.themes.slice(0, 3).join(", ")}${ctx.themes.length > 3 ? "..." : ""}`;
  }
  if (id === "first_signal" && ctx.signal_title) return ctx.signal_title;
  if (id === "five_signals" && ctx.count) return `${ctx.count} active signals`;
  if (id === "weekly_rhythm_4" && ctx.active_in_last_6 != null) return `${ctx.active_in_last_6} of last 6 weeks active`;
  if (id === "first_publish" && ctx.post_count) return `${ctx.post_count} posts published`;
  if (id === "profile_complete" && ctx.sector_focus) return ctx.sector_focus;
  if (id === "voice_trained" && ctx.tone) return `Tone: ${ctx.tone}`;
  return null;
};

const MilestonesSection = ({ userId, data: provided }: Props) => {
  const [data, setData] = useState<AuraScoreResponse | null>(provided ?? null);
  const [loading, setLoading] = useState(!provided);
  const [profile, setProfile] = useState<{ first_name: string | null; level: string | null; sector_focus: string | null } | null>(null);
  const [shareData, setShareData] = useState<MilestoneShareData | null>(null);

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
        const { data: res, error } = await supabase.functions.invoke("calculate-aura-score", { body: {} });
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

  return (
    <section aria-label="Milestones" className="space-y-4">
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink)", marginBottom: 3, textTransform: "uppercase" }}>
          ACHIEVEMENTS
        </div>
        <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 6, lineHeight: 1.5 }}>
          Professional credentials earned through consistent intelligence work
        </div>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 500,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
        }}>
          Your milestones
          <InfoTooltip
            label="Milestones"
            text="Professional credentials earned as your authority grows."
          />
        </h2>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: "hsl(var(--muted-foreground))",
          marginTop: 4,
        }}>
          {earned.length} of {milestones.length} earned
        </p>
      </div>

      {earned.length > 0 && (
        <CollapsibleList
          items={earned}
          visibleCount={3}
          label="milestones"
          renderItem={(m) => {
            const summary = summarizeContext(m.id, m.context);
            return (
              <div
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border) / 0.5)",
                  borderLeft: "3px solid hsl(var(--primary))",
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
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>
                    {m.name}
                  </div>
                  {m.earned_at && (
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                      Earned {formatDate(m.earned_at)}
                    </div>
                  )}
                  {summary && (
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                      {summary}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Share ${m.name} on LinkedIn`}
                  onClick={() => setShareData({
                    name: m.name,
                    context: buildShareContext(m.id, m.name, m.context, profile?.sector_focus || null),
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
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                  title="Share on LinkedIn"
                >
                  <Share2 size={12} />
                  Share
                </button>
              </div>
            );
          }}
        />
      )}

      {unearned.length > 0 && (
        <div className="space-y-2">
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--ink-3)", textTransform: "uppercase", marginTop: 8 }}>
            Next
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
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: isNext ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: isNext ? 500 : 400 }}>
                    {isNext && <span style={{ color: "hsl(var(--primary))", marginRight: 6 }}>›</span>}
                    {m.name}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                    {NEXT_DESCRIPTIONS[m.id] || "Keep going to unlock this milestone."}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shareData && (
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
