import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import InfoTooltip from "@/components/ui/InfoTooltip";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";
import ShareLink from "@/components/ShareLink";

type TierName = "Observer" | "Explorer" | "Strategist" | "Voice" | "Presence";
interface AuraScoreResponse {
  aura_score: number;
  tier_name: TierName;
  tier_number: 1 | 2 | 3 | 4 | 5;
  next_tier_name: string | null;
  points_to_next: number | null;
  personalized_nudge: string;
}

interface Props {
  userId: string | null;
  /** Optional preloaded EF response — pass to avoid an extra call. */
  data?: AuraScoreResponse | null;
}

const TIERS: TierName[] = ["Observer", "Explorer", "Strategist", "Voice", "Presence"];
const TIER_RANGES: Record<TierName, [number, number]> = {
  Observer: [0, 15],
  Explorer: [15, 35],
  Strategist: [35, 60],
  Voice: [60, 80],
  Presence: [80, 100],
};

const TIER_TOOLTIPS: Record<TierName, { title: string; body: string }> = {
  Observer: {
    title: "Observer · 0–14",
    body: "Absorbing the market. Capture weekly to build your intelligence base.",
  },
  Explorer: {
    title: "Explorer · 15–34",
    body: "Finding patterns. Your first signals are forming from what you capture.",
  },
  Strategist: {
    title: "Strategist · 35–59",
    body: "Connecting insights to action. Start drafting posts from your strongest signals.",
  },
  Voice: {
    title: "Voice · 60–79",
    body: "Shaping conversations. Your published work compounds into recognized expertise.",
  },
  Presence: {
    title: "Presence · 80–100",
    body: "The market knows you. Your signals and content sustain lasting authority.",
  },
};

