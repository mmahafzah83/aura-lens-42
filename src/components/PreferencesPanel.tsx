import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { EditProfileField } from "@/components/EditProfileModal";

interface PreferencesPanelProps {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  fullName?: string | null;
  email?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
  onEditField?: (field: EditProfileField) => void;
  onChangePassword?: () => void;
  onRetakeBrandAssessment?: () => void;
}

interface Profile {
  first_name: string | null;
  last_name: string | null;
  firm: string | null;
  sector_focus: string | null;
  linkedin_handle: string | null;
  notification_prefs: Record<string, unknown> | null;
}

function normalizeLinkedInHandle(input: string): string {
  let s = (input || "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.replace(/^linkedin\.com\/in\//i, "");
  s = s.replace(/^in\//i, "");
  s = s.replace(/\/+$/g, "");
  s = s.replace(/^@/, "");
  // take first path segment in case of query/extra
  s = s.split(/[/?#]/)[0];
  return s;
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--brand)",
      fontWeight: 600,
      padding: "20px 24px 10px",
    }}
  >
    {children}
  </div>
);

const Row = ({
  label,
  value,
  onClick,
  chevron = true,
  danger = false,
  children,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="w-full text-left transition-colors"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 24px",
      background: "transparent",
      border: "none",
      borderTop: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.06)))",
      cursor: onClick ? "pointer" : "default",
      color: danger ? "var(--danger, #c0392b)" : "var(--foreground)",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}
    onMouseEnter={(e) => {
      if (onClick) (e.currentTarget as HTMLElement).style.background =
        "var(--color-background-secondary, var(--brand-ghost, rgba(0,0,0,0.04)))";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLElement).style.background = "transparent";
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
      {value !== undefined && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--muted-foreground)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      )}
      {children}
    </div>
    {chevron && onClick && !danger && (
      <ChevronRight className="w-4 h-4" style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
    )}
  </button>
);

const Toggle = ({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!on);
    }}
    style={{
      width: 44,
      height: 24,
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      background: on ? "var(--brand)" : "var(--color-border-secondary, rgba(120,120,120,0.35))",
      position: "relative",
      transition: "background 160ms ease",
      flexShrink: 0,
      padding: 0,
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 2,
        left: on ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        transition: "left 160ms ease",
      }}
    />
  </button>
);

const ToggleRow = ({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "14px 24px",
      borderTop: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.06)))",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)", lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.45 }}>
        {description}
      </div>
    </div>
    <Toggle on={on} onChange={onChange} label={label} />
  </div>
);

