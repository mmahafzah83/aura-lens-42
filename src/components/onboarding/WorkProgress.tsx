/**
 * WORK PROGRESS — a determinate bar for every "Aura is working" screen.
 *
 * The percentage is completed steps ÷ total steps. It counts up smoothly, it
 * never goes backwards, and if a step outstays its welcome the bar holds its
 * position and says so rather than freezing without explanation.
 */
import { useEffect, useRef, useState } from "react";
import { OB } from "./tokens";

const GREEN = "#12805C";

interface Props {
  /** How many steps have finished. */
  done: number;
  /** How many there are in total. */
  total: number;
  /** How long a single step may take before Aura admits it is slow. */
  slowAfterMs?: number;
  onNight?: boolean;
}

const WorkProgress = ({ done, total, slowAfterMs = 12000, onNight = false }: Props) => {
  const target = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  const [shown, setShown] = useState(0);
  const [slow, setSlow] = useState(false);
  const [flash, setFlash] = useState(false);
  const raf = useRef<number | null>(null);

  /* the number only ever climbs */
  useEffect(() => {
    const step = () => {
      setShown((v) => {
        if (v >= target) return v;
        const next = Math.min(target, v + Math.max(1, Math.round((target - v) / 8)));
        raf.current = window.setTimeout(step, 40) as unknown as number;
        return next;
      });
    };
    raf.current = window.setTimeout(step, 40) as unknown as number;
    return () => { if (raf.current) window.clearTimeout(raf.current); };
  }, [target]);

  /* a step that outstays its expected time says so */
  useEffect(() => {
    setSlow(false);
    if (target >= 100) return;
    const t = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(t);
  }, [target, slowAfterMs]);

  /* 100 lands green for a beat */
  useEffect(() => {
    if (shown < 100) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 400);
    return () => window.clearTimeout(t);
  }, [shown]);

  const track = onNight ? OB.lineNight : OB.line;
  const muted = onNight ? OB.mutedNight : OB.muted;

  return (
    <div style={{ marginBlockEnd: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          role="progressbar"
          aria-valuenow={shown}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="How far Aura has got"
          style={{ flex: 1, blockSize: 2, background: track, borderRadius: 2, overflow: "hidden" }}
        >
          <div style={{
            inlineSize: `${shown}%`, blockSize: "100%",
            background: flash || shown >= 100 ? GREEN : OB.blue,
            transition: "inline-size 240ms cubic-bezier(.22,1,.36,1), background 200ms linear",
          }} />
        </div>
        <span style={{
          fontFamily: OB.mono, fontSize: "var(--ob-mono, 9.5px)", fontWeight: 600,
          letterSpacing: "0.08em", color: onNight ? "#FFFFFF" : OB.ink, fontVariantNumeric: "tabular-nums",
        }}>{shown}%</span>
      </div>
      {slow && shown < 100 ? (
        <p style={{ margin: "8px 0 0", fontSize: "var(--ob-small, 12.5px)", lineHeight: 1.5, color: muted }}>
          Still going — this one is slower than usual.
        </p>
      ) : null}
    </div>
  );
};

export default WorkProgress;
