import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";
import { toast } from "sonner";
import CountryPicker from "@/components/CountryPicker";
import { useSeniorityTitles, bandOfTitle } from "@/lib/seniorityTitles";

const SECTOR_OPTIONS = [
  "Consulting", "Energy", "Finance", "Government", "Technology",
  "Healthcare", "Telecom", "Real Estate", "Manufacturing", "Other",
];

export type EditProfileField =
  | "first_name"
  | "last_name"
  | "firm"
  | "sector_focus"
  | "level"
  | "core_practice"
  | "north_star_goal";

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
  const [level, setLevel] = useState("");
  const { titles: seniorityTitles } = useSeniorityTitles();
  const [corePractice, setCorePractice] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  /* What was on file when the modal opened. Only fields the member actually
     changed are ever written, so saving one field can never blank the rest. */
  const initialRef = useRef<Record<string, any>>({});
  const [bandLocked, setBandLocked] = useState(false);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const firmRef = useRef<HTMLInputElement>(null);
  const sectorRef = useRef<HTMLSelectElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const levelRef = useRef<HTMLSelectElement>(null);
  const practiceRef = useRef<HTMLInputElement>(null);
  const northStarRef = useRef<HTMLTextAreaElement>(null);

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
        .select("first_name, last_name, firm, sector_focus, level, core_practice, north_star_goal, country, country_code, band_source")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as any) || {};
      setFirstName(p.first_name || "");
      setLastName(p.last_name || "");
      setFirm(p.firm || "");
      setLevel(p.level || "");
      setCorePractice(p.core_practice || "");
      setNorthStar(p.north_star_goal || "");
      setCountry(p.country || null);
      setCountryCode(p.country_code || null);
      setBandLocked(p.band_source === "corrected");
      initialRef.current = {
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        firm: p.firm || "",
        sector_focus: p.sector_focus || "",
        level: p.level || "",
        core_practice: p.core_practice || "",
        north_star_goal: p.north_star_goal || "",
        country: p.country || null,
        country_code: p.country_code || null,
      };
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
      else if (focusField === "last_name") lastNameRef.current?.focus();
      else if (focusField === "level") levelRef.current?.focus();
      else if (focusField === "core_practice") practiceRef.current?.focus();
      else if (focusField === "north_star_goal") northStarRef.current?.focus();
      else firstNameRef.current?.focus();
    });
  }, [open, loading, focusField]);

  const handleSave = async () => {
    if (!userId || saving) return;
    setSaving(true);
    const resolvedSector = sectorFocus === "Other" ? sectorOther.trim() : sectorFocus;
    const was = initialRef.current;
    const patch: Record<string, any> = {};
    /* A field is written only if the member changed it. An emptied box is an
       explicit clear of that one column — never of any other. */
    const put = (key: string, value: string) => {
      const next = value.trim();
      if (next === String(was[key] ?? "")) return;
      patch[key] = next || null;
    };
    put("first_name", firstName);
    put("last_name", lastName);
    put("firm", firm);
    put("sector_focus", resolvedSector);
    put("level", level);
    put("core_practice", corePractice);
    put("north_star_goal", northStar);
    if ((country || null) !== (was.country ?? null)) patch.country = country || null;
    if ((countryCode || null) !== (was.country_code ?? null)) patch.country_code = countryCode || null;

    // The band is owned by the journey. A band the member already corrected
    // there is left exactly as it is.
    if (patch.level !== undefined && !bandLocked) {
      const pickedBand = bandOfTitle(seniorityTitles, level);
      if (pickedBand) { patch.seniority_band = pickedBand; patch.band_source = "corrected"; }
    }

    if (!Object.keys(patch).length) {
      setSaving(false);
      onClose();
      return;
    }
    const ok = await writeProfile(userId, patch, "EditProfileModal.handleSave");
    setSaving(false);
    if (!ok) {
      toast.error("That didn't save — try once more.");
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
    fontFamily: "var(--font-body)",
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
    fontFamily: "var(--font-body)",
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
          fontFamily: "var(--font-display)",
          fontSize: 22, fontWeight: 500, color: "var(--ink)",
          margin: 0, lineHeight: 1.2,
        }}>Edit profile</h2>
        <p style={{
          fontSize: 13, color: "var(--ink-3)",
          margin: "4px 0 18px",
          fontFamily: "var(--font-body)",
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
                <input ref={lastNameRef} value={lastName} onChange={(e) => setLastName(e.target.value)} style={input} />
              </div>
            </div>
            <div>
              <label style={label}>Firm</label>
              <input ref={firmRef} value={firm} onChange={(e) => setFirm(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Title</label>
              <select ref={levelRef} value={level} onChange={(e) => setLevel(e.target.value)} style={input}>
                <option value="">Select your level…</option>
                {level && !seniorityTitles.some((t) => t.title === level) ? (
                  <option value={level}>{level}</option>
                ) : null}
                {seniorityTitles.map((t) => <option key={t.title} value={t.title}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Core practice</label>
              <input ref={practiceRef} value={corePractice} onChange={(e) => setCorePractice(e.target.value)} style={input} />
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
            <div>
              <label style={label}>North-star goal</label>
              <textarea
                ref={northStarRef}
                value={northStar}
                onChange={(e) => setNorthStar(e.target.value)}
                rows={3}
                style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
            <div>
              <CountryPicker
                value={countryCode}
                onChange={(name, code) => { setCountry(name); setCountryCode(code); }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button
                type="button" onClick={onClose}
                style={{
                  padding: "10px 16px", fontSize: 13, fontWeight: 500,
                  background: "transparent",
                  border: "0.5px solid var(--color-border-secondary, var(--brand-line, rgba(0,0,0,0.12)))",
                  borderRadius: 8, cursor: "pointer", color: "var(--ink)",
                  fontFamily: "var(--font-body)",
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
                  fontFamily: "var(--font-body)",
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
