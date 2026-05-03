import React, { useEffect, useRef, useState, ReactNode, CSSProperties } from "react";

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
  side = "bottom",
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

  const triggerStyle: CSSProperties = {
    width: triggerSize,
    height: triggerSize,
    borderRadius: "50%",
    border: `1px solid ${triggerHover ? "var(--brand)" : "var(--brand-line)"}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 600,
    color: triggerHover ? "var(--brand)" : "var(--ink-3)",
    cursor: "pointer",
    background: "transparent",
    padding: 0,
    transition: "color 0.2s, border-color 0.2s",
    verticalAlign: "middle",
    lineHeight: 1,
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    width,
    background: "var(--vellum, #FBF8F1)",
    border: "1px solid var(--brand-line)",
    borderRadius: 10,
    padding: "16px 18px",
    fontSize: 12,
    color: "var(--ink-3)",
    lineHeight: 1.7,
    boxShadow: "var(--shadow-lift)",
    zIndex: 50,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? "auto" : "none",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    textAlign: "left",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 400,
    letterSpacing: "normal",
    textTransform: "none",
  };

  const xTransform =
    align === "center" ? "translateX(-50%)" : "translateX(0)";
  if (align === "center") panelStyle.left = "50%";
  else if (align === "left") panelStyle.left = 0;
  else panelStyle.right = 0;

  if (side === "bottom") {
    panelStyle.top = "calc(100% + 12px)";
    panelStyle.transform = `${xTransform} translateY(${visible ? 0 : 6}px)`;
  } else {
    panelStyle.bottom = "calc(100% + 12px)";
    panelStyle.transform = `${xTransform} translateY(${visible ? 0 : -6}px)`;
  }

  const arrowStyle: CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    background: "var(--vellum, #FBF8F1)",
    transform: "rotate(45deg)",
    marginLeft: 0,
  };
  if (align === "center") {
    arrowStyle.left = "50%";
    arrowStyle.marginLeft = -5;
  } else if (align === "left") {
    arrowStyle.left = 20;
  } else {
    arrowStyle.right = 20;
  }
  if (side === "bottom") {
    arrowStyle.top = -5;
    arrowStyle.borderLeft = "1px solid var(--brand-line)";
    arrowStyle.borderTop = "1px solid var(--brand-line)";
  } else {
    arrowStyle.bottom = -5;
    arrowStyle.borderRight = "1px solid var(--brand-line)";
    arrowStyle.borderBottom = "1px solid var(--brand-line)";
  }

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
      <div role="tooltip" style={panelStyle}>
        <span aria-hidden style={arrowStyle} />
        {children ?? text}
      </div>
    </span>
  );
}

export default InfoTooltip;