import { useEffect, useState } from "react";

export type AuraLogoVariant = "light" | "dark" | "auto";

export interface AuraLogoProps {
  size?: number;
  variant?: AuraLogoVariant;
  withWordmark?: boolean;
  className?: string;
  title?: string;
}

// Radiant Dial mark — single source of truth for the Aura wordmark + mark across the app.
// The mark uses currentColor so it inherits the surface text colour
// (ink on bone surfaces, light on dark). The live-tick stays teal.
const COLOR_LIGHT = "#1B1712"; // ink on bone surfaces
const COLOR_DARK  = "#E8EDF3"; // light on dark surfaces
const TICK_COLOR  = "#36C5B0";

function useResolvedColor(variant: AuraLogoVariant): string {
  const [color, setColor] = useState<string>(
    variant === "dark" ? COLOR_DARK : variant === "light" ? COLOR_LIGHT : COLOR_LIGHT,
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
 * The #mark group inherits currentColor; #tick-live stays teal.
 */
function MarkSVG({ size, title }: { size: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g id="mark" fill="currentColor" stroke="currentColor" strokeLinecap="round">
        <line x1="32" y1="18.89" x2="32" y2="8.77" strokeWidth="1.2" />
        <line x1="33.87" y1="19.03" x2="34.8" y2="12.54" strokeWidth="0.78" />
        <line x1="35.69" y1="19.42" x2="37.54" y2="13.14" strokeWidth="0.78" />
        <line x1="37.44" y1="20.08" x2="40.17" y2="14.12" strokeWidth="0.78" />
        <line x1="39.09" y1="20.97" x2="44.56" y2="12.45" strokeWidth="1.2" />
        <line x1="40.58" y1="22.09" x2="44.87" y2="17.14" strokeWidth="0.78" />
        <line x1="41.91" y1="23.42" x2="46.86" y2="19.13" strokeWidth="0.78" />
        <line x1="43.03" y1="24.91" x2="48.54" y2="21.37" strokeWidth="0.78" />
        <line x1="43.92" y1="26.56" x2="53.13" y2="22.35" strokeWidth="1.2" />
        <line x1="44.58" y1="28.31" x2="50.86" y2="26.46" strokeWidth="0.78" />
        <line x1="44.97" y1="30.13" x2="51.46" y2="29.2" strokeWidth="0.78" />
        <line x1="45.11" y1="32" x2="51.66" y2="32" strokeWidth="0.78" />
        <line x1="44.97" y1="33.87" x2="55" y2="35.31" strokeWidth="1.2" />
        <line x1="44.58" y1="35.69" x2="50.86" y2="37.54" strokeWidth="0.78" />
        <line x1="43.92" y1="37.44" x2="49.88" y2="40.17" strokeWidth="0.78" />
        <line x1="43.03" y1="39.09" x2="48.54" y2="42.63" strokeWidth="0.78" />
        <line x1="41.91" y1="40.58" x2="49.56" y2="47.22" strokeWidth="1.2" />
        <line x1="40.58" y1="41.91" x2="44.87" y2="46.86" strokeWidth="0.78" />
        <line x1="39.09" y1="43.03" x2="42.63" y2="48.54" strokeWidth="0.78" />
        <line x1="37.44" y1="43.92" x2="40.17" y2="49.88" strokeWidth="0.78" />
        <line x1="35.69" y1="44.58" x2="38.55" y2="54.29" strokeWidth="1.2" />
        <line x1="33.87" y1="44.97" x2="34.8" y2="51.46" strokeWidth="0.78" />
        <line x1="32" y1="45.11" x2="32" y2="51.66" strokeWidth="0.78" />
        <line x1="30.13" y1="44.97" x2="29.2" y2="51.46" strokeWidth="0.78" />
        <line x1="28.31" y1="44.58" x2="25.45" y2="54.29" strokeWidth="1.2" />
        <line x1="26.56" y1="43.92" x2="23.83" y2="49.88" strokeWidth="0.78" />
        <line x1="24.91" y1="43.03" x2="21.37" y2="48.54" strokeWidth="0.78" />
        <line x1="23.42" y1="41.91" x2="19.13" y2="46.86" strokeWidth="0.78" />
        <line x1="22.09" y1="40.58" x2="14.44" y2="47.22" strokeWidth="1.2" />
        <line x1="20.97" y1="39.09" x2="15.46" y2="42.63" strokeWidth="0.78" />
        <line x1="20.08" y1="37.44" x2="14.12" y2="40.17" strokeWidth="0.78" />
        <line x1="19.42" y1="35.69" x2="13.14" y2="37.54" strokeWidth="0.78" />
        <line x1="19.03" y1="33.87" x2="9" y2="35.31" strokeWidth="1.2" />
        <line x1="18.89" y1="32" x2="12.34" y2="32" strokeWidth="0.78" />
        <line x1="19.03" y1="30.13" x2="12.54" y2="29.2" strokeWidth="0.78" />
        <line x1="19.42" y1="28.31" x2="13.14" y2="26.46" strokeWidth="0.78" />
        <line x1="20.08" y1="26.56" x2="10.87" y2="22.35" strokeWidth="1.2" />
        <line x1="20.97" y1="24.91" x2="15.46" y2="21.37" strokeWidth="0.78" />
        <line x1="22.09" y1="23.42" x2="17.14" y2="19.13" strokeWidth="0.78" />
        <line x1="23.42" y1="22.09" x2="19.13" y2="17.14" strokeWidth="0.78" />
        <line x1="24.91" y1="20.97" x2="19.44" y2="12.45" strokeWidth="1.2" />
        <line x1="26.56" y1="20.08" x2="23.83" y2="14.12" strokeWidth="0.78" />
        <line x1="28.31" y1="19.42" x2="26.46" y2="13.14" strokeWidth="0.78" />
        <line x1="30.13" y1="19.03" x2="29.2" y2="12.54" strokeWidth="0.78" />
        <circle cx="32" cy="32" r="6.85" stroke="none" />
      </g>
      <g id="tick-live" stroke={TICK_COLOR} fill={TICK_COLOR} strokeLinecap="round">
        <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" strokeWidth="1.55" />
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
}: AuraLogoProps) {
  const color = useResolvedColor(variant);

  const wordmarkSize = Math.round(size * 0.45);

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, color }}
    >
      <MarkSVG
        size={size}
        title={withWordmark ? undefined : title}
      />
      {withWordmark && (
        <span
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
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
 * Pass a hex color; defaults to ink.
 */
export function getAuraLogoSvgString(color: string = COLOR_LIGHT, size: number = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
  <g fill="${color}" stroke="${color}" stroke-linecap="round">
    <line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/>
    <line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/>
    <line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/>
    <line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/>
    <line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/>
    <line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/>
    <line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/>
    <line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/>
    <line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/>
    <line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/>
    <line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/>
    <circle cx="32" cy="32" r="6.85" stroke="none"/>
  </g>
  <g stroke="${TICK_COLOR}" fill="${TICK_COLOR}" stroke-linecap="round">
    <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/>
    <circle cx="49.24" cy="9.94" r="1.61"/>
  </g>
</svg>`;
}

export const AURA_LOGO_COLORS = { light: COLOR_LIGHT, dark: COLOR_DARK };

export default AuraLogo;