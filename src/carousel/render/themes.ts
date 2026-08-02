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
}

export const THEMES = {
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

export type ThemeName = keyof typeof THEMES;

export const THEME_NAMES = ["midnight", "clay", "gradient", "paper"] as const;

/** midnight is the default. */
export const DEFAULT_THEME: ThemeName = "midnight";

export function getTheme(name?: string | null): Theme {
  return THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : DEFAULT_THEME];
}