import { useEffect, useState } from "react";

/**
 * THE single breakpoint for the studio. Everything phone-shaped is driven from
 * this one constant — there is no second number anywhere in the studio.
 */
export const PHONE_MAX_WIDTH = 768;

/** The bottom navigation the Dashboard owns, plus the device's own safe area. */
export const NAV_CLEARANCE = "calc(64px + env(safe-area-inset-bottom, 0px))";
/** The one-thumb action bar sits directly above the navigation. */
export const ACTION_BAR_HEIGHT = 64;

/**
 * L1 — THERE IS NO PHONE COLUMN GEOMETRY ANY MORE.
 *
 * Editing on a phone happens inside `PhoneLayer`, a `position: fixed; inset: 0`
 * surface. Inside it every height is a percentage of the layer itself, so no
 * constant here can describe — or misdescribe — where the page happens to be
 * scrolled to.
 */

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
