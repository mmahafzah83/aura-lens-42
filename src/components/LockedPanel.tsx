import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ButtonPrimary } from "@/components/systemb/Button";

/**
 * LockedPanel — the one "not yours yet" surface.
 *
 * The real component stays mounted behind the blur: the shape stays honest
 * even when the content is withheld. Nothing here is a screenshot or a mock.
 */
export interface LockedPanelProps {
  title: string;
  line: string;
  count?: number | null;
  countLabel?: string;
  children: React.ReactNode;
}

const LockedPanel: React.FC<LockedPanelProps> = ({ title, line, count, countLabel, children }) => {
  const navigate = useNavigate();
  const veiled = useRef<HTMLDivElement | null>(null);

  // `inert` is not in React's DOM types yet — set it imperatively when the
  // browser supports it so nothing behind the blur can take focus.
  useEffect(() => {
    const el = veiled.current;
    if (!el) return;
    if ("inert" in HTMLElement.prototype) (el as any).inert = true;
  }, []);

  const showCount = typeof count === "number" && count > 0 && !!countLabel;

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={veiled}
        aria-hidden="true"
        style={{
          filter: "blur(5px)",
          opacity: 0.5,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "linear-gradient(0deg, rgba(255,255,255,.94), rgba(255,255,255,.72))",
          borderRadius: 14,
          border: "1px solid #E2E7EE",
        }}
      >
        <div
          style={{
            maxWidth: "34ch",
            textAlign: "center",
            padding: "0 20px",
            marginTop: "18vh",
            position: "sticky",
            top: 96,
          }}
        >
          {showCount && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "var(--ff-mono, 'IBM Plex Mono', monospace)",
                  fontSize: 30,
                  lineHeight: 1.1,
                  color: "#0F1519",
                }}
              >
                {count}
              </div>
              <div style={{ fontSize: 12.5, color: "#5B6673", marginTop: 4 }}>{countLabel}</div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 999, background: "#E0A82E", display: "inline-block" }}
            />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0F1519", margin: 0 }}>{title}</h3>
          </div>

          <p style={{ fontSize: 13, color: "#5B6673", margin: "0 0 16px", lineHeight: 1.55 }}>{line}</p>

          <ButtonPrimary onClick={() => navigate("/request-access")}>
            Ask for a founding seat
          </ButtonPrimary>
        </div>
      </div>
    </div>
  );
};

export default LockedPanel;