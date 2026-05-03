import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AuraButton from "@/components/ui/AuraButton";

const DISMISS_KEY = "aura_nps_dismissed";
const DISMISS_DAYS = 7;

const isDismissedActive = () => {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = parseInt(v, 10);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const NpsSurveyModal = () => {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDismissedActive()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const created = user.created_at ? new Date(user.created_at).getTime() : 0;
      if (!created) return;
      const days = (Date.now() - created) / (24 * 60 * 60 * 1000);
      if (days < 7) return;
      const { data: existing } = await supabase
        .from("beta_feedback")
        .select("id")
        .eq("user_id", user.id)
        .eq("feedback_type", "nps")
        .limit(1);
      if (cancelled) return;
      if (existing && existing.length > 0) return;
      setUserId(user.id);
      // Small delay so it doesn't race with page mount
      setTimeout(() => !cancelled && setOpen(true), 1500);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleDismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (score === null || submitting || !userId) return;
    setSubmitting(true);
    try {
      await supabase.from("beta_feedback").insert({
        user_id: userId,
        rating: score,
        message: message.trim() || null,
        page: location.pathname,
        feedback_type: "nps",
      });
      setThanks(true);
      setTimeout(() => setOpen(false), 2000);
    } catch {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const colorFor = (n: number, isSelected: boolean, isHover: boolean) => {
    if (isSelected) return { bg: "var(--brand)", color: "#fff", border: "var(--brand)" };
    if (isHover) {
      if (n <= 6) return { bg: "var(--ink-2, rgba(255,255,255,0.08))", color: "var(--ink)", border: "var(--brand-line)" };
      if (n <= 8) return { bg: "rgba(197,165,90,0.2)", color: "var(--ink)", border: "var(--brand-line)" };
      return { bg: "var(--brand-ghost, rgba(197,165,90,0.35))", color: "var(--ink)", border: "var(--brand)" };
    }
    return { bg: "var(--vellum)", color: "var(--ink-3)", border: "var(--brand-line)" };
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div
        ref={panelRef}
        style={{
          width: "100%", maxWidth: 480,
          background: "var(--vellum)",
          border: "1px solid var(--brand-line)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          padding: 28,
          fontFamily: "var(--font-body)",
          position: "relative",
        }}
      >
        <button
          onClick={handleDismiss}
          aria-label="Close"
          style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)" }}
        >
          <X size={18} />
        </button>

        {thanks ? (
          <div style={{ padding: "24px 4px", textAlign: "center", color: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 18 }}>
            Thank you!
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: 0, marginBottom: 8 }}>
              Quick question
            </h2>
            <p style={{ fontSize: 14, color: "var(--ink-3)", margin: 0, marginBottom: 18 }}>
              How likely are you to recommend Aura to a colleague?
            </p>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
              {Array.from({ length: 11 }, (_, n) => {
                const isSelected = score === n;
                const isHover = hovered === n && !isSelected;
                const c = colorFor(n, isSelected, isHover);
                return (
                  <button
                    key={n}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setScore(n)}
                    style={{
                      width: 36, height: 36, borderRadius: 6,
                      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                      fontSize: 13, fontWeight: 500, cursor: "pointer",
                      transition: "all 120ms ease",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            {score !== null && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
                  What could we improve? (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", resize: "vertical",
                    background: "var(--paper, #fff)",
                    border: "1px solid var(--brand-line)",
                    borderRadius: 8, padding: 10,
                    fontSize: 13, color: "var(--ink)", fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button
                onClick={handleDismiss}
                style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
              >
                Maybe later
              </button>
              {score !== null && (
                <AuraButton onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </AuraButton>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default NpsSurveyModal;