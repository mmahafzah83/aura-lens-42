import { useState } from "react";
import { CheckCircle2, Lock, ChevronRight } from "lucide-react";
import ProfileManagement from "@/components/ProfileManagement";
import VoiceEngineSection from "@/components/VoiceEngineSection";
import { JourneyState, refreshJourneyState } from "@/hooks/useJourneyState";

interface Props {
  journey: JourneyState;
  onResetDiagnostic?: () => void;
}

type StepStatus = "active" | "completed" | "locked";

const COPY = {
  step1: {
    title: "Your professional profile",
    why: "Every signal Aura detects is filtered through your sector and expertise. Without knowing who you are, Aura is reading blind — it can't tell the difference between noise and the patterns that matter to YOUR career.",
    cta: "Complete your profile",
  },
  step2: {
    title: "Brand assessment",
    why: "This assessment is built on the same frameworks used by the world's top leadership firms — Gallup CliftonStrengths for strengths mapping, McKinsey archetypes for market positioning, and Blue Ocean strategy for finding uncontested space. 10 questions. 5 minutes. It shapes everything Aura does for you from this point forward.",
    cta: "Discover your market position",
  },
  step3: {
    title: "Save a few articles (optional)",
    why: "Save a few articles from your sector. Your first signal could appear after just one — and it gets stronger with each one you add. You can also teach Aura your writing voice from My Story later.",
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
  const [reopened, setReopened] = useState(false);
  const expanded = status === "active" || (status === "completed" && reopened);
  const isLocked = status === "locked";
  const isDone = status === "completed";
  return (
    <div
      style={{
        border: status === "active" ? "1px solid var(--brand)" : "1px solid var(--brand-line, hsl(var(--border) / 0.6))",
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
            background: isDone ? "var(--brand)" : isLocked ? "transparent" : "var(--brand-ghost)",
            border: `1px solid ${isDone ? "var(--brand)" : "var(--brand-line)"}`,
            color: isDone ? "var(--ink-on-brand, #1a160f)" : "var(--brand)",
            fontWeight: 600, fontSize: 13,
          }}
        >
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : isLocked ? <Lock className="w-4 h-4" /> : index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
              Step {index} of 3
            </div>
            {isDone && (
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brand)", fontWeight: 700 }}>
                ✓ Completed
              </span>
            )}
            {isLocked && lockedAfter && (
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Unlocks after Step {lockedAfter}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond', serif)", fontSize: 22, color: "var(--ink)", lineHeight: 1.25, margin: "6px 0 10px" }}>
            {title}
          </div>
          {!isDone && (
            <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
              {why}
            </p>
          )}
          {isDone && !reopened && (
            <button
              type="button"
              onClick={() => setReopened(true)}
              style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              Edit →
            </button>
          )}
          {expanded && children && (
            <div style={{ marginTop: 8 }}>{children}</div>
          )}
          {status === "active" && onUnlock && !children && (
            <button
              type="button"
              onClick={onUnlock}
              style={{
                background: "var(--brand)", color: "var(--ink-on-brand, #1a160f)", border: 0,
                borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {COPY[`step${index}` as keyof typeof COPY]?.cta} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function GuidedJourney({ journey, onResetDiagnostic }: Props) {
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
        <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--brand)", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>
          Your professional identity
        </div>
        <h1 style={{ fontFamily: "var(--font-display, 'Cormorant Garamond', serif)", fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
          Tell Aura who you are
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.55, maxWidth: 640 }}>
          You've spent years building expertise. This is where Aura learns what makes you different — so everything it does reflects your knowledge, your voice, your sector.
        </p>
        <div style={{ marginTop: 12, height: 4, background: "var(--brand-line, rgba(197,165,90,0.15))", borderRadius: 999, overflow: "hidden", maxWidth: 320 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", transition: "width 300ms ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
          {completedCount} of 3 complete
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
                style={{ background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}
      </StepCard>

      {(step3Status === "completed" || voiceSkipped) && step2Status === "completed" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            Setup complete. Your full Story view is below.
          </div>
        </div>
      )}
    </div>
  );
}