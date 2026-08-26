import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Settings as SettingsIcon } from "lucide-react";
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
import { getPublication, validate as validatePublication, type PublicationConfig } from "@/lib/publication";
import { PAPER, INK, SPOT, RULE, SERIF, MONO, ARABIC } from "@/components/broadsheet/pressTokens";
import CountryPicker from "@/components/CountryPicker";
import PreferencesPanel from "@/components/PreferencesPanel";
import EditProfileModal, { type EditProfileField } from "@/components/EditProfileModal";
import AccountPanel from "@/components/settings/AccountPanel";
import CvUploadControl from "@/components/cv/CvUploadControl";
import SlideDefaultsCard from "@/components/settings/SlideDefaultsCard";
import WhatsAppPairingCard from "@/components/settings/WhatsAppPairingCard";
import { WHATSAPP_PAIRING_ADMIN_ONLY } from "@/config/whatsapp";
import { useIsAdmin } from "@/lib/isAdmin";

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
  signature_presets: { id: string; name: string; text_en: string; text_ar: string }[] | null;
  country: string | null;
  country_code: string | null;
}

import { loadLinkedInState, EMPTY_LINKEDIN_STATE, type LinkedInState } from "@/lib/linkedinState";
import { statusFromLinkedInState, mayPromptReconnect } from "@/lib/linkedinStatus";


