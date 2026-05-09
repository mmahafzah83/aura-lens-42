import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SS_KEY = "aura_weekly_loop_dismissed";

type TabValue = "home" | "identity" | "intelligence" | "authority" | "influence";

interface Props {
  onSwitchTab?: (tab: TabValue) => void;
}

const WeeklyIntelligenceLoopCard = ({ onSwitchTab }: Props) => {
  const [days, setDays] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(SS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const uid = session.user.id;
      const [metricsRes, snapsRes] = await Promise.all([
        supabase.from("linkedin_post_metrics").select("snapshot_date").eq("user_id", uid).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("influence_snapshots").select("snapshot_date").eq("user_id", uid).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const dates: number[] = [];
      if (metricsRes.data?.snapshot_date) dates.push(new Date(metricsRes.data.snapshot_date).getTime());
      if (snapsRes.data?.snapshot_date) dates.push(new Date(snapsRes.data.snapshot_date).getTime());
      if (cancelled) return;
      if (dates.length === 0) {
        // Never uploaded LinkedIn data — do not nag. Card stays hidden.
        setDays(-1);
        return;
      }
      const latest = Math.max(...dates);
      const d = Math.floor((Date.now() - latest) / (24 * 3_600_000));
      setDays(d);
    })();
    return () => { cancelled = true; };
  }, []);

  if (dismissed) return null;
  if (days === null || days < 7) return null;
  // Never-uploaded sentinel → hide entirely
  if (days < 0) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(SS_KEY, "1"); } catch {}
    setDismissed(true);
  };

  const goUpload = () => {
    onSwitchTab?.("influence");
    window.setTimeout(() => {
      const el = document.querySelector('[data-section="linkedin-upload"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, 250);
  };

  const dayLabel = `${days} day${days === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      style={{
        background: "var(--brand-ghost, hsl(43 50% 55% / 0.06))",
        borderLeft: "3px solid var(--brand)",
        borderRadius: 10,
        padding: "14px 18px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          fontWeight: 700,
          color: "var(--brand)",
          margin: 0,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        Your week at a glance
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-1)", margin: 0 }}>
        Your LinkedIn data hasn't been updated in {dayLabel}. Close the loop in 30 seconds: export your analytics, upload here, and watch which signals are driving real engagement.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={goUpload}
          style={{
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Upload my numbers →
        </button>
        <button
          onClick={dismiss}
          style={{
            background: "transparent",
            color: "var(--ink-3)",
            border: "1px solid hsl(var(--border) / 0.4)",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Remind me later
        </button>
      </div>
    </div>
  );
};

export default WeeklyIntelligenceLoopCard;