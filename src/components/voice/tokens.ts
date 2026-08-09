/**
 * System-B tokens for the Voice OS. One definition, every file.
 *
 * Colour, radius and type all live here so a drift is a one-line fix rather
 * than a hunt through nine components. Nothing in the Voice pages may invent
 * a hex value or a fractional font size.
 */

/* ── surfaces ────────────────────────────────────────────────────────────── */
export const NIGHT = "#0F1519";
/** Raised panel on night — replaces the old #162026 / #242E36 / #24323C set. */
export const NIGHT_RAISED = "#1A242B";
export const NIGHT_LINE = "#2A3640";
export const NIGHT_TEXT = "#F2F5F9";
/** 6.9:1 on NIGHT — the only muted text allowed on a night surface. */
export const NIGHT_MUTED = "#9BA8B5";

export const WHITE = "#FFFFFF";
/** The one off-white fill — replaces #F1F4F8 and #EDF1F6. */
export const SURFACE = "#F2F5F9";
export const LINE = "#E2E7EE";

/* ── ink ─────────────────────────────────────────────────────────────────── */
export const INK = "#0F1519";
/** 5.6:1 on white. The only grey for secondary text — #A3AEBB is banned. */
export const MUTED = "#5B6673";

/* ── accents ─────────────────────────────────────────────────────────────── */
export const BLUE = "#0670C4";
/** Cyan is a fill. It is never a text colour. */
export const CYAN = "#00CEC9";
/** The legal text form of cyan. */
export const CYAN_TEXT = "#00807B";
export const GREEN = "#12805C";
/** Amber has two legal forms and no third. */
export const AMBER_FILL = "#E0A82E";
export const AMBER_TEXT = "#9A6F12";
export const RED = "#C0392B";

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const SANS = "Inter, system-ui, sans-serif";

/* ── radii — the law ─────────────────────────────────────────────────────── */
export const RADIUS = {
  hero: 28,
  card: 20,
  button: 8,
  chip: 4,
  rail: 3,
} as const;

/* ── type scale — no fractional sizes ────────────────────────────────────── */
export const TYPE = {
  micro: 10,
  caption: 11,
  small: 12,
  body: 13,
  bodyLg: 14,
  title: 15,
  section: 17,
  display: 22,
  figure: 26,
} as const;

/** Minimum tap target, applied to every control the member can press. */
export const TAP = 44;

export const monoNum: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export const cardStyle: React.CSSProperties = {
  background: WHITE, border: `1px solid ${LINE}`, borderRadius: RADIUS.card, padding: 16,
};

export const microLabel: React.CSSProperties = {
  fontSize: TYPE.micro, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: MUTED,
};

/** The quiet button. Every view has at most one primary; everything else is this. */
export const ghostButton: React.CSSProperties = {
  background: WHITE, color: MUTED, border: `1px solid ${LINE}`, borderRadius: RADIUS.button,
  padding: "6px 10px", fontSize: TYPE.small, fontWeight: 600, cursor: "pointer",
};

/** The single primary per view. */
export const primaryButton: React.CSSProperties = {
  background: BLUE, color: WHITE, border: "none", borderRadius: RADIUS.button,
  padding: "10px 16px", fontSize: TYPE.body, fontWeight: 600, cursor: "pointer", minBlockSize: TAP,
};

/** A status chip. Radius 4, mono, uppercase — never a pill. */
export const chipStyle = (fg: string, bg: string, border?: string): React.CSSProperties => ({
  fontFamily: MONO, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: ".08em",
  textTransform: "uppercase", color: fg, background: bg,
  border: border ? `1px solid ${border}` : "none",
  borderRadius: RADIUS.chip, padding: "2px 6px", whiteSpace: "nowrap",
});
