import { useState } from "react";
import { CheckCircle2, Lock, ChevronRight } from "lucide-react";
import ProfileManagement from "@/components/ProfileManagement";
import VoiceEngineSection from "@/components/VoiceEngineSection";
import { JourneyState, refreshJourneyState } from "@/hooks/useJourneyState";
import { useTranslation } from "react-i18next";
import { arStyle } from "@/lib/arDisplay";

interface Props {
  journey: JourneyState;
  onResetDiagnostic?: () => void;
}

type StepStatus = "active" | "completed" | "locked";

const COPY = {
  step1: {
    title: "gj.s1.title",
    why: "gj.s1.why",
    cta: "Complete your profile",
  },
  step2: {
    title: "gj.s2.title",
    why: "gj.s2.why",
    cta: "gj.s2.cta",
  },
  step3: {
    title: "gj.s3.title",
    why: "gj.s3.why",
    cta: "Save your first article",
  },
};

const StepCard = ({
  index, title, why, status, children, onUnlock, lockedAfter,
}: {
  index: number;
  title: string;
  why: string;
  status: StepStatus;
  children?: React.ReactNode;
  onUnlock?: () => void;
  lockedAfter?: string;
}) => {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language;
  const [reopened, setReopened] = useState(false);
  const expanded = status === "active" || (status === "completed" && reopened);
  const isLocked = status === "locked";
  const isDone = status === "completed";
  return (
    <div
      style={{
        border: status === "active" ? "1px solid var(--spot)" : "1px solid var(--rule, hsl(var(--border) / 0.6))",
        background: "hsl(var(--card))",
        borderRadius: 12,
        padding: "20px 22px",
        opacity: isLocked ? 0.55 : 1,
        transition: "opacity 200ms ease, border-color 200ms ease",
        boxShadow: status === "active" && index === 2 ? "0 0 0 3px hsl(var(--primary) / 0.15)" : undefined,
        animation: status === "active" && index === 2 ? "aura-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isDone ? "var(--success)" : isLocked ? "transparent" : "var(--surface-subtle)",
            border: `1px solid `,
            color: isDone ? "var(--text-inverse)" : "var(--spot)",
            fontWeight: 600, fontSize: 14,
          }}
        >
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : isLocked ? <Lock className="w-4 h-4" /> : index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={arStyle(lang, { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 })}>
              {tr("gj.step", { index })}
            </div>
            {isDone && (
              <span style={arStyle(lang, { fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--success)", fontWeight: 700 })}>
                {tr("gj.completed")}
              </span>
            )}
            {isLocked && lockedAfter && (
              <span style={arStyle(lang, { fontSize: 12, color: "var(--ink-3)" })}>
                {tr("gj.unlocks", { n: lockedAfter })}
              </span>
            )}
          </div>
          <div style={arStyle(lang, { fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", lineHeight: 1.375, margin: "6px 0 10px" })}>
            {tr(title)}
          </div>
          {!isDone && (
            <p style={arStyle(lang, { fontSize: 14, color: "var(--ink-3)", lineHeight: 1.625, margin: "0 0 14px" })}>
              {tr(why)}
            </p>
          )}
          {isDone && !reopened && (
            <button
              type="button"
              onClick={() => setReopened(true)}
              style={arStyle(lang, { background: "transparent", border: "none", color: "var(--spot)", fontSize: 12, cursor: "pointer", padding: 0 })}
            >
              {tr("gj.edit")}
            </button>
          )}
          {expanded && children && (
            <div style={{ marginTop: 8 }}>{children}</div>
          )}
          {status === "active" && onUnlock && !children && (
            <button
              type="button"
              onClick={onUnlock}
              style={arStyle(lang, {
                background: "var(--spot)", color: "var(--text-inverse)", border: 0,
                borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              })}
            >
              {(() => { const c = COPY[`step${index}` as keyof typeof COPY]?.cta; return c && c.startsWith("gj.") ? tr(c) : c; })()} {lang !== "ar" && <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function GuidedJourney({ journey, onResetDiagnostic }: Props) {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language;
  const { profileComplete, assessmentComplete, voiceTrained, voiceSkipped } = journey;

  const step1Status: StepStatus = profileComplete ? "completed" : "active";
  const step2Status: StepStatus = !profileComplete ? "locked" : assessmentComplete ? "completed" : "active";
  const step3Status: StepStatus = !assessmentComplete
    ? "locked"
    : voiceTrained ? "completed" : "active";

  const handleStartAssessment = () => {
    window.dispatchEvent(new CustomEvent("aura:open-brand-assessment"));
  };

  const handleSkipVoice = () => {
    try { localStorage.setItem("aura_voice_skipped", "1"); } catch {}
    refreshJourneyState();
  };

  const completedCount = [step1Status, step2Status, step3Status].filter(s => s === "completed").length;
  const pct = Math.round((completedCount / 3) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={arStyle(lang, { fontSize: 12, letterSpacing: 2, color: "var(--ink)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 })}>
          {tr("gj.kicker")}
        </div>
        <h1 style={arStyle(lang, { fontFamily: "var(--serif)", fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 })}>
          {tr("gj.title")}
        </h1>
        <p style={arStyle(lang, { fontSize: 14, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.625, maxWidth: 640 })}>
          {tr("gj.intro")}
        </p>
        <div style={{ marginTop: 12, height: 4, background: "var(--rule, rgba(197,165,90,0.15))", borderRadius: 999, overflow: "hidden", maxWidth: 320 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--spot)", transition: "width 300ms ease" }} />
        </div>
        <div style={arStyle(lang, { fontSize: 12, color: "var(--ink-3)", marginTop: 6 })}>
          {tr("gj.complete", { n: completedCount })}
        </div>
      </div>

      <StepCard index={1} title={COPY.step1.title} why={COPY.step1.why} status={step1Status}>
        <div data-guided-journey-step="1">
          <ProfileManagement startExpanded compact />
        </div>
      </StepCard>

      <StepCard
        index={2}
        title={COPY.step2.title}
        why={COPY.step2.why}
        status={step2Status}
        lockedAfter={step2Status === "locked" ? "1" : undefined}
        onUnlock={handleStartAssessment}
      />

      <StepCard
        index={3}
        title={COPY.step3.title}
        why={COPY.step3.why}
        status={step3Status}
        lockedAfter={step3Status === "locked" ? "2" : undefined}
      >
        {step3Status === "active" && (
          <>
            <VoiceEngineSection />
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={handleSkipVoice}
                style={arStyle(lang, { background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" })}
              >
                {tr("gj.skip")}
              </button>
            </div>
          </>
        )}
      </StepCard>

      {(step3Status === "completed" || voiceSkipped) && step2Status === "completed" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={arStyle(lang, { fontSize: 14, color: "var(--ink-3)" })}>
            {tr("gj.done")}
          </div>
        </div>
      )}
    </div>
  );
}