import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { T, type Lang } from "./strings";
import { ABOVE_ACTION_BAR } from "./usePhone";

/**
 * M3 — the bottom sheet.
 *
 * Anchored ABOVE the action bar, opening at roughly 40% of the viewport and
 * expandable to 80%. It never covers the top of the content, so the slide it
 * belongs to stays visible above it at all times. The grab handle is a real
 * button carrying a full phrase, not a bare glyph, and it mirrors with the
 * interface language.
 */
export const PhoneSheet: React.FC<{
  lang: Lang;
  rtl: boolean;
  open: boolean;
  title: string;
  expanded: boolean;
  onExpanded: (v: boolean) => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ lang, rtl, open, title, expanded, onExpanded, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      dir={rtl ? "rtl" : "ltr"}
      role="dialog"
      aria-label={title}
      className="md:hidden"
      style={{
        position: "fixed",
        insetInlineStart: 0,
        insetInlineEnd: 0,
        left: 0,
        right: 0,
        bottom: ABOVE_ACTION_BAR,
        zIndex: 47,
        height: expanded ? "78vh" : "42vh",
        background: "var(--surface-card)",
        borderTop: "1px solid var(--border-default)",
        borderStartStartRadius: 18,
        borderStartEndRadius: 18,
        boxShadow: "0 -10px 30px rgba(0,0,0,.35)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        transition: "height .2s ease",
      }}
    >
      <div style={{ padding: "8px 16px 6px", borderBottom: "1px solid var(--border-default)" }}>
        {/* The grab affordance IS the expand control, and it says so in words. */}
        <button
          type="button"
          onClick={() => onExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            width: "100%",
            minHeight: 44,
            display: "grid",
            gap: 4,
            justifyItems: "center",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span aria-hidden="true" style={{ display: "block", width: 40, height: 4, borderRadius: 999, background: "var(--border-default)" }} />
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600, color: "var(--act)" }}>
            {expanded ? T.sheetShrink[lang] : T.sheetExpand[lang]}
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
          <p style={{ flex: 1, minWidth: 0, fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "var(--surface-subtle)",
              color: "var(--text-primary)",
              fontFamily: "var(--ff-ui)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {T.helpClose[lang]}
          </button>
        </div>
      </div>
      <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "12px 16px 20px" }}>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default PhoneSheet;
