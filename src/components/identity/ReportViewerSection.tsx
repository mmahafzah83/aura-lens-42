// SLICE 4a — the Strategic Identity Report's home on "Your Story".
// Reads the frozen edition via the shared useReportSnapshot hook, renders it
// ON SCREEN scaled to the column width, and exports the PDF from a SEPARATE
// full-size 794px mount (so export quality is unchanged).

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AuraButton } from "@/components/ui/AuraButton";
import ReportDocument from "@/components/ReportDocument";
import { exportReportPdf } from "@/lib/exportReportPdf";
import { useReportSnapshot } from "@/hooks/useReportSnapshot";

const SHEET_W = 794; // A4 @ 96dpi — fixed, must be scaled to fit on screen.

interface Props {
  firstName?: string | null;
  onCompleteAssessment: () => void;
}

export default function ReportViewerSection({ firstName, onCompleteAssessment }: Props) {
  const { report, version, snapshotAt, loading, hasAssessment } = useReportSnapshot();
  const [exporting, setExporting] = useState(false);
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
    const slug =
      (firstName || "profile").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      "profile";
    const date = (snapshotAt ? new Date(snapshotAt) : new Date()).toISOString().slice(0, 10);
    const v = version ? `-v${version}` : "";
    return `aura-report-${slug}${v}-${date}.pdf`;
  };

  const handleExport = async () => {
    if (!report || !exportMountRef.current) {
      toast.error("Report not ready yet.");
      return;
    }
    setExporting(true);
    try {
      await exportReportPdf(exportMountRef.current, fileName());
      toast.success("Report downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to download report");
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
          <AuraButton variant="primary" size="sm" onClick={onCompleteAssessment}>
            Complete brand assessment
          </AuraButton>
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
        <AuraButton
          variant="primary"
          size="sm"
          onClick={handleExport}
          loading={exporting}
          disabled={exporting || loading || !report}
        >
          Export PDF
        </AuraButton>
        {version && snapshotAt ? (
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
            Version {version} ·{" "}
            {new Date(snapshotAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        ) : null}
      </div>

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

      {/* Separate full-size mount used ONLY for rasterising the export. */}
      {report ? (
        <div
          ref={exportMountRef}
          aria-hidden
          style={{ position: "absolute", left: -9999, top: 0, width: SHEET_W, pointerEvents: "none" }}
        >
          <ReportDocument data={report} />
        </div>
      ) : null}
    </section>
  );
}
