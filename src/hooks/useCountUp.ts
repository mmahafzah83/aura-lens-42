import { useEffect, useRef, useState } from "react";

/**
 * Sprint F3 — count up from 0 to `target` over `duration` ms via rAF.
 * Respects prefers-reduced-motion (returns the target immediately).
 * Optional `delay` (ms) lets callers stagger groups (e.g. 200ms between cards).
 * `gate` allows external feature-flag gating; when false, returns target.
 */
export function useCountUp(
  target: number,
  opts: { duration?: number; delay?: number; gate?: boolean } = {}
): number {
  const { duration = 1200, delay = 0, gate = true } = opts;
  const [value, setValue] = useState(gate ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gate || !target || target <= 0) {
      setValue(target || 0);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }
    setValue(0);
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setValue(Math.round(easeOut(t) * target));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    if (delay > 0) {
      timerRef.current = window.setTimeout(run, delay);
    } else {
      run();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [target, duration, delay, gate]);

  return value;
}