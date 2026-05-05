/**
 * Unified confidence formula for all signal detection pipelines.
 * Formula: AI_base × 0.40 + fragment_depth × 0.35 + org_diversity × 0.15 + recency × 0.10
 *
 * Used by both detect-signals-v2 (per-capture) and detect-patterns (batch)
 * to guarantee identical scoring regardless of pipeline.
 */
export function calcConfidence(
  aiBaseScore: number,
  fragmentCount: number,
  uniqueOrgCount: number,
  newestFragmentDate: string,
): number {
  const aiClamped = Math.min(1, Math.max(0, aiBaseScore));
  // Logarithmic depth: 1=>0, 3=>~0.48, 5=>~0.72, 10+=>~0.96
  const depthScore = Math.min(1.0, Math.log(Math.max(1, fragmentCount) + 1) / Math.log(12));
  const diversityScore = Math.min(1.0, Math.max(0, uniqueOrgCount) / 5);
  const daysSince = Math.max(0, (Date.now() - new Date(newestFragmentDate).getTime()) / 86400000);
  const recencyScore = Math.exp(-0.0116 * daysSince); // half-life ~60 days
  const confidence = (aiClamped * 0.40) + (depthScore * 0.35) + (diversityScore * 0.15) + (recencyScore * 0.10);
  return Math.max(0.0, Math.min(1.0, confidence));
}

export function buildConfidenceExplanation(
  aiBaseScore: number,
  fragmentCount: number,
  uniqueOrgCount: number,
  newestFragmentDate: string,
): { confidence: number; confidence_explanation: string } {
  const aiClamped = Math.min(1, Math.max(0, aiBaseScore));
  const depthScore = Math.min(1.0, Math.log(Math.max(1, fragmentCount) + 1) / Math.log(12));
  const diversityScore = Math.min(1.0, Math.max(0, uniqueOrgCount) / 5);
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(newestFragmentDate).getTime()) / 86400000));
  const recencyScore = Math.exp(-0.0116 * daysSince);
  const aiC = aiClamped * 0.40;
  const depthC = depthScore * 0.35;
  const divC = diversityScore * 0.15;
  const recC = recencyScore * 0.10;
  const confidence = Math.max(0.0, Math.min(1.0, aiC + depthC + divC + recC));
  const srcLabel = uniqueOrgCount === 1 ? "organisation" : "organisations";
  const ageLabel = daysSince === 0 ? "today" : `${daysSince} days ago`;
  const confidence_explanation =
    `AI ${(aiClamped * 100).toFixed(0)}%, ${fragmentCount} fragments, ${uniqueOrgCount} ${srcLabel}, newest ${ageLabel}. ` +
    `Formula: (${aiC.toFixed(2)} AI) + (${depthC.toFixed(2)} depth) + (${divC.toFixed(2)} diversity) + (${recC.toFixed(2)} recency) = ${confidence.toFixed(2)}.`;
  return { confidence, confidence_explanation };
}