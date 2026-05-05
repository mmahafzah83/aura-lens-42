import html2canvas from 'html2canvas';

export async function exportCardAsPng(
  cardElement: HTMLElement,
  _filename: string = 'aura-card.png'
): Promise<Blob | null> {
  try {
    const canvas = await html2canvas(cardElement, {
      width: 1080,
      height: 1350,
      scale: 3,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 0,
      letterRendering: true,
    } as any);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  } catch (err) {
    console.error('Card export failed:', err);
    return null;
  }
}

/**
 * High-fidelity SVG → PNG export. Rasterizes the SVG at a configurable scale
 * so text and vector strokes stay crisp at 4K-class resolutions.
 */
export async function exportSvgAsPng(
  svgElement: SVGSVGElement,
  opts: { scale?: number; width?: number; height?: number; background?: string | null } = {}
): Promise<Blob | null> {
  try {
    const scale = opts.scale ?? 3;
    const vb = svgElement.viewBox?.baseVal;
    const w = opts.width ?? vb?.width ?? svgElement.clientWidth ?? 1080;
    const h = opts.height ?? vb?.height ?? svgElement.clientHeight ?? 1350;

    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob(
      ['<?xml version="1.0" encoding="UTF-8"?>\n', svgString],
      { type: 'image/svg+xml;charset=utf-8' }
    );
    const url = URL.createObjectURL(svgBlob);

    try {
      if ((document as any).fonts?.ready) {
        try { await (document as any).fonts.ready; } catch {}
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG image load failed'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (opts.background) {
        ctx.fillStyle = opts.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, w, h);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('SVG export failed:', err);
    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** JS truncation — never use CSS line-clamp for cards (html2canvas would still capture overflow). */
export function trunc(s: string, max: number): string {
  if (!s) return '';
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

/** Heuristic data-point extraction from raw post text. */
export function extractDataPoints(text: string): { items: { label: string; value?: string }[] } | undefined {
  if (!text) return undefined;
  // Numbered lists: "1. foo" / "1) foo" / Arabic-Indic ١. ٢.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const numbered: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:\d+|[١٢٣٤٥٦٧٨٩])[.)\-]\s*(.+)/);
    if (m) numbered.push(m[1]);
  }
  if (numbered.length >= 2) {
    return { items: numbered.slice(0, 6).map(s => ({ label: trunc(s, 80) })) };
  }
  return undefined;
}

export function extractStat(text: string): { value: string; label: string } | null {
  if (!text) return null;
  const pct = text.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (pct) return { value: `${pct[1]}%`, label: 'percent' };
  const big = text.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d{2,}x|\d+\.\d+x)\b/i);
  if (big) return { value: big[1], label: 'metric' };
  return null;
}