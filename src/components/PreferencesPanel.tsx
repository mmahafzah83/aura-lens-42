import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";
import { toast } from "sonner";
import type { EditProfileField } from "@/components/EditProfileModal";
import { useIsAdmin } from "@/lib/isAdmin";
import { useLanguage } from "@/contexts/LanguageContext";
import { ltrIsolate } from "@/i18n";

interface PreferencesPanelProps {
  open: boolean;
  onClose: () => void;
  /** "panel" (default) = slide-over dialog. "inline" = embedded as a Settings tab. */
  variant?: "panel" | "inline";
  userId?: string | null;
  fullName?: string | null;
  email?: string;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
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
  level: string | null;
  notification_prefs: Record<string, unknown> | null;
  shared_learning_consent: boolean | null;
  timezone: string | null;
  content_language: string | null;
}

const FALLBACK_TIMEZONES = [
  "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait",
  "Asia/Muscat", "Asia/Amman", "Asia/Beirut", "Africa/Cairo",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles",
];

const TIMEZONES: string[] = (() => {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = typeof supported === "function" ? supported("timeZone") : null;
    if (list && list.length) return list;
  } catch { /* fall through */ }
  return FALLBACK_TIMEZONES;
})();

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-2)",
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
  <>
  <style>{`.aura-row:hover .aura-chevron{color:var(--brand)}`}</style>
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="aura-row w-full text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--act)] focus-visible:ring-offset-1 rounded-md"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 24px",
      background: "transparent",
      border: "none",
      borderTop: "0.5px solid var(--rule)",
      cursor: onClick ? "pointer" : "default",
      color: danger ? "var(--error, #c0392b)" : "var(--ink)",
      fontFamily: "var(--font-body)",
    }}
    onMouseEnter={(e) => {
      if (onClick) (e.currentTarget as HTMLElement).style.background = "var(--paper-2)";
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
            color: "var(--ink-2)",
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
      <ChevronRight className="aura-chevron w-4 h-4 transition-colors rtl:-scale-x-100" style={{ color: "var(--ink-3)", flexShrink: 0 }} />
    )}
  </button>
  </>
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
      background: on ? "var(--brand)" : "var(--rule)",
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
        insetInlineStart: on ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        transition: "inset-inline-start 160ms ease",
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
      borderTop: "0.5px solid var(--rule)",
      fontFamily: "var(--font-body)",
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>
        {description}
      </div>
    </div>
    <Toggle on={on} onChange={onChange} label={label} />
  </div>
);

