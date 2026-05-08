import html2canvas from 'html2canvas';

const CARD_W = 1080;
const CARD_H = 1350;

const CARD_FONT_LINKS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap',
];

function hasArabic(s: string | null | undefined): boolean {
  return !!s && /[\u0600-\u06FF]/.test(s);
}

/**
 * Export a Branded Card to PNG using a hidden iframe with isolated font loading.
 * This is the proven pattern that fixes Arabic shaping in exported PNGs:
 *   - clone the card into an iframe with its own document
 *   - load Cairo + brand fonts there
 *   - await iframeDoc.fonts.ready + a small settle delay
 *   - rasterize via html2canvas in the iframe context
 */
export async function exportCardAsPng(
  cardElement: HTMLElement,
  _filename: string = 'aura-card.png',
  opts: { language?: 'en' | 'ar' } = {}
): Promise<Blob | null> {
  const language: 'en' | 'ar' =
    opts.language ?? ((cardElement.getAttribute('dir') === 'rtl' ? 'ar' : 'en'));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    `position:fixed;left:-99999px;top:-99999px;width:${CARD_W}px;height:${CARD_H}px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);

  try {
    // Some browsers need a tick before contentDocument is writable.
    await new Promise((r) => setTimeout(r, 0));
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('iframe document unavailable');

    doc.open();
    doc.write(`<!doctype html><html dir="${language === 'ar' ? 'rtl' : 'ltr'}" lang="${language}"><head>
<meta charset="utf-8"/>
${CARD_FONT_LINKS.map((href) => `<link rel="stylesheet" href="${href}" crossorigin="anonymous"/>`).join('\n')}
<style>
  html,body{margin:0;padding:0;background:transparent;}
  body{width:${CARD_W}px;height:${CARD_H}px;overflow:hidden;}
  /* Force Cairo on Arabic exports so RTL shaping is correct in the raster. */
  body[dir="rtl"], body[dir="rtl"] *{font-family:'Cairo','DM Sans',sans-serif !important;}
</style>
</head><body dir="${language === 'ar' ? 'rtl' : 'ltr'}"></body></html>`);
    doc.close();

    // Clone the card into the iframe.
    const clone = cardElement.cloneNode(true) as HTMLElement;
    // Ensure cloned root carries the right direction.
    clone.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    if (language === 'ar') {
      clone.style.direction = 'rtl';
      // Force Cairo on the clone root and EVERY descendant. The CSS rule in
      // the iframe handles most cases, but inline style font-family declarations
      // on nested spans/headings win over the stylesheet — so we override them
      // directly here. This is what fixes Stat/Comparison column headers and
      // the small top "tag" label rendering as garbled Arabic.
      const FONT_STACK = "'Cairo','DM Sans',sans-serif";
      clone.style.fontFamily = FONT_STACK;
      const all = clone.querySelectorAll<HTMLElement>('*');
      all.forEach((el) => {
        try {
          el.style.fontFamily = FONT_STACK;
          // Also strip any letter-spacing that would break Arabic shaping.
          if (el.style.letterSpacing) el.style.letterSpacing = 'normal';
        } catch { /* ignore */ }
      });
    }
    doc.body.appendChild(clone);

    // Wait for fonts.
    try {
      // @ts-ignore — FontFaceSet on iframe document
      if (doc.fonts?.ready) await doc.fonts.ready;
    } catch { /* ignore */ }
    // Settle delay so freshly-loaded Arabic glyph runs are applied.
    await new Promise((r) => setTimeout(r, language === 'ar' ? 600 : 250));

    const canvas = await html2canvas(clone, {
      width: CARD_W,
      height: CARD_H,
      windowWidth: CARD_W,
      windowHeight: CARD_H,
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 0,
      letterRendering: true,
    } as any);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  } catch (err) {
    console.error('Card export failed:', err);
    return null;
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
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
  const t = stripMarkdown(s).trim();
  if (t.length <= max) return t;
  // Truncate at last sentence boundary or word, never mid-word
  const cut = t.slice(0, max - 1);
  const lastPunct = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('؟ '));
  if (lastPunct > max * 0.5) return cut.slice(0, lastPunct + 1) + '…';
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/** Strip Markdown syntax so cards never show raw #, **, *, `, list prefixes. */
export function stripMarkdown(s: string): string {
  if (!s) return '';
  return s
    // Strip format-label prefixes the model sometimes emits as the first line
    .replace(/^\s*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST|بوست)\s*[:：\-—]?\s*/i, '')
    .replace(/```[\s\S]*?```/g, ' ')          // code fences
    .replace(/`([^`]+)`/g, '$1')              // inline code
    .replace(/^#{1,6}\s+/gm, '')              // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')          // bold
    .replace(/\*(.+?)\*/g, '$1')              // italic
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/^\s*-{3,}\s*$/gm, '')           // horizontal rules ---
    .replace(/^\s*[-*•◆↳►▶➤]\s+/gm, '')      // bullet markers (incl. Arabic decorative)
    .replace(/^\s*\d+[.)]\s+/gm, '')          // numbered list markers
    .replace(/^\s*\.?[\u0621-\u064A]\.\s+/gm, '') // Arabic single-letter prefix: "ا." or ".ا."
    .replace(/^\s*[\u0660-\u0669]+[.)]\s+/gm, '') // Arabic-Indic numbered list markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Heuristic data-point extraction from raw post text. */
export function extractDataPoints(text: string): { items: { label: string; value?: string }[] } | undefined {
  if (!text) return undefined;
  // Operate on the raw text first so we can detect bullet/numbered markers
  // BEFORE stripMarkdown removes them.
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const bulletItems: string[] = [];
  for (const line of rawLines) {
    const cleanLine = line
      .replace(/^\s*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST)\s*[:：\-—]?\s*/i, '')
      .trim();
    if (!cleanLine) continue;
    // Numbered (Arabic-Indic or Latin) or bullet markers (◆ ↳ • - * ►)
    const m = cleanLine.match(/^(?:[\d]+|[١٢٣٤٥٦٧٨٩])[.)\-]\s*(.+)/)
      || cleanLine.match(/^[◆↳►▶➤•\-*]\s+(.+)/);
    if (m && m[1] && m[1].length > 5) {
      bulletItems.push(m[1]);
    }
  }
  if (bulletItems.length >= 2) {
    return { items: bulletItems.slice(0, 6).map(s => ({ label: trunc(stripMarkdown(s), 80) })) };
  }
  text = stripMarkdown(text);
  // Fallback: pick the first 3-5 short standalone sentences/lines
  const sentences = text.split(/(?<=[.!?؟])\s+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 140);
  if (sentences.length >= 3) {
    return { items: sentences.slice(0, 4).map(s => ({ label: trunc(s, 80) })) };
  }
  return undefined;
}

export function extractStat(text: string): { value: string; label: string } | null {
  if (!text) return null;
  const clean = stripMarkdown(text);
  const pct = clean.match(/(\d{1,3}(?:\.\d+)?)\s*[%٪]/);
  if (pct) {
    const idx = clean.indexOf(pct[0]);
    const ctx = clean.slice(Math.max(0, idx - 60), idx + pct[0].length + 60).trim();
    return { value: `${pct[1]}%`, label: trunc(ctx, 80) };
  }
  // Arabic-Indic numerals with optional Arabic percent
  const arPct = clean.match(/([\u0660-\u0669]{1,3}(?:[.,][\u0660-\u0669]+)?)\s*[٪%]/);
  if (arPct) {
    const idx = clean.indexOf(arPct[0]);
    const ctx = clean.slice(Math.max(0, idx - 60), idx + arPct[0].length + 60).trim();
    return { value: `${arPct[1]}٪`, label: trunc(ctx, 80) };
  }
  const money = clean.match(/\$\s?\d+(?:[.,]\d+)?\s?(?:M|B|K|million|billion)?/i);
  if (money) return { value: money[0].replace(/\s+/g, ''), label: 'value' };
  const big = clean.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d{2,}x|\d+\.\d+x)\b/i);
  if (big) return { value: big[1], label: 'metric' };
  // Arabic-Indic large number
  const arBig = clean.match(/([\u0660-\u0669]{2,}(?:[.,][\u0660-\u0669]{3})*)/);
  if (arBig) return { value: arBig[1], label: 'metric' };
  return null;
}

/** Extract a single bold/quote-style insight line. */
export function extractInsight(text: string): string {
  const clean = stripMarkdown(text);
  // Prefer a sentence that was originally bolded
  const bold = text.match(/\*\*([^*]{20,160})\*\*/);
  if (bold) return stripMarkdown(bold[1]).trim();
  // Skip lines that are obviously meta-labels or hashtags
  const sentences = clean
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 220)
    .filter(s => !/^#/.test(s))
    .filter(s => !/^(منشور\s*LinkedIn|LinkedIn\s*Post|POST)/i.test(s));
  return sentences[0] || clean.slice(0, 140);
}

/** Extract a question from the text — prefer the closing question. */
export function extractQuestion(text: string): string | null {
  const clean = stripMarkdown(text);
  const matches = clean.match(/[^.!?؟\n]{15,200}[?؟]/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].trim();
}

/** Extract a contrast/comparison pair. */
export function extractComparison(text: string): { left: string; right: string } | null {
  const clean = stripMarkdown(text);
  // "X vs Y", "X not Y", "instead of X", "from X to Y"
  const vs = clean.match(/([A-Z][^.!?\n]{8,80})\s+(?:vs\.?|versus)\s+([A-Z]?[^.!?\n]{8,80})/i);
  if (vs) return { left: vs[1].trim(), right: vs[2].trim() };
  const fromTo = clean.match(/from\s+([^.!?\n]{8,80})\s+to\s+([^.!?\n]{8,80})/i);
  if (fromTo) return { left: fromTo[1].trim(), right: fromTo[2].trim() };
  const notBut = clean.match(/not\s+([^.!?,\n]{8,80}),?\s+but\s+([^.!?,\n]{8,80})/i);
  if (notBut) return { left: notBut[1].trim(), right: notBut[2].trim() };
  return null;
}

/** Pick content per card type from raw post text. */
export function deriveContentForType(
  text: string,
  cardType: string,
  language: 'en' | 'ar' = 'en'
): { headline: string; body?: string } {
  const arrow = language === 'ar' ? '←' : '→';
  const clean = stripMarkdown(text);
  switch (cardType) {
    case 'insight': {
      const insight = extractInsight(text);
      // Insight card: ONE strong statement only — no body dump.
      return { headline: trunc(insight, 160) };
    }
    case 'stat': {
      const s = extractStat(text);
      const insight = extractInsight(text);
      return { headline: trunc(insight, 120), body: s?.label && s.label !== 'percent' && s.label !== 'metric' && s.label !== 'value' ? trunc(s.label, 200) : undefined };
    }
    case 'question': {
      const q = extractQuestion(text);
      if (q) return { headline: trunc(q, 180), body: undefined };
      return { headline: trunc(extractInsight(text), 160), body: undefined };
    }
    case 'comparison': {
      const c = extractComparison(text);
      if (c) return { headline: `${trunc(c.left, 60)}  ${arrow}  ${trunc(c.right, 60)}`, body: trunc(extractInsight(text), 200) };
      return { headline: trunc(extractInsight(text), 140), body: trunc(clean.slice(0, 200), 220) };
    }
    case 'equation': {
      const c = extractComparison(text);
      if (c) return { headline: `${trunc(c.left, 40)} ${arrow} ${trunc(c.right, 40)}`, body: undefined };
      return { headline: trunc(extractInsight(text), 120), body: undefined };
    }
    case 'framework':
    case 'principles':
    case 'cycle': {
      const insight = extractInsight(text);
      return { headline: trunc(insight, 120), body: undefined };
    }
    default: {
      const insight = extractInsight(text);
      return { headline: trunc(insight, 140), body: trunc(clean.replace(insight, '').trim(), 220) };
    }
  }
}