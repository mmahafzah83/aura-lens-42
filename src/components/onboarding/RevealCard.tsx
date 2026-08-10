/**
 * RevealCard — screen 13. Full-bleed blue, the member's read of the market,
 * and the same card is what gets exported when they share it.
 */
import { forwardRef } from "react";
import { OB, RADIUS } from "./tokens";

export interface RevealData {
  archetype: string;
  marketRead: string;
  subjects: string[];
  softGround: string[];
  figures: { value: string; label: string }[];
}

const chip = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "6px 11px",
  borderRadius: RADIUS.chip,
  background: bg,
  color,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.3,
});

const RevealCard = forwardRef<HTMLDivElement, { data: RevealData }>(({ data }, ref) => (
  <div
    ref={ref}
    style={{
      background: `linear-gradient(170deg, ${OB.blue}, ${OB.blueLight} 55%, ${OB.cyan})`,
      borderRadius: RADIUS.hero,
      padding: "30px 24px 28px",
      color: "#FFFFFF",
      fontFamily: OB.ui,
    }}
  >
    <p style={{
      margin: 0, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase",
      fontFamily: OB.mono, opacity: 0.85,
    }}>How people see you</p>

    <h2 style={{
      margin: "12px 0 0", fontSize: "clamp(34px, 9vw, 40px)", fontWeight: 900,
      lineHeight: 1.02, letterSpacing: "-0.03em",
    }}>{data.archetype}</h2>

    {data.marketRead ? (
      <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, opacity: 0.95 }}>{data.marketRead}</p>
    ) : null}

    {data.subjects.length > 0 && (
      <>
        <p style={{ margin: "22px 0 8px", fontSize: 11.5, opacity: 0.85 }}>The subjects you own</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.subjects.slice(0, 3).map((s) => (
            <span key={s} style={chip("rgba(255,255,255,0.18)", "#FFFFFF")}>{s}</span>
          ))}
        </div>
      </>
    )}

    {data.softGround.length > 0 && (
      <>
        <p style={{ margin: "18px 0 8px", fontSize: 11.5, opacity: 0.85 }}>Ground still soft</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.softGround.slice(0, 2).map((s) => (
            <span key={s} style={chip(OB.amber, OB.night)}>{s}</span>
          ))}
        </div>
      </>
    )}

    {data.figures.length > 0 && (
      <div style={{ display: "flex", gap: 26, marginBlockStart: 24 }}>
        {data.figures.slice(0, 2).map((f) => (
          <div key={f.label}>
            <div style={{ fontFamily: OB.mono, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{f.value}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginBlockStart: 5 }}>{f.label}</div>
          </div>
        ))}
      </div>
    )}
  </div>
));

RevealCard.displayName = "RevealCard";
export default RevealCard;