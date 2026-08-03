import React, { useEffect, useState } from "react";

/**
 * P3 — a progress indicator that actually indicates progress.
 *
 * ONE bar, filling in ONE direction toward completion, with a percentage and
 * a countdown in seconds. Never a decorative crawl: it starts at zero, it
 * moves forward only, and it ends. When the work outlives the estimate the
 * bar holds just short of full rather than resetting or looping.
 */
export const BusyBar: React.FC<{
  message: string;
  /** How long this normally takes. The countdown and the fill follow it. */
  etaSeconds?: number;
  /** "about 20 seconds" / "٢٠ ثانية تقريباً" — rendered as the countdown. */
  remainingLabel?: (seconds: number) => string;
}> = ({ message, etaSeconds = 20, remainingLabel }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(id);
  }, [message, etaSeconds]);

  const ratio = Math.min(0.97, elapsed / Math.max(1, etaSeconds));
  const percent = Math.round(ratio * 100);
  const left = Math.max(1, Math.ceil(etaSeconds - elapsed));

  return (
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
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--machine-text)", margin: 0 }}>
        {message}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        style={{
          position: "relative",
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--surface-subtle)",
        }}
      >
        <span
          style={{
            position: "absolute",
            insetInlineStart: 0,
            top: 0,
            bottom: 0,
            width: `${percent}%`,
            borderRadius: 999,
            background: "var(--machine-text)",
            transition: "width .25s linear",
          }}
        />
      </div>
      <p style={{ fontFamily: "var(--ff-mono)", fontSize: 11.5, color: "var(--machine-text)", margin: 0 }}>
        {percent}% · {remainingLabel ? remainingLabel(left) : `about ${left} seconds left`}
      </p>
    </div>
  );
};

export default BusyBar;
