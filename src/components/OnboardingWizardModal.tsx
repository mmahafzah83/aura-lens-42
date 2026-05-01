import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Constants ────────────────────────────────────────────────
const SECTORS = [
  "Utilities & Infrastructure",
  "Financial Services",
  "Government",
  "Healthcare",
  "Technology",
  "Real Estate",
  "Energy",
  "Other",
];

const FIRM_TYPES = [
  "Big 4 Consulting",
  "Strategy Consulting",
  "Government / Public Sector",
  "Corporate (Multinational)",
  "Corporate (Regional)",
  "Startup / Scale-up",
  "Independent / Freelance",
  "Other",
];

const PILLARS = [
  "Digital Transformation",
  "IT/OT Convergence",
  "Water Utilities",
  "AI Governance",
  "Vision 2030",
  "Operational Resilience",
  "IoT",
  "Sustainability",
  "Data Analytics",
  "Cybersecurity",
];

// ── Inline style helpers (scoped to this overlay) ────────────
const fontSans = "'DM Sans', sans-serif";
const fontSerif = "'DM Serif Display', Georgia, serif";

const inputStyle: React.CSSProperties = {
  background: "var(--ink)",
  border: "0.5px solid var(--ink-3)",
  borderRadius: 10,
  padding: "12px 14px",
  fontFamily: fontSans,
  fontSize: 13,
  color: "var(--ink-7)",
  width: "100%",
  outline: "none",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-4)",
  display: "block",
  marginBottom: 7,
  fontFamily: fontSans,
};

const stepLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--brand)",
  marginBottom: 12,
  fontFamily: fontSans,
};

const stepTitleStyle: React.CSSProperties = {
  fontFamily: fontSerif,
  fontSize: 24,
  color: "#ffffff",
  letterSpacing: "-0.02em",
  lineHeight: 1.2,
  marginBottom: 6,
};

const stepSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--ink-5)",
  fontWeight: 300,
  lineHeight: 1.6,
  marginBottom: 28,
  fontFamily: fontSans,
};

const primaryBtn: React.CSSProperties = {
  background: "var(--brand)",
  color: "#ffffff",
  border: "none",
  borderRadius: 10,
  padding: "11px 18px",
  fontFamily: fontSans,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "-0.01em",
};

const skipBtn: React.CSSProperties = {
  fontSize: 12,
  color: "#3A3836",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: fontSans,
};

// ── Step dots ────────────────────────────────────────────────
function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const dot = (idx: 1 | 2 | 3) => {
    const isCurrent = idx === current;
    const isDone = idx < current;
    if (isCurrent) {
      return (
        <span
          key={idx}
          style={{ width: 20, height: 6, borderRadius: 3, background: "var(--brand)", display: "inline-block" }}
        />
      );
    }
    return (
      <span
        key={idx}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isDone ? "var(--success)" : "var(--ink-3)",
          display: "inline-block",
        }}
      />
    );
  };
  return <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{dot(1)}{dot(2)}{dot(3)}</div>;
}

// ── Chip ─────────────────────────────────────────────────────
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "5px 13px",
        borderRadius: 20,
        cursor: "pointer",
        border: selected ? "0.5px solid var(--bronze-line)" : "0.5px solid var(--ink-3)",
        color: selected ? "var(--brand)" : "var(--ink-5)",
        background: selected ? "var(--brand-muted)" : "transparent",
        fontFamily: fontSans,
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
  onOpenFullCapture?: () => void;
}