export default function Settings() {
  usePageMeta({
    title: "Aura — Settings",
    description: "Your profile, brand, and capabilities.",
    path: "/settings",
  });

  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = rawTab === "preferences" ? "preferences" : rawTab === "connections" ? "connections" : "account";
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
const [signatures, setSignatures] = useState<{ id: string; name: string; text_en: string; text_ar: string }[]>([]);
const [savingSig, setSavingSig] = useState(false);
const [publication, setPublicationState] = useState<PublicationConfig>({ name: "", style: "classic" });
const [savingPub, setSavingPub] = useState(false);
const [dangerOpen, setDangerOpen] = useState(false);
const [deleteConfirmText, setDeleteConfirmText] = useState("");
const [deleting, setDeleting] = useState(false);

const handleDeleteAccount = async () => {
  if (deleteConfirmText !== "DELETE") return;
  setDeleting(true);
  try {
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error || (data && (data as any).error)) {
      throw new Error((data as any)?.error || error?.message || "Delete failed");
    }
    await signOutAndLand(navigate);
  } catch (e: any) {
    console.error("[delete-account] failed", e);
    toast.error(e?.message || "We couldn't delete your account. Please try again.");
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
        setError("Not signed in.");
        return;
      }
      const { data, error: qErr } = await supabase
        .from("diagnostic_profiles")
        .select(
          "first_name, last_name, level, firm, core_practice, sector_focus, north_star_goal, years_experience, leadership_style, primary_strength, avatar_url, brand_assessment_completed_at, brand_pillars, identity_intelligence, brand_assessment_results, skill_ratings, generated_skills, audit_results, signature_presets, country, country_code"
        )
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (qErr) throw qErr;
      setProfile((data as unknown as ProfileData) || null);
      setSignatures(Array.isArray((data as any)?.signature_presets) ? (data as any).signature_presets : []);
      {
        const p = (data as any) || {};
        const initialPub = getPublication(
          { identity_intelligence: p.identity_intelligence || {} },
          "en",
          p.first_name,
        );
        setPublicationState(initialPub);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load profile.");
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

  const persistSignatures = async (next: typeof signatures) => {
    setSavingSig(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not signed in");
      const ok = await writeProfile(session.user.id, { signature_presets: next }, "Settings.persistSignatures");
      if (!ok) throw new Error("That didn't save — try once more.");
      setSignatures(next);
      toast.success("Signatures saved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save signatures");
    } finally {
      setSavingSig(false);
    }
  };

  const [savingCountry, setSavingCountry] = useState(false);
  const persistCountry = async (name: string | null, code: string | null) => {
    setSavingCountry(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not signed in");
      const ok = await writeProfile(session.user.id, { country: name, country_code: code }, "Settings.persistCountry");
      if (!ok) throw new Error("That didn't save — try once more.");
      setProfile((p) => (p ? { ...p, country: name, country_code: code } : p));
      toast.success("Country saved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save country");
    } finally {
      setSavingCountry(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#location") return;
    const t = setTimeout(() => {
      const el = document.getElementById("location");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [loading]);
  const addSignature = () =>
    setSignatures((s) => [
      ...s,
      { id: crypto.randomUUID(), name: `Signature ${s.length + 1}`, text_en: "", text_ar: "" },
    ]);
  const updateSignature = (id: string, field: "name" | "text_en" | "text_ar", value: string) =>
    setSignatures((s) => s.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const removeSignature = (id: string) => persistSignatures(signatures.filter((p) => p.id !== id));

  const persistPublication = async () => {
    const err = validatePublication(publication.name);
    if (err) { toast.error(err); return; }
    if (publication.name_ar && publication.name_ar.trim() && publication.name_ar.trim().length > 40) {
      toast.error("Arabic name must be at most 40 characters."); return;
    }
    setSavingPub(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not signed in");
      // Refetch identity_intelligence at save time — sibling keys
      // (preferred_carousel_style etc.) may have been written elsewhere.
      const { data: fresh, error: fErr } = await supabase
        .from("diagnostic_profiles")
        .select("identity_intelligence")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (fErr) throw fErr;
      const ii = ((fresh as any)?.identity_intelligence as Record<string, any>) || {};
      const nextPub: PublicationConfig = {
        name: publication.name.trim(),
        name_ar: publication.name_ar?.trim() || undefined,
        style: publication.style,
        monogram_char: publication.style === "monogram"
          ? (publication.monogram_char || publication.name.trim().charAt(0) || "A").slice(0, 1).toUpperCase()
          : undefined,
      };
      const ok = await writeProfile(
        session.user.id,
        { identity_intelligence: { ...ii, publication: nextPub } as any },
        "Settings.persistPublication",
      );
      if (!ok) throw new Error("That didn't save — try once more.");
      setPublicationState(nextPub);
      toast.success("Publication saved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save publication");
    } finally {
      setSavingPub(false);
    }
  };

  useEffect(() => {
    void loadLinkedInStatus();
  }, [loadLinkedInStatus]);

  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ") || "Your profile";

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
      toast.error("Report not ready yet.");
      return;
    }
    setExportingReport(true);
    try {
      await exportReportPdf(reportMountRef.current, reportFileName());
      toast.success("Report downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to download report");
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
          Loading your profile…
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
          {error || "No profile found."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="text-sm underline"
          style={{ color: "var(--action)" }}
        >
          Go home
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
      <div className="max-w-2xl mx-auto px-6 py-10">
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
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
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
            Settings
          </h1>
        </div>

        {/* Tabs — Account first, then preferences */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "0.5px solid var(--rule)" }}>
          {([["account", "Account"], ["connections", "Connections"], ["preferences", "Preferences"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSearchParams(key === "account" ? {} : { tab: key }, { replace: true })}
              style={{
                background: "transparent",
                border: 0,
                borderBottom: `2px solid ${tab === key ? "var(--action)" : "transparent"}`,
                color: tab === key ? "var(--ink)" : "var(--ink-3)",
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "preferences" ? (
          <PreferencesPanel
            open
            variant="inline"
            onClose={() => {}}
            userId={authUser?.id ?? null}
            email={authUser?.email}
            onEditField={(f) => setEditField(f)}
            onSignOut={() => { void signOutAndLand(navigate); }}
          />
        ) : tab === "connections" ? (
          <LinkedInAddressCard userId={authUser?.id ?? null} />
        ) : (
        <>

        <AccountPanel userId={authUser?.id ?? null} email={authUser?.email} onSaved={() => void loadProfile()} />

        {/* Your CV — the door stays open after the journey ends. */}
        <SectionHeader
          label="Your CV"
          subtitle="Aura reads it against your profile and shows you the difference."
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            {/* They compared a CV before they had an account: it was read and
                discarded, so we never imply we still hold the file. */}
            {(() => {
              try { return localStorage.getItem("aura_cv_was_transient") === "1"; } catch { return false; }
            })() ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Your comparison is saved. Add your CV again from Settings if you'd like Aura to keep it.
              </p>
            ) : null}
            <CvUploadControl userId={authUser?.id ?? null} />
          </AuraCard>
        </div>

        {/* Your data — trust statement */}
        <SectionHeader
          label="Your data"
          subtitle="What's private, what we can see, and how we protect it."
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)" }}>
              Your captures, drafts, and signals are private to your account — no other user can see them, and nothing in Aura shows them to us. We don't sell your data, and the providers that power Aura operate under business terms that don't use it to train their models by default. Aura isn't end-to-end encrypted — the system has to read your content to turn it into signals — so we protect it with strict per-account isolation instead.{" "}
              <Link
                to="/guide"
                style={{ color: "var(--action)", fontWeight: 500, textDecoration: "none" }}
              >
                Full details →
              </Link>
            </p>
          </AuraCard>
        </div>

        {/* LinkedIn */}
        <SectionHeader
          label="LinkedIn"
          subtitle="Connect your account to publish from Aura and pull your analytics automatically."
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
                      {liState.handle ? `linkedin.com/in/${liState.handle}` : "LinkedIn"}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      {/* The shared rule's sentence — never a locally invented one. */}
                      {liStatus.explanation}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: "var(--ink)" }}>
                      {mayPromptReconnect(liStatus)
                        ? "Your LinkedIn sign-in has run out"
                        : liState.address
                          ? `Address on file — ${liState.address.replace(/^https?:\/\/(www\.)?/, "")}`
                          : "Not connected"}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      {liStatus.explanation}
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
                {liState.connected ? "Disconnect" : mayPromptReconnect(liStatus) ? "Reconnect LinkedIn" : "Connect LinkedIn"}
              </Button>

            </div>
          </AuraCard>
        </div>

        {(!WHATSAPP_PAIRING_ADMIN_ONLY || isAdmin === true) && (
          <>
            <SectionHeader
              label="Capture by WhatsApp"
              subtitle="Forward anything you read straight to Aura. It becomes a capture, in your account, automatically."
            />
            <div className="mb-8">
              <AuraCard variant="default" hover="none">
                <WhatsAppPairingCard userId={authUser.id} />
              </AuraCard>
            </div>
          </>
        )}



        {/* Location */}
        <section id="location" style={{ scrollMarginTop: 96 }}>
        <SectionHeader
          label="Location"
          subtitle="Sets the flag on your Aura Card and helps regionalise your insights."
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

        {/* Slides */}
        <section id="slides" style={{ scrollMarginTop: 96 }}>
          <SectionHeader
            label="Slides"
            subtitle="The family and colour your slides open in. You can still change either inside any post."
          />
          <div className="space-y-4">
            <SlideDefaultsCard userId={authUser?.id ?? null} />
          </div>
        </section>

        {/* Profile summary */}
        <SectionHeader
          label="Profile summary"
          subtitle="A read-only summary of what Aura knows about your profile, brand, and capabilities."
        />

        <div className="space-y-4">
          {/* Profile summary */}
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
          </AuraCard>

          {/* Brand pillars */}
          <AuraCard variant="default" hover="none">
            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-3"
              style={{ color: "var(--ink)" }}
            >
              Brand pillars
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
                No brand pillars saved yet.
              </p>
            )}
          </AuraCard>

          {/* Capabilities */}
          <AuraCard variant="default" hover="none">
            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-3"
              style={{ color: "var(--ink)" }}
            >
              Capabilities
            </div>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {capabilityCount > 0 ? (
                <>
                  <span className="font-semibold">{capabilityCount}</span> capability{" "}
                  {capabilityCount === 1 ? "dimension" : "dimensions"} rated
                </>
              ) : (
                <>No capability ratings saved yet.</>
              )}
            </p>
            {profile.audit_results && Object.keys(profile.audit_results).length > 0 && (
              <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
                Objective evidence audit completed.
              </p>
            )}
          </AuraCard>

          {/* Export actions */}
          <AuraCard variant="default" hover="none">
            <div
              className="text-xs font-semibold uppercase tracking-[0.12em] mb-2"
              style={{ color: "var(--ink)" }}
            >
              Export
            </div>
            {profile?.brand_assessment_completed_at ? (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--ink-3)" }}>
                  Download your Strategic Identity Report as a PDF.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadReport}
                  loading={exportingReport}
                  disabled={exportingReport || reportLoading || !report}
                >
                  Export PDF
                </Button>
                {reportVersion && reportSnapshotAt ? (
                  <p style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4)" }}>
                    Version {reportVersion} ·{" "}
                    {new Date(reportSnapshotAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
                {/* §16.1 trust line — quiet, caption, muted; bilingual stack */}
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0 }}>
                    The report is built from your data alone — and leaves only by your hand.
                  </p>
                  <p
                    dir="rtl"
                    lang="ar"
                    style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0, fontFamily: "'Cairo', var(--font-body), sans-serif" }}
                  >
                    التقرير يُبنى من بياناتك وحدها — ولا يغادر إلا بيدك.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--ink-4)" }}>
                  Complete your brand assessment to generate your identity report.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/onboarding")}
                >
                  Complete brand assessment
                </Button>
              </>
            )}
          </AuraCard>
        </div>

        {/* Danger zone */}
        <SectionHeader
          label="Danger zone"
          subtitle="Irreversible account actions."
        />
        <div className="mb-8">
          <AuraCard variant="default" hover="none">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              Deleting your account permanently removes your profile, captures, signals, drafts, and all associated data. This cannot be undone.
            </p>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0 }}>
                Your live data is removed immediately; routine backups cycle out within 30 days.
              </p>
              <p
                dir="rtl"
                lang="ar"
                style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-4)", margin: 0, fontFamily: "'Cairo', var(--font-body), sans-serif" }}
              >
                تُحذف بياناتك الحية فوراً؛ ونسخ النسخ الاحتياطي المعتادة تنتهي دورتها خلال 30 يوماً.
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
                  Delete my account
                </Button>
              </div>
            ) : (
              <div className="mt-5" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                  Type DELETE to confirm
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
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
                    Cancel
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
                        Deleting…
                      </span>
                    ) : (
                      "Permanently delete"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </AuraCard>
        </div>

        </>
        )}
      </div>

      {/* Off-screen report mount for PDF export (W2-G-2b).
          Must be laid out (not display:none) so html2canvas can rasterise. */}
      {report ? (
        <div
          ref={reportMountRef}
          aria-hidden
          style={{
            position: "absolute",
            left: -9999,
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
