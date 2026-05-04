import React from "react";

export type IntelligenceStage = 1 | 2 | 3;

export interface StageInputs {
  brandAssessmentDone: boolean;
  entryCount: number;
  signalCount: number;
  trackedPostCount: number;
}

export const computeIntelligenceStage = ({
  brandAssessmentDone,
  entryCount,
  signalCount,
  trackedPostCount,
}: StageInputs): IntelligenceStage | null => {
  if (!brandAssessmentDone) return null;
  const stage2 = entryCount >= 10 && signalCount >= 3;
  if (stage2 && trackedPostCount >= 3) return 3;
  if (stage2) return 2;
  return 1;
};

const COPY: Record<IntelligenceStage, string> = {
  1: "Derived from your assessment",
  2: "Informed by your intelligence",
  3: "Validated by market response",
};

interface Props {
  stage: IntelligenceStage | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Small "credential" pill that signals how a piece of positioning was derived.
 * Stage 1 — dotted muted, Stage 2 — solid brand outline, Stage 3 — filled brand.
 */
export const IntelligenceStageBadge: React.FC<Props> = ({ stage, className, style }) => {
  if (!stage) return null;
  const base: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 16,
    padding: "4px 12px",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
  let variant: React.CSSProperties = {};
  if (stage === 1) {
    variant = {
      border: "1px dashed var(--ink-5, hsl(var(--muted-foreground)))",
      color: "var(--ink-5, hsl(var(--muted-foreground)))",
      background: "transparent",
    };
  } else if (stage === 2) {
    variant = {
      border: "1px solid var(--brand)",
      color: "var(--brand)",
      background: "transparent",
    };
  } else {
    variant = {
      border: "none",
      color: "#fff",
      background: "var(--brand)",
    };
  }
  return (
    <span className={className} style={{ ...base, ...variant, ...style }}>
      {COPY[stage]}
    </span>
  );
};

export default IntelligenceStageBadge;