export default function OnboardingWizardModal({ open, userId, onClose, onOpenFullCapture }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [role, setRole] = useState("");
  const [firm, setFirm] = useState("");
  const [sector, setSector] = useState("");
  const [firmType, setFirmType] = useState("");
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [savingStep1, setSavingStep1] = useState(false);

  // Step 2 state
  const [captureTab, setCaptureTab] = useState<"link" | "text" | "voice">("link");
  const [linkUrl, setLinkUrl] = useState("");
  const [textNote, setTextNote] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureSaved, setCaptureSaved] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  if (!open) return null;

  const togglePillar = (p: string) => {
    setSelectedPillars((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleStep1Save = async () => {
    if (!role.trim()) {
      setRoleError("Please enter your role");
      return;
    }
    setRoleError(null);
    setSavingStep1(true);
    try {
      const payload: any = {
        user_id: userId,
        level: role.trim(),
        firm: firm.trim() || null,
        sector_focus: sector || null,
        core_practice: firmType || null,
        // skill_pillar column on diagnostic_profiles is not present in the schema;
        // we use brand_pillars (array) which exists. Per spec we also keep a
        // joined string in primary_strength for visibility.
        brand_pillars: selectedPillars,
        primary_strength: selectedPillars.join(", ") || null,
      };
      const { error } = await supabase
        .from("diagnostic_profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save profile. Try again.");
    } finally {
      setSavingStep1(false);
    }
  };

  const dismissAndFinish = () => {
    try { localStorage.setItem("aura_onboarding_complete", "true"); } catch {}
    toast.success("Your Aura is ready. First signal detected.", { duration: 4000 });
    onClose();
  };

  const handleCaptureSave = async () => {
    if (captureTab === "voice") {
      // Reuse existing voice capture from the main Capture modal
      onOpenFullCapture?.();
      return;
    }
    const isLink = captureTab === "link";
    const value = isLink ? linkUrl.trim() : textNote.trim();
    if (!value) return;

    setCaptureBusy(true);
    setCaptureSaved(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please log in again.");
        setCaptureBusy(false);
        return;
      }

      const captureType = isLink ? "link" : "note";
      const captureContent = value;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            type: captureType,
            content: captureContent,
            metadata: {},
            ...(isLink && { source_url: value }),
          }),
        }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok && data?.error !== "duplicate_url") {
        throw new Error(data?.error_message || data?.error || `Server error (${resp.status})`);
      }

      // Mirror Capture modal: also insert into entries
      const entryContent = isLink && data?.extracted_content ? data.extracted_content : captureContent;
      const entryTitle = isLink
        ? (data?.extracted_title ||
            (() => { try { return new URL(value).hostname; } catch { return value.slice(0, 60); } })())
        : captureContent.slice(0, 60) || "Untitled";

      const { data: entryRow } = await supabase
        .from("entries")
        .insert({
          user_id: session.user.id,
          type: captureType,
          title: entryTitle,
          content: entryContent,
          summary: entryContent.slice(0, 300),
          ...(isLink && { image_url: data?.original_url || value }),
        })
        .select("id")
        .single();

      // Fire-and-forget signal pipeline
      if (entryRow?.id) {
        supabase.functions
          .invoke("extract-evidence", {
            body: { source_type: "entry", source_id: entryRow.id, user_id: session.user.id },
          })
          .then(({ data: extractResult }) => {
            const registryId = extractResult?.source_registry_id;
            if (!registryId) return;
            return supabase.functions.invoke("detect-signals-v2", {
              body: { source_registry_id: registryId, user_id: session.user.id },
            });
          })
          .catch(() => {});
      }

      setCaptureSaved(true);
      // Brief pause so the user sees the success state, then advance
      setTimeout(() => setStep(3), 700);
    } catch (e: any) {
      toast.error(e?.message || "Capture failed. Try again.");
    } finally {
      setCaptureBusy(false);
    }
  };

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--surface-ink-raised)",
          border: "0.5px solid var(--ink-3)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 560,
          overflow: "hidden",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 3, background: "var(--ink-3)", flexShrink: 0 }}>
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "var(--brand)",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        <div style={{ padding: 36, overflowY: "auto", fontFamily: fontSans }}>
          {step === 1 && (
            <>
              <div style={stepLabelStyle}>Step 1 of 3 — Your identity</div>
              <h2 style={stepTitleStyle}>Tell Aura who you are</h2>
              <p style={stepSubStyle}>
                This calibrates every signal, every post, every strategic recommendation. The more
                specific, the sharper your intelligence.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Role</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Director of Digital Transformation"
                    value={role}
                    onChange={(e) => { setRole(e.target.value); if (roleError) setRoleError(null); }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Firm</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. EY"
                    value={firm}
                    onChange={(e) => setFirm(e.target.value)}
                  />
                </div>
              </div>
              {roleError && (
                <div style={{ color: "var(--danger)", fontSize: 11, marginTop: -8, marginBottom: 10 }}>
                  {roleError}
                </div>
              )}

              <label style={labelStyle}>Sector</label>
              <select
                style={{ ...inputStyle, appearance: "none" }}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                <option value="">Select your sector</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              <label style={labelStyle}>Firm type</label>
              <select
                style={{ ...inputStyle, appearance: "none" }}
                value={firmType}
                onChange={(e) => setFirmType(e.target.value)}
              >
                <option value="">Select firm type</option>
                {FIRM_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              <label style={labelStyle}>Your expertise pillars (pick 3–5)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                {PILLARS.map((p) => (
                  <Chip key={p} label={p} selected={selectedPillars.includes(p)} onClick={() => togglePillar(p)} />
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <StepDots current={1} />
                <button
                  type="button"
                  style={{ ...primaryBtn, opacity: savingStep1 ? 0.6 : 1 }}
                  disabled={savingStep1}
                  onClick={handleStep1Save}
                >
                  {savingStep1 ? "Saving…" : "Save & continue →"}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={stepLabelStyle}>Step 2 of 3 — Feed Aura</div>
              <h2 style={stepTitleStyle}>Make your first capture</h2>
              <p style={stepSubStyle}>
                Paste an article or report you've read this week. Aura will detect your first
                strategic signal within 60 seconds.
              </p>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                {(["link", "text", "voice"] as const).map((t) => {
                  const active = captureTab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCaptureTab(t)}
                      style={{
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        padding: "7px 16px",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: active ? "0.5px solid #ffffff" : "0.5px solid var(--ink-3)",
                        color: active ? "var(--ink)" : "var(--ink-5)",
                        background: active ? "#ffffff" : "transparent",
                        fontFamily: fontSans,
                        textTransform: "capitalize",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {captureTab === "link" && (
                <div>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={linkInputRef}
                      style={{ ...inputStyle, paddingRight: 78 }}
                      placeholder="https://…"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const t = await navigator.clipboard.readText();
                          if (t) setLinkUrl(t.trim());
                        } catch {}
                      }}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        background: "transparent",
                        color: "var(--brand)",
                        border: "0.5px solid var(--bronze-line)",
                        borderRadius: 7,
                        cursor: "pointer",
                        fontFamily: fontSans,
                      }}
                    >
                      Paste
                    </button>
                  </div>
                </div>
              )}

              {captureTab === "text" && (
                <textarea
                  style={{ ...inputStyle, height: 90, resize: "none" }}
                  placeholder="What did you observe, learn, or read? Describe it in your own words..."
                  value={textNote}
                  onChange={(e) => setTextNote(e.target.value)}
                />
              )}

              {captureTab === "voice" && (
                <div
                  style={{
                    background: "var(--ink)",
                    border: "0.5px solid var(--ink-3)",
                    borderRadius: 10,
                    padding: 16,
                    color: "var(--ink-5)",
                    fontSize: 12,
                    fontFamily: fontSans,
                    marginBottom: 14,
                  }}
                >
                  Voice capture lives in the full Capture screen.{" "}
                  <button
                    type="button"
                    onClick={() => onOpenFullCapture?.()}
                    style={{ color: "var(--brand)", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: fontSans, fontSize: 12 }}
                  >
                    Open voice recorder →
                  </button>
                </div>
              )}

              {/* Status */}
              {captureBusy && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: "50%", background: "var(--brand)",
                      animation: "aura-pulse 1.2s ease-in-out infinite",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-5)", fontFamily: fontSans }}>
                    Aura is detecting signals...
                  </span>
                </div>
              )}
              {captureSaved && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: "var(--success)", fontSize: 12, fontFamily: fontSans }}>
                  <span>✓</span>
                  Capture saved. Signal detection running in the background.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <StepDots current={2} />
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button type="button" style={skipBtn} onClick={() => setStep(3)}>
                    Skip for now
                  </button>
                  <button
                    type="button"
                    style={{ ...primaryBtn, opacity: captureBusy ? 0.6 : 1 }}
                    disabled={captureBusy}
                    onClick={handleCaptureSave}
                  >
                    {captureBusy ? "Saving…" : "Save capture →"}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={stepLabelStyle}>Step 3 of 3 — Supercharge Aura</div>
              <h2 style={stepTitleStyle}>Install the Chrome extension</h2>
              <p style={stepSubStyle}>
                Capture any article, report, or LinkedIn post in one click — without leaving the
                page. This is how Aura becomes effortless.
              </p>

              <div
                style={{
                  background: "var(--ink)",
                  border: "0.5px solid var(--ink-3)",
                  borderRadius: 14,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  {/* Chrome logo */}
                  <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">
                    <circle cx="24" cy="24" r="22" fill="#fff" />
                    <circle cx="24" cy="24" r="8" fill="#4285F4" />
                    <circle cx="24" cy="24" r="6" fill="#fff" />
                    <path d="M24 4 A20 20 0 0 1 41.32 14 L24 14 Z" fill="#EA4335" />
                    <path d="M41.32 14 A20 20 0 0 1 32.66 41.32 L24 24 Z" fill="#FBBC05" />
                    <path d="M32.66 41.32 A20 20 0 0 1 6.68 14 L24 24 Z" fill="#34A853" />
                    <circle cx="24" cy="24" r="5" fill="#4285F4" />
                  </svg>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-7)", fontFamily: fontSans }}>
                      Aura Chrome Extension
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-5)", fontFamily: fontSans, marginTop: 2 }}>
                      One-click capture from any webpage
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  style={{ ...primaryBtn, width: "100%", padding: 12 }}
                  onClick={() => window.open("https://chrome.google.com/webstore", "_blank", "noopener,noreferrer")}
                >
                  Add to Chrome — free
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {[
                  "Click the button above → Chrome Web Store opens",
                  "Click Add to Chrome → extension installs in seconds",
                  "Visit any article, click the Aura icon → captured instantly",
                ].map((txt, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "var(--brand-muted)", color: "var(--brand)",
                        fontSize: 11, fontWeight: 700, display: "inline-flex",
                        alignItems: "center", justifyContent: "center",
                        fontFamily: fontSans,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-5)", fontFamily: fontSans }}>{txt}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <StepDots current={3} />
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button type="button" style={skipBtn} onClick={dismissAndFinish}>
                    Skip — go to dashboard
                  </button>
                  <button type="button" style={primaryBtn} onClick={dismissAndFinish}>
                    Done — go to Aura →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes aura-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}