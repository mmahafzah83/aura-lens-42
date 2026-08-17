/**
 * ProgressBeads — five pills, shown on WHITE screens only. They tell the
 * member how much of the shelf is left, never how well they are doing.
 */
import { OB, EASE, reducedMotion } from "./tokens";
import { ASSESSMENT_STEPS, stepLabel } from "@/lib/brand";

/** The five named stages. Only the active one is ever labelled. */
export const STAGE_NAMES = [
  "Know you",
  "What you read",
  "Your strengths",
  "A few questions",
  "Your read",
] as const;

const CSS = `
@keyframes pb-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.pb-active{animation:pb-pulse 2s cubic-bezier(.22,1,.36,1) infinite;}
@media (prefers-reduced-motion:reduce){ .pb-active{animation:none !important;} }
`;

/**
 * `subProgress` (0–1) fills the CURRENT bead partially, so movement inside a
 * stage is visible. Absent, the current bead behaves exactly as before.
 */
const ProgressBeads = ({ active, subProgress }: { active: number; subProgress?: number }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}
    role="group"
    aria-label={`Step ${Math.min(Math.max(active, 0), ASSESSMENT_STEPS - 1) + 1} of ${ASSESSMENT_STEPS} — ${STAGE_NAMES[Math.min(Math.max(active, 0), ASSESSMENT_STEPS - 1)]}`}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden>
      <style>{CSS}</style>
      {[0, 1, 2, 3, 4].map((i) => {
        const done = i < active;
        const now = i === active;
        const frac = now && typeof subProgress === "number"
          ? Math.max(0, Math.min(1, subProgress))
          : null;
        if (frac !== null) {
          return (
            <span
              key={i}
              style={{
                blockSize: 9,
                inlineSize: 9 * 1.7 * 2.4,
                borderRadius: 999,
                background: OB.line,
                overflow: "hidden",
                display: "inline-block",
              }}
            >
              <span style={{
                display: "block", blockSize: "100%", inlineSize: `${frac * 100}%`,
                borderRadius: 999, background: OB.cyan,
                transition: reducedMotion() ? "none" : `inline-size 250ms ${EASE}`,
              }} />
            </span>
          );
        }
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
    <span style={{
      fontFamily: OB.mono, fontSize: 9.5, textTransform: "uppercase",
      letterSpacing: "0.12em", color: OB.muted, textAlign: "center",
    }}>
      {stepLabel(Math.min(Math.max(active, 0), ASSESSMENT_STEPS - 1) + 1)} · {STAGE_NAMES[Math.min(Math.max(active, 0), ASSESSMENT_STEPS - 1)]}
    </span>
  </div>
);

export default ProgressBeads;