/**
 * The wait, filled with the member's own figures — one line every 2.5s.
 * Every line is computed upstream; nothing here is illustrative.
 */
import { useEffect, useState } from "react";
import { OB, EASE, RADIUS } from "./tokens";

const CSS = `
@keyframes wp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.wp-line{animation:wp-in 320ms ${EASE} both;}
@media (prefers-reduced-motion:reduce){.wp-line{animation:none !important;}}
`;

const WaitProof = ({ lines, howLong = "About a minute." }: { lines: string[]; howLong?: string }) => {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (lines.length <= 1) return;
    const t = window.setInterval(() => setShown((n) => (n >= lines.length ? n : n + 1)), 2500);
    return () => window.clearInterval(t);
  }, [lines.length]);

  if (lines.length === 0) return <p style={{ margin: "16px 0 0", fontSize: 13.5, color: OB.mutedNight }}>{howLong}</p>;

  return (
    <div style={{ marginBlockStart: 20 }}>
      <style>{CSS}</style>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: OB.mutedNight }}>{howLong}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }} aria-live="polite">
        {lines.slice(0, shown).map((l) => (
          <div key={l} className="wp-line" style={{
            background: OB.nightSoft, border: `1px solid ${OB.lineNight}`, borderRadius: RADIUS.card,
            padding: "12px 14px", color: "#FFFFFF", fontSize: 13.5, lineHeight: 1.5,
          }}>{l}</div>
        ))}
      </div>
    </div>
  );
};

export default WaitProof;
