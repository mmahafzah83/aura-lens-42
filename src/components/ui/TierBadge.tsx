import { CSSProperties } from "react";
import { Zap, Leaf, Sprout } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";

export type SignalTier = "live" | "evergreen" | "emerging" | "faded";

const DISPLAYABLE_TIERS = ["live", "evergreen", "emerging"] as const;
type DisplayableTier = (typeof DISPLAYABLE_TIERS)[number];

export interface TierBadgeProps {
  tier: SignalTier | null | undefined;
  /** Hide the explanatory tooltip trigger. Defaults to false (tooltip shown). */
  hideTooltip?: boolean;
  className?: string;
}

const TIER_META: Record<Exclude<SignalTier, "faded">, { label: string; Icon: typeof Zap; varName: string }> = {
  live: { label: "Live", Icon: Zap, varName: "--tier-live" },
  evergreen: { label: "Evergreen", Icon: Leaf, varName: "--tier-evergreen" },
  emerging: { label: "Emerging", Icon: Sprout, varName: "--tier-emerging" },
};

/**
 * Signal lifecycle badge. Renders icon + label tinted via --tier-* CSS vars.
 * Returns null for "faded" — caller decides how to render decay.
 * Uses logical properties (margin-inline-*) so it flips cleanly in RTL.
 */
export function TierBadge({ tier, hideTooltip = false, className }: TierBadgeProps) {
  if (!tier || !DISPLAYABLE_TIERS.includes(tier as DisplayableTier)) return null;
  const meta = TIER_META[tier];
  const { Icon, label, varName } = meta;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 3,
    paddingInline: 8,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.02em",
    fontFamily: "var(--font-body)",
    color: `var(${varName})`,
    background: `var(${varName}-pale)`,
    border: `1px solid var(${varName}-line)`,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={style} aria-label={`Signal tier: ${label}`}>
        <Icon size={11} strokeWidth={2.25} aria-hidden />
        <span>{label}</span>
      </span>
      {!hideTooltip && (
        <InfoTooltip slug={`signal-tier-${tier}`} label={`${label} tier`} triggerSize={14} />
      )}
    </span>
  );
}

export default TierBadge;