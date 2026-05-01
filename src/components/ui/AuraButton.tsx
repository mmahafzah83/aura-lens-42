import React, { useState, CSSProperties } from "react";

export type AuraButtonVariant = "primary" | "signal" | "ghost" | "danger";
export type AuraButtonSize = "sm" | "md" | "lg";

export type AuraButtonProps = {
  variant?: AuraButtonVariant;
  size?: AuraButtonSize;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  style?: CSSProperties;
};

const SIZE_STYLES: Record<AuraButtonSize, CSSProperties> = {
  sm: { padding: "6px 14px", fontSize: 12, borderRadius: 6 },
  md: { padding: "10px 20px", fontSize: 14, borderRadius: 8 },
  lg: { padding: "14px 28px", fontSize: 16, borderRadius: 10 },
};

function variantBase(variant: AuraButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "var(--brand)",
        color: "var(--paper)",
        border: "none",
      };
    case "signal":
      return {
        background: "var(--signal)",
        color: "#fff",
        border: "none",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--brand)",
        border: "0.5px solid var(--brand-line)",
      };
    case "danger":
      return {
        background: "var(--danger)",
        color: "#fff",
        border: "none",
      };
  }
}

function variantHover(variant: AuraButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "var(--brand-deep)",
        boxShadow: "var(--shadow-brand)",
      };
    case "signal":
      return { filter: "brightness(1.1)" };
    case "ghost":
      return { background: "var(--brand-ghost)" };
    case "danger":
      return { filter: "brightness(1.1)" };
  }
}

export const AuraButton: React.FC<AuraButtonProps> = ({
  variant = "primary",
  size = "md",
  children,
  onClick,
  disabled = false,
  className,
  type = "button",
  style,
}) => {
  const [hover, setHover] = useState(false);

  const base = variantBase(variant);
  const hoverStyle = !disabled && hover ? variantHover(variant) : {};

  const composed: CSSProperties = {
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background 120ms ease, box-shadow 120ms ease, filter 120ms ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1.2,
    ...SIZE_STYLES[size],
    ...base,
    ...hoverStyle,
    ...style,
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className}
      style={composed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
};

export default AuraButton;