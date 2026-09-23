/**
 * Shared guards for the opportunity engine.
 *
 * A directory is not a chair. These two checks are used by the reader
 * (before a record is written) and by the judge (before a model is called),
 * so the same page can never slip in through the other door.
 */

/** A bare host root, or one path segment with no id/slug, is an index page. */
export function isRootishUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/^https?:/i.test(url)) return false; // urn:aura:… records have no page
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return true;
  if (segs.length > 1) return false;
  const seg = decodeURIComponent(segs[0]);
  // one segment: an id or a slug of several words is a detail page
  if (/\d{3,}/.test(seg)) return false;
  if (/[-_]/.test(seg) && seg.length >= 12) return false;
  return true;
}

/** Wording that describes many things at once rather than one chair. */
export const AGGREGATOR_RE =
  /calendar|directory|listing|aggregator|newsroom|news\s*index|about\s*us|\d{2,}\+?\s*(events|summits|roles|conferences|exhibitions)|جميع الفعاليات|دليل|الأخبار|من نحن/i;

export function isAggregatorText(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ");
  return !!text && AGGREGATOR_RE.test(text);
}

/** True when this candidate is an index page rather than one opportunity. */
export function isAggregator(
  url: string | null | undefined,
  ...text: Array<string | null | undefined>
): boolean {
  return isRootishUrl(url) || isAggregatorText(...text);
}

/**
 * One normal form for both sides of the quote test: markdown and punctuation
 * removed, whitespace collapsed, Latin lowercased, Arabic letter forms unified.
 */
export function normaliseForQuote(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[*_#\\|>`\[\]()«»"'’‘“”,]/g, " ")
    .replace(/[\u0640]/g, "")                 // tatweel
    .replace(/[\u064B-\u0652\u0670]/g, "")    // tashkeel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A job board is not a directory. A board record that carries a way in — an
 * apply link, the employer's own site, a form or contact details — is one
 * chair and must not be dropped as an index page. Every other record is
 * judged exactly as before.
 */
export function isAggregatorFor(
  discoveryKind: string | null | undefined,
  hasRoute: boolean,
  url: string | null | undefined,
  ...text: Array<string | null | undefined>
): boolean {
  if (discoveryKind === "job_board" && hasRoute) return false;
  return isAggregator(url, ...text);
}
