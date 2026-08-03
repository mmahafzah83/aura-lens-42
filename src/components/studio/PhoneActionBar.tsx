import React from "react";
import { createPortal } from "react-dom";
import { ACTION_BAR_HEIGHT } from "./usePhone";

/**
 * M2 — ONE THUMB ZONE.
 *
 * A single fixed bar directly ABOVE the Dashboard bottom navigation. It holds
 * at most two controls: one secondary and one primary. Nothing else on a phone
 * floats — the capture button is stood down while the studio is open, so this
 * bar is never overlapped.
 *
 * `env(keyboard-inset-height)` lifts the bar above the on-screen keyboard on
 * the browsers that report it; the focused field is also scrolled into view by
 * the panel, so the primary action can never be covered.
 */
export const PhoneActionBar: React.FC<{
  rtl: boolean;
  /** Left/secondary control, or nothing. */
  secondary?: React.ReactNode;
  /** Right/primary control, or nothing. */
  primary?: React.ReactNode;
  /** Shown above the bar when a control is refused, always in words. */
  note?: string | null;
}> = ({ rtl, secondary, primary, note }) => {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="md:hidden"
      style={{
        position: "fixed",
        insetInlineStart: 0,
        insetInlineEnd: 0,
        left: 0,
        right: 0,
        // Clears the 60px navigation bar, its 4px of breathing room and the
        // device safe area; rises further when a keyboard is reported.
        bottom: "calc(64px + env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px))",
        zIndex: 48,
        background: "var(--surface-card)",
        borderTop: "1px solid var(--border-default)",
        padding: "8px 16px",
      }}
    >
      {note && (
        <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
          {note}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: ACTION_BAR_HEIGHT - 16 }}>
        <div style={{ flex: secondary ? "1 1 0" : "0 0 auto" }}>{secondary}</div>
        <div style={{ flex: primary ? "1 1 0" : "0 0 auto" }}>{primary}</div>
      </div>
    </div>,
    document.body,
  );
};

export default PhoneActionBar;
