/**
 * Themes are plain objects of literal strings, NOT a stylesheet.
 *
 * html2canvas runs inside an iframe and cannot read CSS custom properties, so
 * a custom property referenced inside a slide resolves differently in the
 * export than in the preview. Every colour in the slide subtree must reach the
 * DOM as an inline literal. That is the whole reason this file exists.
 */

export interface Theme {
  bg: string;
  /**
   * One opaque colour standing in for `bg`. JPEG has no alpha channel, so the
   * PDF exporter composites every captured page onto this before encoding —
   * without it a transparent region would encode as black.
   */
  bgSolid: string;
  fg: string;
  dim: string;
  head: string;
  accent: string;
  accentLight: string;
  accentInk: string;
  alert: string;
  neutral: string;
  panel: string;
  rule: string;
  avA: string;
  avB: string;
  avInk: string;
  /**
   * OPTIONAL INVERSION GROUND. Families that alternate a dark slide against a
   * light one (gridpaper) declare the dark surface and the ink that rides on
   * it here. A family with no dark slide leaves both absent rather than
   * inventing a colour the renderer never draws.
   */
  invert?: string;
  invertFg?: string;
}

const INSTRUMENT_THEMES = {
  midnight: {
    bg: "radial-gradient(125% 95% at 15% -5%, #1E2F39 0%, #101A20 45%, #0B1216 100%)",
    bgSolid: "#101A20",
    fg: "#DFE8EA",
    dim: "#A6B4B8",
    head: "#F6FBFB",
    accent: "#36C5B0",
    accentLight: "#8FE3D6",
    accentInk: "#0B1216",
    alert: "#E8674F",
    neutral: "#3E5560",
    panel: "rgba(255,255,255,.05)",
    rule: "rgba(255,255,255,.13)",
    avA: "#36C5B0",
    avB: "#1C8577",
    avInk: "#04120F",
  },
  clay: {
    bg: "radial-gradient(125% 95% at 15% -5%, #4A2C22 0%, #2A1712 48%, #1E100C 100%)",
    bgSolid: "#2A1712",
    fg: "#F0E2D8",
    dim: "#C0AB9C",
    head: "#FEF8F1",
    accent: "#D6A748",
    accentLight: "#F0D08C",
    accentInk: "#2A1712",
    alert: "#E8674F",
    neutral: "#6B4A3A",
    panel: "rgba(255,255,255,.05)",
    rule: "rgba(255,255,255,.15)",
    avA: "#E8A45F",
    avB: "#C4703F",
    avInk: "#2A1712",
  },
  gradient: {
    bg: "linear-gradient(158deg,#E8A765 0%,#C4685A 48%,#7E3230 100%)",
    bgSolid: "#C4685A",
    fg: "#FFF8F0",
    dim: "#FFEBDC",
    head: "#FFF8F0",
    accent: "#FFE2C4",
    accentLight: "#FFF3E6",
    accentInk: "#7E3230",
    alert: "#5E1F1D",
    neutral: "rgba(255,255,255,.35)",
    panel: "rgba(255,255,255,.18)",
    rule: "rgba(255,255,255,.32)",
    avA: "#FFFFFF",
    avB: "#F0D6BE",
    avInk: "#8E3A34",
  },
  paper: {
    bg: "#F1ECE1",
    bgSolid: "#F1ECE1",
    fg: "#1B1712",
    dim: "#4A4136",
    head: "#1B1712",
    accent: "#6E2A26",
    accentLight: "#6E2A26",
    accentInk: "#F1ECE1",
    alert: "#B3402F",
    neutral: "#C9C0B0",
    panel: "rgba(27,23,18,.05)",
    rule: "rgba(27,23,18,.15)",
    avA: "#6E2A26",
    avB: "#4A1C19",
    avInk: "#F1ECE1",
  },
} satisfies Record<string, Theme>;

