import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { reportIssue } from "@/lib/reportIssue";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/button";

const RATINGS: { label: string; rating: number; color: string }[] = [
  { label: "Exceptional", rating: 5, color: "var(--pulse-accent, var(--brand))" },
  { label: "Strong", rating: 4, color: "var(--ink-3)" },
  { label: "Adequate", rating: 3, color: "var(--ink-4)" },
  { label: "Weak", rating: 2, color: "var(--ink-4)" },
  { label: "Poor", rating: 1, color: "var(--ink-5)" },
];

const FeedbackButton = () => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
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
    setFailed(null);
    // An action that reports success must have verified success: the thank-you
    // renders only after the function confirms the row landed.
    const label = rating ? RATINGS.find((r) => r.rating === rating)?.label ?? String(rating) : null;
    const res = await reportIssue({
      kind: "feedback",
      message: [label ? `Rating: ${label}` : null, message.trim() || null]
        .filter(Boolean)
        .join("\n") || "(no message)",
      route: location.pathname,
    });
    setSubmitting(false);
    if (!res.ok) {
      setFailed("We couldn't send that. Your words are still here — try again.");
      return;
    }
    setThanks(true);
    setTimeout(() => {
      setOpen(false);
      setThanks(false);
      setRating(null);
      setMessage("");
    }, 2000);
  };

  return createPortal(
    <>
      {!open && (
        <button
          /* Measured by the Desk dock so the two never sit on top of each other. */
          data-feedback-button=""
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

              <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 12, flexWrap: "wrap" }}>
                {RATINGS.map((r) => {
                  const selected = rating === r.rating;
                  return (
                    <button
                      key={r.rating}
                      onClick={() => setRating(r.rating)}
                      style={{
                        flex: "1 1 auto",
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 400,
                        borderRadius: 999,
                        border: `1px solid ${selected ? r.color : "var(--brand-line)"}`,
                        background: selected ? "var(--brand-ghost)" : "transparent",
                        color: r.color,
                        cursor: "pointer",
                        transition: "all 120ms ease",
                      }}
                      aria-label={`Rate ${r.label}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
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
                  fontSize: 14,
                  color: "var(--ink)",
                  resize: "vertical",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />

              {failed ? (
                <p style={{ fontSize: 12, color: "#C0392B", marginBottom: 8 }}>{failed}</p>
              ) : null}

              <Button
                size="sm"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!rating && !message.trim()}
                style={{ width: "100%" }}
              >
                {submitting ? "Sending..." : "Send feedback"}
              </Button>

              <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 12, textAlign: "center" }}>
                Your feedback helps us improve Aura
              </p>
              <p style={{ fontSize: 12, marginTop: 4, textAlign: "center" }}>
                <a href="mailto:support@aura-intel.org" style={{ color: "var(--brand)" }}>
                  Talk to the founder: support@aura-intel.org
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