import React, { useState, CSSProperties } from "react";

export type AuraButtonVariant = "primary" | "secondary" | "signal" | "ghost" | "danger";
export type AuraButtonSize = "sm" | "md" | "lg";

export type AuraButtonProps = {
  variant?: AuraButtonVariant;
  size?: AuraButtonSize;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
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
    case "secondary":
      return {
        background: "var(--brand-ghost)",
        color: "var(--brand)",
        border: "1px solid var(--brand-line)",
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
        color: "var(--ink-3)",
        border: "1px solid var(--brand-line)",
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
    case "secondary":
      return { background: "color-mix(in srgb, var(--brand) 15%, transparent)" };
    case "signal":
      return { filter: "brightness(1.1)" };
    case "ghost":
      return { background: "var(--brand-ghost)", color: "var(--ink)" };
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
  loading = false,
  className,
  type = "button",
  style,
}) => {
  const [hover, setHover] = useState(false);
  const isDisabled = disabled || loading;

  const base = variantBase(variant);
  const hoverStyle = !isDisabled && hover ? variantHover(variant) : {};

  const composed: CSSProperties = {
    fontWeight: 600,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.4 : 1,
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
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={className}
      style={composed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading ? (
        <span
          aria-label="Loading"
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "aurabtn-spin 0.7s linear infinite",
          }}
        />
      ) : (
        children
      )}
      <style>{`@keyframes aurabtn-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
};

export default AuraButton;