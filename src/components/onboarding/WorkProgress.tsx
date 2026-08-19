/**
 * THE WAIT METER — no percentage, ever.
 *
 * A client cannot know how far through the work is, so it does not claim to.
 * What it can know, it shows: an estimate computed from real finished runs of
 * this same operation, and a counter of real elapsed time. When the wait passes
 * the measured p95 it says so — and only then.
 *
 * Reduced motion changes nothing here: the same words, the same real counter.
 */
import { OB } from "./tokens";
import {
  OVER_P95_LINE, mmss, useElapsed, useWaitEstimate, waitCopy, type WaitOperation,
} from "@/lib/waitEstimate";

interface Props {
  /** Which real operation is being waited on. */
  operation: WaitOperation;
  onNight?: boolean;
}

const WorkProgress = ({ operation, onNight = false }: Props) => {
  const est = useWaitEstimate(operation);
  const secs = useElapsed(true);
  const muted = onNight ? OB.mutedNight : OB.muted;
  const over = est.known && secs > est.p95;

  return (
    <div style={{ marginBlockEnd: 18 }} role="status" aria-live="polite">
      <p style={{ margin: 0, fontSize: "var(--ob-small, 12.5px)", lineHeight: 1.55, color: muted }}>
        {waitCopy(est)}
      </p>
      <p style={{
        margin: "8px 0 0", fontFamily: OB.mono, fontSize: 13,
        color: onNight ? "#FFFFFF" : OB.ink, fontVariantNumeric: "tabular-nums",
      }}>
        {mmss(secs)}
      </p>
      {over ? (
        <p style={{ margin: "6px 0 0", fontSize: "var(--ob-small, 12.5px)", lineHeight: 1.5, color: muted }}>
          {OVER_P95_LINE}
        </p>
      ) : null}
    </div>
  );
};

export default WorkProgress;
