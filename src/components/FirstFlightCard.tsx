import { useFirstFlight, type FirstFlightSignal } from "@/hooks/useFirstFlight";

export interface FirstFlightCardProps {
  userId: string | null;
  onConnectLinkedIn: () => void;
  onOpenCapture: () => void;
  onOpenSignal: (signal: FirstFlightSignal) => void;
  onWriteFromSignal: (signal: FirstFlightSignal) => void;
}

const STEP_LABELS = ["CONNECT", "CAPTURE", "SIGNAL", "PUBLISH"] as const;

const kickerStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--spot)",
};

const counterStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

const ctaStyle: React.CSSProperties = {
  background: "var(--spot)",
  color: "var(--paper)",
  border: 0,
  padding: "10px 20px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
  minHeight: 44,
};

const skipStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  padding: 0,
};

const proseStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 19,
  lineHeight: 1.35,
  color: "var(--ink)",
  margin: 0,
};

function Dot({ state }: { state: "done" | "current" | "future" }) {
  const size = 10;
  if (state === "done") {
    return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "var(--spot)", display: "inline-block", flexShrink: 0 }} />;
  }
  if (state === "current") {
    return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "transparent", border: "1.5px solid var(--spot)", display: "inline-block", flexShrink: 0 }} />;
  }
  return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "transparent", border: "1.5px solid var(--ink-3)", display: "inline-block", flexShrink: 0 }} />;
}

export function FirstFlightCard(props: FirstFlightCardProps) {
  const { userId, onConnectLinkedIn, onOpenCapture, onOpenSignal, onWriteFromSignal } = props;
  const ff = useFirstFlight(userId);

  if (!ff.active) return null;

  const { currentStep, steps, topSignal, justCompleted, markSignalSeen } = ff;

  const stepStates: Array<"done" | "current" | "future"> = [1, 2, 3, 4].map((n) => {
    const done = [steps.s1, steps.s2, steps.s3, steps.s4][n - 1];
    if (done) return "done";
    if (n === currentStep) return "current";
    return "future";
  }) as Array<"done" | "current" | "future">;

  const container: React.CSSProperties = {
    background: "var(--paper)",
    border: "1px solid var(--rule)",
    borderTop: "2px solid var(--ink)",
    padding: "22px 24px",
    marginBottom: 24,
    boxShadow: "0 1px 0 var(--hair, rgba(255,255,255,0.06))",
    opacity: 0,
    animation: "firstFlightFade 240ms ease forwards",
  };

  // Completion state (one render).
  if (justCompleted) {
    return (
      <section style={container} aria-label="First Flight complete">
        <style>{`
          @keyframes firstFlightFade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes firstFlightPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
          @media (prefers-reduced-motion: reduce) {
            .ff-pulse { animation: none !important; }
          }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "16px 8px", gap: 14 }}>
          <span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "var(--action)" }}>✦</span>
          <p style={{ ...proseStyle, fontSize: 20 }}>First Flight complete — Aura is now working for you.</p>
          <button type="button" onClick={ff.retire} style={ctaStyle}>Continue</button>
        </div>
      </section>
    );
  }

  const stepCopy: Record<number, string> = {
    1: "Connect LinkedIn so Aura reads how the market already sees you.",
    2: "Save one thing you read this week. 30 seconds.",
    3: "Aura found your first signal. Open it.",
    4: "Your signal is ready to become a post — everything is pre-filled.",
  };

  const cta = () => {
    if (currentStep === 1) return { label: "Connect LinkedIn", onClick: onConnectLinkedIn, disabled: false };
    if (currentStep === 2) return { label: "Capture something", onClick: onOpenCapture, disabled: false };
    if (currentStep === 3) return {
      label: "Open the signal",
      onClick: () => { if (topSignal) { onOpenSignal(topSignal); markSignalSeen(); } },
      disabled: !topSignal,
    };
    return { label: "Write it", onClick: () => topSignal && onWriteFromSignal(topSignal), disabled: !topSignal };
  };

  // Waiting: s2 done but s3 pending → no button, italic serif line.
  const isWaitingForSignal = steps.s2 && !steps.s3;

  return (
    <section style={container} aria-label="First Flight">
      <style>{`
        @keyframes firstFlightFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes firstFlightPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ff-pulse { animation: none !important; }
        }
        .ff-skip:hover { text-decoration: underline; }
      `}</style>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={kickerStyle}>◆ First Flight</span>
        <span style={counterStyle}>Step {currentStep} of 4</span>
      </div>

      {/* Step rail */}
      <ol
        role="list"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 0,
          alignItems: "center",
          marginBottom: 18,
        }}
        className="ff-rail"
      >
        {STEP_LABELS.map((label, idx) => {
          const st = stepStates[idx];
          const labelColor = st === "done" ? "var(--ink)" : st === "current" ? "var(--spot)" : "var(--ink-3)";
          const isLast = idx === STEP_LABELS.length - 1;
          return (
            <li
              key={label}
              aria-current={st === "current" ? "step" : undefined}
              style={{ display: "flex", alignItems: "center", flex: isLast ? "0 0 auto" : "1 1 auto", minWidth: 0 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingInlineEnd: 8 }}>
                <Dot state={st} />
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: labelColor,
                  whiteSpace: "nowrap",
                }}>{label}</span>
              </span>
              {!isLast && (
                <span aria-hidden style={{ flex: 1, height: 1, background: "var(--rule)", marginInline: 6, minWidth: 12 }} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Action row */}
      {isWaitingForSignal ? (
        <>
          <p style={{ ...proseStyle, marginBottom: 18 }}>Aura is building your first signal.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden
                className="ff-pulse"
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--live)",
                  animation: "firstFlightPulse 1.6s ease-in-out infinite",
                  display: "inline-block",
                }}
              />
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, color: "var(--ink-2)" }}>
                Reading what you saved… your first signal usually appears within a few minutes.
              </span>
            </div>
            <button type="button" onClick={ff.skip} style={skipStyle} className="ff-skip">I'll explore on my own</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...proseStyle, marginBottom: 18 }}>{stepCopy[currentStep]}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            {(() => {
              const c = cta();
              return (
                <button type="button" onClick={c.onClick} disabled={c.disabled} style={{ ...ctaStyle, opacity: c.disabled ? 0.5 : 1 }}>
                  {c.label}
                </button>
              );
            })()}
            <button type="button" onClick={ff.skip} style={skipStyle} className="ff-skip">I'll explore on my own</button>
          </div>
        </>
      )}
    </section>
  );
}

export default FirstFlightCard;