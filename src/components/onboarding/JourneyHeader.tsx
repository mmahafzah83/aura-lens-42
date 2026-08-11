/**
 * The slim header carried by every screen in the journey: the mark, and one
 * quiet way out that keeps everything already saved.
 */
import { OB } from "./tokens";

const JourneyHeader = ({ onNight = false, onExit }: { onNight?: boolean; onExit: () => void }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    inlineSize: "100%", marginBlockEnd: 18,
  }}>
    <span
      aria-label="Aura"
      style={{
        fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, fontSize: 13,
        letterSpacing: "0.14em", color: onNight ? "#FFFFFF" : "#0F1519", padding: 2,
      }}
    >
      AURA
    </span>
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
