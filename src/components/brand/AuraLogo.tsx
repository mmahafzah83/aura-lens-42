import { useEffect, useState } from "react";

export type AuraLogoVariant = "light" | "dark" | "auto";
export type AuraLogoDensity = "full" | "compact";

export interface AuraLogoProps {
  size?: number;
  variant?: AuraLogoVariant;
  withWordmark?: boolean;
  className?: string;
  title?: string;
  /** Explicit ink colour. Overrides the variant colour when supplied. */
  ink?: string;
  /** Explicit live-tick colour. Overrides the default teal when supplied. */
  tick?: string;
  /** "compact" drops the 32 minor spokes and thickens the rest for small sizes. */
  density?: AuraLogoDensity;
}

// Radiant Dial mark — single source of truth for the Aura wordmark + mark across the app.
const COLOR_LIGHT = "var(--text-primary)"; // ink on light surfaces
const COLOR_DARK  = "#E8EDF3"; // light on dark surfaces
const TICK_COLOR  = "var(--machine)";

/** Resolved hex fallbacks for standalone SVG (emails, favicons, OG images). */
const INK_HEX = "#0F1519";
const TICK_HEX = "#00CEC9";

/** ONE geometry source. `major` spokes survive compact density. */
export interface Spoke { x1: number; y1: number; x2: number; y2: number; major: boolean }
const SPOKES: Spoke[] = [
  { x1: 32, y1: 18.89, x2: 32, y2: 8.77, major: true },
  { x1: 33.87, y1: 19.03, x2: 34.8, y2: 12.54, major: false },
  { x1: 35.69, y1: 19.42, x2: 37.54, y2: 13.14, major: false },
  { x1: 37.44, y1: 20.08, x2: 40.17, y2: 14.12, major: false },
  { x1: 39.09, y1: 20.97, x2: 44.56, y2: 12.45, major: true },
  { x1: 40.58, y1: 22.09, x2: 44.87, y2: 17.14, major: false },
  { x1: 41.91, y1: 23.42, x2: 46.86, y2: 19.13, major: false },
  { x1: 43.03, y1: 24.91, x2: 48.54, y2: 21.37, major: false },
  { x1: 43.92, y1: 26.56, x2: 53.13, y2: 22.35, major: true },
  { x1: 44.58, y1: 28.31, x2: 50.86, y2: 26.46, major: false },
  { x1: 44.97, y1: 30.13, x2: 51.46, y2: 29.2, major: false },
  { x1: 45.11, y1: 32, x2: 51.66, y2: 32, major: false },
  { x1: 44.97, y1: 33.87, x2: 55, y2: 35.31, major: true },
  { x1: 44.58, y1: 35.69, x2: 50.86, y2: 37.54, major: false },
  { x1: 43.92, y1: 37.44, x2: 49.88, y2: 40.17, major: false },
  { x1: 43.03, y1: 39.09, x2: 48.54, y2: 42.63, major: false },
  { x1: 41.91, y1: 40.58, x2: 49.56, y2: 47.22, major: true },
  { x1: 40.58, y1: 41.91, x2: 44.87, y2: 46.86, major: false },
  { x1: 39.09, y1: 43.03, x2: 42.63, y2: 48.54, major: false },
  { x1: 37.44, y1: 43.92, x2: 40.17, y2: 49.88, major: false },
  { x1: 35.69, y1: 44.58, x2: 38.55, y2: 54.29, major: true },
  { x1: 33.87, y1: 44.97, x2: 34.8, y2: 51.46, major: false },
  { x1: 32, y1: 45.11, x2: 32, y2: 51.66, major: false },
  { x1: 30.13, y1: 44.97, x2: 29.2, y2: 51.46, major: false },
  { x1: 28.31, y1: 44.58, x2: 25.45, y2: 54.29, major: true },
  { x1: 26.56, y1: 43.92, x2: 23.83, y2: 49.88, major: false },
  { x1: 24.91, y1: 43.03, x2: 21.37, y2: 48.54, major: false },
  { x1: 23.42, y1: 41.91, x2: 19.13, y2: 46.86, major: false },
  { x1: 22.09, y1: 40.58, x2: 14.44, y2: 47.22, major: true },
  { x1: 20.97, y1: 39.09, x2: 15.46, y2: 42.63, major: false },
  { x1: 20.08, y1: 37.44, x2: 14.12, y2: 40.17, major: false },
  { x1: 19.42, y1: 35.69, x2: 13.14, y2: 37.54, major: false },
  { x1: 19.03, y1: 33.87, x2: 9, y2: 35.31, major: true },
  { x1: 18.89, y1: 32, x2: 12.34, y2: 32, major: false },
  { x1: 19.03, y1: 30.13, x2: 12.54, y2: 29.2, major: false },
  { x1: 19.42, y1: 28.31, x2: 13.14, y2: 26.46, major: false },
  { x1: 20.08, y1: 26.56, x2: 10.87, y2: 22.35, major: true },
  { x1: 20.97, y1: 24.91, x2: 15.46, y2: 21.37, major: false },
  { x1: 22.09, y1: 23.42, x2: 17.14, y2: 19.13, major: false },
  { x1: 23.42, y1: 22.09, x2: 19.13, y2: 17.14, major: false },
  { x1: 24.91, y1: 20.97, x2: 19.44, y2: 12.45, major: true },
  { x1: 26.56, y1: 20.08, x2: 23.83, y2: 14.12, major: false },
  { x1: 28.31, y1: 19.42, x2: 26.46, y2: 13.14, major: false },
  { x1: 30.13, y1: 19.03, x2: 29.2, y2: 12.54, major: false },
];

