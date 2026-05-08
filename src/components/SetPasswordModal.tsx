import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  isFirstTime?: boolean;
}

export default function SetPasswordModal({ open, onClose, isFirstTime = false }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword(""); setConfirm(""); setShow(false);
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

  const valid = password.length >= 8 && password === confirm;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });
      if (error) throw error;
      toast.success("Password updated successfully");
      try { localStorage.setItem("password_set", "1"); } catch {}
      setTimeout(onClose, 600);
    } catch (e: any) {
      toast.error(e?.message || "Could not update password");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 38px 10px 12px",
    fontSize: 14,
    background: "var(--paper)",
    border: "1px solid var(--brand-line)",
    borderRadius: 6,
    color: "var(--ink)",
    outline: "none",
  };

  return createPortal(
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vellum)",
          border: "1px solid var(--brand-line)",
          borderRadius: 12, boxShadow: "var(--shadow-lg)",
          width: "100%", maxWidth: 420, padding: "20px 22px", position: "relative",
        }}
      >
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "transparent", border: 0, cursor: "pointer",
            color: "var(--ink-3)", padding: 4,
          }}
        ><X size={18} /></button>

        <SectionHeader
          label={isFirstTime ? "Secure your account" : "Change your password"}
          subtitle={isFirstTime
            ? "Set a password so you can log in from any device"
            : "Choose a new password for your account"}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={{ position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              style={inputStyle}
              autoComplete="new-password"
            />
            <button
              type="button" onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: 0, cursor: "pointer",
                color: "var(--ink-3)", padding: 4,
              }}
            >{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            style={{ ...inputStyle, padding: "10px 12px" }}
            autoComplete="new-password"
          />

          <div style={{ marginTop: 4 }}>
            <AuraButton
              variant="primary" size="md"
              onClick={handleSubmit}
              disabled={!valid || submitting}
            >
              {submitting ? "Saving..." : (isFirstTime ? "Set password" : "Update password")}
            </AuraButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}