/**
 * The slim header carried by every screen in the journey: a way back, the
 * mark, and one quiet way out that keeps everything already saved.
 */
import { ArrowLeft } from "lucide-react";
import { OB } from "./tokens";

const JourneyHeader = ({ onNight = false, onExit, onBack }: {
  onNight?: boolean; onExit: () => void; onBack?: () => void;
}) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    inlineSize: "100%", marginBlockEnd: 18,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back one step"
          className="ob-btn ob-btn-tertiary"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, color: onNight ? OB.mutedNight : OB.muted }}
        >
          <ArrowLeft size={15} aria-hidden /> Back
        </button>
      ) : null}
      <span
      aria-label="Aura"
      style={{
        fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, fontSize: 13,
        letterSpacing: "0.14em", color: onNight ? "#FFFFFF" : "#0F1519", padding: 2,
      }}
    >
      AURA
    </span>
    </div>
    <button
      type="button"
      onClick={onExit}
      className="ob-btn ob-btn-tertiary"
      style={{ color: onNight ? OB.mutedNight : OB.muted }}
    >
      Finish later
    </button>
  </div>
);

export default JourneyHeader;
