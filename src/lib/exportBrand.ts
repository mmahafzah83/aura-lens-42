/**
 * Single source of truth for footer branding on PNG exports
 * (TierCredentialCard + MilestoneShareModal).
 *
 * Exports rasterize via html2canvas inside an isolated iframe that cannot
 * read CSS variables — colors and font families MUST be literal constants.
 */

/** System-B action blue — the one accent on every export. Literal by design:
 *  html2canvas rasterises in an iframe that cannot read CSS variables. */
export const EXPORT_ACTION = "#0670C4";

/** Brand line (URL) — same on every export. */
export const EXPORT_URL = "aura-intel.org";

/** Tagline copy — bilingual. */
export const EXPORT_TAGLINE_EN = "Personal Intelligence System";
export const EXPORT_TAGLINE_AR = "نظام ذكاء شخصي";

/**
 * Arabic font stack used by the working visual-card / carousel export
 * pipeline (see src/components/visual-cards/exportCard.ts). Cairo is
 * preloaded inside the export iframe, so reusing this exact stack keeps
 * the AR tagline shaped (joined letters, RTL) in the raster.
 */
export const EXPORT_AR_FONT = "'Cairo','DM Sans',sans-serif";

/** Footer typography — kept above the 11px AA-legibility threshold. */
export const EXPORT_FOOTER_SIZE_BRAND = 12;   // URL / brand line
export const EXPORT_FOOTER_SIZE_TAGLINE = 11; // EN + AR taglines