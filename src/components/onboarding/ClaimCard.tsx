/**
 * ClaimCard — one of the three claims Aura pulled out of the member's first
 * link. Deals in like a card off the top of a deck.
 */
import { OB, SPRING } from "./tokens";

const CSS = `
@keyframes cc-deal{from{opacity:0;transform:translateY(26px) rotate(0deg) scale(.94)}to{opacity:1}}
.cc{animation:cc-deal 600ms cubic-bezier(.34,1.56,.64,1) both;}
@media (prefers-reduced-motion:reduce){ .cc{animation:none !important;opacity:1 !important;} }
`;

const EDGE = [OB.blue, OB.cyan, OB.amber];
const TILT = ["-3deg", "1.6deg", "-1deg"];

interface Props {
  index: number;
  title: string;
  content?: string | null;
}

const ClaimCard = ({ index, title, content }: Props) => (
  <div
    className="cc"
    style={{
      animationDelay: `${100 + index * 300}ms`,
      transform: `rotate(${TILT[index % 3]})`,
      background: OB.white,
      borderRadius: 18,
      borderLeft: `4px solid ${EDGE[index % 3]}`,
      padding: "13px 15px",
      boxShadow: "0 18px 40px -26px rgba(0,0,0,.75)",
      transition: `transform 250ms ${SPRING}`,
    }}
  >
    <style>{CSS}</style>
    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: OB.ink }}>{title}</p>
    {content ? (
      <p style={{
        margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: OB.muted,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{content}</p>
    ) : null}
  </div>
);

export default ClaimCard;