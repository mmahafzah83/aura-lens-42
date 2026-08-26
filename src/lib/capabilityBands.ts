// Frontend twin of `supabase/functions/_shared/capabilities.ts`.
//
// The cut-offs below are copied verbatim from BAND_THRESHOLDS in that module.
// If one side changes, change both — drifting thresholds make the product lie.
export type CapabilityBand = "not_assessed" | "developing" | "solid" | "strong";

export const BAND_ORDER: CapabilityBand[] = [
  "not_assessed",
  "developing",
  "solid",
  "strong",
];

/** Identical to BAND_THRESHOLDS in _shared/capabilities.ts. */
export const BAND_THRESHOLDS = {
  // The ordinal ladder emits only these values, from three booleans.
  ordinal: {
    not_assessed: [0],
    developing: [33],
    solid: [50, 66, 70],
    strong: [100],
  },
  // Continuous 0–100 sliders.
  slider: {
    developing: { min: 1, max: 39 },
    solid: { min: 40, max: 74 },
    strong: { min: 75, max: 100 },
  },
  /** An untouched slider sits exactly here. Not an answer. */
  sliderUntouchedDefault: 50,
} as const;

export function bandForOrdinal(value: number | null | undefined): CapabilityBand {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not_assessed";
  const t = BAND_THRESHOLDS.ordinal;
  if ((t.strong as readonly number[]).includes(value)) return "strong";
  if ((t.solid as readonly number[]).includes(value)) return "solid";
  if ((t.developing as readonly number[]).includes(value)) return "developing";
  // 0 means "no evidence ticked", never a measured zero.
  return "not_assessed";
}

export function bandForSlider(
  value: number | null | undefined,
  touched: boolean,
): CapabilityBand {
  if (!touched) return "not_assessed";
  if (typeof value !== "number" || !Number.isFinite(value)) return "not_assessed";
  const t = BAND_THRESHOLDS.slider;
  if (value >= t.strong.min) return "strong";
  if (value >= t.solid.min) return "solid";
  if (value >= t.developing.min) return "developing";
  return "not_assessed";
}

export const BAND_COPY: Record<CapabilityBand, { label: string; meaning: string; step: number }> = {
  not_assessed: { label: "Not yet read", meaning: "Aura hasn't seen this one yet.", step: 0 },
  developing: { label: "Developing", meaning: "You have a foundation here.", step: 1 },
  solid: { label: "Solid", meaning: "You can carry this on your own.", step: 2 },
  strong: { label: "Strong", meaning: "Others come to you for this.", step: 3 },
};

/** System-B only. Cyan #00CEC9 is reserved for a small live dot elsewhere. */
export const BAND_TOKEN: Record<CapabilityBand, { fill: string; text: string; bg: string }> = {
  not_assessed: { fill: "#E2E7EE", text: "#5B6673", bg: "#F2F5F9" },
  developing: { fill: "#E0A82E", text: "#9A6F12", bg: "#FDF6E7" },
  solid: { fill: "#0670C4", text: "#04477C", bg: "#EAF3FB" },
  strong: { fill: "#12805C", text: "#12805C", bg: "#E8F5F0" },
};