const STROKE_MAJOR = 1.2;
const STROKE_MINOR = 0.78;
const STROKE_MAJOR_COMPACT = 1.9;
const STROKE_TICK = 1.55;
const STROKE_TICK_COMPACT = 2.2;

function useResolvedColor(variant: AuraLogoVariant): string {
  const [color, setColor] = useState<string>(
    variant === "dark" ? COLOR_DARK : COLOR_LIGHT,
  );

  useEffect(() => {
    if (variant !== "auto") {
      setColor(variant === "dark" ? COLOR_DARK : COLOR_LIGHT);
      return;
    }
    const root = document.documentElement;
    const compute = () => {
      const isDark =
        root.classList.contains("dark") ||
        root.getAttribute("data-theme") === "dark";
      setColor(isDark ? COLOR_DARK : COLOR_LIGHT);
    };
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, [variant]);

  return color;
}

/**
 * Radiant Dial mark — square 64×64 viewBox.
 */
function MarkSVG({ size, title, tick, density }: {
  size: number; title?: string; tick: string; density: AuraLogoDensity;
}) {
  const compact = density === "compact";
  const spokes = compact ? SPOKES.filter((s) => s.major) : SPOKES;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <g id="mark" fill="currentColor" stroke="currentColor" strokeLinecap="round">
        {spokes.map((s, i) => (
          <line
            key={i}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            strokeWidth={s.major ? (compact ? STROKE_MAJOR_COMPACT : STROKE_MAJOR) : STROKE_MINOR}
          />
        ))}
        <circle cx="32" cy="32" r="6.85" stroke="none" />
      </g>
      <g id="tick-live" stroke={tick} fill={tick} strokeLinecap="round">
        <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" strokeWidth={compact ? STROKE_TICK_COMPACT : STROKE_TICK} />
        <circle cx="49.24" cy="9.94" r="1.61" />
      </g>
    </svg>
  );
}

export function AuraLogo({
  size = 40,
  variant = "auto",
  withWordmark = false,
  className,
  title = "Aura",
  ink,
  tick,
  density = "full",
}: AuraLogoProps) {
  const variantColor = useResolvedColor(variant);
  const color = ink ?? variantColor;

  const wordmarkSize = Math.round(size * 0.45);

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, color }}
    >
      <MarkSVG
        size={size}
        title={withWordmark ? undefined : title}
        tick={tick ?? TICK_COLOR}
        density={density}
      />
      {withWordmark && (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            fontSize: wordmarkSize,
            color,
            lineHeight: 1.5,
          }}
        >
          Aura
        </span>
      )}
    </span>
  );
}

/**
 * Raw SVG string for use in favicons, transactional emails, OG images.
 * Takes RESOLVED hex only — custom properties cannot resolve in standalone SVG.
 * Renders at compact density from the same shared spoke array.
 */
export function getAuraLogoSvgString(
  color: string = INK_HEX,
  size: number = 24,
  tick: string = TICK_HEX,
): string {
  const lines = SPOKES.filter((s) => s.major)
    .map((s) => `    <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="${STROKE_MAJOR_COMPACT}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
  <g fill="${color}" stroke="${color}" stroke-linecap="round">
${lines}
    <circle cx="32" cy="32" r="6.85" stroke="none"/>
  </g>
  <g stroke="${tick}" fill="${tick}" stroke-linecap="round">
    <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="${STROKE_TICK_COMPACT}"/>
    <circle cx="49.24" cy="9.94" r="1.61"/>
  </g>
</svg>`;
}

export const AURA_LOGO_COLORS = { light: COLOR_LIGHT, dark: COLOR_DARK };

export default AuraLogo;
