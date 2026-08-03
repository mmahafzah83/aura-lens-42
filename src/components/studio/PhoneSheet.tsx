import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T, type Lang } from "./strings";
import { ABOVE_ACTION_BAR, PHONE_SHEET_H, PHONE_SHEET_H_TALL } from "./usePhone";

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  /**
   * K1 — the close handler is held in a ref, NEVER in the dependency array.
   * The call site passes a fresh arrow on every render; depending on it made
   * the effect tear down and re-run on every keystroke, which stole focus out
   * of whatever field the member was typing in.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // Whatever opened the sheet gets the focus back when it closes.
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    // Runs once per opening, never again while the member types.
    const t = window.setTimeout(() => focusables()[0]?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    // One scroll container at a time: the page behind the sheet is frozen.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const opener = openerRef.current;
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* A tap anywhere outside puts the slide back in full view. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="md:hidden"
        // K3 — above the action bar (48), so nothing outside the sheet can be
        // tapped while a modal sheet is open.
        style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,.35)" }}
      />
    <div
      ref={panelRef}
      dir={rtl ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="md:hidden"
      style={{
        position: "fixed",
        insetInlineStart: 0,
        insetInlineEnd: 0,
        left: 0,
        right: 0,
        bottom: ABOVE_ACTION_BAR,
        zIndex: 50,
        // K2 — the sheet's height is CSS, and the two states differ by a full
        // 14dvh, so expanding visibly shrinks the slide above it.
        height: expanded ? PHONE_SHEET_H_TALL : PHONE_SHEET_H,
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
    </div>
    </>,
    document.body,
  );
};

export default PhoneSheet;
