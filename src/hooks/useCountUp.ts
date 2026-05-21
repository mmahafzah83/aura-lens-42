import { useEffect, useRef, useState } from "react";

/**
 * Sprint F3 — count up from 0 to `target` over `duration` ms via rAF.
 * Respects prefers-reduced-motion (returns the target immediately).
 * Optional `delay` (ms) lets callers stagger groups (e.g. 200ms between cards).
 * `gate` allows external feature-flag gating; when false, returns target.
 * `once` + `key`: when both set, the value animates exactly once per session
 * for that key — subsequent mounts (e.g. tab switches) skip the animation.
 */
const animatedOnce = new Set<string>();

export function useCountUp(
  target: number,
  opts: { duration?: number; delay?: number; gate?: boolean; once?: boolean; key?: string } = {}
): number {
  const { duration = 1200, delay = 0, gate = true, once = false, key } = opts;
  const alreadyDone = once && key ? animatedOnce.has(key) : false;
  const [value, setValue] = useState(gate && !alreadyDone ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gate || !target || target <= 0) {
      setValue(target || 0);
      return;
    }
    if (once && key && animatedOnce.has(key)) {
      setValue(target);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      if (once && key) animatedOnce.add(key);
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
        else if (once && key) animatedOnce.add(key);
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
  }, [target, duration, delay, gate, once, key]);

  return value;
}