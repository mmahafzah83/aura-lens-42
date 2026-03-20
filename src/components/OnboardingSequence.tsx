import { useState, useEffect, useCallback } from "react";
import { Zap } from "lucide-react";

const TAGLINE = "Where Leaders Think Clearly.";

const STEPS = [
  { key: "splash", duration: 4200 },
  { key: "radar", duration: 2400 },
  { key: "briefing", duration: 2200 },
];

const TypewriterText = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, 65);
    return () => clearTimeout(timer);
  }, [displayed, started, text]);

  return (
    <span>
      {displayed}
      <span className="typewriter-cursor">|</span>
    </span>
  );
};

const OnboardingSequence = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const advance = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setExiting(true);
      setTimeout(onComplete, 600);
    }
  }, [step, onComplete]);

  useEffect(() => {
    const timer = setTimeout(advance, STEPS[step].duration);
    return () => clearTimeout(timer);
  }, [step, advance]);

  const exit = () => {
    setExiting(true);
    setTimeout(onComplete, 600);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex items-center justify-center transition-opacity duration-500 ${exiting ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      {/* Gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="onboarding-mesh absolute inset-0" />
      </div>

      {/* Step 0: Premium Splash — Logo + Typewriter */}
      {step === 0 && (
        <div className="flex flex-col items-center gap-8 animate-onboard-fade-in">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-[1.75rem] bg-primary/8 flex items-center justify-center border border-primary/15 onboarding-logo-pulse">
            <Zap className="w-14 h-14 sm:w-16 sm:h-16 text-primary" />
          </div>
          <h1
            className="text-5xl sm:text-6xl text-gradient-gold tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1.1 }}
          >
            Aura
          </h1>
          <p className="text-xs text-muted-foreground/40 tracking-[0.35em] uppercase">
            Executive Intelligence Platform
          </p>
          <div className="h-8 mt-4">
            <p
              className="text-lg sm:text-xl text-foreground/70 tracking-tight font-light"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              <TypewriterText text={TAGLINE} delay={1200} />
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Radar Draw */}
      {step === 1 && (
        <div className="flex flex-col items-center gap-6 animate-onboard-fade-in">
          <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56">
            {[30, 55, 80].map((r) => (
              <circle
                key={r}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke="hsl(0 0% 20%)"
                strokeWidth="0.5"
                strokeDasharray="3 3"
                className="onboarding-ring-draw"
              />
            ))}
            <polygon
              points="100,30 168,72 142,155 58,155 32,72"
              fill="hsl(43 72% 52% / 0.08)"
              stroke="hsl(43 72% 52%)"
              strokeWidth="1.5"
              className="onboarding-radar-draw"
            />
            {[
              [100, 30],
              [168, 72],
              [142, 155],
              [58, 155],
              [32, 72],
            ].map(([cx, cy], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3"
                fill="hsl(43 72% 52%)"
                className="onboarding-dot-appear"
                style={{ animationDelay: `${0.8 + i * 0.15}s` }}
              />
            ))}
          </svg>
          <p className="text-sm text-muted-foreground/50 tracking-[0.2em] uppercase animate-onboard-fade-in" style={{ animationDelay: "0.6s" }}>
            Mapping Your Capabilities
          </p>
        </div>
      )}

      {/* Step 2: Briefing slide-in with CTA */}
      {step === 2 && (
        <div className="flex flex-col items-center gap-8 px-8 animate-onboard-slide-up max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h2
            className="text-3xl sm:text-4xl text-foreground/90 tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1.15 }}
          >
            Architecting Your Presence
          </h2>
          <p className="text-sm text-muted-foreground/50 leading-relaxed max-w-xs">
            Your strategic intelligence layer is ready. Capture insights, build frameworks, and lead with clarity.
          </p>
          <button
            onClick={exit}
            className="mt-4 px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium tracking-wide tactile-press hover-lift transition-all border border-primary/30"
          >
            Enter Aura
          </button>
        </div>
      )}
    </div>
  );
};

export default OnboardingSequence;
