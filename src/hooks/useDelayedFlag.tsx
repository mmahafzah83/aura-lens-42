import { useEffect, useState } from "react";

/**
 * useDelayedFlag — defer turning a boolean flag `true` in the UI for `delayMs`.
 *
 * Why: After a browser refresh, data often resolves within ~50–200ms. Showing
 * a skeleton for that brief window causes a distracting flicker. This hook
 * keeps the rendered flag `false` until the source flag has been `true`
 * continuously for `delayMs`. Turning `false` is always immediate, so real
 * loaded content appears instantly.
 *
 * Usage:
 *   const showSkeleton = useDelayedFlag(loading, 200);
 *   {showSkeleton ? <Skeleton/> : <Content/>}
 */
export function useDelayedFlag(flag: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!flag) {
      setDelayed(false);
      return;
    }
    const t = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(t);
  }, [flag, delayMs]);

  return delayed;
}
