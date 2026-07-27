import React from "react";

/**
 * System-B buttons — five roles, no more.
 *
 * Primary (one per view), Ghost, DangerGhost, Dark (on night surfaces only)
 * and AI (the single sanctioned cyan→blue gradient, Ask Aura's alone).
 * All colour comes from tokens; nothing here carries a raw hex.
 */

type Base = React.ButtonHTMLAttributes<HTMLButtonElement>;

const FONT: React.CSSProperties = {
  fontFamily: "var(--ff-ui)",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.2,
};

const SHELL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 8,
  padding: "10px 15px",
  cursor: "pointer",
  transition: "background 150ms ease, box-shadow 150ms ease, transform 120ms ease, opacity 150ms ease",
  ...FONT,
};

function disabledStyle(disabled?: boolean): React.CSSProperties {
  return disabled ? { opacity: 0.45, cursor: "not-allowed" } : {};
}

/** Primary — the single "do this" action on a view. */
export const ButtonPrimary: React.FC<Base> = ({ style, disabled, onMouseDown, onMouseUp, onMouseLeave, ...rest }) => (
  <button
    type="button"
    aria-disabled={disabled || undefined}
    disabled={disabled}
    className="cursor-pointer"
    style={{
      ...SHELL,
      background: "var(--v23-btn-bg)",
      color: "var(--text-inverse)",
      border: 0,
      boxShadow: "var(--v23-btn-inset), var(--v23-btn-shadow)",
      ...disabledStyle(disabled),
      ...style,
    }}
    onMouseDown={(e) => {
      if (!disabled) {
        e.currentTarget.style.transform = "translateY(1px)";
        e.currentTarget.style.boxShadow = "var(--v23-btn-pressed)";
      }
      onMouseDown?.(e);
    }}
    onMouseUp={(e) => {
      e.currentTarget.style.transform = "none";
      e.currentTarget.style.boxShadow = "var(--v23-btn-inset), var(--v23-btn-shadow)";
      onMouseUp?.(e);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "none";
      e.currentTarget.style.boxShadow = "var(--v23-btn-inset), var(--v23-btn-shadow)";
      onMouseLeave?.(e);
    }}
    {...rest}
  />
);

/** Ghost — a secondary action on a light surface. */
export const ButtonGhost: React.FC<Base> = ({ style, disabled, onMouseEnter, onMouseLeave, ...rest }) => (
  <button
    type="button"
    aria-disabled={disabled || undefined}
    disabled={disabled}
    className="cursor-pointer"
    style={{
      ...SHELL,
      background: "transparent",
      color: "var(--text-primary)",
      border: "1px solid var(--border-default)",
      ...disabledStyle(disabled),
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) e.currentTarget.style.background = "var(--surface-subtle)";
      onMouseEnter?.(e);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "transparent";
      onMouseLeave?.(e);
    }}
    {...rest}
  />
);

/** Danger ghost — destructive secondary (Discard). */
export const ButtonDangerGhost: React.FC<Base> = ({ style, disabled, onMouseEnter, onMouseLeave, ...rest }) => (
  <button
    type="button"
    aria-disabled={disabled || undefined}
    disabled={disabled}
    className="cursor-pointer"
    style={{
      ...SHELL,
      background: "transparent",
      color: "var(--error)",
      border: "1px solid var(--error)",
      ...disabledStyle(disabled),
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) e.currentTarget.style.background = "var(--error-tint)";
      onMouseEnter?.(e);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "transparent";
      onMouseLeave?.(e);
    }}
    {...rest}
  />
);

/** Dark — for use ON night surfaces only (the Overnight card). */
export const ButtonDark: React.FC<Base> = ({ style, disabled, onMouseEnter, onMouseLeave, ...rest }) => (
  <button
    type="button"
    aria-disabled={disabled || undefined}
    disabled={disabled}
    className="cursor-pointer"
    style={{
      ...SHELL,
      background: "var(--v23-night-lift)",
      color: "var(--text-inverse)",
      border: "1px solid var(--v23-night-line)",
      ...disabledStyle(disabled),
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) e.currentTarget.style.background = "var(--v23-night-hover)";
      onMouseEnter?.(e);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "var(--v23-night-lift)";
      onMouseLeave?.(e);
    }}
    {...rest}
  />
);

/** AI — Ask Aura's alone. The one cyan→blue gradient in the system. */
export const ButtonAI: React.FC<Base> = ({ style, onMouseEnter, onMouseLeave, ...rest }) => (
  <button
    type="button"
    className="cursor-pointer"
    style={{
      ...SHELL,
      height: 38,
      padding: "0 14px",
      gap: 7,
      background: "var(--v23-ask-bg)",
      color: "var(--text-inverse)",
      border: 0,
      fontSize: 13,
      boxShadow: "var(--v23-ask-glow)",
      ...style,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; onMouseEnter?.(e); }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; onMouseLeave?.(e); }}
    {...rest}
  />
);