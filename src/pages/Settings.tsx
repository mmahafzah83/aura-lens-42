import { useEffect, useState } from "react";
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
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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

  const today = () => new Date().toISOString().slice(0, 10);
  const baseName = () =>
    `aura-data-${(profile?.first_name || "profile")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "profile"}-${today()}`;

  const buildExportPayload = () => {
    if (!profile) return {};
    return {
      profile: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        level: profile.level,
        firm: profile.firm,
        core_practice: profile.core_practice,
        sector_focus: profile.sector_focus,
        north_star_goal: profile.north_star_goal,
        linkedin_handle: profile.linkedin_handle,
        linkedin_url: profile.linkedin_url,
        years_experience: profile.years_experience,
        leadership_style: profile.leadership_style,
        primary_strength: profile.primary_strength,
      },
      brand: {
        brand_pillars: profile.brand_pillars,
        identity_intelligence: profile.identity_intelligence,
        brand_assessment_results: profile.brand_assessment_results,
      },
      capabilities: {
        skill_ratings: profile.skill_ratings,
        generated_skills: profile.generated_skills,
        audit_results: profile.audit_results,
      },
    };
  };

  const handleExportJson = async () => {
    if (!profile) return;
    setExportingJson(true);
    try {
      const payload = buildExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `${baseName()}.json`);
      toast.success("JSON downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export JSON");
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportPdf = async () => {
    if (!profile) return;
    setExportingPdf(true);
    let node: HTMLDivElement | null = null;
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      node = document.createElement("div");
      node.style.cssText =
        "position:absolute;left:-9999px;top:0;width:720px;padding:48px;background:#ffffff;color:#1a1a1a;font-family:var(--font-body,'DM Sans',sans-serif);";
      const skills = profile.skill_ratings as Record<string, unknown> | null;
      const skillRows = skills
        ? Object.entries(skills)
            .filter(([, v]) => typeof v === "number")
            .map(
              ([k, v]) =>
                `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;"><span dir="auto">${escapeHtml(
                  k
                )}</span><span>${v}</span></div>`
            )
            .join("")
        : '<p style="font-size:13px;color:#666;">No capability ratings.</p>';

      const pillars =
        profile.brand_pillars && profile.brand_pillars.length > 0
          ? `<ul style="margin:0;padding-left:18px;font-size:13px;">${profile.brand_pillars
              .map((p) => `<li dir="auto" style="margin:2px 0;">${escapeHtml(p)}</li>`)
              .join("")}</ul>`
          : '<p style="font-size:13px;color:#666;">No brand pillars.</p>';

      const row = (label: string, value: string | null | undefined) =>
        value
          ? `<div style="margin:4px 0;font-size:13px;"><strong style="color:#555;">${label}:</strong> <span dir="auto">${escapeHtml(
              String(value)
            )}</span></div>`
          : "";

      node.innerHTML = `
        <h1 style="font-family:var(--font-display,'Cormorant Garamond'),Georgia,serif;font-size:28px;font-weight:500;margin:0 0 8px;">Aura — Your Data</h1>
        <div style="font-size:12px;color:#888;margin-bottom:24px;">Exported ${today()}</div>
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.12em;margin:24px 0 8px;color:#333;">Profile</h2>
        ${row("Name", [profile.first_name, profile.last_name].filter(Boolean).join(" "))}
        ${row("Level", profile.level)}
        ${row("Firm", profile.firm)}
        ${row("Core practice", profile.core_practice)}
        ${row("Sector focus", profile.sector_focus)}
        ${row("North star", profile.north_star_goal)}
        ${row("LinkedIn", profile.linkedin_url || profile.linkedin_handle)}
        ${row("Years experience", profile.years_experience)}
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.12em;margin:24px 0 8px;color:#333;">Brand pillars</h2>
        ${pillars}
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.12em;margin:24px 0 8px;color:#333;">Capabilities</h2>
        ${skillRows}
      `;
      document.body.appendChild(node);

      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        let remaining = imgHeight;
        let position = 0;
        while (remaining > 0) {
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          remaining -= pageHeight;
          if (remaining > 0) {
            pdf.addPage();
            position -= pageHeight;
          }
        }
      }

      downloadBlob(pdf.output("blob"), `${baseName()}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export PDF");
    } finally {
      if (node && node.parentNode) node.parentNode.removeChild(node);
      setExportingPdf(false);
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
      className="min-h-screen"
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
              Download a copy of your Aura profile, brand, and capabilities.
            </p>
            <div className="flex flex-wrap gap-2">
              <AuraButton
                variant="primary"
                size="sm"
                onClick={handleExportJson}
                loading={exportingJson}
                disabled={exportingJson || exportingPdf}
              >
                Download JSON
              </AuraButton>
              <AuraButton
                variant="secondary"
                size="sm"
                onClick={handleExportPdf}
                loading={exportingPdf}
                disabled={exportingJson || exportingPdf}
              >
                Download PDF
              </AuraButton>
            </div>
          </AuraCard>
        </div>

        {/* TEMP (W2-G-2a): visible four-page Strategic Identity Report.
            Moves off-screen in W2-G-2b for export-only rendering. */}
        <div className="mt-10">
          <SectionHeader
            label="Strategic Identity Report — preview"
            subtitle="Temporary visible mount for W2-G-2a verification."
          />
          {reportLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-4)" }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand)" }} />
              Assembling report…
            </div>
          ) : report ? (
            <ReportDocument data={report} />
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-4)" }}>
              Report data unavailable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
