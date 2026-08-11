import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Avatar from "@/components/systemb/Avatar";
import { MONO } from "./homeAtoms";
import { STANDING } from "@/constants/vocabulary";
import { useTierFromImprint, TIER_BANDS } from "@/hooks/useTierFromImprint";

/**
 * HomeMasthead — the greeting, the clock and the member's standing.
 * Standing comes from useTierFromImprint only: one source, everywhere.
 */

interface Profile {
  first_name: string | null;
  avatar_url: string | null;
  level: string | null;
  firm: string | null;
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function kickerFor(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${date} · ${time}`.toUpperCase();
}

export const HomeMasthead: React.FC<{ userId: string | null | undefined }> = ({ userId }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const tier = useTierFromImprint(userId);

  const tick = useCallback(() => setNow(new Date()), []);
  useEffect(() => {
    tick();
    window.addEventListener("focus", tick);
    const id = window.setInterval(tick, 60_000);
    return () => { window.removeEventListener("focus", tick); window.clearInterval(id); };
  }, [tick]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("first_name, avatar_url, level, firm")
        .eq("user_id", userId)
        .maybeSingle();
      if (alive && data) setProfile(data as Profile);
    })();
    return () => { alive = false; };
  }, [userId]);

  const firstName = (profile?.first_name || "").trim();
  const greeting = greetingFor(now.getHours());

  // ── standing, from the one source ──────────────────────────────
  const band = tier.currentTier;
  const score = tier.score;
  const idx = band ? TIER_BANDS.findIndex((b) => b.key === band.key) : -1;
  const nextBand = idx >= 0 ? TIER_BANDS[idx + 1] ?? null : null;
  const pointsToNext = band && nextBand && score != null
    ? Math.max(0, nextBand.min - Math.round(score))
    : null;
  const pct = band && score != null
    ? Math.max(0, Math.min(100, ((Math.round(score) - band.min) / Math.max(1, band.max - band.min)) * 100))
    : 0;

  return (
    <header className="home-masthead" style={{
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <Avatar size="lg" src={profile?.avatar_url ?? null} name={firstName || null} />

      <div style={{ display: "grid", gap: 4, minInlineSize: 0, flex: "1 1 240px" }}>
        <div style={{
          ...MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>{kickerFor(now)}</div>
        <h1 style={{
          margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 30,
          letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--text-primary)",
        }}>
          {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
        </h1>
      </div>

      <div className="home-masthead-standing" style={{ display: "grid", gap: 5, minInlineSize: 190 }}>
        <div style={{
          ...MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>{STANDING.label.toUpperCase()}</div>
        {tier.loading || !band ? (
          <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)" }}>
            {tier.loading ? "Reading your standing…" : "Not measured yet."}
          </div>
        ) : (
          <>
            <div style={{
              fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 15,
              color: "var(--text-primary)",
            }}>{band.name}</div>
            <div style={{ ...MONO, fontSize: 12, color: "var(--text-secondary)" }}>
              {nextBand && pointsToNext != null
                ? `${pointsToNext} points to ${nextBand.name}`
                : "The top band — it is held, not climbed."}
            </div>
            <div aria-hidden style={{
              blockSize: 4, background: "var(--rule-outer)", borderRadius: 999, overflow: "hidden",
            }}>
              <div style={{
                blockSize: 4, borderRadius: 999, background: "var(--machine)",
                inlineSize: `${pct}%`,
              }} />
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 700px) {
          .home-masthead { align-items: flex-start; }
          .home-masthead-standing { flex: 1 1 100%; text-align: start; }
        }
      `}</style>
    </header>
  );
};

export default HomeMasthead;
