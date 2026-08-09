/**
 * The mic badge with the cyan pulse ring.
 *
 * One component, two callers: the Voice Overview readiness header and the
 * Voice DNA strength bar. The keyframes live here so the badge is
 * self-contained and can never fall out of sync with a page-level style block.
 * `prefers-reduced-motion` stops the ring.
 */
import { Mic } from "lucide-react";

const CYAN = "#00CEC9";

export default function VoiceMicBadge({ size = 52 }: { size?: number }) {
  return (
    <>
      <style>{`
        @keyframes voiceMicPulse { 0% { transform: scale(.9); opacity: .9 } 100% { transform: scale(1.25); opacity: 0 } }
        .voice-mic::after {
          content: ""; position: absolute; inset: -1px; border-radius: 50%;
          border: 1px solid rgba(0,206,201,.5); animation: voiceMicPulse 2.6s infinite ease-out;
        }
        @media (prefers-reduced-motion: reduce) { .voice-mic::after { animation: none !important; } }
      `}</style>
      <div
        className="voice-mic"
        aria-hidden
        style={{
          position: "relative", inlineSize: size, blockSize: size, borderRadius: "50%", flex: "0 0 auto",
          background: "rgba(0,206,201,.10)", border: "1px solid rgba(0,206,201,.28)",
          display: "grid", placeItems: "center",
        }}
      >
        <Mic size={Math.round(size * 0.42)} color={CYAN} strokeWidth={1.7} fill="none" />
      </div>
    </>
  );
}