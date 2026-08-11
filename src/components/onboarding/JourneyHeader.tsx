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
    <img
      src="/aura-mark.svg"
      alt="Aura"
      width={22}
      height={22}
      style={{ display: "block", color: onNight ? "#FFFFFF" : OB.blue, filter: onNight ? "invert(1) brightness(2)" : undefined }}
    />
    <button
      type="button"
      onClick={onExit}
      className="ob-btn ob-btn-tertiary"
      style={{ color: onNight ? OB.mutedNight : OB.muted }}
    >
      Save &amp; exit
    </button>
  </div>
);

export default JourneyHeader;
