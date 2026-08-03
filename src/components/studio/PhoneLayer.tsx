import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { T, type Lang } from "./strings";

/**
 * L1 — A FULL-SCREEN EDITING LAYER, ON A PHONE ONLY.
 *
 * A focused editing task takes the whole screen. The layer is
 * `position: fixed; inset: 0`, so `100%` inside it is finally the truth: no
 * offset constant, no measured column, no overlay on top of the thing being
 * edited. Nothing outside the layer can be reached while it is open — the
 * shell navigation is stood down by `body[data-studio-layer="open"]` and the
 * layer paints above every other studio surface.
 */
export const PhoneLayer: React.FC<{
  lang: Lang;
  rtl: boolean;
  title: string;
  /** Optional row of sibling layers, rendered in the same bar. */
  tabs?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ lang, rtl, title, tabs, onClose, children }) => {
  useEffect(() => {
    document.body.dataset.studioLayer = "open";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.studioLayer;
      window.removeEventListener("keydown", onKey);
    };
    // The close handler is read fresh on every event, so it never re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  const barBtn: React.CSSProperties = {
    minHeight: 44,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--surface-subtle)",
    color: "var(--text-primary)",
    fontFamily: "var(--ff-ui)",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  };

  return createPortal(
    <div
      dir={rtl ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="md:hidden"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "var(--surface-page)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          display: "grid",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--surface-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={onClose} style={barBtn}>
            {rtl ? `${T.layerBack[lang]} →` : `‹ ${T.layerBack[lang]}`}
          </button>
          <p
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              textAlign: "center",
              fontFamily: "var(--ff-ui)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </p>
          <button type="button" onClick={onClose} style={{ ...barBtn, background: "var(--act-tint)", color: "var(--act)", borderColor: "var(--act)" }}>
            {T.layerDone[lang]}
          </button>
        </div>
        {tabs && <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{tabs}</div>}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default PhoneLayer;
