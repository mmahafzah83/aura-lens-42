import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InviteColleagueModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setNote("");
    (async () => {
      try {
        await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke("colleague-invite", {
          body: { action: "count" },
        });
        if (!error && data) setRemaining(data.remaining ?? 0);
      } catch (e) {
        console.warn("[invite] count failed", e);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const used = remaining === null ? 0 : 3 - remaining;
  const exhausted = remaining !== null && remaining <= 0;

  const handleSubmit = async () => {
    if (!email.trim() || submitting || exhausted) return;
    setSubmitting(true);
    try {
      await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("colleague-invite", {
        body: { action: "invite", email: email.trim(), note: note.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sent. They're about to discover what you already know.`);
      setRemaining(typeof data?.remaining === "number" ? data.remaining : (remaining ?? 1) - 1);
      setEmail("");
      setNote("");
      setTimeout(onClose, 800);
    } catch (e: any) {
      toast.error(e?.message || "Could not send invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vellum)",
          border: "1px solid var(--brand-line)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lg)",
          width: "100%", maxWidth: 420,
          padding: "20px 22px",
          position: "relative",
        }}
      >
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "transparent", border: 0, cursor: "pointer",
            color: "var(--ink-3)", padding: 4,
          }}
        >
          <X size={18} />
        </button>

        <SectionHeader
          label="Invite a colleague to Aura"
          subtitle="They'll receive an invitation email and join the beta"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            disabled={exhausted}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              background: "var(--paper)",
              border: "1px solid var(--brand-line)",
              borderRadius: 6,
              color: "var(--ink)",
              outline: "none",
            }}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a personal note (optional)"
            rows={2}
            disabled={exhausted}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              background: "var(--paper)",
              border: "1px solid var(--brand-line)",
              borderRadius: 6,
              color: "var(--ink)",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />

          <div style={{ marginTop: 4 }}>
            <AuraButton
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={submitting || exhausted || !email.trim()}
            >
              {exhausted ? "You've used all 3 invitations" : (submitting ? "Sending..." : "Send invitation")}
            </AuraButton>
          </div>

          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            {remaining === null
              ? "Loading invitations..."
              : `You have ${remaining}/3 invitations left`}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default InviteColleagueModal;