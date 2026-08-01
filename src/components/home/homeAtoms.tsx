import React from "react";

/**
 * homeAtoms — the shared parts of Home. Every value is a token from
 * src/index.css; no hex literal may appear in this file or its consumers.
 */

export const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
};

export const Kicker: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div style={{
    ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase",
    color: "var(--text-muted)", ...style,
  }}>{children}</div>
);

export const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div style={{
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
    borderRadius: 16, padding: 18, boxShadow: "var(--v23-card-rest)", ...style,
  }}>{children}</div>
);

export const Num: React.FC<React.PropsWithChildren<{ size?: number; color?: string }>> = ({ children, size = 14, color }) => (
  <span style={{ ...MONO, fontSize: size, fontWeight: 600, color: color ?? "var(--text-primary)" }}>{children}</span>
);

/** Blue = his turn. The only fill allowed for an action the member must take. */
export const ActButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    border: 0, borderRadius: 10, padding: "10px 15px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", background: "var(--act)", color: "var(--text-inverse)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

/** The one black pill on the page — publishing only. */
export const PublishPill: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    border: 0, borderRadius: 999, padding: "11px 20px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", background: "var(--surface-inverse)", color: "var(--text-inverse)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    borderRadius: 10, padding: "10px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "transparent", color: "var(--act)", border: "1px solid var(--act)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

export const TextButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
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
  <div aria-hidden style={{
    blockSize: h, inlineSize: w, borderRadius: radius, background: "var(--surface-subtle)",
  }} />
);

export const SectionTitle: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h3 style={{
    fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, lineHeight: 1.3,
    color: "var(--text-primary)", margin: "0 0 10px",
  }}>{children}</h3>
);

export const Muted: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", ...style }}>{children}</p>
);

export const Body: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", ...style }}>{children}</p>
);

export function titleCaseFacet(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}