/* ------------------------------------------------------------------ */
/* highlighter — the second family with a renderer                      */
/*                                                                      */
/* These are the SAME token values as the `highlighter_orange` /        */
/* `highlighter_green` stubs below, widened to the 17-field `Theme`     */
/* shape the render pipeline reads. Nothing is invented that carries    */
/* text: `alert` is the ink, because this template has no red — the     */
/* worst bar in a benchmark is drawn in ink, per the approved spec.     */
/* ------------------------------------------------------------------ */

const HIGHLIGHTER_THEMES = {
  highlighter_orange: {
    bg: "#F0EADF",
    bgSolid: "#F0EADF",
    fg: "#1B1B1B",
    dim: "#575552",
    head: "#1B1B1B",
    accent: "#F0813C",
    accentLight: "#F7B98A",
    accentInk: "#1B1B1B",
    // No red in this template. Ink IS the alert.
    alert: "#1B1B1B",
    neutral: "#D8CEBE",
    panel: "rgba(27,27,27,.06)",
    rule: "rgba(27,27,27,.16)",
    avA: "#F0813C",
    avB: "#C25E22",
    avInk: "#1B1B1B",
  },
  highlighter_green: {
    bg: "#EDF2EB",
    bgSolid: "#EDF2EB",
    fg: "#15241C",
    dim: "#515E56",
    head: "#15241C",
    accent: "#4CC08A",
    accentLight: "#A6DFC4",
    accentInk: "#15241C",
    alert: "#15241C",
    neutral: "#D3DED4",
    panel: "rgba(21,36,28,.06)",
    rule: "rgba(21,36,28,.16)",
    avA: "#4CC08A",
    avB: "#2E8A5F",
    avInk: "#15241C",
  },
} satisfies Record<string, Theme>;

/* ------------------------------------------------------------------ */
/* crumple — pressed paper, one rotated amber slab                      */
/*                                                                      */
/* Widened from the `crumple_amber` stub below. Nothing is invented that */
/* carries text: `bgSolid` IS the declared paper, `accentInk` IS the     */
/* declared ink, and because this palette holds no red, ink is also the  */
/* alert — the highlighter precedent, not a new decision.                */
/* ------------------------------------------------------------------ */

const CRUMPLE_THEMES = {
  crumple_amber: {
    bg: "#F5F3EE",
    bgSolid: "#F5F3EE",
    fg: "#161616",
    dim: "#57534C",
    head: "#161616",
    accent: "#F2A93B",
    accentLight: "#F8CE8C",
    accentInk: "#161616",
    // No red in this template. Ink IS the alert.
    alert: "#161616",
    neutral: "#DDD8CD",
    panel: "rgba(22,22,22,.06)",
    rule: "rgba(22,22,22,.16)",
    avA: "#F2A93B",
    avB: "#C4801F",
    avInk: "#161616",
  },
} satisfies Record<string, Theme>;

/* ------------------------------------------------------------------ */
/* gridpaper — graph ground, alternating dark slides                    */
/*                                                                      */
/* The one family with a declared inversion ground: `invert` is the      */
/* stub's own `dark`, and `invertFg` is the stub's own paper. Both are   */
/* declared colours reused, never fabricated ones.                       */
/* ------------------------------------------------------------------ */

const GRIDPAPER_THEMES = {
  gridpaper_yellow: {
    bg: "#F6EFE2",
    bgSolid: "#F6EFE2",
    fg: "#141210",
    dim: "#55504A",
    head: "#141210",
    accent: "#F0B429",
    accentLight: "#F7D687",
    accentInk: "#141210",
    // No red in this template either. Ink IS the alert.
    alert: "#141210",
    neutral: "#DED6C6",
    panel: "rgba(20,18,16,.06)",
    rule: "rgba(20,18,16,.16)",
    avA: "#F0B429",
    avB: "#C08A12",
    avInk: "#141210",
    invert: "#141210",
    invertFg: "#F6EFE2",
  },
} satisfies Record<string, Theme>;

export const THEMES = {
  ...INSTRUMENT_THEMES,
  ...HIGHLIGHTER_THEMES,
  ...CRUMPLE_THEMES,
  ...GRIDPAPER_THEMES,
};

export type ThemeName = keyof typeof THEMES;

