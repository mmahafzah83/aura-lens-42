import React from "react";
import type { Lang } from "./strings";

/** Shared System-B surfaces for the guided compose flow. No raw colour values. */

export const card: React.CSSProperties = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  boxShadow: "var(--shadow-card)",
  padding: 20,
};

export const Heading: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h1
    style={{
      fontFamily: "var(--ff-ui)",
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 1.4,
      color: "var(--text-primary)",
      margin: 0,
    }}
  >
    {children}
  </h1>
);

export const Helper: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p
    style={{
      fontFamily: "var(--ff-ui)",
      fontSize: 14,
      lineHeight: 1.7,
      color: "var(--text-secondary)",
      margin: "8px 0 0",
    }}
  >
    {children}
  </p>
);

export const Muted: React.FC<React.PropsWithChildren<{ size?: number }>> = ({ children, size = 12.5 }) => (
  <span style={{ fontFamily: "var(--ff-ui)", fontSize: size, color: "var(--text-muted)" }}>{children}</span>
);

export const TextLink: React.FC<
  React.PropsWithChildren<{ onClick: () => void }>
> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: "transparent",
      border: 0,
      padding: 0,
      cursor: "pointer",
      fontFamily: "var(--ff-ui)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--act)",
      textDecoration: "underline",
      textUnderlineOffset: 3,
    }}
  >
    {children}
  </button>
);

/** English / العربية toggle. */
export const LangToggle: React.FC<{ lang: Lang; onChange: (l: Lang) => void }> = ({ lang, onChange }) => (
  <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
    {(["en", "ar"] as Lang[]).map((l) => (
      <button
        key={l}
        type="button"
        onClick={() => onChange(l)}
        style={{
          border: 0,
          cursor: "pointer",
          padding: "6px 12px",
          fontFamily: "var(--ff-ui)",
          fontSize: 12.5,
          fontWeight: 600,
          background: lang === l ? "var(--act-tint)" : "transparent",
          color: lang === l ? "var(--act)" : "var(--text-secondary)",
        }}
      >
        {l === "en" ? "English" : "العربية"}
      </button>
    ))}
  </div>
);

/** A selectable row used by Choose. */
export const SelectRow: React.FC<
  React.PropsWithChildren<{ selected: boolean; onClick: () => void; align: "left" | "right" }>
> = ({ selected, onClick, align, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: "block",
      width: "100%",
      textAlign: align,
      cursor: "pointer",
      background: selected ? "var(--act-tint)" : "var(--surface-card)",
      border: `1px solid ${selected ? "var(--act)" : "var(--border-default)"}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      fontFamily: "var(--ff-ui)",
    }}
  >
    {children}
  </button>
);