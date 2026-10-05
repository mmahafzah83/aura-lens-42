// SLICE 4a — the Strategic Identity Report's home on "Your Story".
// Reads the frozen edition via the shared useReportSnapshot hook, renders it
// ON SCREEN scaled to the column width, and exports the PDF from a SEPARATE
// full-size 794px mount (so export quality is unchanged).

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { displayDate } from "@/lib/arDisplay";
import { Button } from "@/components/ui/button";
import ReportDocument from "@/components/ReportDocument";
import { exportReportPdf } from "@/lib/exportReportPdf";
import { useReportSnapshot } from "@/hooks/useReportSnapshot";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";
import { brandPaperHasContent, attachCapabilityNamesAr, type CapabilityNameRow } from "@/lib/buildBrandPaper";
import { supabase } from "@/integrations/supabase/client";
import { reportLang } from "@/components/report/paperText";

const SHEET_W = 794; // A4 @ 96dpi — fixed, must be scaled to fit on screen.

/* Cairo second: Plex Mono has no Arabic letters, so Arabic in a mono span falls to Cairo. */
const MONO = "'IBM Plex Mono', 'Cairo', ui-monospace, monospace";
const ERROR_LINE: React.CSSProperties = { fontSize: 12.5, color: "#C0392B", marginTop: 8 };

/** Shared outer shell for every top-level card in "What you can show". */
const SHELL: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E7EE",
  borderRadius: 20,
  padding: 20,
};
const MUTED: React.CSSProperties = { fontSize: 11, color: "#5B6673" };

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
  const { t: tr, i18n } = useTranslation();
  const live = useReportSnapshot();
  const usingOverride = !!overrideReport;
  const report = usingOverride ? overrideReport : live.report;
  const version = usingOverride ? overrideVersion ?? null : live.version;
  const snapshotAt = usingOverride ? overrideSnapshotAt ?? null : live.snapshotAt;
  const loading = usingOverride ? false : live.loading;
  const hasAssessment = usingOverride ? true : live.hasAssessment;
  const paperReady = brandPaperHasContent((report as any)?.brand_paper ?? null);
  const [capNames, setCapNames] = useState<CapabilityNameRow[] | null>(null);
  // Saved editions may predate Arabic capability names; add them at display.
  useEffect(() => {
    let off = false;
    (supabase.from("capability_dimensions" as any) as any).select("name, name_ar")
      .then(({ data }: any) => { if (!off) setCapNames(data || null); });
    return () => { off = true; };
  }, []);
  // One language for the whole export: the report's own language (never the screen's).
  const paperLang = reportLang(report);
  const exportPaper = report?.brand_paper
    ? { ...report.brand_paper, lang: paperLang, capabilities: attachCapabilityNamesAr(report.brand_paper.capabilities || [], capNames) }
    : null;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  // DEFECT 7 — a failure from one version must never linger on another.
  useEffect(() => { setExportError(null); }, [overrideVersion, overrideSnapshotAt]);

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
      [firstName, lastName]
        .filter(Boolean)
        .join("-")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "") || "Member";
    const date = (snapshotAt ? new Date(snapshotAt) : new Date()).toISOString().slice(0, 10);
    const v = version ?? 1;
    return `KnownBy-Report-${person}-v${v}-${date}.pdf`;
  };

  const handleExport = async () => {
    if (!report || !exportMountRef.current) {
      setExportError(tr("viewer.notReady"));
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      await exportReportPdf(exportMountRef.current, fileName());
      toast.success(tr("viewer.downloaded"));
    } catch (e: any) {
      setExportError(tr("viewer.pdfFail"));
    } finally {
      setExporting(false);
    }
  };

  if (!hasAssessment && !loading) {
    return (
      <section style={SHELL}>
        <p className="text-sm" style={{ color: "#5B6673", margin: 0 }}>
          {tr("viewer.empty")}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="default" size="sm" onClick={onCompleteAssessment}>
            {tr("brandRep.completeCta")}
          </Button>
        </div>
      </section>
    );
  }

  // A completion stamp is not a read. If the paper has nothing on it, say so
  // and offer to run the read again — never print a masthead over nothing.
  if (!loading && report && !paperReady) {
    return (
      <section style={SHELL}>
        <p className="text-sm" style={{ color: "#5B6673", margin: 0 }}>
          {tr("viewer.unwritten")}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="default" size="sm" onClick={onCompleteAssessment}>
            {tr("viewer.runAgain")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section style={SHELL}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || loading || !report}
        >
          {exporting ? tr("viewer.preparingPdf") : tr("viewer.download")}
        </Button>
        {version && snapshotAt ? (
          <span style={MUTED}>
            <span style={{ fontFamily: MONO, unicodeBidi: "isolate" }}>v{version}</span> ·{" "}
            <span style={{ fontFamily: MONO, unicodeBidi: "isolate" }}>
              {i18n.language === "ar"
                ? displayDate(snapshotAt, "ar")
                : new Date(snapshotAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </span>
        ) : null}
      </div>
      {exportError ? <div style={ERROR_LINE}>{exportError}</div> : null}

      {loading || !report ? (
        <p className="text-sm" style={{ color: "#5B6673", margin: 0 }}>
          {tr("viewer.preparing")}
        </p>
      ) : (
        <div
          ref={frameRef}
          /* The scaled sheet is anchored top-left; keep the frame LTR so it stays in view in Arabic. */
          dir="ltr"
          style={{
            border: "1px solid #E2E7EE",
            borderRadius: 12,
            background: "#FFFFFF",
            overflow: "hidden",
            height: scaledHeight ? Math.ceil(scaledHeight) : undefined,
          }}
        >
          <div
            ref={previewRef}
            aria-label={tr("viewer.previewAria")}
            style={{
              width: SHEET_W,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <ReportDocument data={report} lang={paperLang} />
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
          /* Inline-start, so the off-screen sheet never adds sideways scroll in Arabic. */
          style={{ position: "absolute", insetInlineStart: -9999, top: 0, width: SHEET_W, pointerEvents: "none" }}
        >
          {brandPaperHasContent(report.brand_paper) ? (
            <BrandPaperDocument paper={exportPaper} showClosing={false} />
          ) : null}
          <ReportDocument data={report} lang={paperLang} />
        </div>
      ) : null}
    </section>
  );
}
