import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import { Link } from "react-router-dom";
import { downloadBlob } from "@/lib/download";
import { exportReportPdf } from "@/lib/exportReportPdf";
import usePageMeta from "@/hooks/usePageMeta";
import ReportDocument from "@/components/ReportDocument";
import { buildIdentityReport, type ReportData } from "@/lib/buildIdentityReport";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  firm: string | null;
  core_practice: string | null;
  sector_focus: string | null;
  north_star_goal: string | null;
  linkedin_handle: string | null;
  linkedin_url: string | null;
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
}

interface LinkedInConnection {
  display_name?: string | null;
  connected_at?: string;
  last_synced_at?: string;
}


export default function Settings() {
  usePageMeta({
    title: "Aura — Settings",
    description: "Your profile, brand, and capabilities.",
    path: "/settings",
  });

  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
const [reportLoading, setReportLoading] = useState(true);
const [linkedInConnection, setLinkedInConnection] = useState<LinkedInConnection | null>(null);
const [linkedInBusy, setLinkedInBusy] = useState(true);
const [signatures, setSignatures] = useState<{ id: string; name: string; text_en: string; text_ar: string }[]>([]);
const [savingSig, setSavingSig] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (!cancelled) {
            setLoading(false);
            setError("Not signed in.");
            setReportLoading(false);
          }
          return;
        }
        const { data, error: qErr } = await supabase
          .from("diagnostic_profiles")
          .select(
            "first_name, last_name, level, firm, core_practice, sector_focus, north_star_goal, linkedin_handle, linkedin_url, years_experience, leadership_style, primary_strength, avatar_url, brand_assessment_completed_at, brand_pillars, identity_intelligence, brand_assessment_results, skill_ratings, generated_skills, audit_results, signature_presets"
          )
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw qErr;
        setProfile((data as ProfileData) || null);
        setSignatures(Array.isArray((data as any)?.signature_presets) ? (data as any).signature_presets : []);
        if (data?.brand_assessment_completed_at) {
          try {
            const r = await buildIdentityReport(session.user.id);
            if (!cancelled) setReport(r);
          } catch (re) {
            console.error("[Settings] buildIdentityReport failed", re);
          } finally {
            if (!cancelled) setReportLoading(false);
          }
        } else {
          if (!cancelled) setReportLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load profile.");
        if (!cancelled) setReportLoading(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadLinkedInStatus = async () => {
    setLinkedInBusy(true);
    try {
      const { data } = await supabase.functions.invoke("linkedin-oauth", { body: { action: "status" } });
      setLinkedInConnection(data?.connection || null);
    } catch (e) {
      console.error("[Settings] LinkedIn status error", e);
    } finally {
      setLinkedInBusy(false);
    }
  };

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
      const { error } = await supabase.from("diagnostic_profiles").update({ signature_presets: next }).eq("user_id", session.user.id);
      if (error) throw error;
      setSignatures(next);
      toast.success("Signatures saved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save signatures");
    } finally {
      setSavingSig(false);
    }
  };
  const addSignature = () => setSignatures((s) => [...s, { id: crypto.randomUUID(), name: "New signature", text_en: "", text_ar: "" }]);
  const updateSignature = (id: string, field: "name" | "text_en" | "text_ar", value: string) =>
    setSignatures((s) => s.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const removeSignature = (id: string) => persistSignatures(signatures.filter((p) => p.id !== id));

  useEffect(() => {
    loadLinkedInStatus();
  }, []);

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
    const date = new Date().toISOString().slice(0, 10);
    return `aura-report-${slug}-${date}.pdf`;
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
              fontFamily: "var(--serif)",
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            Settings
          </h1>
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
                {linkedInConnection ? (
                  <>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {linkedInConnection.display_name || "LinkedIn User"}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      Connected
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: "var(--ink)" }}>
                      Not connected
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      Connect your LinkedIn account to publish and sync analytics.
                    </div>
                  </>
                )}
              </div>
              <AuraButton
                variant={linkedInConnection ? "ghost" : "primary"}
                size="sm"
                loading={linkedInBusy}
                disabled={linkedInBusy}
                onClick={linkedInConnection ? handleDisconnectLinkedIn : handleConnectLinkedIn}
              >
                {linkedInConnection ? "Disconnect" : "Connect LinkedIn"}
              </AuraButton>
            </div>
          </AuraCard>
        </div>

        {/* Signatures */}
        <SectionHeader
          label="Signatures"
          subtitle="Reusable closers you can drop into any post — each with an English and an Arabic version. You'll pick one in the Composer when you publish."
        />
        <div className="mb-8 space-y-4">
          {signatures.length === 0 && (
            <AuraCard variant="default" hover="none">
              <p className="text-sm italic" style={{ color: "var(--ink-4)" }}>No signatures yet. Add one to reuse across your posts.</p>
            </AuraCard>
          )}
          {signatures.map((sig) => (
            <AuraCard key={sig.id} variant="default" hover="none">
              <div className="space-y-3">
                <input
                  value={sig.name}
                  onChange={(e) => updateSignature(sig.id, "name", e.target.value)}
                  placeholder="Signature name"
                  className="w-full text-sm font-semibold bg-transparent outline-none"
                  style={{ color: "var(--ink)", borderBottom: "1px solid var(--rule)", padding: "4px 0" }}
                />
                <div>
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>English</label>
                  <textarea
                    value={sig.text_en}
                    onChange={(e) => updateSignature(sig.id, "text_en", e.target.value)}
                    rows={3}
                    placeholder="English signature text…"
                    className="w-full mt-1 text-sm rounded-md p-2 outline-none"
                    style={{ color: "var(--ink)", background: "var(--paper-2)", border: "1px solid var(--rule)", fontFamily: "var(--font-body)" }}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-4)", fontFamily: "var(--font-arabic, 'Cairo', sans-serif)" }}>العربية</label>
                  <textarea
                    value={sig.text_ar}
                    onChange={(e) => updateSignature(sig.id, "text_ar", e.target.value)}
                    rows={3}
                    dir="rtl"
                    placeholder="نص التوقيع بالعربية…"
                    className="w-full mt-1 text-sm rounded-md p-2 outline-none"
                    style={{ color: "var(--ink)", background: "var(--paper-2)", border: "1px solid var(--rule)", fontFamily: "'Cairo', var(--font-body), sans-serif", textAlign: "right" }}
                  />
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => removeSignature(sig.id)} className="text-xs" style={{ color: "var(--error)" }}>Delete</button>
                </div>
              </div>
            </AuraCard>
          ))}
          <div className="flex gap-2">
            <AuraButton variant="ghost" size="sm" onClick={addSignature} disabled={savingSig}>Add signature</AuraButton>
            <AuraButton variant="primary" size="sm" onClick={() => persistSignatures(signatures)} loading={savingSig} disabled={savingSig}>Save signatures</AuraButton>
          </div>
        </div>

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
                <AuraButton
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadReport}
                  loading={exportingReport}
                  disabled={exportingReport || reportLoading || !report}
                >
                  Download Report (PDF)
                </AuraButton>
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
                <AuraButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate("/onboarding")}
                >
                  Complete brand assessment
                </AuraButton>
              </>
            )}
          </AuraCard>
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
            left: -9999,
            top: 0,
            width: 794,
            pointerEvents: "none",
          }}
        >
          <ReportDocument data={report} />
        </div>
      ) : null}
    </div>
  );
}
