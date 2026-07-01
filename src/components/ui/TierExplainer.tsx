import InfoTooltip from "@/components/ui/InfoTooltip";
import { TIER_COPY, TIER_DIP_NOTE } from "@/constants/tierCopy";
import type { TierKey } from "@/hooks/useTierFromImprint";

interface TierExplainerProps {
  tierKey: TierKey | null | undefined;
  tierName?: string | null;
  side?: "top" | "bottom";
  triggerSize?: number;
  align?: "center" | "left" | "right";
}

/**
 * TierExplainer — a small info marker that explains the user's CURRENT stage:
 * what it means, how they reached it, what lifts them, and how a dip is handled.
 * Thin wrapper over InfoTooltip so it matches every other tooltip in the app.
 */
export default function TierExplainer({
  tierKey,
  tierName,
  side = "top",
  triggerSize = 13,
  align = "center",
}: TierExplainerProps) {
  if (!tierKey) return null;
  const copy = TIER_COPY[tierKey];
  if (!copy) return null;
  const name = tierName || tierKey.charAt(0).toUpperCase() + tierKey.slice(1);

  return (
    <InfoTooltip
      label={`${name} — what this stage means`}
      side={side}
      triggerSize={triggerSize}
      align={align}
      width={280}
    >
      <div style={{ marginBottom: 10, lineHeight: 1.5 }}>{copy.meaning}</div>
      <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
        <strong>How you reached it.</strong> {copy.howReached}
      </div>
      <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
        <strong>What lifts you.</strong> {copy.whatLifts}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          marginTop: 8,
          borderTop: "1px solid var(--rule)",
          paddingTop: 8,
          lineHeight: 1.5,
        }}
      >
        {TIER_DIP_NOTE}
      </div>
    </InfoTooltip>
  );
}
