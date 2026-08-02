/**
 * Keys for matching one LinkedIn post to another across sources.
 *
 * The same post arrives with three different identifiers depending on where
 * it came from: a full `/posts/handle_slug-ugcPost-7479109979350712320-7XWq`
 * URL from analytics sync, a `urn:li:share:7354822545990205441` link from the
 * official data export, and a bare activity URL from the browser extension.
 * The one thing they share is the numeric activity id.
 */

/** The numeric activity/share/ugcPost id inside any LinkedIn post URL or URN. */
export function activityId(value?: string | null): string | null {
  if (!value) return null;
  const ids = String(value).match(/\d{15,25}/g);
  return ids && ids.length ? ids[ids.length - 1] : null;
}

/** Canonical form of a post URL for equality checks. */
export function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return v.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Words carried in the URL slug (`..._digital-transformation-is-not-...`).
 * Rows synced from analytics have no text, so the slug is the only content
 * signal available for a fuzzy same-day match.
 */
export function slugTokens(url?: string | null): string[] {
  if (!url) return [];
  let path = String(url);
  try { path = new URL(url).pathname; } catch { /* already a path */ }
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  const slug = decodeURIComponent(seg).split("_").slice(1).join("_")
    .replace(/-(?:ugcpost|share|activity)-\d{15,25}.*$/i, "");
  return slug.split(/[-_]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3 && !/^\d+$/.test(w));
}

/** Comparable words from post body text. */
export function textTokens(text?: string | null): Set<string> {
  if (!text) return new Set();
  return new Set(
    String(text).toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** UTC calendar day, for date-based matching. */
export function dayKey(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Arabic if a meaningful share of the letters are Arabic, else English. */
export function scriptOf(text: string): "ar" | "en" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? "ar" : "en";
}