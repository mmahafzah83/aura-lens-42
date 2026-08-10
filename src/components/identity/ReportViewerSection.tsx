// SLICE 4a — the Strategic Identity Report's home on "Your Story".
// Reads the frozen edition via the shared useReportSnapshot hook, renders it
// ON SCREEN scaled to the column width, and exports the PDF from a SEPARATE
// full-size 794px mount (so export quality is unchanged).

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ReportDocument from "@/components/ReportDocument";
import { exportReportPdf } from "@/lib/exportReportPdf";
import { useReportSnapshot } from "@/hooks/useReportSnapshot";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";

const SHEET_W = 794; // A4 @ 96dpi — fixed, must be scaled to fit on screen.

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const ERROR_LINE: React.CSSProperties = { fontSize: 12.5, color: "#C0392B", marginTop: 8 };

interface Props {
  firstName?: string | null;
  lastName?: string | null;
  onCompleteAssessment: () => void;
  /** When set, this exact snapshot is rendered and exported instead of the current one. */
  overrideReport?: any | null;
  overrideVersion?: number | null;
  overrideSnapshotAt?: string | null;
}

export default function ReportViewerSection({
  firstName,
  lastName,
  onCompleteAssessment,
  overrideReport,
  overrideVersion,
  overrideSnapshotAt,
}: Props) {
  const live = useReportSnapshot();
  const usingOverride = !!overrideReport;
  const report = usingOverride ? overrideReport : live.report;
  const version = usingOverride ? overrideVersion ?? null : live.version;
  const snapshotAt = usingOverride ? overrideSnapshotAt ?? null : live.snapshotAt;
  const loading = usingOverride ? false : live.loading;
  const hasAssessment = usingOverride ? true : live.hasAssessment;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const exportMountRef = useRef<HTMLDivElement | null>(null);

  // Fit the fixed 794px sheet into whatever column width we get.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / SHEET_W));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [report]);

  // Reserve exactly the scaled height so nothing clips or leaves dead space.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.scrollHeight;
      if (h > 0) setScaledHeight(h * scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale, report]);

  const fileName = () => {
    const person =
      `${firstName || ""}${lastName || ""}`.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Member";
    const date = (snapshotAt ? new Date(snapshotAt) : new Date()).toISOString().slice(0, 10);
    const v = version ?? 1;
    return `Aura-Report-${person}-v${v}-${date}.pdf`;
  };

  const handleExport = async () => {
    if (!report || !exportMountRef.current) {
      setExportError("Your report isn't ready yet. Try again in a moment.");
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      await exportReportPdf(exportMountRef.current, fileName());
      toast.success("Report downloaded");
    } catch (e: any) {
      setExportError("We couldn't build your PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (!hasAssessment && !loading) {
    return (
      <section
        style={{
          background: "var(--aura-card)",
          border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <p className="text-sm" style={{ color: "var(--ink-3)", margin: 0 }}>
          Complete your brand assessment to generate your identity report.
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="default" size="sm" onClick={onCompleteAssessment}>
            Complete brand assessment
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        background: "var(--aura-card)",
        border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || loading || !report}
        >
          {exporting ? "Preparing your PDF…" : "Download PDF"}
        </Button>
        {version && snapshotAt ? (
          <span style={{ fontSize: 11, color: "#5B6673" }}>
            <span style={{ fontFamily: MONO }}>v{version}</span> ·{" "}
            {new Date(snapshotAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        ) : null}
      </div>
      {exportError ? <div style={ERROR_LINE}>{exportError}</div> : null}

      {loading || !report ? (
        <p className="text-sm" style={{ color: "var(--ink-4)", margin: 0 }}>
          Preparing your report…
        </p>
      ) : (
        <div
          ref={frameRef}
          style={{
            border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
            borderRadius: 10,
            background: "#ffffff",
            overflow: "hidden",
            height: scaledHeight ? Math.ceil(scaledHeight) : undefined,
          }}
        >
          <div
            ref={previewRef}
            aria-label="Strategic Identity Report preview"
            style={{
              width: SHEET_W,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <ReportDocument data={report} />
          </div>
        </div>
      )}

      {/* Separate full-size mount used ONLY for rasterising the export.
          SLICE 4d — the Brand Assessment paper is bound in FIRST, then the
          Strategic Identity paper, so exportReportPdf (which walks every
          [data-report-page] in DOM order) produces one continuous document. */}
      {report ? (
        <div
          ref={exportMountRef}
          aria-hidden
          style={{ position: "absolute", left: -9999, top: 0, width: SHEET_W, pointerEvents: "none" }}
        >
          {report.brand_paper &&
          (report.brand_paper.primary_archetype || report.brand_paper.market_read) ? (
            <BrandPaperDocument paper={report.brand_paper} showClosing={false} />
          ) : null}
          <ReportDocument data={report} />
        </div>
      ) : null}
    </section>
  );
}
