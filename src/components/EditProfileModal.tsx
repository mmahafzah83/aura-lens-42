import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SECTOR_OPTIONS = [
  "Consulting", "Energy", "Finance", "Government", "Technology",
  "Healthcare", "Telecom", "Real Estate", "Manufacturing", "Other",
];

export type EditProfileField = "first_name" | "firm" | "sector_focus";

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  focusField?: EditProfileField;
  onSaved?: () => void;
}

export default function EditProfileModal({ open, onClose, userId, focusField, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firm, setFirm] = useState("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [sectorOther, setSectorOther] = useState("");
  const firstNameRef = useRef<HTMLInputElement>(null);
  const firmRef = useRef<HTMLInputElement>(null);
  const sectorRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name, last_name, firm, sector_focus")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as any) || {};
      setFirstName(p.first_name || "");
      setLastName(p.last_name || "");
      setFirm(p.firm || "");
      const sf = p.sector_focus || "";
      if (sf && !SECTOR_OPTIONS.includes(sf)) {
        setSectorFocus("Other");
        setSectorOther(sf);
      } else {
        setSectorFocus(sf);
        setSectorOther("");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  useEffect(() => {
    if (!open || loading) return;
    requestAnimationFrame(() => {
      if (focusField === "firm") firmRef.current?.focus();
      else if (focusField === "sector_focus") sectorRef.current?.focus();
      else firstNameRef.current?.focus();
    });
  }, [open, loading, focusField]);

  const handleSave = async () => {
    if (!userId || saving) return;
    setSaving(true);
    const resolvedSector = sectorFocus === "Other" ? sectorOther.trim() : sectorFocus;
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        firm: firm.trim() || null,
        sector_focus: resolvedSector || null,
      })
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast.error("Could not save profile");
      return;
    }
    toast.success("Profile updated");
    onSaved?.();
    onClose();
  };

  if (!open) return null;

  const label: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    background: "var(--color-background-secondary, var(--brand-ghost, rgba(0,0,0,0.04)))",
    border: "0.5px solid var(--color-border-secondary, var(--brand-line, rgba(0,0,0,0.12)))",
    borderRadius: 8,
    color: "var(--ink)",
    outline: "none",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary, var(--paper, #fff))",
          border: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.08)))",
          borderRadius: 12,
          boxShadow: "0 24px 60px -20px rgba(0,0,0,0.35)",
          width: "100%", maxWidth: 460,
          padding: "22px 24px", position: "relative",
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

        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 22, fontWeight: 500, color: "var(--ink)",
          margin: 0, lineHeight: 1.2,
        }}>Edit profile</h2>
        <p style={{
          fontSize: 13, color: "var(--ink-3)",
          margin: "4px 0 18px",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>Update how you appear across Aura.</p>

        {loading ? (
          <div style={{ padding: "20px 0", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>First name</label>
                <input ref={firstNameRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={input} />
              </div>
            </div>
            <div>
              <label style={label}>Firm</label>
              <input ref={firmRef} value={firm} onChange={(e) => setFirm(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Sector</label>
              <select
                ref={sectorRef}
                value={sectorFocus}
                onChange={(e) => setSectorFocus(e.target.value)}
                style={input}
              >
                <option value="">Select sector…</option>
                {SECTOR_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {sectorFocus === "Other" && (
                <input
                  value={sectorOther}
                  onChange={(e) => setSectorOther(e.target.value)}
                  placeholder="Describe your sector"
                  style={{ ...input, marginTop: 8 }}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button
                type="button" onClick={onClose}
                style={{
                  padding: "10px 16px", fontSize: 13, fontWeight: 500,
                  background: "transparent",
                  border: "0.5px solid var(--color-border-secondary, var(--brand-line, rgba(0,0,0,0.12)))",
                  borderRadius: 8, cursor: "pointer", color: "var(--ink)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >Cancel</button>
              <button
                type="button" onClick={handleSave} disabled={saving}
                style={{
                  padding: "10px 18px", fontSize: 13, fontWeight: 600,
                  background: "var(--brand)", color: "#fff",
                  border: "none", borderRadius: 8,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
