import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Settings as SettingsIcon, User, Link2, Settings2, Presentation, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { signOutAndLand } from "@/lib/signOut";
import { supabase } from "@/integrations/supabase/client";
import { writeProfile } from "@/lib/profileWrite";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AuraCard } from "@/components/ui/AuraCard";
import LinkedInAddressCard from "@/components/settings/LinkedInAddressCard";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { exportReportPdf } from "@/lib/exportReportPdf";
import usePageMeta from "@/hooks/usePageMeta";
import ReportDocument from "@/components/ReportDocument";
import { useReportSnapshot } from "@/hooks/useReportSnapshot";
import CountryPicker from "@/components/CountryPicker";
import PreferencesPanel from "@/components/PreferencesPanel";
import EditProfileModal, { type EditProfileField } from "@/components/EditProfileModal";
import AccountPanel from "@/components/settings/AccountPanel";
import CvUploadControl from "@/components/cv/CvUploadControl";
import SlideDefaultsCard from "@/components/settings/SlideDefaultsCard";
import WhatsAppPairingCard from "@/components/settings/WhatsAppPairingCard";
import { WHATSAPP_PAIRING_ADMIN_ONLY } from "@/config/whatsapp";
import { useIsAdmin } from "@/lib/isAdmin";
import { useTranslation, Trans } from "react-i18next";
import { dateLocale, ltrIsolate } from "@/i18n";
import { useLanguage } from "@/contexts/LanguageContext";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  firm: string | null;
  core_practice: string | null;
  sector_focus: string | null;
  north_star_goal: string | null;
  // LinkedIn address is read from linkedin_connections, not from this record.
  years_experience: string | null;
  leadership_style: string | null;
  primary_strength: string | null;
  avatar_url: string | null;
  brand_assessment_completed_at: string | null;
  brand_pillars: string[];
  identity_intelligence: Record<string, unknown>;
  brand_assessment_results: Record<string, unknown>;
  skill_ratings: Record<string, unknown>;
  generated_skills: Record<string, unknown>;
  audit_results: Record<string, unknown>;
  
  country: string | null;
  country_code: string | null;
}

import { loadLinkedInState, EMPTY_LINKEDIN_STATE, type LinkedInState } from "@/lib/linkedinState";
import { statusFromLinkedInState, mayPromptReconnect } from "@/lib/linkedinStatus";

/* One list, two renderings (rail on desktop, chips on mobile). */
const NAV_ITEMS = [
  { key: "profile", labelKey: "settings.nav.profile", Icon: User },
  { key: "connections", labelKey: "settings.nav.connections", Icon: Link2 },
  { key: "preferences", labelKey: "settings.nav.preferences", Icon: Settings2 },
  { key: "slides", labelKey: "settings.nav.slides", Icon: Presentation },
  { key: "privacy", labelKey: "settings.nav.privacy", Icon: ShieldCheck },
  { key: "danger", labelKey: "settings.nav.danger", Icon: AlertTriangle },
] as const;

export default function Settings() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  usePageMeta({
    title: t("settings.meta.title"),
    description: t("settings.meta.description"),
    path: "/settings",
  });

  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSection = searchParams.get("section");
  const SECTIONS = ["profile", "connections", "preferences", "slides", "privacy", "danger"] as const;
  type SectionKey = typeof SECTIONS[number];
  const section: SectionKey = (SECTIONS as readonly string[]).includes(rawSection || "")
    ? (rawSection as SectionKey)
    : "profile";
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const { isAdmin } = useIsAdmin();
  /** Which profile field the member asked to edit. Null means the modal is shut. */
  const [editField, setEditField] = useState<EditProfileField | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!cancelled && u) setAuthUser({ id: u.id, email: u.email ?? undefined });
    });
    return () => { cancelled = true; };
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);
const {
  report,
  version: reportVersion,
  snapshotAt: reportSnapshotAt,
  loading: reportLoading,
} = useReportSnapshot();
/* One reader for the LinkedIn facts — the page used to answer this three
   different ways and contradict itself between cards. */
