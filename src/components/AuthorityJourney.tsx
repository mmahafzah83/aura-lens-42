import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import InfoTooltip from "@/components/ui/InfoTooltip";

interface AuraScoreResponse {
  aura_score: number;
  tier_name: "Observer" | "Strategist" | "Authority";
  tier_number: 1 | 2 | 3;
  next_tier_name: string | null;
  points_to_next: number | null;
  personalized_nudge: string;
}

interface Props {
  userId: string | null;
  /** Optional preloaded EF response — pass to avoid an extra call. */
  data?: AuraScoreResponse | null;
}

const TIERS: AuraScoreResponse["tier_name"][] = ["Observer", "Strategist", "Authority"];
const TIER_RANGES: Record<string, [number, number]> = {
  Observer: [0, 35],
  Strategist: [35, 65],
  Authority: [65, 100],
};

const AuthorityJourney = ({ userId, data: provided }: Props) => {
  const [data, setData] = useState<AuraScoreResponse | null>(provided ?? null);
  const [loading, setLoading] = useState(!provided);
  const [sector, setSector] = useState<string | null>(null);

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
        console.error("AuthorityJourney load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, provided]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("diagnostic_profiles").select("sector_focus").eq("user_id", userId).maybeSingle()
      .then(({ data: p }) => setSector((p as any)?.sector_focus || null));
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
  const atAuthority = data.tier_name === "Authority";

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
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
          fontFamily: "'DM Sans', sans-serif",
          display: "inline-flex",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        Authority journey
        <InfoTooltip
          label="Authority Journey"
          text="Your path from Observer to Authority. Each tier unlocks with specific actions."
        />
      </div>
      <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 3, marginBottom: 6, lineHeight: 1.5 }}>
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
                  }}
                >
                  {t}
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
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 18,
          color: "hsl(var(--foreground))",
          marginTop: 4,
        }}
      >
        {data.tier_name}{sector ? ` in ${sector}` : ""}
      </div>

      {/* Points to next + progress */}
      <div className="font-sans" style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
        {atAuthority ? (
          <span>You've reached Authority — maintain your edge.</span>
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
      {data.personalized_nudge && (
        <p
          className="font-sans"
          style={{ fontSize: 13, color: "hsl(var(--foreground))", marginTop: 12, lineHeight: 1.6 }}
        >
          {data.personalized_nudge}
        </p>
      )}

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
    </section>
  );
};

export default AuthorityJourney;