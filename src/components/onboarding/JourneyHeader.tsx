/**
 * The slim header carried by every screen in the journey: the mark, and one
 * quiet way out that keeps everything already saved.
 */
import { OB } from "./tokens";
import AuraLogo from "@/components/brand/AuraLogo";

const JourneyHeader = ({ onNight = false, onExit }: { onNight?: boolean; onExit: () => void }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    inlineSize: "100%", marginBlockEnd: 18,
  }}>
    <span style={{ display: "inline-flex", alignItems: "center", padding: 2 }} aria-label="Aura">
      <AuraLogo size={26} variant={onNight ? "dark" : "light"} title="Aura" />
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
