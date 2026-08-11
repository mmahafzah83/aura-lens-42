/**
 * AuraFace — the 96px orb that appears on NIGHT screens only.
 * It is the signal that Aura is working and the member does nothing.
 */
import { OB } from "./tokens";

const CSS = `
@keyframes af-float{0%,100%{transform:translateY(-8px)}50%{transform:translateY(8px)}}
@keyframes af-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes af-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
.af-wrap{animation:af-float 4s cubic-bezier(.22,1,.36,1) infinite;}
.af-ring{animation:af-spin 14s linear infinite;}
.af-eye{animation:af-blink 4.4s cubic-bezier(.22,1,.36,1) infinite;transform-origin:center;}
@media (prefers-reduced-motion:reduce){
  .af-wrap,.af-ring,.af-eye{animation:none !important;}
}
`;

const AuraFace = ({ size = 96 }: { size?: number | string }) => (
  <div
    aria-hidden
    style={{ inlineSize: size, blockSize: size, position: "relative", margin: "0 auto" }}
  >
    <style>{CSS}</style>
    <div className="af-wrap" style={{ inlineSize: "100%", blockSize: "100%", position: "relative" }}>
      <div
        className="af-ring"
        style={{
          position: "absolute", inset: -10, borderRadius: "50%",
          border: `1.5px dashed ${OB.cyan}`, opacity: 0.55,
        }}
      />
      <div
        style={{
          inlineSize: "100%", blockSize: "100%", borderRadius: "50%",
          background: `radial-gradient(circle at 34% 28%, ${OB.cyan}, ${OB.blue} 72%)`,
          boxShadow: `0 18px 44px -18px ${OB.blue}`,
          position: "relative",
        }}
      >
        <svg viewBox="0 0 96 96" style={{ position: "absolute", inset: 0, inlineSize: "100%", blockSize: "100%" }}>
          <ellipse className="af-eye" cx="36" cy="42" rx="4.4" ry="6" fill="#FFFFFF" />
          <ellipse className="af-eye" cx="60" cy="42" rx="4.4" ry="6" fill="#FFFFFF" />
          <path d="M34 60 Q48 70 62 60" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity="0.92" />
        </svg>
      </div>
    </div>
  </div>
);

export default AuraFace;