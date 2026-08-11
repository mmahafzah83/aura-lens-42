/**
 * The catch for a member who stopped part-way through the journey.
 *
 * One line of substance and one action. The masthead already carries the name,
 * the time and the date, so this card never greets anyone. When there is
 * nothing to resume it renders nothing at all.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { nEvidence } from "@/constants/vocabulary";

const stageOf = (s: number) => (s <= 3 ? 1 : s <= 7 ? 2 : s <= 9 ? 3 : s <= 11 ? 4 : 5);
const dismissKey = (uid: string) => `aura_resume_hidden_${uid}`;

interface Paused { stage: number; saved: string[]; chose: boolean; }

export default function ResumeJourneyCard({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const [paused, setPaused] = useState<Paused | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try { setHidden(localStorage.getItem(dismissKey(userId)) === "1"); } catch { /* noop */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("identity_intelligence, onboarding_step, onboarding_completed, headline, seniority_band, skill_ratings")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive || !data) return;
      const ii = ((data as any).identity_intelligence as Record<string, any>) || {};
      const screen = Number(ii.journey_screen ?? 0);
      const finished = Boolean((data as any).onboarding_completed) || Number((data as any).onboarding_step ?? 0) >= 4;
      if (finished || screen <= 0) { setPaused(null); return; }
      const claims = Array.isArray(ii.claims) ? ii.claims.length : 0;
      const strengths = Object.keys(((data as any).skill_ratings as Record<string, unknown>) || {}).length;
      const saved = [
        (data as any).headline || (data as any).seniority_band ? "Your profile is read" : "",
        claims ? `${nEvidence(claims)} saved` : "",
        strengths ? "your strengths saved" : "",
      ].filter(Boolean) as string[];
      setPaused({
        stage: Number(ii.journey_stage ?? stageOf(screen)) || 1,
        saved,
        chose: Boolean(ii.journey_paused),
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!paused || hidden) return null;
  const left = Math.max(2, (5 - paused.stage) * 2);

  return (
    <section style={{
      background: "var(--surface-1)", border: "1px solid var(--rule-outer)", borderRadius: 18,
      padding: 18, marginBlockEnd: 16,
    }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
        {paused.chose
          ? `You're part-way through — ${paused.stage} of 5 done, about ${left} minutes left.`
          : `You started setting up and stopped at step ${paused.stage} of 5. It's all still here.`}
      </h2>
      {paused.saved.length ? (
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          {paused.saved.join(" · ")}
        </p>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBlockStart: 14 }}>
        <button
          type="button"
          onClick={() => navigate("/onboarding")}
          style={{
            minBlockSize: 48, padding: "0 22px", borderRadius: 999,
            border: "none", background: "var(--act)", color: "var(--action-ink)",
            fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Pick up where I left off
        </button>
        <button
          type="button"
          onClick={() => {
            if (userId) { try { localStorage.setItem(dismissKey(userId), "1"); } catch { /* noop */ } }
            setHidden(true);
          }}
          style={{
            background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: 500, color: "var(--text-secondary)",
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}