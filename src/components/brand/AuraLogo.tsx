import { useEffect, useState } from "react";

export type AuraLogoVariant = "light" | "dark" | "auto";

export interface AuraLogoProps {
  size?: number;
  variant?: AuraLogoVariant;
  withWordmark?: boolean;
  className?: string;
  title?: string;
}

const COLOR_LIGHT = "#B08D3A";
const COLOR_DARK = "#D4B056";

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
 * Horizon Eye mark — بصيرة (basira), strategic foresight.
 * ViewBox 0 0 100 80, mark centered at (50, 40).
 */
function MarkSVG({
  size,
  color,
  showRays,
  showIris,
  title,
}: {
  size: number;
  color: string;
  showRays: boolean;
  showIris: boolean;
  title?: string;
}) {
  const height = Math.round(size * 0.8);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 100 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g transform="translate(50 40)" stroke={color} fill="none" strokeLinecap="round">
        {/* Eye almond arcs */}
        <path d="M-44,0 Q-22,-28 0,-28 Q22,-28 44,0" strokeWidth="1.6" />
        <path d="M-44,0 Q-22,28 0,28 Q22,28 44,0" strokeWidth="1.6" />

        {/* Iris ring */}
        {showIris && <circle cx="0" cy="0" r="12" strokeWidth="1.2" />}

        {/* Pupil */}
        <circle cx="0" cy="0" r="5" fill={color} stroke="none" />

        {/* Foresight rays */}
        {showRays && (
          <g strokeWidth="0.7" stroke={color}>
            <line x1="0" y1="-30" x2="0" y2="-34" opacity="0.3" />
            <line x1="-16" y1="-27" x2="-19" y2="-31" opacity="0.25" />
            <line x1="16" y1="-27" x2="19" y2="-31" opacity="0.25" />
          </g>
        )}
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

  // Detail tiers based on size
  const showIris = size >= 32;
  const showRays = size >= 40;

  const wordmarkSize = Math.round(size * 0.45);

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <MarkSVG
        size={size}
        color={color}
        showRays={showRays}
        showIris={showIris}
        title={withWordmark ? undefined : title}
      />
      {withWordmark && (
        <span
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 500,
            letterSpacing: "0.14em",
            fontSize: wordmarkSize,
            color,
            lineHeight: 1,
          }}
        >
          AURA
        </span>
      )}
    </span>
  );
}

/**
 * Raw SVG string for use in favicons, transactional emails, OG images.
 * Pass a hex color; defaults to bronze.
 */
export function getAuraLogoSvgString(color: string = COLOR_LIGHT, size: number = 24): string {
  const showIris = size >= 32;
  const showRays = size >= 40;
  const height = Math.round(size * 0.8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 100 80" fill="none">
  <g transform="translate(50 40)" stroke="${color}" fill="none" stroke-linecap="round">
    <path d="M-44,0 Q-22,-28 0,-28 Q22,-28 44,0" stroke-width="1.6"/>
    <path d="M-44,0 Q-22,28 0,28 Q22,28 44,0" stroke-width="1.6"/>
    ${showIris ? `<circle cx="0" cy="0" r="12" stroke-width="1.2"/>` : ""}
    <circle cx="0" cy="0" r="5" fill="${color}" stroke="none"/>
    ${
      showRays
        ? `<g stroke-width="0.7" stroke="${color}">
      <line x1="0" y1="-30" x2="0" y2="-34" opacity="0.3"/>
      <line x1="-16" y1="-27" x2="-19" y2="-31" opacity="0.25"/>
      <line x1="16" y1="-27" x2="19" y2="-31" opacity="0.25"/>
    </g>`
        : ""
    }
  </g>
</svg>`;
}

export const AURA_LOGO_COLORS = { light: COLOR_LIGHT, dark: COLOR_DARK };

export default AuraLogo;