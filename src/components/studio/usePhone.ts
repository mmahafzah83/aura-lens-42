import { useEffect, useState } from "react";

/**
 * R1 — THE PHONE IS NOT DESIGNED, IT IS SAFE.
 *
 * There is no phone layout any more: the studio renders the SAME components at
 * every width and simply stacks them into one column when the screen is
 * narrow. Nothing here describes geometry — no column height, no sheet, no
 * action bar, no reserve. The only survivors are the breakpoint (used for two
 * cheap comfort details: 16px fields so iOS does not zoom, and 44px targets),
 * the raster resolutions, and the boolean itself.
 */
export const PHONE_MAX_WIDTH = 768;

/**
 * The RESOLUTION the preview canvas is rasterised at — not a layout value.
 * Layout is CSS; this only decides how many pixels the renderer draws.
 */
export function clampCanvasWidth(w: number): number {
  if (!Number.isFinite(w) || w < 260) return 260;
  return w > 720 ? 720 : Math.round(w);
}

/**
 * The width every exported slide is rasterised at, on ANY device. The preview
 * width follows the screen; the output resolution never does — a member who
 * exports from a phone gets the same file as a member who exports from a desk.
 */
export const EXPORT_WIDTH = 720;

/** True while the viewport is phone-shaped. Desktop never sees the phone tree. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.innerWidth < PHONE_MAX_WIDTH,
  );
  useEffect(() => {
    const measure = () => setPhone(window.innerWidth < PHONE_MAX_WIDTH);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  return phone;
}
