import { useEffect, useState } from "react";

const BRONZE = "#B08D3A";

const sections = [
  { id: "hero", label: "The Question" },
  { id: "problem", label: "The Problem" },
  { id: "stats", label: "The Numbers" },
  { id: "builder", label: "Why I Built This" },
  { id: "how-it-works", label: "How It Works" },
  { id: "timeline", label: "What Changes" },
  { id: "final-cta", label: "Join" },
];

export default function ScrollSpyNav() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(section.id);
        },
        { threshold: 0, rootMargin: "-40% 0px -55% 0px" }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <style>{SPY_CSS}</style>
      <nav className="scroll-spy-nav" aria-label="Page sections">
        <div className="scroll-spy-line" aria-hidden />
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => handleClick(section.id)}
              className={`scroll-spy-item ${isActive ? "active" : ""}`}
              aria-label={`Jump to ${section.label}`}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="scroll-spy-label">{section.label}</span>
              <span className="scroll-spy-dot" aria-hidden />
            </button>
          );
        })}
      </nav>
    </>
  );
}

const SPY_CSS = `
  .scroll-spy-nav {
    position: fixed;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .scroll-spy-line {
    position: absolute;
    right: 9px;
    top: 14px;
    bottom: 14px;
    width: 1px;
    background: rgba(176,141,58,0.15);
    pointer-events: none;
  }
  .scroll-spy-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 8px 0;
    background: none;
    border: none;
    cursor: pointer;
    outline: none;
    min-height: 28px;
  }
  .scroll-spy-label {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    opacity: 0;
    transform: translateX(8px);
    transition: opacity 400ms ease-out, transform 400ms ease-out, color 400ms ease-out;
    white-space: nowrap;
    pointer-events: none;
  }
  .scroll-spy-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    box-shadow: 0 0 0 0 rgba(176,141,58,0);
    transition: width 400ms ease-out, height 400ms ease-out, background 400ms ease-out, box-shadow 400ms ease-out;
    flex-shrink: 0;
  }
  .scroll-spy-item:hover .scroll-spy-label {
    opacity: 1;
    transform: translateX(0);
  }
  .scroll-spy-item.active .scroll-spy-label {
    opacity: 1;
    transform: translateX(0);
    color: ${BRONZE};
  }
  .scroll-spy-item.active .scroll-spy-dot {
    width: 10px;
    height: 10px;
    background: ${BRONZE};
    box-shadow: 0 0 12px 2px rgba(176,141,58,0.55);
  }
  .scroll-spy-item:hover .scroll-spy-dot {
    background: ${BRONZE};
  }
  @media (max-width: 767px) {
    .scroll-spy-nav { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .scroll-spy-label, .scroll-spy-dot { transition: none !important; }
  }
`;