/**
 * Single source of truth for footer branding on PNG exports
 * (TierCredentialCard + MilestoneShareModal).
 *
 * Exports rasterize via html2canvas inside an isolated iframe that cannot
 * read CSS variables — colors and font families MUST be literal constants.
 */

/** Dark-mode gold — legible on the dark export background (AA pass on #0c0b0a / #111118). */
export const EXPORT_GOLD = "#D4B056";

/** Brand line (URL) — same on every export. */
export const EXPORT_URL = "aura-intel.org";

/** Tagline copy — bilingual. */
export const EXPORT_TAGLINE_EN = "Turns your expertise into presence";
export const EXPORT_TAGLINE_AR = "حوّل خبرتك إلى حضور";

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