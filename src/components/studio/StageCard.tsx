import React, { useEffect, useState } from "react";
import { T, type Lang } from "./strings";

/**
 * The one card shell used by every full-width block on this page.
 * `defaultOpen` is the only thing the posture is allowed to touch — nothing
 * inside is ever hidden, moved or disabled by it.
 */
export const StageCard: React.FC<
  React.PropsWithChildren<{
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    collapsible?: boolean;
    align?: "left" | "right";
    lang?: Lang;
  }>
> = ({ title, subtitle, defaultOpen = true, collapsible = false, align = "left", lang = "en", children }) => {
  const [open, setOpen] = useState(defaultOpen);
  // `useState` snapshots at mount. When the caller's answer changes later the
  // card must follow it, never keep a stale first answer.
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        padding: 18,
        textAlign: align,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {title}
        </h2>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={T.cardToggle[lang]}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              minHeight: 44,
              fontFamily: "var(--ff-ui)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--act)",
            }}
          >
            {open ? "▴" : "▾"}
          </button>
        )}
      </div>
      {subtitle && (
        <p
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--text-secondary)",
            margin: "8px 0 0",
          }}
        >
          {subtitle}
        </p>
      )}
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </section>
  );
};

export default StageCard;