import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import AuraButton from "@/components/ui/AuraButton";

const EMOJIS: { emoji: string; rating: number }[] = [
  { emoji: "😍", rating: 5 },
  { emoji: "😊", rating: 4 },
  { emoji: "😐", rating: 3 },
  { emoji: "😕", rating: 2 },
  { emoji: "😤", rating: 1 },
];

const FeedbackButton = () => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("beta_feedback").insert({
        user_id: user?.id ?? null,
        rating,
        message: message.trim() || null,
        page: location.pathname,
        feedback_type: "general",
      } as any);
      setThanks(true);
      setTimeout(() => {
        setOpen(false);
        setThanks(false);
        setRating(null);
        setMessage("");
      }, 2000);
    } catch (e) {
      console.error("feedback submit failed", e);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 40,
            height: 40,
            padding: "0 16px",
            borderRadius: 20,
            background: "var(--vellum)",
            border: "1px solid var(--brand-line)",
            boxShadow: "var(--shadow-md)",
            color: "var(--ink-3)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "border-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--brand-line)")}
        >
          Feedback
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 50,
            width: 320,
            background: "var(--vellum)",
            border: "1px solid var(--brand-line)",
            borderRadius: "12px 12px 12px 12px",
            boxShadow: "var(--shadow-lg)",
            padding: 16,
            animation: "slideUp 0.2s ease-out",
          }}
        >
          <button
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-3)",
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {thanks ? (
            <div style={{ padding: "32px 8px", textAlign: "center", color: "var(--ink)", fontSize: 14 }}>
              Thank you!
            </div>
          ) : (
            <>
              <SectionHeader label="Share your feedback" />

              <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 12 }}>
                {EMOJIS.map((e) => (
                  <button
                    key={e.rating}
                    onClick={() => setRating(e.rating)}
                    style={{
                      flex: 1,
                      height: 36,
                      fontSize: 18,
                      borderRadius: 8,
                      border: rating === e.rating ? "1px solid var(--brand)" : "1px solid transparent",
                      background: rating === e.rating ? "var(--brand-ghost)" : "transparent",
                      cursor: "pointer",
                    }}
                    aria-label={`Rate ${e.rating}`}
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                style={{
                  width: "100%",
                  background: "var(--vellum)",
                  border: "1px solid var(--brand-line)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  color: "var(--ink)",
                  resize: "vertical",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />

              <AuraButton
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || (!rating && !message.trim())}
                style={{ width: "100%" }}
              >
                {submitting ? "Sending..." : "Send feedback"}
              </AuraButton>

              <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12, textAlign: "center" }}>
                Your feedback helps us improve Aura
              </p>
              <p style={{ fontSize: 11, marginTop: 4, textAlign: "center" }}>
                <a href="mailto:mohammad@aura-intel.org" style={{ color: "var(--brand)" }}>
                  Talk to the founder: mohammad@aura-intel.org
                </a>
              </p>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>,
    document.body
  );
};

export default FeedbackButton;