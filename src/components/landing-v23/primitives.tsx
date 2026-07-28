import React, { useEffect, useRef, useState } from "react";

/** Mono kicker — the V23 landing eyebrow. */
export const Kicker: React.FC<{ children: React.ReactNode; tone?: "machine" | "muted" }> = ({
  children,
  tone = "muted",
}) => (
  <div
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: tone === "machine" ? "var(--machine)" : "var(--text-muted)",
      marginBottom: 18,
      lineHeight: 1.6,
    }}
  >
    {children}
  </div>
);

/** Section shell with consistent max width and generous vertical rhythm. */
export const Section: React.FC<{
  id?: string;
  night?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ id, night, children, style }) => (
  <section
    id={id}
    style={{
      background: night ? "var(--v23-night)" : "var(--surface-page)",
      borderTop: night ? "none" : "1px solid var(--rule-outer)",
      padding: "clamp(64px, 9vw, 128px) 20px",
      ...style,
    }}
  >
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>{children}</div>
  </section>
);

/** Editorial section heading. */
export const SectionTitle: React.FC<{ children: React.ReactNode; night?: boolean }> = ({
  children,
  night,
}) => (
  <h2
    style={{
      fontFamily: "var(--font-display)",
      fontSize: "clamp(28px, 4vw, 46px)",
      lineHeight: 1.1,
      letterSpacing: "-0.02em",
      fontWeight: 600,
      color: night ? "var(--text-inverse)" : "var(--text-primary)",
      margin: 0,
      maxWidth: 20 + "ch",
    }}
  >
    {children}
  </h2>
);

export const Lede: React.FC<{ children: React.ReactNode; night?: boolean }> = ({ children, night }) => (
  <p
    style={{
      fontSize: "clamp(15px, 1.5vw, 18px)",
      lineHeight: 1.65,
      color: night ? "var(--v23-on-night)" : "var(--text-secondary)",
      maxWidth: "62ch",
      marginTop: 20,
    }}
  >
    {children}
  </p>
);

/** Card surface used across the light sections. */
export const Card: React.FC<{
  children: React.ReactNode;
  accent?: boolean;
  style?: React.CSSProperties;
}> = ({ children, accent, style }) => (
  <div
    style={{
      background: "var(--surface-card)",
      border: `1px solid ${accent ? "var(--act)" : "var(--rule-outer)"}`,
      borderRadius: 12,
      padding: 24,
      boxShadow: "var(--v23-card-rest)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** "Coming soon" chip — never presented as live. */
export const SoonChip: React.FC = () => (
  <span
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--deadline-text)",
      background: "var(--deadline-tint)",
      border: "1px solid var(--deadline)",
      borderRadius: 999,
      padding: "3px 8px",
      whiteSpace: "nowrap",
    }}
  >
    Coming soon
  </span>
);

/** Scroll-reveal wrapper. Uses v23CardIn; skipped under reduced motion. */
export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        animation: shown ? `v23CardIn 320ms ease ${delay}ms both` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const grid = (min: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  gap: 18,
});