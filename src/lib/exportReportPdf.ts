// Shared PDF export for AuraPaper documents.
// Rasterises every [data-report-page] under `mountEl` and fits each to A4.
// Behaviour mirrors the original Settings.tsx handleDownloadReport (Cairo
// preload, scale 2, JPEG 0.82, A4 fit). Callers must ensure the mount is
// laid out (not display:none) so html2canvas can measure it.

import { downloadBlob } from "@/lib/download";

export async function exportReportPdf(mountEl: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Force-request Cairo (used by Arabic blocks) BEFORE awaiting fonts.ready.
  try {
    if ((document as any).fonts?.load) {
      await Promise.all([
        (document as any).fonts.load("400 12px Cairo"),
        (document as any).fonts.load("600 12px Cairo"),
      ]);
    }
  } catch { /* ignore */ }
  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }
  // Settle for offscreen Arabic glyph runs to apply.
  await new Promise((r) => setTimeout(r, 150));

  const pageNodes: HTMLElement[] = Array.from(
    mountEl.querySelectorAll("[data-report-page]")
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
    const imgData = canvas.toDataURL("image/jpeg", 0.82);
    let w = pageW;
    let h = (canvas.height * w) / canvas.width;
    if (h > pageH) {
      h = pageH;
      w = (canvas.width * h) / canvas.height;
    }
    const x = (pageW - w) / 2;
    const y = 0;
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", x, y, w, h);
  }

  downloadBlob(pdf.output("blob"), fileName);
}

export default exportReportPdf;