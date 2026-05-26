import React, { useEffect, useLayoutEffect, useRef, useState, ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface InfoTooltipProps {
  children?: ReactNode;
  side?: "top" | "bottom";
  width?: number;
  triggerSize?: number;
  /** Legacy: text content (used when children not provided) */
  text?: string;
  /** Legacy: aria label */
  label?: string;
  className?: string;
  /** Horizontal alignment of the panel relative to the trigger */
  align?: "center" | "left" | "right";
}

export function InfoTooltip({
  children,
  side = "top",
  width = 260,
  triggerSize = 17,
  text,
  label,
  className,
  align = "center",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [triggerHover, setTriggerHover] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; effectiveSide: "top" | "bottom"; arrowLeft: number } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visible = open || hover || triggerHover;

  // Compute viewport-aware position for floating panel (desktop)
  useLayoutEffect(() => {
    if (!visible || isMobile) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const tr = trigger.getBoundingClientRect();
    const pad = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(width, vw - pad * 2);
    const ph = panel.offsetHeight || 120;

    // Decide side: prefer requested side, flip if it clips
    let eff: "top" | "bottom" = side;
    if (eff === "top" && tr.top - ph - 12 < pad) eff = "bottom";
    else if (eff === "bottom" && tr.bottom + ph + 12 > vh - pad) eff = "top";

    const top = eff === "top" ? tr.top - ph - 12 : tr.bottom + 12;

    // Center horizontally on trigger, clamp to viewport
    const triggerCenter = tr.left + tr.width / 2;
    let left = triggerCenter - pw / 2;
    if (align === "left") left = tr.left;
    else if (align === "right") left = tr.right - pw;
    left = Math.max(pad, Math.min(left, vw - pw - pad));

    const arrowLeft = Math.max(12, Math.min(triggerCenter - left, pw - 12));

    setPos({ top, left, effectiveSide: eff, arrowLeft });
  }, [visible, isMobile, side, width, align, children, text]);

  const triggerStyle: CSSProperties = {
    width: triggerSize,
    height: triggerSize,
    borderRadius: "50%",
    border: `1px solid ${triggerHover ? "var(--brand)" : "var(--brand-line)"}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    color: triggerHover ? "var(--brand)" : "var(--ink-3)",
    cursor: "pointer",
    background: "transparent",
    padding: 0,
    transition: "color 0.2s, border-color 0.2s",
    verticalAlign: "middle",
    lineHeight: 1.5,
  };

  const basePanelStyle: CSSProperties = {
    position: "fixed",
    background: "var(--vellum, #FBF8F1)",
    border: "1px solid var(--brand-line)",
    borderRadius: 10,
    padding: "16px 18px",
    fontSize: 12,
    color: "var(--ink-3)",
    lineHeight: 1.7,
    boxShadow: "var(--shadow-lift)",
    zIndex: 1000,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? "auto" : "none",
    transition: "opacity 0.2s ease",
    textAlign: "left",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 400,
    letterSpacing: "normal",
    textTransform: "none",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    whiteSpace: "normal",
  };

  let panelStyle: CSSProperties;
  let arrowStyle: CSSProperties | null = null;

  if (isMobile) {
    panelStyle = {
      ...basePanelStyle,
      left: 16,
      right: 16,
      bottom: 16,
      width: "auto",
      maxWidth: "calc(100vw - 32px)",
      padding: "18px 20px",
      fontSize: 13,
    };
  } else {
    const effSide = pos?.effectiveSide ?? side;
    panelStyle = {
      ...basePanelStyle,
      top: pos?.top ?? -9999,
      left: pos?.left ?? -9999,
      width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 32 : width),
      maxWidth: "calc(100vw - 32px)",
    };
    arrowStyle = {
      position: "absolute",
      width: 10,
      height: 10,
      background: "var(--vellum, #FBF8F1)",
      transform: "rotate(45deg)",
      left: (pos?.arrowLeft ?? 20) - 5,
    };
    if (effSide === "bottom") {
      arrowStyle.top = -5;
      arrowStyle.borderLeft = "1px solid var(--brand-line)";
      arrowStyle.borderTop = "1px solid var(--brand-line)";
    } else {
      arrowStyle.bottom = -5;
      arrowStyle.borderRight = "1px solid var(--brand-line)";
      arrowStyle.borderBottom = "1px solid var(--brand-line)";
    }
  }

  const panelNode = (
    <div ref={panelRef} role="tooltip" style={panelStyle}>
      {arrowStyle && <span aria-hidden style={arrowStyle} />}
      {children ?? text}
    </div>
  );

  return (
    <span
      ref={wrapRef}
      className={className}
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        ref={triggerRef}
        aria-label={label ? `Info: ${label}` : "More info"}
        style={triggerStyle}
        onMouseEnter={() => setTriggerHover(true)}
        onMouseLeave={() => setTriggerHover(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {visible && typeof document !== "undefined" && createPortal(panelNode, document.body)}
    </span>
  );
}

export default InfoTooltip;