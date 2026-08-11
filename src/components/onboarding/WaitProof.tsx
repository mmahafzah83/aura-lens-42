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

const WaitProof = ({ lines, howLong = "About a minute.", startAt = 0 }: { lines: string[]; howLong?: string; startAt?: number }) => {
  /* Each wait shows a different slice, so the member never reads the same
     figure twice unless there genuinely are not enough of them. */
  const window = (() => {
    if (lines.length === 0) return [] as string[];
    const start = ((startAt % lines.length) + lines.length) % lines.length;
    const rest = lines.slice(start);
    return rest.length >= 3 ? rest.slice(0, 3) : [...rest, ...lines.slice(0, 3 - rest.length)];
  })();
  const [shown, setShown] = useState(1);
  useEffect(() => {
    setShown(1);
  }, [startAt, lines.length]);
  useEffect(() => {
    if (window.length <= 1) return;
    const t = globalThis.setInterval(() => setShown((n) => (n >= window.length ? n : n + 1)), 2500);
    return () => globalThis.clearInterval(t);
  }, [window.length]);

  if (window.length === 0) return <p style={{ margin: "16px 0 0", fontSize: 13.5, color: OB.mutedNight }}>{howLong}</p>;

  return (
    <div style={{ marginBlockStart: 20 }}>
      <style>{CSS}</style>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: OB.mutedNight }}>{howLong}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }} aria-live="polite">
        {window.slice(0, shown).map((l) => (
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