export default function PreferencesPanel({
  open,
  onClose,
  userId,
  fullName,
  email,
  theme,
  onToggleTheme,
  onSignOut,
  onEditField,
  onChangePassword,
  onRetakeBrandAssessment,
}: PreferencesPanelProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingLinkedIn, setEditingLinkedIn] = useState(false);
  const [linkedInInput, setLinkedInInput] = useState("");
  const liInputRef = useRef<HTMLInputElement>(null);

  // Body scroll lock + Esc to close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Load profile when opening.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("diagnostic_profiles" as any) as any)
        .select("first_name, last_name, firm, sector_focus, linkedin_handle, notification_prefs")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) {
        setProfile((data as Profile) || null);
        setLinkedInInput((data as Profile)?.linkedin_handle ?? "");
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  useEffect(() => {
    if (editingLinkedIn) {
      // Defer focus to next frame so the input is in the DOM.
      requestAnimationFrame(() => liInputRef.current?.focus());
    }
  }, [editingLinkedIn]);

  const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const weeklyBriefOn = prefs.weekly_brief !== false; // default true
  const dailyNudgesOn = prefs.daily_nudges !== false; // default true

  const updatePref = async (key: string, value: boolean) => {
    if (!userId) return;
    const next = { ...prefs, [key]: value };
    setProfile((p) => (p ? { ...p, notification_prefs: next } : p));
    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ notification_prefs: next })
      .eq("user_id", userId);
  };

  const saveLinkedIn = async () => {
    const handle = normalizeLinkedInHandle(linkedInInput);
    setEditingLinkedIn(false);
    if (!userId) return;
    if (handle === (profile?.linkedin_handle ?? "")) return;
    setProfile((p) => (p ? { ...p, linkedin_handle: handle } : p));
    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ linkedin_handle: handle || null })
      .eq("user_id", userId);
  };

  const displayName = useMemo(() => {
    const fn = (profile?.first_name || "").trim();
    const ln = (profile?.last_name || "").trim();
    const joined = [fn, ln].filter(Boolean).join(" ");
    return joined || (fullName?.trim() ?? "") || "Not set";
  }, [profile, fullName]);

  if (!open) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
      style={{ position: "fixed", inset: 0, zIndex: 1000 }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={theme === "dark" ? "bg-black/40" : "bg-black/20"}
        style={{
          position: "absolute",
          inset: 0,
          transition: "opacity 200ms ease",
          animation: "aura-pref-fade-in 180ms ease",
          touchAction: "none",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "var(--color-background-primary, var(--paper, #fff))",
          borderLeft: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.08)))",
          boxShadow: "-12px 0 40px -10px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          animation: "aura-pref-slide-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <style>{`
          @keyframes aura-pref-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes aura-pref-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "22px 24px 18px",
            borderBottom: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.08)))",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 20,
                fontWeight: 500,
                color: "var(--foreground)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Preferences
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--muted-foreground)",
                margin: "4px 0 0",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              How Aura works for you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preferences"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              color: "var(--muted-foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="hover:bg-[var(--color-background-secondary,var(--brand-ghost,rgba(0,0,0,0.04)))]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {/* YOUR PROFILE */}
          <SectionHeader>Your profile</SectionHeader>
          <Row label="Name" value={displayName} onClick={onEditField ? () => onEditField("first_name") : undefined} />
          <Row
            label="Firm"
            value={profile?.firm?.trim() || "Not set"}
            onClick={onEditField ? () => onEditField("firm") : undefined}
          />
          <Row
            label="Sector"
            value={profile?.sector_focus?.trim() || "Not set"}
            onClick={onEditField ? () => onEditField("sector_focus") : undefined}
          />
          {editingLinkedIn ? (
            <div
              style={{
                padding: "14px 24px",
                borderTop: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.06)))",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  marginBottom: 8,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                LinkedIn
              </div>
              <input
                ref={liInputRef}
                value={linkedInInput}
                onChange={(e) => setLinkedInInput(e.target.value)}
                onBlur={saveLinkedIn}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLinkedIn();
                  if (e.key === "Escape") {
                    setLinkedInInput(profile?.linkedin_handle ?? "");
                    setEditingLinkedIn(false);
                  }
                }}
                placeholder="Paste your LinkedIn profile URL"
                style={{
                  width: "100%",
                  background: "var(--color-background-secondary, var(--brand-ghost, rgba(0,0,0,0.04)))",
                  border: "0.5px solid var(--color-border-secondary, var(--brand-line, rgba(0,0,0,0.12)))",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "var(--foreground)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  outline: "none",
                }}
              />
            </div>
          ) : (
            <Row
              label="LinkedIn"
              value={profile?.linkedin_handle ? `@${profile.linkedin_handle}` : "Not set"}
              onClick={() => {
                setLinkedInInput(profile?.linkedin_handle ?? "");
                setEditingLinkedIn(true);
              }}
            />
          )}

          {/* INTELLIGENCE */}
          <SectionHeader>Intelligence</SectionHeader>
          <ToggleRow
            label="Monday intelligence brief"
            description="Signals, rhythm, and one recommended move. Every Monday."
            on={weeklyBriefOn}
            onChange={(v) => updatePref("weekly_brief", v)}
          />
          <ToggleRow
            label="Daily nudges"
            description="In-app reminders when signals need attention or content is due."
            on={dailyNudgesOn}
            onChange={(v) => updatePref("daily_nudges", v)}
          />

          {/* APPEARANCE */}
          <SectionHeader>Appearance</SectionHeader>
          <div
            style={{
              padding: "14px 24px",
              borderTop: "0.5px solid var(--color-border-tertiary, var(--brand-line, rgba(0,0,0,0.06)))",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--foreground)",
                marginBottom: 10,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              Theme
            </div>
            <div
              role="group"
              aria-label="Theme"
              style={{
                display: "flex",
                width: "100%",
                padding: 3,
                borderRadius: 10,
                background: "var(--color-background-secondary, var(--brand-ghost, rgba(0,0,0,0.04)))",
                border: "0.5px solid var(--color-border-secondary, var(--brand-line, rgba(0,0,0,0.08)))",
              }}
            >
              {(["light", "dark"] as const).map((mode) => {
                const active = theme === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { if (mode !== theme) onToggleTheme(); }}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      minHeight: 34,
                      padding: "6px 10px",
                      fontSize: 13,
                      fontWeight: 500,
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: active ? "var(--brand)" : "transparent",
                      color: active ? "#fff" : "var(--color-text-secondary, var(--muted-foreground))",
                      transition: "background 150ms ease, color 150ms ease",
                      textTransform: "capitalize",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACCOUNT */}
          <SectionHeader>Account</SectionHeader>
          {onChangePassword && (
            <Row label="Change password" onClick={onChangePassword} />
          )}
          {onRetakeBrandAssessment && (
            <Row label="Retake brand assessment" onClick={onRetakeBrandAssessment} />
          )}
          <Row label="Sign out" onClick={onSignOut} chevron={false} danger />

          {email && (
            <div
              style={{
                padding: "20px 24px 28px",
                fontSize: 11,
                color: "var(--muted-foreground)",
                textAlign: "center",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              Signed in as {email}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
