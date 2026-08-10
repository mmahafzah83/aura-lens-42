/**
 * ProgressBeads — five pills, shown on WHITE screens only. They tell the
 * member how much of the shelf is left, never how well they are doing.
 */
import { OB, EASE } from "./tokens";

const CSS = `
@keyframes pb-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.pb-active{animation:pb-pulse 2s cubic-bezier(.22,1,.36,1) infinite;}
@media (prefers-reduced-motion:reduce){ .pb-active{animation:none !important;} }
`;

const ProgressBeads = ({ active }: { active: number }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden>
    <style>{CSS}</style>
    {[0, 1, 2, 3, 4].map((i) => {
      const done = i < active;
      const now = i === active;
      return (
        <span
          key={i}
          className={now ? "pb-active" : undefined}
          style={{
            blockSize: 9,
            inlineSize: now ? 9 * 1.7 * 2.4 : 22,
            borderRadius: 999,
            background: done ? OB.blue : now ? OB.cyan : OB.line,
            transition: `background 250ms ${EASE}, inline-size 250ms ${EASE}`,
          }}
        />
      );
    })}
  </div>
);

export default ProgressBeads;