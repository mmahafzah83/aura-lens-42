/**
 * The Collection journey — one token file, module scope, no magic colours
 * anywhere else in src/components/onboarding.
 *
 * Surface law: NIGHT means Aura is working and the member does nothing.
 * WHITE / CREAM means it is the member's turn.
 */
export const OB = {
  night: "#0F1519",
  nightSoft: "#18222A",
  cream: "#FBF7F0",
  white: "#FFFFFF",
  canvas: "#F2F5F9",
  line: "#E2E7EE",
  lineNight: "#25313A",
  ink: "#0F1519",
  muted: "#5B6673",
  mutedNight: "#9BA9B4",
  blue: "#0670C4",
  blueLight: "#0984E3",
  blueTint: "#E6F2FD",
  /** Cyan is decoration only. Never a button. Never body text. */
  cyan: "#00CEC9",
  /** The only legal cyan for text. */
  cyanText: "#00807B",
  amber: "#E0A82E",
  err: "#C0392B",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
} as const;

/** Springy — arrivals, unlocks, deals. */
export const SPRING = "cubic-bezier(.34,1.56,.64,1)";
/** Functional — hovers, fades, presses. There is no third curve. */
export const EASE = "cubic-bezier(.22,1,.36,1)";

export const RADIUS = { chip: 4, pill: 999, card: 20, hero: 34 } as const;

export const reducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
};

/** Every figure the member reads is mono. Everything else is Inter. */
export const figure = (size = 26): React.CSSProperties => ({
  fontFamily: OB.mono,
  fontSize: size,
  fontWeight: 600,
  lineHeight: 1.05,
  letterSpacing: "-0.02em",
});