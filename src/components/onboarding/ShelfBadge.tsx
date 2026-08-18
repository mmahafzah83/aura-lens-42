/**
 * ShelfBadge — the four things the member collects. Locked is a dashed
 * outline carrying the badge's own outline icon; unlocked is a filled
 * gradient with the member's own figure on it.
 */
import { OB, SPRING, RADIUS } from "./tokens";
import { User, Bookmark, BarChart3, Target } from "lucide-react";

const CSS = `
@keyframes sb-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.sb-unlocked{animation:sb-pop 550ms cubic-bezier(.34,1.56,.64,1) both;}
@media (prefers-reduced-motion:reduce){ .sb-unlocked{animation:none !important;} }
`;

export type ShelfBadgeTone = "blue" | "cyan" | "amber" | "deep";

const FILL: Record<ShelfBadgeTone, string> = {
  blue: `linear-gradient(150deg, ${OB.blue}, ${OB.blueLight})`,
  cyan: `linear-gradient(150deg, ${OB.blue}, ${OB.cyan})`,
  amber: `linear-gradient(150deg, ${OB.amber}, #C98F14)`,
  deep: `linear-gradient(150deg, #04477C, ${OB.blue})`,
};

interface Props {
  label: string;
  unlocked?: boolean;
  /** The member's own number, shown once unlocked. */
  figure?: string | number | null;
  tone?: ShelfBadgeTone;
  onNight?: boolean;
  /** Which outline icon a locked badge carries — never a question mark. */
  icon?: "profile" | "saved" | "strengths" | "subjects";
  /** What unlocks it, shown on hover and tap. */
  hint?: string;
  /** A second, quieter line under the label — what the badge is made of. */
  sublabel?: string;
}

const ICON = { profile: User, saved: Bookmark, strengths: BarChart3, subjects: Target } as const;

const ShelfBadge = ({ label, unlocked = false, figure, tone = "blue", onNight = false, icon = "profile", hint, sublabel }: Props) => {
  const Icon = ICON[icon];
  /* A zero is not an achievement — a badge with nothing behind it stays empty. */
  const isZero = figure === 0 || figure === "0";
  const on = unlocked && !isZero;
  return (
  <div style={{ width: "100%", maxWidth: 88, minWidth: 0, textAlign: "center" }} title={on ? label : (hint || label)}>
    <style>{CSS}</style>
    <div
      className={on ? "sb-unlocked" : undefined}
      aria-label={on ? label : `${label} — ${hint || "not unlocked yet"}`}
      style={{
        inlineSize: 54, blockSize: 54, borderRadius: RADIUS.card,
        marginInline: "auto",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: on ? FILL[tone] : (onNight ? "#141E25" : OB.canvas),
        border: on ? "1px solid transparent" : `1.5px dashed ${onNight ? OB.lineNight : "#C3CBD5"}`,
        color: on ? "#FFFFFF" : (onNight ? OB.mutedNight : OB.muted),
        transition: `background 300ms ${SPRING}`,
      }}
    >
      {on
        ? <span style={{ fontFamily: OB.mono, fontSize: 17, fontWeight: 600 }}>{figure ?? "✓"}</span>
        : <Icon size={20} strokeWidth={1.75} color={onNight ? OB.mutedNight : OB.muted} />}
    </div>
    <p style={{
      margin: "8px 0 0", fontSize: 10.5, lineHeight: 1.35, minHeight: 29,
      color: onNight ? OB.mutedNight : OB.muted,
    }}>{label}</p>
    {sublabel ? (
      <p style={{
        margin: "3px 0 0", fontSize: 11, lineHeight: 1.35, minHeight: 45,
        color: onNight ? OB.mutedNight : OB.muted,
      }}>{sublabel}</p>
    ) : null}
  </div>
  );
};

export default ShelfBadge;