import React from "react";

/**
 * homeAtoms — the shared parts of Home. Every value is a token from
 * src/index.css; no hex literal may appear in this file or its consumers.
 */

/**
 * One stylesheet, injected once, owns every hover / pressed / disabled state
 * on Home. Inline styles cannot carry pseudo-classes, so the atoms below wear
 * class names and the rules live here — never as per-component mouse handlers.
 */
export const HOME_ATOM_CSS = `
.ha-i { cursor: pointer; transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out, transform 120ms ease-out; }
.ha-i:disabled, .ha-i[aria-disabled="true"] {
  cursor: not-allowed; transform: none;
  background: var(--surface-subtle); color: var(--text-muted); border-color: var(--rule-outer);
}
.ha-i:not(:disabled):active { transform: translateY(1px); }

/* the primary — blue fill darkens to the action hover token */
.ha-act:not(:disabled):hover { background: var(--act-hover); }

/* the black publish pill */
.ha-publish:not(:disabled):hover { background: var(--surface-inverse); filter: brightness(1.18); }

/* outlined and text-only actions move their ink toward the action token */
.ha-ghost:not(:disabled):hover { background: var(--act-tint); border-color: var(--act-hover); color: var(--act-hover); }
.ha-text:not(:disabled):hover { color: var(--text-primary); }

/* shelf rows must feel pressable before they are pressed */
.ha-shelf:not(:disabled):hover { border-color: var(--act); }
.ha-shelf:not(:disabled):hover .ha-chev { transform: translateX(2px); color: var(--act); }
.ha-chev { transition: transform 120ms ease-out, color 120ms ease-out; display: inline-block; }

/* the quiet index rows and the zoom / lens pills */
.ha-index:not(:disabled):hover { color: var(--text-primary); }
.ha-index:not(:disabled):hover .ha-chev { transform: translateX(2px); color: var(--act); }
.ha-pill:not(:disabled):hover { border-color: var(--act); color: var(--act); }

/* night surface: the border brightens, the fill never turns blue */
.ha-nightchip:not(:disabled):hover { border-color: color-mix(in srgb, var(--v23-night-line) 40%, var(--v23-on-night)); }

@media (prefers-reduced-motion: reduce) {
  .ha-i, .ha-chev { transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out; }
  .ha-i:not(:disabled):active { transform: none; }
  .ha-shelf:not(:disabled):hover .ha-chev,
  .ha-index:not(:disabled):hover .ha-chev { transform: none; }
}
`;

const STYLE_ID = "home-atom-interaction-css";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = HOME_ATOM_CSS;
  document.head.appendChild(el);
}

/** Join a caller's className with the atom's own. */
const cx = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");

export const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
};

export const Kicker: React.FC<React.PropsWithChildren<{
  style?: React.CSSProperties;
  /** Render as a real heading where the kicker is the section's title. */
  as?: "div" | "h2" | "h3";
}>> = ({ children, style, as: Tag = "div" }) => (
  <Tag style={{
    ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase",
    color: "var(--text-muted)", margin: 0, fontWeight: 400, ...style,
  }}>{children}</Tag>
);

/**
 * Three card weights and no others.
 *  stage  — the card that holds the stage: elevated, generous padding.
 *  shelf  — flat, hairline border.
 *  strip  — no border at all, only a rule above.
 */
export type CardWeight = "stage" | "shelf" | "strip";

const WEIGHT: Record<CardWeight, React.CSSProperties> = {
  stage: {
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
    borderRadius: 16, padding: 22, boxShadow: "var(--v23-card-hover)",
  },
  shelf: {
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
    borderRadius: 14, padding: 16, boxShadow: "none",
  },
  strip: {
    background: "transparent", border: 0, borderBlockStart: "1px solid var(--rule-divider)",
    borderRadius: 0, padding: "14px 0", boxShadow: "none",
  },
};

export const Card: React.FC<React.PropsWithChildren<{
  style?: React.CSSProperties; weight?: CardWeight;
}>> = ({ children, style, weight = "stage" }) => (
  <div style={{ ...WEIGHT[weight], ...style }}>{children}</div>
);

export const Num: React.FC<React.PropsWithChildren<{ size?: number; color?: string }>> = ({ children, size = 14, color }) => (
  <span style={{ ...MONO, fontSize: size, fontWeight: 600, color: color ?? "var(--text-primary)" }}>{children}</span>
);

/** Blue = his turn. The only fill allowed for an action the member must take. */
export const ActButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, className, ...rest }) => (
  <button type="button" className={cx("ha-i", "ha-act", className)} style={{
    border: 0, borderRadius: 10, padding: "10px 15px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", background: "var(--act)", color: "var(--text-inverse)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

/** The one black pill on the page — publishing only. */
export const PublishPill: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, className, ...rest }) => (
  <button type="button" className={cx("ha-i", "ha-publish", className)} style={{
    border: 0, borderRadius: 999, padding: "11px 20px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", background: "var(--surface-inverse)", color: "var(--text-inverse)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, className, ...rest }) => (
  <button type="button" className={cx("ha-i", "ha-ghost", className)} style={{
    borderRadius: 10, padding: "10px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "transparent", color: "var(--act)", border: "1px solid var(--act)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

export const TextButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, className, ...rest }) => (
  <button type="button" className={cx("ha-i", "ha-text", className)} style={{
    background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 500,
    color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3,
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

/** Cyan dot = the machine acted. Cyan is never used as a text colour. */
export const MachineDot: React.FC<{ size?: number }> = ({ size = 7 }) => (
  <span aria-hidden style={{
    inlineSize: size, blockSize: size, borderRadius: 999,
    background: "var(--machine)", display: "inline-block", flex: "0 0 auto",
  }} />
);

export const MachineLine: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5,
    color: "var(--text-secondary)", lineHeight: 1.5,
  }}>
    <MachineDot />
    {children}
  </span>
);

export const Skeleton: React.FC<{ h?: number; w?: string | number; radius?: number }> = ({ h = 14, w = "100%", radius = 6 }) => (
  <div aria-hidden className="aura-skeleton" style={{
    blockSize: h, inlineSize: w, borderRadius: radius,
  }} />
);

export const SectionTitle: React.FC<React.PropsWithChildren<{
  /** The heading level. Home's direct children pass "h2"; nested cards keep h3. */
  as?: "h2" | "h3" | "h4";
  style?: React.CSSProperties;
}>> = ({ children, as: Tag = "h3", style }) => (
  <Tag style={{
    fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, lineHeight: 1.3,
    color: "var(--text-primary)", margin: "0 0 10px", ...style,
  }}>{children}</Tag>
);

export const Muted: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", ...style }}>{children}</p>
);

/**
 * ReadFailure — the one honest line shown when a read errored.
 * Never replaces good data already on screen; it sits beneath it.
 */
export const ReadFailure: React.FC<{ onRetry?: () => void; style?: React.CSSProperties }> = ({ onRetry, style }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", ...style }}>
    <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
      Aura could not read this just now. Nothing is lost — try again.
    </span>
    {onRetry && <TextButton onClick={onRetry}>Try again</TextButton>}
  </div>
);

export const Body: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", ...style }}>{children}</p>
);

export function titleCaseFacet(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}