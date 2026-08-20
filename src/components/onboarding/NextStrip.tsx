/**
 * NextStrip — what the fragments become, shown as what comes NEXT.
 *
 * TRUTH LAW: nothing in here has happened. The fragments above it are real,
 * pulled out of the member's own link. This strip is a preview of the chain
 * and is marked as one: a "What comes next" chip, muted treatment, and copy
 * that puts every step in the future. It must never be styled like a real
 * signal card and must never carry a fabricated post attributed to the member.
 */
import { OB } from "./tokens";

interface Props {
  /** How many real fragments came out of the capture. Zero is honest too. */
  count: number;
  onNight?: boolean;
}

const STEPS = [
  { k: "fragments", label: "What Aura found", note: "Already on your record." },
  { k: "signal", label: "A signal", note: "Forms once a few captures point the same way." },
  { k: "post", label: "Something to say", note: "Written from your own evidence, in your words." },
];

const NextStrip = ({ count, onNight }: Props) => {
  const ink = onNight ? "rgba(255,255,255,.92)" : OB.ink;
  const muted = onNight ? "rgba(255,255,255,.60)" : OB.muted;
  const line = onNight ? "rgba(255,255,255,.16)" : OB.line;
  const surface = onNight ? "rgba(255,255,255,.05)" : OB.canvas;

  return (
    <section
      aria-label="What comes next"
      style={{
        marginBlockStart: 24, padding: "14px 15px 15px",
        border: `1px dashed ${line}`, borderRadius: 16, background: surface,
      }}
    >
      <span style={{
        display: "inline-block", fontFamily: OB.mono, fontSize: 10.5, letterSpacing: "0.08em",
        textTransform: "uppercase", color: muted,
        border: `1px solid ${line}`, borderRadius: 999, padding: "3px 9px",
      }}>
        Preview — what comes next
      </span>

      <div style={{
        display: "flex", alignItems: "stretch", gap: 8, marginBlockStart: 12, flexWrap: "wrap",
      }}>
        {STEPS.map((s, i) => (
          <div key={s.k} style={{ flex: "1 1 150px", minInlineSize: 140 }}>
            <p style={{
              margin: 0, fontSize: 12.5, fontWeight: 700, color: i === 0 ? ink : muted,
            }}>
              {i > 0 ? "→ " : ""}{s.label}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: muted }}>
              {i === 0 && count > 0
                ? `${count} ${count === 1 ? "piece" : "pieces"} from your link. Already on your record.`
                : s.note}
            </p>
          </div>
        ))}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: muted }}>
        Two or three more captures and these become a signal — something worth saying, with your
        evidence behind it. Nothing here has been written yet.
      </p>
    </section>
  );
};

export default NextStrip;
