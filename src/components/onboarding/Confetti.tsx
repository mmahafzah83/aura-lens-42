/**
 * Confetti — six pieces, 3.4s, and it happens exactly once in the whole
 * journey (screen 12). Reduced motion removes it entirely.
 */
import { OB } from "./tokens";

const CSS = `
@keyframes cf-fall{
  0%{transform:translateY(-12vh) rotate(0deg);opacity:0}
  10%{opacity:1}
  100%{transform:translateY(96vh) rotate(540deg);opacity:0}
}
.cf-p{position:absolute;top:0;inline-size:9px;block-size:14px;border-radius:2px;animation:cf-fall 3.4s cubic-bezier(.22,1,.36,1) forwards;}
@media (prefers-reduced-motion:reduce){ .cf-wrap{display:none !important;} }
`;

const PIECES = [
  { left: "12%", delay: "0ms", color: OB.cyan },
  { left: "27%", delay: "220ms", color: OB.blue },
  { left: "44%", delay: "90ms", color: OB.amber },
  { left: "61%", delay: "380ms", color: OB.blueLight },
  { left: "76%", delay: "160ms", color: OB.cyan },
  { left: "89%", delay: "300ms", color: OB.blue },
];

const Confetti = () => (
  <div
    className="cf-wrap"
    aria-hidden
    style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}
  >
    <style>{CSS}</style>
    {PIECES.map((p, i) => (
      <span key={i} className="cf-p" style={{ left: p.left, background: p.color, animationDelay: p.delay }} />
    ))}
  </div>
);

export default Confetti;