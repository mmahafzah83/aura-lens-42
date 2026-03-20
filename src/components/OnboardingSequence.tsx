import { useState, useEffect, useCallback } from "react";
import { Zap } from "lucide-react";

const STEPS = [
  { key: "logo", duration: 2400 },
  { key: "radar", duration: 2200 },
  { key: "briefing", duration: 2000 },
];

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

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex items-center justify-center transition-opacity duration-500 ${exiting ? "opacity-0" : "opacity-100"}`}
    >
      {/* Gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="onboarding-mesh absolute inset-0" />
      </div>

      {/* Step 0: Pulsing Aura Logo */}
      {step === 0 && (
        <div className="flex flex-col items-center gap-6 animate-onboard-fade-in">
          <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow onboarding-logo-pulse">
            <Zap className="w-12 h-12 text-primary" />
          </div>
          <h1
            className="text-4xl sm:text-5xl text-gradient-gold tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Aura
          </h1>
          <p className="text-sm text-muted-foreground/60 tracking-[0.3em] uppercase">
            Executive Intelligence
          </p>
        </div>
      )}

      {/* Step 1: Radar Draw */}
      {step === 1 && (
        <div className="flex flex-col items-center gap-6 animate-onboard-fade-in">
          <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56">
            {/* Grid rings */}
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
            {/* Radar shape */}
            <polygon
              points="100,30 168,72 142,155 58,155 32,72"
              fill="hsl(43 72% 52% / 0.08)"
              stroke="hsl(43 72% 52%)"
              strokeWidth="1.5"
              className="onboarding-radar-draw"
            />
            {/* Dots */}
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
          <p className="text-sm text-muted-foreground/60 tracking-[0.2em] uppercase animate-onboard-fade-in" style={{ animationDelay: "0.6s" }}>
            Mapping Your Capabilities
          </p>
        </div>
      )}

      {/* Step 2: Briefing slide-in */}
      {step === 2 && (
        <div className="flex flex-col items-center gap-8 px-8 animate-onboard-slide-up max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h2
            className="text-3xl sm:text-4xl text-foreground/90 tracking-tight leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Architecting Your Presence
          </h2>
          <p className="text-sm text-muted-foreground/50 leading-relaxed">
            Your strategic intelligence layer is ready. Capture insights, build frameworks, and lead with clarity.
          </p>
          <button
            onClick={() => {
              setExiting(true);
              setTimeout(onComplete, 600);
            }}
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
