import { useTranslation } from "react-i18next";
import { type FirstFlightSignal, type FirstFlightState } from "@/hooks/useFirstFlight";

export interface FirstFlightCardProps {
  state: FirstFlightState;
  onConnectLinkedIn: () => void;
  onOpenCapture: () => void;
  onOpenSignal: (signal: FirstFlightSignal) => void;
  onWriteFromSignal: (signal: FirstFlightSignal) => void;
}

const STEP_KEYS = ["connect", "capture", "signal", "publish"] as const;

// Arabic: Cairo, open line-height, no tracking, no capitals, no italics.
const AR: React.CSSProperties = { fontFamily: "var(--font-arabic)", lineHeight: 1.7, letterSpacing: 0, textTransform: "none", fontStyle: "normal" };

const kickerStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--act)",
};

const counterStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const ctaStyle: React.CSSProperties = {
  background: "var(--act)",
  color: "var(--text-inverse)",
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
  color: "var(--text-muted)",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  padding: 0,
};

const proseStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 19,
  lineHeight: 1.35,
  color: "var(--text-primary)",
  margin: 0,
};

function Dot({ state }: { state: "done" | "current" | "future" }) {
  const size = 14;
  if (state === "done") {
    return (
      <span aria-hidden style={{
        width: size, height: size, borderRadius: "50%", background: "var(--success)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="var(--text-inverse)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "transparent", border: "2px solid var(--act)", display: "inline-block", flexShrink: 0 }} />;
  }
  return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "transparent", border: "1.5px solid var(--text-muted)", display: "inline-block", flexShrink: 0 }} />;
}

