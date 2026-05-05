import html2canvas from 'html2canvas';

export async function exportCardAsPng(
  cardElement: HTMLElement,
  _filename: string = 'aura-card.png'
): Promise<Blob | null> {
  try {
    const canvas = await html2canvas(cardElement, {
      width: 1080,
      height: 1350,
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  } catch (err) {
    console.error('Card export failed:', err);
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