const AuthorityJourney = ({ userId, data: provided }: Props) => {
  const [data, setData] = useState<AuraScoreResponse | null>(provided ?? null);
  const [loading, setLoading] = useState(!provided);
  const [sector, setSector] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [signalCount, setSignalCount] = useState<number | null>(null);
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
        const { data: res, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (!cancelled && !error && res) setData(res as AuraScoreResponse);
      } catch (e) {
        console.error("AuthorityJourney load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, provided]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("diagnostic_profiles").select("sector_focus, first_name").eq("user_id", userId).maybeSingle()
      .then(({ data: p }) => {
        setSector((p as any)?.sector_focus || null);
        setFirstName((p as any)?.first_name || null);
      });
    supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("status", "active")
      .then(({ count }) => setSignalCount(count ?? 0));
  }, [userId]);

  if (loading) {
    return (
      <section aria-label="Authority journey" className="rounded-r-lg border p-5"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border) / 0.5)" }}>
        <Skeleton className="h-6 w-full mb-4" />
        <Skeleton className="h-4 w-2/3" />
      </section>
    );
  }
  if (!data) return null;

  const currentIdx = TIERS.indexOf(data.tier_name);
  const [tierMin, tierMax] = TIER_RANGES[data.tier_name];
  const inTierProgress = Math.max(0, Math.min(1, (data.aura_score - tierMin) / (tierMax - tierMin)));
  const atAuthority = data.tier_name === "Presence";

  return (
    <section
      aria-label="Authority journey"
      className="rounded-r-lg border"
      style={{
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border) / 0.5)",
        borderLeftWidth: 4,
        borderLeftColor: "var(--brand)",
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
          fontFamily: "'DM Sans', sans-serif",
          display: "inline-flex",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        Presence journey
        <InfoTooltip
          label="Presence Journey"
          text="Your path from Observer to Presence. Each tier unlocks with specific actions."
        />
      </div>
      <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", marginTop: 3, marginBottom: 6, lineHeight: 1.5 }}>
        Your progression from Observer to recognized Authority
      </div>
      {/* Waypoint bar */}
      <div className="relative" style={{ paddingTop: 6, paddingBottom: 28 }}>
        <div className="flex items-center justify-between relative">
          {TIERS.map((t, i) => {
            const isCurrent = i === currentIdx;
            const isPast = i < currentIdx;
            const size = isCurrent ? 32 : 24;
            return (
              <div key={t} className="flex flex-col items-center" style={{ flex: "0 0 auto", zIndex: 2 }}>
                <div
                  className={isCurrent ? "aura-journey-pulse" : ""}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: isPast || isCurrent ? "var(--brand)" : "transparent",
                    border: isPast || isCurrent
                      ? "1px solid var(--brand)"
                      : "1.5px solid hsl(var(--muted-foreground) / 0.4)",
                    transition: "all 200ms ease",
                  }}
                />
                <div
                  className="font-sans"
                  style={{
                    fontSize: 12,
                    marginTop: 8,
                    color: isCurrent ? "var(--brand)" : "hsl(var(--muted-foreground))",
                    fontWeight: isCurrent ? 600 : 400,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t}
                  <InfoTooltip side="bottom" label={t} width={240} triggerSize={14}>
                    <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                      {TIER_TOOLTIPS[t].title}
                    </div>
                    <p style={{ margin: 0 }}>{TIER_TOOLTIPS[t].body}</p>
                  </InfoTooltip>
                </div>
              </div>
            );
          })}

          {/* Connecting lines (absolute, between circles) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              top: currentIdx === 0 ? 16 : 16,
              height: 2,
              display: "flex",
              zIndex: 1,
            }}
          >
            {[0, 1].map((seg) => (
              <div key={seg} style={{ flex: 1, height: 2, background: seg < currentIdx ? "var(--brand)" : "hsl(var(--muted-foreground) / 0.25)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Tier name + sector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18,
            color: "hsl(var(--foreground))",
          }}
        >
          {data.tier_name}{sector ? ` in ${sector}` : ""}
        </div>
        <button
          type="button"
          aria-label={`Share ${data.tier_name} tier on LinkedIn`}
          onClick={() => setShareData({
            name: `${data.tier_name} Tier`,
            context: `Aura score ${data.aura_score}/100${sector ? ` · ${sector}` : ""}`,
            earnedAt: new Date().toISOString(),
            icon: data.tier_name === "Presence" ? "✦"
              : data.tier_name === "Voice" ? "✧"
              : data.tier_name === "Strategist" ? "◆"
              : data.tier_name === "Explorer" ? "◇"
              : "◎",
            firstName,
            level: data.tier_name,
            sectorFocus: sector,
          })}
          style={{
            background: "transparent",
            border: "1px solid hsl(var(--border) / 0.6)",
            borderRadius: 6,
            padding: "3px 8px",
            cursor: "pointer",
            color: "hsl(var(--muted-foreground))",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
          title="Share on LinkedIn"
        >
          <Share2 size={11} />
          Share
        </button>
      </div>

      {/* Points to next + progress */}
      <div className="font-sans" style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
        {atAuthority ? (
          <>
            <div>You've reached Presence — keep your edge.</div>
            <div style={{ marginTop: 8 }}>
              <ShareLink
                label="Share your Presence status →"
                ariaLabel="Share Presence tier on LinkedIn"
                onClick={() => setShareData({
                  name: `${data.tier_name} Tier`,
                  context: `Aura score ${data.aura_score}/100${sector ? ` · ${sector}` : ""}`,
                  earnedAt: new Date().toISOString(),
                  icon: "✦",
                  firstName,
                  level: data.tier_name,
                  sectorFocus: sector,
                })}
              />
            </div>
          </>
        ) : (
          <>
            <div>{data.points_to_next} points to {data.next_tier_name}</div>
            <div
              aria-hidden
              style={{
                marginTop: 6,
                height: 3,
                background: "hsl(var(--muted-foreground) / 0.18)",
                borderRadius: 2,
                overflow: "hidden",
                maxWidth: 280,
              }}
            >
              <div
                style={{
                  width: `${Math.round(inTierProgress * 100)}%`,
                  height: "100%",
                  background: "var(--brand)",
                  transition: "width 400ms ease",
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Personalized nudge */}
      {(() => {
        const noSignals = signalCount === 0;
        let nudge = noSignals
          ? "You're starting your authority journey. Capture articles in your area of expertise to detect your first signals."
          : (data.personalized_nudge || "");
        // Defensive: strip accidental duplicate leading "Your your" coming from
        // a top-signal title that itself starts with "your".
        nudge = nudge.replace(/\bYour\s+your\b/gi, "Your");
        if (!nudge) return null;
        // Detect the broken pattern "Your <title> signal (NN%) is ready to publish. <rest>"
        // and reformat it across multiple lines so the title isn't embedded mid-sentence.
        const m = nudge.match(/^Your\s+(.+?)\s+signal\s*\((\d+%)\)\s+is ready to publish\.?\s*(.*)$/i);
        if (m) {
          const [, title, pct, rest] = m;
          return (
            <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.625, color: "hsl(var(--foreground))" }} className="font-sans">
              <div style={{ color: "var(--ink-3)", marginBottom: 4 }}>
                Your strongest signal is ready to publish:
              </div>
              <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                "{title}" <span style={{ color: "var(--brand)", fontWeight: 500 }}>({pct})</span>
              </div>
              {rest && <div style={{ color: "var(--ink-2)" }}>{rest}</div>}
            </div>
          );
        }
        return (
          <p
            className="font-sans"
            style={{ fontSize: 14, color: "hsl(var(--foreground))", marginTop: 12, lineHeight: 1.625 }}
          >
            {nudge}
          </p>
        );
      })()}

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .aura-journey-pulse {
            animation: aura-journey-pulse 3s ease-in-out infinite;
          }
          @keyframes aura-journey-pulse {
            0%, 100% { opacity: 0.7; }
            50%      { opacity: 1; }
          }
        }
      `}</style>
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

export default AuthorityJourney;