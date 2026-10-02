import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Avatar from "@/components/systemb/Avatar";
import { MONO, ReadFailure } from "./homeAtoms";
import { useTierFromImprint, TIER_BANDS } from "@/hooks/useTierFromImprint";
import { useLanguage } from "@/contexts/LanguageContext";
import { dateLocale, type UiLang } from "@/i18n";

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

function greetingFor(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function kickerFor(d: Date, lang: UiLang): string {
  const loc = lang === "ar" ? dateLocale(lang) : undefined;
  const day = d.toLocaleDateString(loc, { weekday: "long" });
  const date = d.toLocaleDateString(loc, { day: "numeric", month: "long" });
  const time = d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${date} · ${time}`.toUpperCase();
}

export const HomeMasthead: React.FC<{ userId: string | null | undefined }> = ({ userId }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [profileNonce, setProfileNonce] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
  const tier = useTierFromImprint(userId);
  const { t, lang } = useLanguage();

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
      const { data, error } = await supabase
        .from("diagnostic_profiles")
        .select("first_name, avatar_url, level, firm")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.warn("[HomeMasthead] diagnostic_profiles read failed", error);
        setProfileFailed(true);   // keep whatever profile is already rendered
        return;
      }
      setProfileFailed(false);
      if (data) setProfile(data as Profile);
    })();
    return () => { alive = false; };
  }, [userId, profileNonce]);

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
        }}>{kickerFor(now, lang)}</div>
        <h1 style={{
          margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 30,
          letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--text-primary)",
        }}>
          {firstName ? t(`home.masthead.${greeting}Name`, { name: firstName }) : t(`home.masthead.${greeting}`)}
        </h1>
      </div>

      <div className="home-masthead-standing" style={{ display: "grid", gap: 5, minInlineSize: 190 }}>
        <div style={{
          ...MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>{t("home.masthead.standingLabel").toUpperCase()}</div>
        {tier.loading || !band ? (
          <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)" }}>
            {tier.loading
              ? t("home.masthead.reading")
              : tier.failed
                ? t("home.masthead.failed")
                : t("home.masthead.notMeasured")}
          </div>
        ) : (
          <>
            <div style={{
              fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 15,
              color: "var(--text-primary)",
            }}>{t(`tier.${band.key}`)}</div>
            <div style={{ ...MONO, fontSize: 12, color: "var(--text-secondary)" }}>
              {nextBand && pointsToNext != null
                ? t("home.masthead.pointsTo", { count: pointsToNext, band: t(`tier.${nextBand.key}`) })
                : t("home.masthead.topBand")}
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
        {tier.failed && !tier.loading && <ReadFailure onRetry={tier.refresh} />}
        {profileFailed && <ReadFailure onRetry={() => setProfileNonce((n) => n + 1)} />}
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