const [liState, setLiState] = useState<LinkedInState>(EMPTY_LINKEDIN_STATE);
/* The one status rule. Sync age is a nudge to re-read, never a reconnect. */
const liStatus = statusFromLinkedInState(liState);

const [linkedInBusy, setLinkedInBusy] = useState(true);
/* Signatures and the publication nameplate were removed from Settings.
   Renderers keep working off the default nameplate fallback. */

const [dangerOpen, setDangerOpen] = useState(false);
const [deleteConfirmText, setDeleteConfirmText] = useState("");
const [deleting, setDeleting] = useState(false);

const handleDeleteAccount = async () => {
  if (deleteConfirmText !== "DELETE") return;
  setDeleting(true);
  try {
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error || (data && (data as any).error)) {
      throw new Error((data as any)?.error || error?.message || t("settings.error.deleteFailed"));
    }
    await signOutAndLand(navigate);
  } catch (e: any) {
    console.error("[delete-account] failed", e);
    toast.error(e?.message || t("settings.error.deleteAccount"));
    setDeleting(false);
  }
};

  /**
   * ONE READ, CALLABLE TWICE.
   *
   * The read-only summary below is the same data the edit modal writes, so
   * saving has to be able to re-run this. It was an anonymous effect body;
   * it is now a named load the modal can call on save, which is why a change
   * made in the modal shows up in the summary without a page reload.
   */
  const loadProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setLoading(false);
        setError(t("settings.error.notSignedInDot"));
        return;
      }
      const { data, error: qErr } = await supabase
        .from("diagnostic_profiles")
        .select(
          "first_name, last_name, level, firm, core_practice, sector_focus, north_star_goal, years_experience, leadership_style, primary_strength, avatar_url, brand_assessment_completed_at, brand_pillars, identity_intelligence, brand_assessment_results, skill_ratings, generated_skills, audit_results, country, country_code"
        )
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (qErr) throw qErr;
      setProfile((data as unknown as ProfileData) || null);

    } catch (e: any) {
      setError(e?.message || t("settings.error.loadProfile"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const loadLinkedInStatus = useCallback(async () => {
    if (!authUser?.id) return;
    setLinkedInBusy(true);
    try {
      setLiState(await loadLinkedInState(authUser.id));
    } catch (e) {
      console.error("[Settings] LinkedIn status error", e);
    } finally {
      setLinkedInBusy(false);
    }
  }, [authUser?.id]);

  const handleConnectLinkedIn = async () => {
    setLinkedInBusy(true);
    try {
      const { data } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin: window.location.origin },
      });
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error("[Settings] LinkedIn connect error", e);
    } finally {
      setLinkedInBusy(false);
    }
  };

  const handleDisconnectLinkedIn = async () => {
    setLinkedInBusy(true);
    try {
      await supabase.functions.invoke("linkedin-oauth", { body: { action: "disconnect" } });
      await loadLinkedInStatus();
    } catch (e) {
      console.error("[Settings] LinkedIn disconnect error", e);
    } finally {
      setLinkedInBusy(false);
    }
  };




  const [savingCountry, setSavingCountry] = useState(false);
  const persistCountry = async (name: string | null, code: string | null) => {
    setSavingCountry(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error(t("settings.error.notSignedIn"));
      const ok = await writeProfile(session.user.id, { country: name, country_code: code }, "Settings.persistCountry");
      if (!ok) throw new Error(t("settings.error.didntSave"));
      setProfile((p) => (p ? { ...p, country: name, country_code: code } : p));
      toast.success(t("settings.toast.countrySaved"));
    } catch (e: any) {
      toast.error(e?.message || t("settings.error.countrySave"));
    } finally {
      setSavingCountry(false);
    }
  };

  /* Old links used ?tab=. Map them once so bookmarks still land. */
  useEffect(() => {
    const legacy = searchParams.get("tab");
    if (!legacy || searchParams.get("section")) return;
    if (legacy === "preferences" || legacy === "connections") {
      setSearchParams({ section: legacy }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#location") return;
    /* Location lives inside "profile" now, so land there first. */
    if (section !== "profile") setSearchParams({ section: "profile" }, { replace: true });
    const t = setTimeout(() => {
      const el = document.getElementById("location");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [loading, section, setSearchParams]);



  useEffect(() => {
    void loadLinkedInStatus();
  }, [loadLinkedInStatus]);

  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ") || t("settings.profile.yourProfile");

  const capabilityCount = profile?.skill_ratings
    ? Object.keys(profile.skill_ratings).filter(
        (k) => typeof (profile.skill_ratings as Record<string, unknown>)[k] === "number"
      ).length
    : 0;

  const reportFileName = () => {
    const slug =
      (profile?.first_name || "profile")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "profile";
    // Date of the frozen edition, not "today" — the file name is part of the
    // artifact's identity and must be stable across re-exports.
    const date = (reportSnapshotAt ? new Date(reportSnapshotAt) : new Date())
      .toISOString()
      .slice(0, 10);
    const v = reportVersion ? `-v${reportVersion}` : "";
    return `aura-report-${slug}${v}-${date}.pdf`;
  };

  const reportMountRef = useRef<HTMLDivElement | null>(null);

  const handleDownloadReport = async () => {
    if (!report || !reportMountRef.current) {
      toast.error(t("settings.error.reportNotReady"));
      return;
    }
    setExportingReport(true);
    try {
      await exportReportPdf(reportMountRef.current, reportFileName());
      toast.success(t("settings.toast.reportDownloaded"));
    } catch (e: any) {
      toast.error(e?.message || t("settings.error.reportDownload"));
    } finally {
      setExportingReport(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: "var(--paper)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--action)" }} />
        <p className="text-sm" style={{ color: "var(--ink-4)" }}>
          {t("settings.profile.loading")}
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 px-6"
        style={{ background: "var(--paper)" }}
      >
        <p className="text-sm" style={{ color: "var(--error)" }}>
          {error || t("settings.error.noProfile")}
        </p>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="text-sm underline"
          style={{ color: "var(--action)" }}
        >
          {t("settings.nav.goHome")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[color:var(--paper)]"
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Back */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0) {
              navigate(-1);
            } else {
              navigate("/home");
            }
          }}
          className="flex items-center gap-1.5 text-sm mb-4"
          style={{ color: "var(--action)" }}
        >
          <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
          <span>{t("settings.nav.back")}</span>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-5 h-5" style={{ color: "var(--action)" }} />
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {t("settings.nav.title")}
          </h1>
        </div>

        {/* One nav array, two render branches: rail on desktop, chips on mobile. */}
        <div className="md:flex md:items-start">
          <nav
            className="hidden md:block"
            aria-label={t("settings.nav.sections")}
            style={{
              width: 240,
              flex: "0 0 240px",
              position: "sticky",
              top: 24,
              borderInlineEnd: "1px solid var(--rule)",
              padding: "24px 12px",
            }}
          >
            {NAV_ITEMS.map((item) => {
              const active = section === item.key;
              const danger = item.key === "danger";
              return (
                <div key={item.key}>
                  {danger ? (
                    <div style={{ height: 1, background: "var(--rule)", margin: "12px 8px" }} />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSearchParams(item.key === "profile" ? {} : { section: item.key }, { replace: true })}
                    aria-current={active ? "page" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "start",
                      border: 0,
                      cursor: "pointer",
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      fontFamily: "var(--font-body)",
                      background: active ? "color-mix(in srgb, var(--action) 10%, var(--paper))" : "transparent",
                      color: danger ? "var(--error)" : active ? "var(--action)" : "var(--ink-3)",
                    }}
                    onMouseEnter={(e) => {
                      if (!active && !danger) e.currentTarget.style.color = "var(--ink)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active && !danger) e.currentTarget.style.color = "var(--ink-3)";
                    }}
                  >
                    <item.Icon className="w-4 h-4" />
                    <span>{t(item.labelKey)}</span>
                    {item.key === "connections" ? (
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: liState.connected ? "var(--success)" : "var(--rule)",
                        }}
                      />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </nav>

          <div
            className="flex md:hidden"
            aria-label={t("settings.nav.sections")}
            style={{ gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}
          >
            {NAV_ITEMS.map((item) => {
              const active = section === item.key;
              const danger = item.key === "danger";
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSearchParams(item.key === "profile" ? {} : { section: item.key }, { replace: true })}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    flex: "0 0 auto",
                    whiteSpace: "nowrap",
                    borderRadius: 999,
                    border: "1px solid var(--rule)",
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    background: active ? "var(--action)" : "transparent",
                    color: active ? "#FFFFFF" : danger ? "var(--error)" : "var(--ink-3)",
                  }}
                >
                  <item.Icon className="w-3.5 h-3.5" />
                  <span>{t(item.labelKey)}</span>
                  {item.key === "connections" ? (
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: liState.connected ? "var(--success)" : "var(--rule)",
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-w-0 md:pl-8">
            <div className="max-w-2xl mx-auto">

        {section === "preferences" ? (
          <PreferencesPanel
            open
            variant="inline"
            onClose={() => {}}
            userId={authUser?.id ?? null}
            email={authUser?.email}
            onEditField={(f) => setEditField(f)}
            onSignOut={() => { void signOutAndLand(navigate); }}
          />
        ) : null}

        {section === "connections" ? (
          <>
        {/* LinkedIn */}
        <SectionHeader
          label={t("settings.linkedin.title")}
          subtitle={t("settings.linkedin.subtitle")}
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            <div className="flex items-start justify-between gap-4">
              <div>
                {liState.connected ? (
                  <>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {liState.handle ? `linkedin.com/in/${liState.handle}` : t("settings.linkedin.title")}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      {/* The shared rule's sentence — never a locally invented one. */}
                      {t(liStatus.explanationKey, liStatus.explanationParams)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: "var(--ink)" }}>
                      {mayPromptReconnect(liStatus)
                        ? t("settings.linkedin.expired")
                        : liState.address
                          ? t("settings.linkedin.addressOnFile", { address: ltrIsolate(liState.address.replace(/^https?:\/\/(www\.)?/, "")) })
                          : t("settings.linkedin.notConnected")}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      {t(liStatus.explanationKey, liStatus.explanationParams)}
                    </div>
                  </>
                )}
              </div>
              <Button
                variant={liState.connected ? "outline" : "default"}
                size="sm"
                loading={linkedInBusy}
                disabled={linkedInBusy}
                onClick={liState.connected ? handleDisconnectLinkedIn : handleConnectLinkedIn}
              >
                {liState.connected ? t("settings.linkedin.disconnect") : mayPromptReconnect(liStatus) ? t("settings.linkedin.reconnect") : t("settings.linkedin.connect")}
              </Button>

            </div>
          </AuraCard>
        </div>

        {(!WHATSAPP_PAIRING_ADMIN_ONLY || isAdmin === true) && (
          <>
            <SectionHeader
              label={t("settings.whatsapp.title")}
              subtitle={t("settings.whatsapp.subtitle")}
            />
            <div className="mb-8">
              <AuraCard variant="default" hover="none">
                <WhatsAppPairingCard userId={authUser.id} />
              </AuraCard>
            </div>
          </>
        )}

        <LinkedInAddressCard userId={authUser?.id ?? null} />
          </>
        ) : null}

        {section === "slides" ? (
        <section id="slides" style={{ scrollMarginTop: 96 }}>
          <SectionHeader
            label={t("settings.slides.title")}
            subtitle={t("settings.slides.subtitle")}
          />
          <div className="space-y-4">
            <SlideDefaultsCard userId={authUser?.id ?? null} />
          </div>
        </section>
        ) : null}

        {section === "privacy" ? (
          <>
        {/* Your data — trust statement */}
        <SectionHeader
          label={t("settings.privacy.title")}
          subtitle={t("settings.privacy.subtitle")}
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)" }}>
              {t("settings.privacy.body")}{" "}
              <Link
                to="/guide"
                style={{ color: "var(--action)", fontWeight: 500, textDecoration: "none" }}
              >
                {t("settings.privacy.fullDetails")}
              </Link>
            </p>
          </AuraCard>
        </div>
          </>
        ) : null}

        {section === "profile" ? (
        <>

        <AccountPanel userId={authUser?.id ?? null} email={authUser?.email} onSaved={() => void loadProfile()} />

        {/* Your CV — the door stays open after the journey ends. */}
        <SectionHeader
          label={t("settings.profile.cvTitle")}
          subtitle={t("settings.profile.cvSubtitle")}
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            {/* They compared a CV before they had an account: it was read and
                discarded, so we never imply we still hold the file. */}
            {(() => {
              try { return localStorage.getItem("aura_cv_was_transient") === "1"; } catch { return false; }
            })() ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {t("settings.profile.cvTransient")}
              </p>
            ) : null}
            <CvUploadControl userId={authUser?.id ?? null} />
          </AuraCard>
        </div>

        {/* Location */}
        <section id="location" style={{ scrollMarginTop: 96 }}>
        <SectionHeader
          label={t("settings.profile.locationTitle")}
          subtitle={t("settings.profile.locationSubtitle")}
        />
        <div className="space-y-4">
          <AuraCard variant="default" hover="none">
            <div style={{ maxWidth: 420, opacity: savingCountry ? 0.6 : 1 }}>
              <CountryPicker
                value={profile.country_code}
                onChange={(name, code) => persistCountry(name, code)}
              />
            </div>
          </AuraCard>
        </div>
        </section>

        {/* About you — one card, three labelled rows. */}
        <SectionHeader
          label={t("settings.profile.aboutTitle")}
          subtitle={t("settings.profile.aboutSubtitle")}
        />

        <div className="space-y-4">
          <AuraCard variant="default" hover="none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--ink)" }}
                >
                  {displayName}
                </div>
                <div className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                  {profile.level && <span className="capitalize">{profile.level}</span>}
                  {profile.level && profile.firm && <span className="mx-1">·</span>}
                  {profile.firm && <span>{profile.firm}</span>}
                </div>
                {(profile.sector_focus || profile.core_practice) && (
                  <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                    {profile.sector_focus && (
                      <span className="capitalize">{profile.sector_focus}</span>
                    )}
                    {profile.sector_focus && profile.core_practice && (
                      <span className="mx-1">·</span>
                    )}
                    {profile.core_practice}
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: "var(--rule)", margin: "16px 0" }} />

            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-3"
              style={{ color: "var(--ink)" }}
            >
              {t("settings.profile.pillars")}
            </div>
            {profile.brand_pillars && profile.brand_pillars.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.brand_pillars.map((pillar) => (
                  <span
                    key={pillar}
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: "color-mix(in srgb, var(--action) 12%, var(--paper))",
                      color: "var(--ink)",
                      border: "1px solid color-mix(in srgb, var(--action) 32%, transparent)",
                    }}
                  >
                    {pillar}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--ink-4)" }}>
                {t("settings.profile.noPillars")}
              </p>
            )}

            <div style={{ height: 1, background: "var(--rule)", margin: "16px 0" }} />

            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-3"
              style={{ color: "var(--ink)" }}
            >
              {t("settings.profile.capabilities")}
            </div>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {capabilityCount > 0 ? (
                <Trans
                  i18nKey="settings.profile.capabilityCount"
                  count={capabilityCount}
                  values={{ count: capabilityCount }}
                  components={{ 1: <span className="font-semibold" /> }}
                />
              ) : (
                <>{t("settings.profile.noCapabilities")}</>
              )}
            </p>
            {profile.audit_results && Object.keys(profile.audit_results).length > 0 && (
              <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
                {t("settings.profile.auditDone")}
              </p>
            )}
          </AuraCard>

          {/* Export actions — the identity report lives with identity, not slides. */}
          <AuraCard variant="default" hover="none">
            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-2"
              style={{ color: "var(--ink)" }}
            >
              {t("settings.profile.export")}
            </div>
            {profile?.brand_assessment_completed_at ? (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--ink-3)" }}>
                  {t("settings.profile.exportBody")}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadReport}
                  loading={exportingReport}
                  disabled={exportingReport || reportLoading || !report}
                >
                  {t("settings.profile.exportPdf")}
                </Button>
                {reportVersion && reportSnapshotAt ? (
                  <p style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4)" }}>
                    {t("settings.profile.version", {
                      version: reportVersion,
                      date: new Date(reportSnapshotAt).toLocaleDateString(dateLocale(lang), {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }),
                    })}
                  </p>
                ) : null}
                {/* §16.1 trust line — quiet, caption, muted; one line in the member's language */}
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0 }}>
                    {t("settings.profile.reportTrust")}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--ink-4)" }}>
                  {t("settings.profile.assessFirst")}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/onboarding")}
                >
                  {t("settings.profile.assessCta")}
                </Button>
              </>
            )}
          </AuraCard>
        </div>

        </>
        ) : null}

        {section === "danger" ? (
          <>
        {/* Danger zone */}
        <SectionHeader
          label={t("settings.danger.title")}
          subtitle={t("settings.danger.subtitle")}
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("settings.danger.body")}
            </p>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0 }}>
                {t("settings.danger.backups")}
              </p>
            </div>

            {!dangerOpen ? (
              <div className="mt-5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDangerOpen(true)}
                  className="text-[var(--error)] border-[color-mix(in_srgb,var(--error)_40%,var(--rule))] hover:bg-[color-mix(in_srgb,var(--error)_8%,transparent)]"
                >
                  {t("settings.danger.deleteMine")}
                </Button>
              </div>
            ) : (
              <div className="mt-5" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                  {t("settings.danger.typeToConfirm", { word: "DELETE" })}
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={t("settings.danger.typeToConfirm", { word: "DELETE" })}
                  autoFocus
                  disabled={deleting}
                  className="w-full text-sm bg-transparent outline-none"
                  style={{
                    color: "var(--ink)",
                    borderBottom: "1px solid var(--rule)",
                    padding: "6px 0",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDangerOpen(false);
                      setDeleteConfirmText("");
                    }}
                    disabled={deleting}
                  >
                    {t("settings.danger.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                  >
                    {deleting ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t("settings.danger.deleting")}
                      </span>
                    ) : (
                      t("settings.danger.permanent")
                    )}
                  </Button>
                </div>
              </div>
            )}
          </AuraCard>
        </div>
          </>
        ) : null}

            </div>
          </div>
        </div>
      </div>

      {/* Off-screen report mount for PDF export (W2-G-2b).
          Must be laid out (not display:none) so html2canvas can rasterise. */}
      {report ? (
        <div
          ref={reportMountRef}
          aria-hidden
          style={{
            position: "absolute",
            insetInlineStart: -9999,
            top: 0,
            width: 794,
            pointerEvents: "none",
          }}
        >
          <ReportDocument data={report} />
        </div>
      ) : null}

      {/* Editing a field re-reads the profile, so the read-only summary
          above never disagrees with what was just saved. */}
      <EditProfileModal
        open={!!editField}
        focusField={editField ?? undefined}
        userId={authUser?.id ?? null}
        onClose={() => setEditField(null)}
        onSaved={() => { setEditField(null); void loadProfile(); }}
      />
    </div>
  );
}
