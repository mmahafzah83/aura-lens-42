/**
 * The fit ladder. Render, measure, escalate — never truncate.
 *
 * An ellipsis in a carousel is the loudest possible signal that a machine
 * wrote it badly, so there is no truncation path here at all. Three bounded
 * steps reduce the type scale; step 2 additionally drops body nodes marked
 * `optional_tail`. If it still does not fit, we report the failure and let the
 * caller refuse to ship the slide rather than render something broken.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { carouselFontsLoaded, ensureCarouselFonts } from "./fontsReady";

/** Fixed reductions. Bounded on purpose: an unbounded ladder hides bad copy. */
export const FIT_SCALES = [1, 0.88, 0.78] as const;
export const MAX_FIT_STEP = FIT_SCALES.length - 1;

/** A hero line taller than this multiple of its line-height has wrapped. */
const WRAP_TOLERANCE = 1.4;

export interface FitState {
  step: number;
  scale: number;
  /** True once step 2 still overflows — the slide must not ship. */
  failed: boolean;
  /** Human-readable reason, in the same vocabulary as the invariants. */
  reason: string | null;
}

function overflows(root: HTMLElement): string | null {
  // The slide box itself.
  if (root.scrollHeight > root.clientHeight + 1) {
    return `INV-02: content overflows the canvas by ${root.scrollHeight - root.clientHeight}px.`;
  }
  if (root.scrollWidth > root.clientWidth + 1) {
    return `INV-02: content overflows the canvas width by ${root.scrollWidth - root.clientWidth}px.`;
  }
  // Any hero line that wrapped. A wrapped highlight is a ragged staircase.
  const heroes = root.querySelectorAll<HTMLElement>("[data-hero-line]");
  for (const hero of Array.from(heroes)) {
    const lh = parseFloat(getComputedStyle(hero).lineHeight);
    if (Number.isFinite(lh) && lh > 0 && hero.offsetHeight > lh * WRAP_TOLERANCE) {
      return `INV-02: hero line "${hero.textContent ?? ""}" wrapped onto more than one line.`;
    }
  }
  return null;
}

/**
 * Measures after layout and escalates the step until the slide fits.
 * `signature` should change whenever the slide's content or theme changes, so
 * the ladder restarts from step 0 rather than inheriting a previous shrink.
 */
export function useFitLadder(
  ref: React.RefObject<HTMLElement | null>,
  signature: string,
): FitState {
  const [state, setState] = useState<FitState>({ step: 0, scale: FIT_SCALES[0], failed: false, reason: null });
  const lastSignature = useRef(signature);

  // Measure only once the four bundled faces are in. Fallback metrics are far
  // wider than Anton, so measuring early reports a phantom wrap — and the
  // ladder only ever escalates, so the slide would stay wrongly shrunk.
  // `document.fonts.ready` alone is not enough: it can already be settled
  // before these faces are requested.
  const [fontsReady, setFontsReady] = useState<boolean>(carouselFontsLoaded());
  useEffect(() => {
    if (fontsReady) return;
    let live = true;
    ensureCarouselFonts().then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, [fontsReady]);

  if (lastSignature.current !== signature && state.step !== 0) {
    // Restart the ladder synchronously on new content.
    lastSignature.current = signature;
    setState({ step: 0, scale: FIT_SCALES[0], failed: false, reason: null });
  } else {
    lastSignature.current = signature;
  }

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !fontsReady) return;
    const reason = overflows(root);
    if (!reason) {
      if (state.failed || state.reason) setState((s) => ({ ...s, failed: false, reason: null }));
      return;
    }
    console.warn('[fit]', root.getAttribute('data-archetype'), state.step, reason, 'sh',root.scrollHeight,'ch',root.clientHeight);
    if (state.step < MAX_FIT_STEP) {
      const next = state.step + 1;
      setState({ step: next, scale: FIT_SCALES[next], failed: false, reason: null });
      return;
    }
    // Step 2 and still short of room. Report rather than render broken.
    if (!state.failed) setState({ step: MAX_FIT_STEP, scale: FIT_SCALES[MAX_FIT_STEP], failed: true, reason });
  });

  return state;
}