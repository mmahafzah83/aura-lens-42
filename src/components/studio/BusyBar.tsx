import React from "react";

/**
 * Continuous motion for anything that runs longer than a moment, paired with
 * a plain sentence. Never a tick — nothing here has finished.
 */
export const BusyBar: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: "grid",
      gap: 8,
      background: "var(--machine-tint)",
      borderRadius: 10,
      padding: "10px 12px",
      margin: "0 0 12px",
    }}
  >
    <style>{"@keyframes auraStudioBusy{0%{left:-40%}100%{left:100%}}"}</style>
    <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--machine-text)", margin: 0 }}>
      {message}
    </p>
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        height: 4,
        borderRadius: 999,
        overflow: "hidden",
        background: "var(--surface-subtle)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "40%",
          borderRadius: 999,
          background: "var(--machine-text)",
          animation: "auraStudioBusy 1.1s linear infinite",
        }}
      />
    </div>
  </div>
);

export default BusyBar;