/** True when a theme is a light-ground (paper) set. Drives ink-on-paper chrome. */
export const PAPER_THEMES: readonly string[] = [
  "paper",
  "highlighter_orange",
  "highlighter_green",
  "crumple_amber",
  "gridpaper_yellow",
];

export const THEME_NAMES = ["midnight", "clay", "gradient", "paper"] as const;

/** midnight is the default. */
export const DEFAULT_THEME: ThemeName = "midnight";

export function getTheme(name?: string | null): Theme {
  return THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : DEFAULT_THEME];
}

/* ------------------------------------------------------------------ */
/* TEMPLATE SCOPING                                                     */
/* ------------------------------------------------------------------ */

/**
 * Which colour sets a template is allowed to use. The Look zone reads this,
 * so a template can never be offered a theme its renderer does not implement.
 * Only `instrument` has a renderer today, so only `instrument` is listed —
 * nothing about the existing UI changes.
 */
export const templateThemes: Record<string, string[]> = {
  instrument: ["midnight", "clay", "gradient", "paper"],
  highlighter: ["highlighter_orange", "highlighter_green"],
  crumple: ["crumple_amber"],
  gridpaper: ["gridpaper_yellow"],
};

/* ------------------------------------------------------------------ */
/* TOKEN STUBS for the six locked template families                     */
/*                                                                      */
/* These are TOKENS ONLY — no renderer consumes them yet. They are a     */
/* separate discriminated union rather than the 17-field `Theme`         */
/* interface on purpose: forcing a paper-and-ink palette to invent a     */
/* `bgSolid`, an `avA` and a `panel` would put fabricated colours in the */
/* registry and the contrast gate would then be testing fiction.         */
/* ------------------------------------------------------------------ */

/** A field (solid dark ground) palette. */
export interface FieldTheme {
  kind: "field";
  field: string;
  fg: string;
  dim?: string;
  alt?: string;
  accent: string;
  accentInk: string;
}

/** A paper (light ground, dark ink) palette. */
export interface PaperTheme {
  kind: "paper";
  paper: string;
  ink: string;
  /** Optional inversion surface used for full-bleed panels. */
  dark?: string;
  accent: string;
  accentInk: string;
}

/** A gradient palette: three stops plus the ink that rides on them. */
export interface GradientTheme {
  kind: "gradient";
  g1: string;
  g2: string;
  g3: string;
  fg: string;
  accent: string;
  accentInk: string;
}

export type TemplateTheme = FieldTheme | PaperTheme | GradientTheme;

export const TEMPLATE_THEMES = {
  salford_navy: {
    kind: "field",
    field: "#152436",
    alt: "#5CE8A4",
    fg: "#FFFFFF",
    dim: "#8FA3B8",
    accent: "#5CE8A4",
    accentInk: "#152436",
  },
  crumple_amber: {
    kind: "paper",
    paper: "#F5F3EE",
    ink: "#161616",
    accent: "#F2A93B",
    accentInk: "#161616",
  },
  highlighter_orange: {
    kind: "paper",
    paper: "#F0EADF",
    ink: "#1B1B1B",
    accent: "#F0813C",
    accentInk: "#1B1B1B",
  },
  highlighter_green: {
    kind: "paper",
    paper: "#EDF2EB",
    ink: "#15241C",
    accent: "#4CC08A",
    accentInk: "#15241C",
  },
  blueprint_violet: {
    kind: "field",
    field: "#161616",
    fg: "#FFFFFF",
    dim: "#B9B9C4",
    accent: "#8A7BFF",
    accentInk: "#161616",
  },
  gridpaper_yellow: {
    kind: "paper",
    paper: "#F6EFE2",
    dark: "#141210",
    ink: "#141210",
    accent: "#F0B429",
    accentInk: "#141210",
  },
  concept_violet: {
    kind: "gradient",
    g1: "#1A1040",
    g2: "#4B3AA8",
    g3: "#6F58E0",
    accent: "#B8F04A",
    accentInk: "#1A1040",
    fg: "#FFFFFF",
  },
} satisfies Record<string, TemplateTheme>;

export type TemplateThemeName = keyof typeof TEMPLATE_THEMES;
