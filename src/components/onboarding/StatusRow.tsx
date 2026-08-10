/**
 * StatusRow — one line of work Aura is doing. Pending shows a faint pulsing
 * placeholder and the word "reading…". Landed shows the value and a check.
 * A row never renders a zero: the caller drops it instead.
 */
import { Check } from "lucide-react";
import { OB, EASE, RADIUS } from "./tokens";

const CSS = `
@keyframes sr-pulse{0%,100%{opacity:.5}50%{opacity:.18}}
@keyframes sr-fade{from{opacity:0}to{opacity:1}}
.sr-pending{animation:sr-pulse 1.5s ${EASE} infinite;}
.sr-check{animation:sr-fade 200ms ${EASE} both;}
@media (prefers-reduced-motion:reduce){.sr-pending,.sr-check{animation:none !important;}}
`;

const StatusRow = ({ label, done, children }: {
  /** What Aura is doing, shown while it is still working. */
  label: React.ReactNode;
  done: boolean;
  /** The finished line. */
  children?: React.ReactNode;
}) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    background: OB.nightSoft, border: `1px solid ${OB.lineNight}`, borderRadius: RADIUS.card,
    padding: "13px 15px", color: "#FFFFFF", fontSize: 14.5,
  }}>
    <style>{CSS}</style>
    <span>
      {done ? children : (
        <>
          <span className="sr-pending" style={{
            display: "inline-block", inlineSize: 34, blockSize: 11, borderRadius: 999,
            background: OB.mutedNight, marginInlineEnd: 9, verticalAlign: "middle",
          }} />
          <span style={{ color: OB.mutedNight }}>{label} · reading…</span>
        </>
      )}
    </span>
    {done ? <Check size={14} className="sr-check" style={{ color: "#12805C", flexShrink: 0 }} /> : null}
  </div>
);

export default StatusRow;
