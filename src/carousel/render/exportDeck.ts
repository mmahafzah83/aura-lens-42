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

/**
 * The preview shows the 1080x1350 slide through a CSS `scale()` wrapper so it
 * fits on screen. The rasteriser resolves ancestor transforms, so a capture taken
 * through that wrapper lands as a shrunken thumbnail in the corner of the
 * page. We therefore un-scale the wrappers for the duration of the capture and
 * put them back afterwards. This is a display-scale change on the SAME nodes —
 * no clone, no re-render, no second layout of the slide itself, which is
 * already laid out at its true 1080x1350 in every case.
 */
function unscaleForCapture(nodes: HTMLElement[]): () => void {
  const undo: Array<() => void> = [];
  for (const node of nodes) {
    const scaler = node.parentElement;
    if (scaler?.hasAttribute("data-slide-scaler")) {
      const prev = scaler.style.transform;
      scaler.style.transform = "none";
      undo.push(() => { scaler.style.transform = prev; });
    }
    const frame = scaler?.parentElement;
    if (frame?.hasAttribute("data-slide-frame")) {
      const prevW = frame.style.width;
      const prevH = frame.style.height;
      frame.style.width = `${CANVAS_W}px`;
      frame.style.height = `${CANVAS_H}px`;
      undo.push(() => { frame.style.width = prevW; frame.style.height = prevH; });
    }
  }
  return () => undo.forEach((fn) => fn());
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

  // Rasterise through the browser's own layout engine (SVG foreignObject),
  // NOT through a re-implementation of CSS. html2canvas re-derives text
  // baselines from font metrics and placed the Anton hero ~40px below its own
  // highlight block — right on screen, wrong in the PDF. Same class of bug as
  // the font-metrics race: never let the export resolve a metric differently
  // from the preview.
  const { toCanvas, getFontEmbedCSS } = await import("html-to-image");

  // Fonts first — measuring or rasterising against fallback metrics is the
  // exact trap the fit ladder already guards against, and it would hit the
  // export identically. document.fonts.ready alone is NOT sufficient: it can
  // settle before these faces are ever requested.
  await ensureCarouselFonts();
  // One frame so any fit-ladder escalation has committed to the DOM.
  await nextFrame();

  const canvases: HTMLCanvasElement[] = [];
  const restore = unscaleForCapture(nodes);
  try {
    await nextFrame();
    // Resolve the bundled faces to data: URLs once, then reuse for every
    // slide: one deterministic font payload, no per-slide network work.
    const fontEmbedCSS = await getFontEmbedCSS(nodes[0]);
    for (const node of nodes) {
      await inlineImages(node);
      const canvas = await toCanvas(node, {
        width: CANVAS_W,
        height: CANVAS_H,
        pixelRatio: 1,
        cacheBust: false,
        fontEmbedCSS,
      });
      if (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H) {
        throw new Error(
          `Slide ${node.dataset.slideRoot}: captured ${canvas.width}x${canvas.height}, expected ${CANVAS_W}x${CANVAS_H}.`,
        );
      }
      canvases.push(canvas);
    }
  } finally {
    restore();
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
 *
 * The blob form is what direct publishing uploads, so the bytes LinkedIn
 * receives are byte-for-byte the bytes a manual download would have produced.
 */
export async function renderDeckPdfBlob(
  nodes: HTMLElement[],
): Promise<{ blob: Blob; result: ExportResult }> {
  const t0 = performance.now();
  const canvases = await captureAll(nodes);
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: [CANVAS_W, CANVAS_H], orientation: "portrait" });
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage([CANVAS_W, CANVAS_H], "portrait");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, CANVAS_W, CANVAS_H);
  });
  return {
    blob: pdf.output("blob"),
    result: {
      slides: canvases.length,
      maxFitStep: maxFitStep(nodes),
      durationMs: Math.round(performance.now() - t0),
    },
  };
}

export async function exportDeckPdf(nodes: HTMLElement[], filename: string): Promise<ExportResult> {
  const { blob, result } = await renderDeckPdfBlob(nodes);
  download(blob, filename);
  return result;
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