export function FirstFlightCard(props: FirstFlightCardProps) {
  const { state: ff, onConnectLinkedIn, onOpenCapture, onOpenSignal, onWriteFromSignal } = props;
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const ar = (st: React.CSSProperties): React.CSSProperties => (isAr ? { ...st, ...AR } : st);

  if (!ff.active) return null;

  const { currentStep, steps, topSignal, justCompleted, markSignalSeen } = ff;

  const stepStates: Array<"done" | "current" | "future"> = [1, 2, 3, 4].map((n) => {
    const done = [steps.s1, steps.s2, steps.s3, steps.s4][n - 1];
    if (done) return "done";
    if (n === currentStep) return "current";
    return "future";
  }) as Array<"done" | "current" | "future">;

  const doneCount = stepStates.filter((s) => s === "done").length;
  const remaining = 4 - doneCount;

  const container: React.CSSProperties = {
    background: "var(--surface-card)",
    border: "1px solid var(--rule-outer)",
    borderTop: "2px solid var(--text-primary)",
    padding: "22px 24px",
    marginBottom: 24,
    boxShadow: "0 1px 0 var(--hair, rgba(255,255,255,0.06))",
    opacity: 0,
    animation: "firstFlightFade 240ms ease forwards",
  };

  // Completion state (one render). Never celebrate on a failed durable read —
  // we cannot know this member finished, so we must not say they did.
  if (justCompleted && !ff.failed) {
    return (
      <section style={container} aria-label={t("firstFlight.complete")}>
        <style>{`
          @keyframes firstFlightFade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes firstFlightPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
          @media (prefers-reduced-motion: reduce) {
            .ff-pulse { animation: none !important; }
          }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "16px 8px", gap: 14 }}>
          <span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "var(--act)" }}>✦</span>
          <p style={ar({ ...proseStyle, fontSize: 20 })}>{t("firstFlight.completeLine")}</p>
          <button type="button" onClick={ff.retire} style={ar(ctaStyle)}>{t("firstFlight.continue")}</button>
        </div>
      </section>
    );
  }

  const stepCopy = (n: number) => t(`firstFlight.copy.${n}`);

  const cta = () => {
    if (currentStep === 1) return { label: t("firstFlight.cta.connect"), onClick: onConnectLinkedIn, disabled: false };
    if (currentStep === 2) return { label: t("firstFlight.cta.capture"), onClick: onOpenCapture, disabled: false };
    if (currentStep === 3) return {
      label: t("firstFlight.cta.open"),
      onClick: () => { if (topSignal) { onOpenSignal(topSignal); markSignalSeen(); } },
      disabled: !topSignal,
    };
    return { label: t("firstFlight.cta.post"), onClick: () => topSignal && onWriteFromSignal(topSignal), disabled: !topSignal };
  };

  // Waiting: s2 done but s3 pending → no button, italic serif line.
  const isWaitingForSignal = steps.s2 && !steps.s3;

  return (
    <section style={container} aria-label={t("firstFlight.title")}>
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
        <span style={ar(kickerStyle)}>◆ {t("firstFlight.title")}</span>
        <span style={ar(counterStyle)}>{t("firstFlight.stepOf", { n: currentStep })}</span>
      </div>

      {/* Plain progress */}
      <div style={ar({ ...counterStyle, textTransform: "none", letterSpacing: "0.06em", marginTop: -10, marginBottom: 14, textAlign: "end" })}>
        {t(remaining === 0 ? "firstFlight.progress.none" : remaining === 1 ? "firstFlight.progress.one" : "firstFlight.progress.other", { done: doneCount, r: remaining })}
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
        {STEP_KEYS.map((key, idx) => {
          const label = t(`firstFlight.step.${key}`);
          const st = stepStates[idx];
          const labelColor = st === "done" ? "var(--success-text)" : st === "current" ? "var(--act)" : "var(--text-muted)";
          const isLast = idx === STEP_KEYS.length - 1;
          return (
            <li
              key={key}
              aria-current={st === "current" ? "step" : undefined}
              style={{ display: "flex", alignItems: "center", flex: isLast ? "0 0 auto" : "1 1 auto", minWidth: 0 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingInlineEnd: 8 }}>
                <Dot state={st} />
                  <span style={ar({
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: labelColor,
                  whiteSpace: "nowrap",
                  fontWeight: st === "current" ? 700 : 400,
                  textDecoration: st === "done" ? "line-through" : undefined,
                  textDecorationThickness: st === "done" ? "1px" : undefined,
                  opacity: st === "done" ? 0.85 : 1,
                })}>{label}</span>
              </span>
              {!isLast && (
                <span aria-hidden style={{ flex: 1, height: 1, background: "var(--rule-outer)", marginInline: 6, minWidth: 12 }} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Action row */}
      {isWaitingForSignal ? (
        <>
          <p style={ar({ ...proseStyle, marginBottom: 18 })}>{t("firstFlight.building")}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden
                className="ff-pulse"
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--machine)",
                  animation: "firstFlightPulse 1.6s ease-in-out infinite",
                  display: "inline-block",
                }}
              />
              <span style={ar({ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15, color: "var(--text-secondary)" })}>
                {t("firstFlight.reading")}
              </span>
            </div>
            <button type="button" onClick={ff.skip} style={ar(skipStyle)} className="ff-skip">{t("firstFlight.skip")}</button>
          </div>
        </>
      ) : (
        <>
          <p style={ar({ ...proseStyle, marginBottom: 18 })}>{stepCopy(currentStep)}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            {(() => {
              const c = cta();
              return (
                <button type="button" onClick={c.onClick} disabled={c.disabled} style={ar({ ...ctaStyle, opacity: c.disabled ? 0.5 : 1 })}>
                  {c.label}
                </button>
              );
            })()}
            <button type="button" onClick={ff.skip} style={ar(skipStyle)} className="ff-skip">{t("firstFlight.skip")}</button>
          </div>
        </>
      )}

      {ff.failed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--rule-divider)" }}>
          <span style={ar({ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)" })}>
            {t("firstFlight.failed")}
          </span>
          <button type="button" onClick={ff.refresh} style={ar(skipStyle)} className="ff-skip">{t("firstFlight.retry")}</button>
        </div>
      ) : null}
    </section>
  );
}

export default FirstFlightCard;