/**
 * ReadingScreen — the one honest wait.
 *
 * Named steps that never pretend to finish, a real elapsed counter, and an
 * estimate measured from finished reads. No percentage, no fake progress.
 * This is the canonical pattern first written for the assessment gate; it is
 * shared so every "Aura is reading" screen looks and behaves the same.
 */
import type { ReactNode } from "react";
import { OVER_P95_LINE, mmss, useElapsed, useWaitEstimate, waitCopy } from "@/lib/waitEstimate";

/* System-B surface tokens */
const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const INK2 = "#5B6673";
const BLUE = "#0670C4";
const MONO = "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)";

type Props = {
  /** Small mono label above the heading. */
  label?: string;
  /** One bold line saying what is happening. */
  heading: string;
  /** Plain step labels, stacked. None of them ticks. */
  steps: string[];
  /** Which measured wait to quote. */
  waitKey: string;
  /** Optional action below the counter (for example, a quiet cancel). */
  children?: ReactNode;
};

export default function ReadingScreen({
  label = "READING", heading, steps, waitKey, children,
}: Props) {
  const secs = useElapsed(true);
  const est = useWaitEstimate(waitKey);
  const over = est.known && secs > est.p95;

  return (
    <section
      style={{
        background: CARD, border: `1px solid ${LINE}`, borderRadius: 20,
        padding: 26, textAlign: "center", color: INK,
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.17em", color: BLUE }}>
        {label}
      </span>
      <h1 style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.018em", margin: "10px 0 0",
      }}>
        {heading}
      </h1>
      <div role="status" aria-live="polite" style={{ marginBlockStart: 18 }}>
        <p style={{ fontSize: 14.5, lineHeight: 1.65, color: INK2, margin: "12px 0 0" }}>
          {waitCopy(est)}
        </p>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {steps.map((s) => (
            <li key={s} style={{ fontSize: 14, lineHeight: 1.5, color: INK2 }}>{s}</li>
          ))}
        </ul>
        <p style={{
          fontFamily: MONO, fontSize: 13, color: INK2, margin: "12px 0 0",
          fontVariantNumeric: "tabular-nums",
        }}>
          {mmss(secs)}
        </p>
        {over ? (
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: INK2, margin: "6px 0 0" }}>{OVER_P95_LINE}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
