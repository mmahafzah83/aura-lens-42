/**
 * ── F-SWAP no-op ────────────────────────────────────────────────────────
 * System-A tokens (src/index.css) are the single effective source of truth.
 * This hook previously fetched the `design_system` table and wrote tokens
 * onto documentElement at runtime, which would override the theme. The
 * table and its other readers (AmbientOrbs, AdminDesignSystem,
 * AdminExperience, and the email/QA edge functions) are untouched — only
 * this dead frontend fetch was removed.
 *
 * The signature is preserved so the single call site keeps compiling.
 */
export function useDesignTokens(_theme: "dark" | "light") {
  return { tokens: null, loading: false, error: null };
}
