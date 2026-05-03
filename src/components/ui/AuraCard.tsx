import React, { useState, ReactNode, CSSProperties } from "react";

export interface AuraCardProps {
  children: ReactNode;
  variant?: "default" | "dark" | "elevated";
  hover?: "lift" | "glow" | "none";
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function AuraCard({
  children,
  variant = "default",
  hover = "lift",
  onClick,
  selected = false,
  className,
}: AuraCardProps) {
  const [isHover, setIsHover] = useState(false);

  const bgByVariant: Record<string, string> = {
    default: "var(--vellum, #FBF8F1)",
    dark: "#111118",
    elevated: "var(--paper, #F5F0E6)",
  };

  const baseShadow = "var(--shadow-rest, 0 1px 2px rgba(0,0,0,0.04))";
  const hoverShadow =
    hover === "lift"
      ? "var(--shadow-lift)"
      : hover === "glow"
      ? "var(--shadow-brand)"
      : baseShadow;

  const style: CSSProperties = {
    position: "relative",
    background: selected ? "var(--brand-ghost, #F8F2E2)" : bgByVariant[variant],
    border: `1px solid ${
      selected ? "var(--brand, #B08D3A)" : "var(--brand-line, rgba(176,141,58,0.22))"
    }`,
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: isHover && hover !== "none" ? hoverShadow : baseShadow,
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: onClick ? "pointer" : undefined,
    transform: isHover && hover === "lift" ? "translateY(-1px)" : undefined,
  };

  const beforeStyle: CSSProperties = {
    content: '""',
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 2,
    background: "var(--brand)",
    opacity: isHover ? 1 : 0,
    transition: "opacity 0.2s",
    borderRadius: 2,
  };

  return (
    <div
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      <span aria-hidden style={beforeStyle} />
      {children}
    </div>
  );
}

export default AuraCard;