/**
 * PNG + PDF export for the carousel renderer.
 *
 * THE RULE: preview and export are the SAME DOM. This module never renders a
 * deck. It is handed the slide nodes that are already on screen, waits for the
 * bundled fonts and the fit ladder, inlines images onto those same nodes, and
 * captures them. There is no hidden clone and no export-time re-render, so
 * "looked right, exported wrong" has nowhere to live.
 */
import { CANVAS_H, CANVAS_W } from "./Slide";
import { ensureCarouselFonts } from "./fontsReady";
import { inlineImages } from "./inlineImages";

export interface ExportResult {
  slides: number;
  maxFitStep: number;
  durationMs: number;
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Slide nodes, in deck order, from a mounted container. */
export function collectSlideNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-slide-root]")).sort(
    (a, b) => Number(a.dataset.slideRoot) - Number(b.dataset.slideRoot),
  );
}

export function maxFitStep(nodes: HTMLElement[]): number {
  return nodes.reduce((m, n) => Math.max(m, Number(n.dataset.fit ?? 0)), 0);
}

/**
 * Captures the mounted slides, sequentially. Parallel canvas work in a single
 * tab intermittently yields blank frames, so this is deliberately serial.
 */
async function captureAll(nodes: HTMLElement[]): Promise<HTMLCanvasElement[]> {
  if (nodes.length === 0) throw new Error("Nothing to export: no slides are mounted.");

  const { default: html2canvas } = await import("html2canvas");

  // Fonts first — measuring or rasterising against fallback metrics is the
  // exact trap the fit ladder already guards against, and it would hit the
  // export identically. document.fonts.ready alone is NOT sufficient: it can
  // settle before these faces are ever requested.
  await ensureCarouselFonts();
  // One frame so any fit-ladder escalation has committed to the DOM.
  await nextFrame();

  const canvases: HTMLCanvasElement[] = [];
  for (const node of nodes) {
    await inlineImages(node);
    const canvas = await html2canvas(node, {
      width: CANVAS_W,
      height: CANVAS_H,
      windowWidth: CANVAS_W,
      windowHeight: CANVAS_H,
      scale: 1,
      backgroundColor: null, // the theme paints its own background
      useCORS: true,
      logging: false,
    });
    if (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H) {
      throw new Error(
        `Slide ${node.dataset.slideRoot}: captured ${canvas.width}x${canvas.height}, expected ${CANVAS_W}x${CANVAS_H}.`,
      );
    }
    canvases.push(canvas);
  }
  return canvases;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))), "image/png"),
  );
}

/**
 * One PDF, one slide per page, page box exactly 1080 x 1350pt — the shape
 * LinkedIn accepts as a document post. Any slide failing aborts everything;
 * a 6-of-7 carousel is worse than no carousel.
 */
export async function exportDeckPdf(nodes: HTMLElement[], filename: string): Promise<ExportResult> {
  const t0 = performance.now();
  const canvases = await captureAll(nodes);
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: [CANVAS_W, CANVAS_H], orientation: "portrait" });
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage([CANVAS_W, CANVAS_H], "portrait");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, CANVAS_W, CANVAS_H);
  });
  download(pdf.output("blob"), filename);
  return { slides: canvases.length, maxFitStep: maxFitStep(nodes), durationMs: Math.round(performance.now() - t0) };
}

/** The same capture, delivered as individual PNGs in a zip. */
export async function exportDeckPngs(nodes: HTMLElement[], filename: string): Promise<ExportResult> {
  const t0 = performance.now();
  const canvases = await captureAll(nodes);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (let i = 0; i < canvases.length; i++) {
    zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, await toBlob(canvases[i]));
  }
  download(await zip.generateAsync({ type: "blob" }), filename);
  return { slides: canvases.length, maxFitStep: maxFitStep(nodes), durationMs: Math.round(performance.now() - t0) };
}
