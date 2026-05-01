import { useState } from "react";
import { Zap, ArrowRight, Radio, Lightbulb, Crown, TrendingUp, FileText } from "lucide-react";

const STEPS = [
  {
    headline: "Capture the signals shaping your field.",
    nodes: [
      { label: "Capture", icon: FileText },
      { label: "Signals", icon: Radio },
    ],
  },
  {
    headline: "Turn knowledge into strategic insight.",
    nodes: [
      { label: "Signals", icon: Radio },
      { label: "Insights", icon: Lightbulb },
      { label: "Frameworks", icon: Zap },
    ],
  },
  {
    headline: "Transform thinking into influence.",
    nodes: [
      { label: "Frameworks", icon: Zap },
      { label: "Authority", icon: Crown },
      { label: "Influence", icon: TrendingUp },
    ],
  },
];

const OnboardingSequence = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setExiting(true);
      setTimeout(onComplete, 600);
    }
  };

  const current = STEPS[step];

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center transition-all duration-600 ${
        exiting ? "opacity-0 scale-[1.08] pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Skip */}
      {step < STEPS.length - 1 && (
        <button
          onClick={() => { setExiting(true); setTimeout(onComplete, 600); }}
          className="absolute top-6 right-6 text-[14px] text-muted-foreground/40 hover:text-muted-foreground transition-colors tracking-widest uppercase z-10"
        >
          Skip
        </button>
      )}

      {/* Step indicator */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-500 ${
              i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/40" : "w-4 bg-muted-foreground/15"
            }`}
          />
        ))}
      </div>

      {/* Content — keyed per step for re-animation */}
      <div key={step} className="flex flex-col items-center gap-10 px-8 max-w-lg text-center animate-onboard-fade-in">
        {/* Headline */}
        <h1
          className="text-3xl sm:text-4xl md:text-[42px] text-foreground/90 tracking-tight leading-[1.15]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {current.headline}
        </h1>

        {/* Pipeline visual */}
        <div className="flex items-center gap-3 sm:gap-5">
          {current.nodes.map((node, i) => (
            <div key={node.label} className="flex items-center gap-3 sm:gap-5">
              {/* Node */}
              <div
                className="flex flex-col items-center gap-2 animate-onboard-slide-up"
                style={{ animationDelay: `${0.15 + i * 0.15}s` }}
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_24px_hsl(43_80%_45%/0.12)]">
                  <node.icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                </div>
                <span className="text-meta text-muted-foreground/60 tracking-wide">{node.label}</span>
              </div>
              {/* Arrow between nodes */}
              {i < current.nodes.length - 1 && (
                <ArrowRight
                  className="w-5 h-5 text-primary/30 mb-6 animate-onboard-fade-in"
                  style={{ animationDelay: `${0.3 + i * 0.15}s` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="absolute bottom-12 sm:bottom-16 w-full flex justify-center px-8">
        <button
          onClick={handleNext}
          className="px-10 py-3.5 rounded-xl bg-gradient-to-b from-[hsl(43_80%_55%)] to-primary text-primary-foreground text-sm font-medium tracking-wide hover:brightness-110 hover:shadow-[0_0_20px_hsl(43_80%_45%/0.25)] transition-all duration-[250ms] ease-[ease-in-out] active:scale-[0.97] border border-primary/30"
        >
          {step < STEPS.length - 1 ? "Next" : "Start Using Aura"}
        </button>
      </div>
    </div>
  );
};

export default OnboardingSequence;
