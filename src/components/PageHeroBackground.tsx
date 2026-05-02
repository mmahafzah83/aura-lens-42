import { useEffect, useState } from "react";
import { usePageBackground } from "@/hooks/usePageBackground";

interface PageHeroBackgroundProps {
  pageKey: string;
  theme: "dark" | "light";
}

/**
 * Sprint F4 — Optional cinematic background for a page.
 * Reads page_backgrounds via usePageBackground and renders an image layer +
 * gradient overlay + tint. Dormant by default (enabled=false in DB).
 */
export function PageHeroBackground({ pageKey, theme }: PageHeroBackgroundProps) {
  const cfg = usePageBackground(pageKey, theme);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (cfg.enabled && cfg.imageUrl) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
  }, [cfg.enabled, cfg.imageUrl]);

  if (!cfg.enabled || !cfg.imageUrl) return null;

  return (
    <div
      aria-hidden="true"
      className="aura-page-hero-bg"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "var(--page-hero-h, 360px)",
        zIndex: 0,
        pointerEvents: "none",
        opacity: shown ? 1 : 0,
        transition: "opacity 0.8s ease",
        overflow: "hidden",
      }}
    >
      {/* Image layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${cfg.imageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: cfg.position || "center",
          opacity: cfg.opacity,
        }}
      />
      {/* Tint layer */}
      {cfg.tintColor && (
        <div style={{ position: "absolute", inset: 0, background: cfg.tintColor, mixBlendMode: "overlay" }} />
      )}
      {/* Gradient overlay */}
      {cfg.gradientOverlay && (
        <div style={{ position: "absolute", inset: 0, background: cfg.gradientOverlay }} />
      )}
    </div>
  );
}

export default PageHeroBackground;