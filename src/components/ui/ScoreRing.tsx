import { useEffect, useState } from "react";
import { useCountUp } from "@/hooks/useCountUp";

/**
 * Sprint F3 — Authority score ring.
 * SVG circle with animated stroke-dashoffset + count-up number.
 * Globally gated by [data-fx-score-ring="true"]; if disabled,
 * the ring fills instantly and the number renders at full value.
 */
interface ScoreRingProps {
  value: number;          // 0..max
  max?: number;           // default 100
  size?: number;          // px outer diameter
  stroke?: number;        // stroke width
  numberStyle?: React.CSSProperties;
}

export function ScoreRing({
  value,
  max = 100,
  size = 160,
  stroke = 5,
  numberStyle,
}: ScoreRingProps) {
  const enabled = true;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));

  // Animate stroke-dashoffset on mount.
  const [offset, setOffset] = useState(enabled && !reduced ? c : c * (1 - pct));
  const [breathing, setBreathing] = useState(false);
  useEffect(() => {
    if (!enabled || reduced) {
      setOffset(c * (1 - pct));
      setBreathing(true);
      return;
    }
    // start fully empty, fill to pct on next frame
    setOffset(c);
    const id = requestAnimationFrame(() => setOffset(c * (1 - pct)));
    // After the draw-in completes, switch the ring to its breathing pulse.
    const breatheTimer = window.setTimeout(() => setBreathing(true), 1500);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(breatheTimer);
    };
  }, [enabled, reduced, c, pct]);

  const display = useCountUp(value, { duration: 800, gate: enabled, once: true, key: `score-ring-${max}` });

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand-line)"
          strokeWidth={stroke}
          opacity={0.6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={breathing ? "aura-ring-breathing" : undefined}
          style={{
            transition: enabled && !reduced ? "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
        />
      </svg>
      <div
        className="tabular-nums"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...numberStyle,
        }}
      >
        {display}
      </div>
    </div>
  );
}

export default ScoreRing;