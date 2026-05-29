import { Joyride, EventData, STATUS, Step, ACTIONS, EVENTS } from "react-joyride";
import { useState, useEffect } from "react";

type TabValue = "home" | "identity" | "intelligence" | "authority" | "influence";

interface ProductTourProps {
  activeTab: TabValue;
  setActiveTab: (tab: TabValue) => void;
  userId?: string;
}

const TOUR_STEPS: (Step & { requiresTab?: TabValue })[] = [
  // ── HOME (stops 1-3) ──
  {
    target: '[data-tour="score-hero"]',
    content: "This is your Digital Presence Score. It grows when you capture, publish, and stay consistent.",
    placement: "bottom",
    requiresTab: "home",
  },
  {
    target: '[data-tour="missions"]',
    content: "Your weekly actions. Each one moves your score. Start with the one marked Recommended.",
    placement: "bottom",
    requiresTab: "home",
  },
  {
    target: '[data-tour="market-scan"]',
    content: "AI-curated articles for your sector. Capture them to build signals, or draft a post directly.",
    placement: "top",
    requiresTab: "home",
  },
  // ── INTELLIGENCE (stops 4-5) ──
  {
    target: '[data-tour="signal-radar"]',
    content: "Your expertise map. Each node is a pattern Aura found across your captures.",
    placement: "bottom",
    requiresTab: "intelligence",
  },
  {
    target: '[data-tour="signal-list"]',
    content: "Your signals ranked by strength. When one is ready, hit 'Write this' to generate a post.",
    placement: "top",
    requiresTab: "intelligence",
  },
  // ── PUBLISH (stop 6) ──
  {
    target: '[data-tour="content-generator"]',
    content: "Pick a signal, choose a format, generate a post in your voice. English or Arabic. One tap.",
    placement: "bottom",
    requiresTab: "authority",
  },
  // ── IMPACT (stops 7-8) ──
  {
    target: '[data-tour="impact-hero"]',
    content: "Track your impressions, followers, and engagement. Upload LinkedIn analytics to unlock the full picture.",
    placement: "bottom",
    requiresTab: "influence",
  },
  {
    target: '[data-tour="audience-section"]',
    content: "See who follows you — by seniority, industry, and company. Proof that the right people are watching.",
    placement: "top",
    requiresTab: "influence",
  },
  // ── BACK TO HOME (stops 9-10) ──
  {
    target: '[data-tour="nav-capture"]',
    content: "Capture anything — a URL, a document, a voice note. This is how you feed Aura your intelligence.",
    placement: "right",
    requiresTab: "home",
  },
  {
    target: '[data-tour="nav-ask-aura"]',
    content: "Your strategic advisor. Ask about your positioning, your signals, or what to write next.",
    placement: "right",
    requiresTab: "home",
  },
];

export function ProductTour({ activeTab, setActiveTab }: ProductTourProps) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem("aura_tour_completed");
    if (!completed) {
      const t = setTimeout(() => setRun(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleCallback = (data: EventData) => {
    const { action, index, status, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      localStorage.setItem("aura_tour_completed", "true");
      const count = Number(localStorage.getItem("aura_tour_login_count") || "0");
      localStorage.setItem("aura_tour_login_count", String(Math.max(count, 1)));
      setActiveTab("home");
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;
      if (nextIndex >= 0 && nextIndex < TOUR_STEPS.length) {
        const nextStep = TOUR_STEPS[nextIndex];
        const requiredTab = nextStep.requiresTab;
        if (requiredTab && requiredTab !== activeTab) {
          setActiveTab(requiredTab);
          setTimeout(() => setStepIndex(nextIndex), 600);
        } else {
          setStepIndex(nextIndex);
        }
      }
    }
  };

  useEffect(() => {
    (window as any).auraReplayTour = () => {
      setStepIndex(0);
      setActiveTab("home");
      setTimeout(() => setRun(true), 500);
    };
    return () => { delete (window as any).auraReplayTour; };
  }, [setActiveTab]);

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      callback={handleCallback}
      locale={{
        back: "← Back",
        close: "Close",
        last: "Done — let's go!",
        next: "Next →",
        skip: "Skip tour",
      }}
      styles={{
        options: {
          primaryColor: "#B08D3A",
          textColor: "var(--foreground, #2c2c2a)",
          backgroundColor: "var(--background, #faf8f4)",
          overlayColor: "rgba(0, 0, 0, 0.55)",
          zIndex: 10000,
          arrowColor: "var(--background, #faf8f4)",
        },
        tooltip: {
          borderRadius: 10,
          fontSize: 14,
          lineHeight: 1.6,
          padding: "16px 20px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          border: "0.5px solid var(--border, #d4d0c8)",
        },
        tooltipContent: {
          padding: "8px 0 12px",
        },
        buttonNext: {
          backgroundColor: "#B08D3A",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          padding: "8px 18px",
          border: "none",
          outline: "none",
        },
        buttonBack: {
          color: "var(--muted-foreground, #888)",
          fontSize: 13,
          marginRight: 8,
        },
        buttonSkip: {
          color: "var(--muted-foreground, #888)",
          fontSize: 13,
        },
        spotlight: {
          rx: 10,
          ry: 10,
        } as any,
      }}
      floaterProps={{ disableAnimation: true }}
    />
  );
}

export default ProductTour;