export default function PreferencesPanel({
  open,
  onClose,
  variant = "panel",
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
  const { isAdmin } = useIsAdmin();
  const { lang, setLang, t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunityEmailOn, setOpportunityEmailOn] = useState(false);

  // Body scroll lock + Esc to close.
  useEffect(() => {
    if (!open || variant === "inline") return;
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
  }, [open, onClose, variant]);

  // Load profile when opening.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("diagnostic_profiles" as any) as any)
        .select("first_name, last_name, firm, sector_focus, level, notification_prefs, shared_learning_consent, timezone, content_language")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) {
        setProfile((data as Profile) || null);
      }
      const { data: matching } = await (supabase.from("oe_consents" as any) as any)
        .select("id").eq("user_id", userId).eq("kind", "matching").is("revoked_at", null).limit(1);
      if (!cancelled) setOpportunityEmailOn((matching?.length ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const weeklyBriefOn = prefs.email_weekly_brief !== false; // default true
  const dailyNudgesOn = prefs.daily_nudges !== false; // default true
  const overnightReadingOn = prefs.overnight_reading_enabled !== false; // default true
  const sharedLearningOn = profile?.shared_learning_consent === true;

  /**
   * A SWITCH THAT DID NOT SAVE MUST NOT LOOK SAVED.
   *
   * The toggle moves first because that is what makes it feel instant, but an
   * optimistic move is a promise. If the write fails the switch goes back to
   * where it was and we say so — a member who returns tomorrow to a setting
   * they believed they had changed is worse served than one told plainly.
   */
  const updatePref = async (key: string, value: boolean) => {
    if (!userId) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setProfile((p) => (p ? { ...p, notification_prefs: next } : p));
    try {
      const ok = await writeProfile(userId, { notification_prefs: next }, "PreferencesPanel.updatePref");
      if (!ok) throw new Error("write affected no rows");
    } catch {
      setProfile((p) => (p ? { ...p, notification_prefs: previous } : p));
      toast.error(t("settings.error.didntSave"));
    }
  };

  /** Same contract as updatePref, for settings that live under more than one key. */
  const updatePrefs = async (patch: Record<string, boolean>) => {
    if (!userId) return;
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setProfile((p) => (p ? { ...p, notification_prefs: next } : p));
    try {
      const ok = await writeProfile(userId, { notification_prefs: next }, "PreferencesPanel.updatePrefs");
      if (!ok) throw new Error("write affected no rows");
    } catch {
      setProfile((p) => (p ? { ...p, notification_prefs: previous } : p));
      toast.error(t("settings.error.didntSave"));
    }
  };

  /** Top-level column write; same optimistic + rollback contract as updatePref. */
  const persistTimezone = async (tz: string) => {
    if (!userId) return;
    const previousTz = profile?.timezone ?? null;
    setProfile((p) => (p ? { ...p, timezone: tz } : p));
    try {
      const ok = await writeProfile(userId, { timezone: tz }, "PreferencesPanel.persistTimezone");
      if (!ok) throw new Error("write affected no rows");
    } catch {
      setProfile((p) => (p ? { ...p, timezone: previousTz } : p));
      toast.error(t("settings.error.didntSave"));
    }
  };

  /** The language Aura writes in. Same column the composer seeds from, so it can
      be set here without opening the composer. Same optimistic + rollback contract. */
  const persistLanguage = async (next: "en" | "ar") => {
    if (!userId) return;
    const previous = profile?.content_language ?? null;
    setProfile((p) => (p ? { ...p, content_language: next } : p));
    try {
      const ok = await writeProfile(userId, { content_language: next }, "PreferencesPanel.persistLanguage");
      if (!ok) throw new Error("write affected no rows");
    } catch {
      setProfile((p) => (p ? { ...p, content_language: previous } : p));
      toast.error(t("settings.error.didntSave"));
    }
  };

  const updateSharedLearning = async (value: boolean) => {
    if (!userId) return;
    const previous = profile?.shared_learning_consent ?? null;
    setProfile((p) => (p ? { ...p, shared_learning_consent: value } : p));
    try {
      const ok = await writeProfile(userId, { shared_learning_consent: value }, "PreferencesPanel.updateSharedLearning");
      if (!ok) throw new Error("write affected no rows");
    } catch {
      setProfile((p) => (p ? { ...p, shared_learning_consent: previous } : p));
      toast.error(t("settings.error.didntSave"));
    }
  };

  const updateOpportunityEmail = async (value: boolean) => {
    if (!userId) return;
    const previous = opportunityEmailOn;
    setOpportunityEmailOn(value);
    try {
      if (!value) {
        const { error } = await (supabase.from("oe_consents" as any) as any).update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId).eq("kind", "matching").is("revoked_at", null);
        if (error) throw error;
      } else {
        const { data: latest } = await (supabase.from("oe_consents" as any) as any).select("id,version")
          .eq("user_id", userId).eq("kind", "matching").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latest) {
          const { error } = await (supabase.from("oe_consents" as any) as any).update({ revoked_at: null, granted_at: new Date().toISOString() }).eq("id", latest.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from("oe_consents" as any) as any).insert({ user_id: userId, kind: "matching", version: "1.0" });
          if (error) throw error;
        }
      }
    } catch {
      setOpportunityEmailOn(previous);
      toast.error(t("settings.error.didntSave"));
    }
  };

  const displayName = useMemo(() => {
    const fn = (profile?.first_name || "").trim();
    const ln = (profile?.last_name || "").trim();
    const joined = [fn, ln].filter(Boolean).join(" ");
    return joined || (fullName?.trim() ?? "") || t("settings.preferences.notSet");
  }, [profile, fullName, t]);

  if (!open) return null;

  const uiSwitch = (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "0.5px solid var(--rule)", fontFamily: "var(--font-body)" }}
    >
      <div role="group" aria-label={`${t("lang.en")} / ${t("lang.ar")}`} style={{ display: "inline-flex", border: "0.5px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
        {(["en", "ar"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            lang={l}
            style={{ minHeight: 44, padding: "8px 14px", fontSize: 13, fontFamily: l === "ar" ? "'Cairo', var(--font-body)" : "var(--font-body)", background: lang === l ? "var(--paper-2)" : "transparent", color: "var(--ink)", fontWeight: lang === l ? 600 : 400, cursor: "pointer", border: 0 }}
          >
            {t(`lang.${l}`)}
          </button>
        ))}
      </div>
    </div>
  );

  const sections = (
    <>
      {/* YOUR PROFILE */}
      <SectionHeader>{t("settings.preferences.yourProfile")}</SectionHeader>
      <Row label={t("settings.preferences.name")} value={displayName} onClick={onEditField ? () => onEditField("first_name") : undefined} />
      <Row label={t("settings.preferences.title")} value={profile?.level?.trim() || t("settings.preferences.notSet")} onClick={onEditField ? () => onEditField("level") : undefined} />
      <Row label={t("settings.preferences.firm")} value={profile?.firm?.trim() || t("settings.preferences.notSet")} onClick={onEditField ? () => onEditField("firm") : undefined} />
      <Row label={t("settings.preferences.sector")} value={profile?.sector_focus?.trim() || t("settings.preferences.notSet")} onClick={onEditField ? () => onEditField("sector_focus") : undefined} />

      {/* INTELLIGENCE */}
      <SectionHeader>{t("settings.preferences.intelligence")}</SectionHeader>
      <ToggleRow
        label={t("settings.preferences.weeklyBrief")}
        description={t("settings.preferences.weeklyBriefDesc")}
        on={weeklyBriefOn}
        onChange={(v) => updatePrefs({ email_weekly_brief: v, weekly_brief: v })}
      />
      <ToggleRow
        label={t("settings.preferences.dailyNudges")}
        description={t("settings.preferences.dailyNudgesDesc")}
        on={dailyNudgesOn}
        onChange={(v) => updatePref("daily_nudges", v)}
      />
      <ToggleRow
        label={t("settings.preferences.overnight")}
        description={t("settings.preferences.overnightDesc")}
        on={overnightReadingOn}
        onChange={(v) => updatePref("overnight_reading_enabled", v)}
      />
      <ToggleRow
        label={t("settings.preferences.opportunityEmail")}
        description={t("settings.preferences.opportunityEmailDesc")}
        on={opportunityEmailOn}
        onChange={updateOpportunityEmail}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 24px",
          borderTop: "0.5px solid var(--rule)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>{t("settings.preferences.timezone")}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>
            {t("settings.preferences.timezoneDesc")}
          </div>
        </div>
        <select
          aria-label={t("settings.preferences.timezone")}
          value={profile?.timezone || "Asia/Riyadh"}
          onChange={(e) => persistTimezone(e.target.value)}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--ink)",
            background: "var(--paper-2)",
            border: "0.5px solid var(--rule)",
            borderRadius: 8,
            padding: "8px 10px",
            minHeight: 44,
            maxWidth: 220,
            cursor: "pointer",
          }}
          className="focus-visible:ring-2 focus-visible:ring-[var(--act)]"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Writing language — the composer reads this same column at boot. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 24px",
          borderTop: "0.5px solid var(--rule)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>{t("settings.preferences.writingLanguage")}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>
            {t("settings.preferences.writingLanguageDesc")}
          </div>
        </div>
        <select
          aria-label={t("settings.preferences.writingLanguage")}
          value={profile?.content_language === "ar" ? "ar" : "en"}
          onChange={(e) => persistLanguage(e.target.value === "ar" ? "ar" : "en")}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--ink)",
            background: "var(--paper-2)",
            border: "0.5px solid var(--rule)",
            borderRadius: 8,
            padding: "8px 10px",
            minHeight: 44,
            maxWidth: 220,
            cursor: "pointer",
          }}
          className="focus-visible:ring-2 focus-visible:ring-[var(--act)]"
        >
          <option value="en">{t("settings.preferences.english")}</option>
          <option value="ar">العربية</option>
        </select>
      </div>

      {uiSwitch}

      {/* PRIVACY */}
      <SectionHeader>{t("settings.preferences.privacy")}</SectionHeader>
      <ToggleRow
        label={t("settings.preferences.sharedLearning")}
        description={t("settings.preferences.sharedLearningDesc")}
        on={sharedLearningOn}
        onChange={updateSharedLearning}
      />

      {/* ACCOUNT */}
      {(onChangePassword || onRetakeBrandAssessment || onSignOut) && (
        <SectionHeader>{t("settings.preferences.account")}</SectionHeader>
      )}
      {onChangePassword && <Row label={t("settings.preferences.changePassword")} onClick={onChangePassword} />}
      {onRetakeBrandAssessment && <Row label={t("settings.preferences.retake")} onClick={onRetakeBrandAssessment} />}
      {onSignOut && <Row label={t("settings.preferences.signOut")} onClick={onSignOut} chevron={false} danger />}

      {email && (
        <div style={{ padding: "20px 24px 28px", fontSize: 11, color: "var(--ink-2)", textAlign: "center", fontFamily: "var(--font-body)" }}>
          {t("settings.preferences.signedInAs", { email: ltrIsolate(email) })}
        </div>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div
        style={{
          background: "var(--paper)",
          color: "var(--ink)",
          border: "0.5px solid var(--rule)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {sections}
      </div>
    );
  }

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.preferences.panelTitle")}
      style={{ position: "fixed", inset: 0, zIndex: 1000 }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="bg-black/20"
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
          insetInlineEnd: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "var(--paper)",
          borderInlineStart: "0.5px solid var(--rule)",
          boxShadow: document.documentElement.dir === "rtl" ? "12px 0 40px -10px rgba(0,0,0,0.25)" : "-12px 0 40px -10px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          animation: (document.documentElement.dir === "rtl" ? "aura-pref-slide-in-rtl" : "aura-pref-slide-in") + " 240ms cubic-bezier(0.16, 1, 0.3, 1)",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <style>{`
          @keyframes aura-pref-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes aura-pref-slide-in-rtl {
            from { transform: translateX(-100%); }
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
            borderBottom: "0.5px solid var(--rule)",
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
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 500,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {t("settings.preferences.panelTitle")}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                margin: "4px 0 0",
                fontFamily: "var(--font-body)",
              }}
            >
              {t("settings.preferences.panelSub")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("settings.preferences.close")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              color: "var(--ink-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="hover:bg-[var(--paper-2)]"
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
          {sections}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
