/**
 * The catch for a member who chose "Finish later" part-way through the journey.
 *
 * Pinned to the top of Home, it states what is already saved — nothing they did
 * may look lost — and carries them back to the exact screen they stopped on.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";
const INK = "#0F1519";

const stageOf = (s: number) => (s <= 3 ? 1 : s <= 7 ? 2 : s <= 9 ? 3 : s <= 11 ? 4 : 5);

interface Paused { stage: number; saved: string[]; chose: boolean; }

export default function ResumeJourneyCard({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const [paused, setPaused] = useState<Paused | null>(null);

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
        claims ? `${claims} ${claims === 1 ? "subject" : "subjects"} saved` : "",
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

  if (!paused) return null;
  const left = Math.max(2, (5 - paused.stage) * 2);

  return (
    <section style={{
      background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 18,
      padding: 18, marginBlockEnd: 16,
    }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>
        {paused.chose
          ? `You're part-way through — ${paused.stage} of 5 done, about ${left} minutes left.`
          : `You started setting up and stopped at step ${paused.stage} of 5. It's all still here.`}
      </h2>
      {paused.saved.length ? (
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: MUTED }}>
          {paused.saved.join(" · ")}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => navigate("/onboarding")}
        style={{
          marginBlockStart: 14, inlineSize: "100%", minBlockSize: 52, borderRadius: 999,
          border: "none", background: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Pick up where I left off
      </button>
    </section>
  );
}