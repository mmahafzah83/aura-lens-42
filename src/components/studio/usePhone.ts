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
/** Anything anchored above the action bar starts here. */
export const ABOVE_ACTION_BAR = `calc(64px + env(safe-area-inset-bottom, 0px) + ${ACTION_BAR_HEIGHT}px)`;

/**
 * K2 — THE PHONE STEP-3 COLUMN, IN CSS AND ONLY IN CSS.
 *
 * The column is the viewport less the three fixed strips it must never sit
 * under: the studio progress header (56), the one-thumb action bar (64) and
 * the shell navigation (64). Nothing here is measured, so nothing here can go
 * stale on scroll, rotation or a keyboard opening.
 */
export const PHONE_COLUMN_H =
  "calc(100dvh - 184px - env(safe-area-inset-bottom, 0px))";
/** The rows under the slide when no sheet is open: filmstrip, steps, openers. */
export const PHONE_ROWS_BELOW = 152;
/** The rows under the slide while a sheet is open: filmstrip and steps only. */
export const PHONE_ROWS_BELOW_SHEET = 96;
/** The sheet, collapsed. Leaves the slide above 40% of the column at 640px. */
export const PHONE_SHEET_H = "calc(40dvh - 96px)";
/** The sheet, expanded. Visibly shrinks the slide; never hides it. */
export const PHONE_SHEET_H_TALL = "calc(54dvh - 96px)";

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
