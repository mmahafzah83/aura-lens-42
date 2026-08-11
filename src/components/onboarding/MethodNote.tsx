import { useState } from "react";
import { OB } from "@/components/onboarding/tokens";

/**
 * The foot of the result. One tappable line — the methodology lecture lives
 * behind it, where the people who want it can find it and nobody else is
 * slowed down.
 */
const MethodNote = ({ onNight = false }: { onNight?: boolean }) => {
  const [open, setOpen] = useState(false);
  const colour = onNight ? OB.mutedNight : OB.muted;
  return (
    <div style={{ marginBlockStart: 18 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none", border: "none", padding: "6px 0", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: colour, textDecoration: "underline",
        }}
      >
        How this was built
      </button>
      {open ? (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.6, color: colour }}>
          Read from your LinkedIn profile, your recent posts, the claims you saved, and your own answers. Built on
          established ways of reading capability and standing: describing behaviour by example rather than by score,
          the leadership-pipeline view of seniority, archetype method from brand work, and uncontested-space
          strategy. Aura is not affiliated with any of them. This is a professional read, not a clinical or
          psychological test.
        </p>
      ) : null}
    </div>
  );
};

export default MethodNote;
