import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import { downloadBlob } from "@/lib/download";
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
  brand_pillars: string[];
  identity_intelligence: Record<string, unknown>;
  brand_assessment_results: Record<string, unknown>;
  skill_ratings: Record<string, unknown>;
  generated_skills: Record<string, unknown>;
  audit_results: Record<string, unknown>;
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
            "first_name, last_name, level, firm, core_practice, sector_focus, north_star_goal, linkedin_handle, linkedin_url, years_experience, leadership_style, primary_strength, avatar_url, brand_pillars, identity_intelligence, brand_assessment_results, skill_ratings, generated_skills, audit_results"
          )
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw qErr;
        setProfile((data as ProfileData) || null);
        try {
          const r = await buildIdentityReport(session.user.id);
          if (!cancelled) setReport(r);
        } catch (re) {
          console.error("[Settings] buildIdentityReport failed", re);
        } finally {
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
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      const pageNodes: HTMLElement[] = Array.from(
        reportMountRef.current.querySelectorAll("[data-report-page]")
      ) as HTMLElement[];
      if (pageNodes.length === 0) throw new Error("No report pages to export.");

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageNodes.length; i++) {
        const canvas = await html2canvas(pageNodes[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        const imgData = canvas.toDataURL("image/png");
        // Fit to width; if too tall, fit to height instead.
        let w = pageW;
        let h = (canvas.height * w) / canvas.width;
        if (h > pageH) {
          h = pageH;
          w = (canvas.width * h) / canvas.height;
        }
        const x = (pageW - w) / 2;
        const y = 0;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", x, y, w, h);
      }

      downloadBlob(pdf.output("blob"), reportFileName());
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
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
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
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error || "No profile found."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="text-sm underline"
          style={{ color: "var(--brand)" }}
        >
          Go home
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-neutral-950"
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-5 h-5" style={{ color: "var(--brand)" }} />
          <h1
            style={{
              fontFamily: "var(--font-display, 'Cormorant Garamond'), Georgia, serif",
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            Settings
          </h1>
        </div>

        {/* Your data */}
        <SectionHeader
          label="Your data"
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
                      background: "var(--brand-ghost, rgba(176,141,58,0.08))",
                      color: "var(--brand)",
                      border: "1px solid var(--brand-line, rgba(176,141,58,0.22))",
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
