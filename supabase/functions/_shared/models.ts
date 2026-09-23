/**
 * ONE SOURCE OF TRUTH FOR THE MODEL.
 *
 * Founder ruling: every call through the Lovable AI gateway uses the standard
 * model. The model is a policy value, never a literal in a function body, and
 * an expensive model cannot be reintroduced by accident: anything outside the
 * allow-list falls back to the standard and says so in the log.
 */

export const MODEL_STANDARD = "google/gemini-3-flash-preview";

export const ALLOWED_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
];

/**
 * The model for a stage, read from the active policy row.
 *   params.models[stage] → params.models.default → MODEL_STANDARD
 * A value outside ALLOWED_MODELS is refused, not obeyed.
 */
export function modelFor(stage: string, policyParams?: any): string {
  const wanted =
    policyParams?.models?.[stage] ??
    policyParams?.models?.default ??
    MODEL_STANDARD;

  if (typeof wanted === "string" && ALLOWED_MODELS.includes(wanted)) return wanted;

  console.warn(
    `[models] refused model "${String(wanted)}" for stage "${stage}" — not in the allow-list; using ${MODEL_STANDARD}`,
  );
  return MODEL_STANDARD;
}
