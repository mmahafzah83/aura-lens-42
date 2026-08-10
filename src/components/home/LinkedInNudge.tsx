/**
 * One quiet line on Home for members whose LinkedIn has never been read.
 * Not a modal, not a blocker. Dismissal lives in diagnostic_profiles.ui_dismissals.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadReadStatus } from "@/lib/linkedinReadStatus";

const ACTION = "#0670C4";
const INK = "#0F1519";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";

const KEY = "linkedin_read_nudge";

export default function LinkedInNudge({ userId }: { userId: string | null }) {
  const [show, setShow] = useState(false);
  const [dismissals, setDismissals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [status, profile] = await Promise.all([
        loadReadStatus(userId),
        supabase.from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle(),
      ]);
      if (!alive) return;
      const raw = (profile.data as { ui_dismissals?: unknown } | null)?.ui_dismissals;
      const map = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {};
      setDismissals(map);
      setShow(status !== "verified_by_read" && !map[KEY]);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!show) return null;

  const dismiss = async () => {
    setShow(false);
    if (!userId) return;
    await supabase
      .from("diagnostic_profiles")
      .update({ ui_dismissals: { ...dismissals, [KEY]: true } })
      .eq("user_id", userId);
  };

  return (
    <div
      data-testid="linkedin-nudge"
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 12,
        padding: "10px 12px", marginBottom: 16, fontSize: 13.5, color: INK, lineHeight: 1.5,
      }}
    >
      <span style={{ flex: "1 1 220px", minWidth: 0 }}>
        Aura hasn't read your LinkedIn yet — that's what makes it sound like you.{" "}
        <Link to="/settings" style={{ color: ACTION, fontWeight: 500, textDecoration: "none" }}>
          Add it →
        </Link>
      </span>
      <button
        type="button"
        onClick={() => void dismiss()}
        aria-label="Dismiss"
        style={{ background: "none", border: 0, padding: 4, color: MUTED, cursor: "pointer", lineHeight: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}