import React, { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * System-B tooltip — dark card, optional cyan title line.
 *
 * Only ever used to explain something real (how a number is made, what a
 * rail section does). Never attached to a plain label.
 */

interface TooltipProps {
  title?: string;
  body: string;
  children: React.ReactElement;
}

export const TooltipPanel: React.FC<{ title?: string; body: string; left: number; top: number }> = ({ title, body, left, top }) => (
  <div
    role="tooltip"
    className="v23-tooltip pointer-events-none fixed z-50"
    style={{
      left, top, maxWidth: 236, padding: "9px 11px", borderRadius: 9,
      background: "var(--v23-tooltip-bg)", color: "var(--v23-tooltip-text)",
      boxShadow: "var(--v23-tooltip-shadow)",
      fontFamily: "var(--ff-ui)", fontSize: 11.5, lineHeight: 1.6,
      animation: "v23TooltipIn 150ms ease both",
    }}
  >
    {title && <div style={{ color: "var(--machine)", fontWeight: 600 }}>{title}</div>}
    <div style={{ color: "var(--v23-tooltip-muted)" }}>{body}</div>
  </div>
);

const Tooltip: React.FC<TooltipProps> = ({ title, body, children }) => {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLElement | null>(null);

  const show = useCallback((e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ left: Math.min(r.left, window.innerWidth - 248), top: Math.max(8, r.bottom + 8) });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  const child = React.cloneElement(children as any, {
    ref,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <>
      {child}
      {pos && createPortal(<TooltipPanel title={title} body={body} left={pos.left} top={pos.top} />, document.body)}
    </>
  );
};

export default Tooltip;