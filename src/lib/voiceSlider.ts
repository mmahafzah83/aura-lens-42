/**
 * Slider maths for a trait spectrum. Low pole sits on the start side, high on
 * the end side, so in right-to-left the value grows leftwards and the arrow
 * keys are mirrored (ArrowLeft increases).
 */
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function sliderValueFromX(
  clientX: number, rect: { left: number; width: number }, rtl: boolean,
): number | null {
  if (rect.width === 0) return null;
  const frac = (clientX - rect.left) / rect.width;
  return Math.round(clamp((rtl ? 1 - frac : frac) * 100));
}

/** The next value for a key, or null when the key does not move the slider. */
export function sliderKeyValue(key: string, current: number, rtl: boolean): number | null {
  const fwd = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  switch (key) {
    case fwd: case "ArrowUp": return clamp(current + 1);
    case back: case "ArrowDown": return clamp(current - 1);
    case "PageUp": return clamp(current + 10);
    case "PageDown": return clamp(current - 10);
    case "Home": return 0;
    case "End": return 100;
    default: return null;
  }
}
