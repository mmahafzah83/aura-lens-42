import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import usePageMeta from "@/hooks/usePageMeta";

const BRONZE = "#B08D3A";
const BG = "#0a0a08";
const BG_WARM = "#0d0b08";
const BG_ALT = "#0f0e0c";
const CARD_BG = "#151412";
const STEPS_BG = "#111110";

const HorizonEye = ({ size = 80, color = BRONZE, pupilR = 5 }: { size?: number; color?: string; pupilR?: number }) => (
  <svg width={size} height={size * 0.55} viewBox="0 0 60 33" fill="none" aria-hidden>
    <path d="M2 16.5 C 12 4, 48 4, 58 16.5 C 48 29, 12 29, 2 16.5 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <circle cx="30" cy="16.5" r="9" stroke={color} strokeWidth="1" fill="none" opacity="0.55" />
    <circle cx="30" cy="16.5" r={pupilR} fill={color} style={{ transition: "r 600ms ease-out" }} />
  </svg>
);

/* Character-by-character headline reveal */
const CharReveal = ({ text, accentWord, className, style }: { text: string; accentWord?: string; className?: string; style?: React.CSSProperties }) => {
  const chars = Array.from(text);
  let cursor = 0;
  return (
    <h1 aria-label={text} className={className} style={style}>
      {text.split(/(\s+)/).map((word, wi) => {
        const isAccent = accentWord && word === accentWord;
        return (
          <span key={wi} style={{ whiteSpace: "nowrap", color: isAccent ? BRONZE : undefined }}>
            {Array.from(word).map((ch, ci) => {
              const i = cursor++;
              if (/\s/.test(ch)) return ch;
              return (
                <span
                  key={ci}
                  aria-hidden
                  className="pw-char"
                  style={{ display: "inline-block", animationDelay: `${i * 40}ms` }}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
};

/* Massive count-up stat row */
const MassiveStat = ({ value, suffix = "%", literal, desc, accent, source }: { value?: number; suffix?: string; literal?: string; desc: string; accent?: boolean; source?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const counted = useCountUp(value ?? 0, visible);
  useEffect(() => {
    if (!visible) return;
    if (literal != null) { setLanded(true); return; }
    if (value != null && counted >= value) {
      const t = setTimeout(() => setLanded(true), 30);
      return () => clearTimeout(t);
    }
  }, [visible, counted, value, literal]);
  return (
    <div ref={ref} className="reveal" style={{
      margin: "48px 0", textAlign: "center",
      borderLeft: accent ? `3px solid ${BRONZE}` : undefined,
      paddingLeft: accent ? 16 : 0,
    }}>
      <div className={landed ? "pw-stat-pulse" : ""} style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "clamp(40px, 10vw, 72px)",
        color: BRONZE, fontWeight: 300, lineHeight: 1,
      }}>
        {literal ?? `${counted}${suffix}`}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#888", lineHeight: 1.5, marginTop: 16, maxWidth: 240, marginLeft: "auto", marginRight: "auto" }}>
        {desc}
      </div>
      {source && <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>{source}</div>}
    </div>
  );
};

/* Kinetic Invisible → Undeniable split */
const KineticSplit = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} aria-label="From invisible to undeniable" className="pw-split" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 24, margin: "20px 0 48px", flexWrap: "nowrap",
    }}>
      <span className={`pw-split-left ${on ? "on" : ""}`} style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(22px, 4vw, 32px)",
        color: "#ededed", fontWeight: 300,
      }}>Invisible</span>
      <span aria-hidden className={`pw-split-bar ${on ? "on" : ""}`} />
      <span className={`pw-split-right ${on ? "on" : ""}`} style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(22px, 4vw, 32px)",
        color: BRONZE, fontStyle: "italic", fontWeight: 300,
      }}>Undeniable</span>
    </div>
  );
};

/* ── Count up hook (respects reduced motion) ── */
function useCountUp(target: number, start: boolean, duration = 1200) {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setValue(target); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [start, target, duration]);
  return value;
}

const StatCard = ({ value, suffix = "%", literal, desc, fullWidth }: { value?: number; suffix?: string; literal?: string; desc: string; fullWidth?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const counted = useCountUp(value ?? 0, visible);
  // Pulse when the count finishes landing
  useEffect(() => {
    if (!visible) return;
    if (literal != null) { setLanded(true); return; }
    if (value != null && counted >= value) {
      const t = setTimeout(() => setLanded(true), 30);
      return () => clearTimeout(t);
    }
  }, [visible, counted, value, literal]);
  // Highlight the 54% rejection stat with a bronze accent
  const isAccent = value === 54;
  return (
    <div
      ref={ref}
      className={`pw-stat-card reveal pw-stat-flash ${fullWidth ? "pw-stat-fullwidth" : ""} ${isAccent ? "pw-stat-accent" : ""}`}
      style={{
        background: CARD_BG,
        border: "1px solid #1f1f1f",
        borderRadius: 12,
        padding: 28,
        textAlign: "center",
        transition: "border-color 300ms ease, transform 300ms ease",
      }}
    >
      <div className={landed ? "pw-stat-pulse" : ""} style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "clamp(40px, 7vw, 64px)",
        color: BRONZE,
        lineHeight: 1.05,
        fontWeight: 500,
      }}>
        {literal ?? `${counted}${suffix}`}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#a3a3a3", lineHeight: 1.5, marginTop: 12 }}>
        {desc}
      </div>
    </div>
  );
};

const Milestone = ({ label, title, desc, preFilled }: { label: string; title: string; desc: string; preFilled?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(!!preFilled);
  useEffect(() => {
    if (preFilled || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setFilled(true);
        if (titleRef.current) titleRef.current.classList.add("pw-milestone-pop");
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [preFilled]);
  return (
    <div ref={ref} className="relative pl-12 pb-12">
      <div
        aria-hidden
        style={{
          position: "absolute", left: 8, top: 0, bottom: 0, width: 2,
          background: filled ? BRONZE : "#2a2a2a",
          transition: "background 600ms ease-out",
        }}
      />
      <div
        aria-hidden
        className={filled ? "pw-dot-ripple" : ""}
        style={{
          position: "absolute", left: 0, top: 2, width: 18, height: 18, borderRadius: "50%",
          border: `2.5px solid ${BRONZE}`,
          background: filled ? BRONZE : "transparent",
          boxShadow: filled ? "0 0 8px rgba(176,141,58,0.3)" : "none",
          transition: "background 400ms ease-out, box-shadow 400ms ease-out",
        }}
      />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: "3px", color: BRONZE, fontWeight: 600 }}>{label}</div>
      <div ref={titleRef} style={{ fontSize: 18, color: "#fff", fontWeight: 600, marginTop: 8, transition: "transform 300ms ease" }}>{title}</div>
      <div style={{ fontSize: 14, color: "#b8b8b8", lineHeight: 1.6, marginTop: 8 }}>{desc}</div>
    </div>
  );
};

const Engine = ({ symbol, title, desc }: { symbol: string; title: string; desc: string }) => (
  <div
    className="reveal pw-engine-card"
    style={{
      background: CARD_BG,
      border: "1px solid #1f1f1f",
      borderLeft: `3px solid ${BRONZE}`,
      borderRadius: 12,
      padding: 24,
      display: "flex",
      gap: 16,
      alignItems: "flex-start",
      transition: "border-color 300ms ease",
    }}
  >
    <div className="pw-engine-icon" style={{
      width: 44, height: 44, minWidth: 44, borderRadius: "50%",
      border: `1.5px solid ${BRONZE}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: BRONZE, fontWeight: 600, fontSize: 18,
      transition: "box-shadow 300ms ease",
    }}>{symbol}</div>
    <div>
      <div style={{ fontSize: 16, color: "#fff", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 14, color: "#b8b8b8", lineHeight: 1.65, marginTop: 6 }}>{desc}</div>
    </div>
  </div>
);

const SectionDivider = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        ref.current?.classList.add("pw-divider-sweep-on");
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="pw-divider-sweep" aria-hidden style={{
      width: "60%", height: 1, margin: "0 auto",
      background: "linear-gradient(90deg, transparent, rgba(176,141,58,0.45), transparent)",
    }} />
  );
};

const TypewriterQuote = ({ text }: { text: string }) => {
  const ref = useRef<HTMLQuoteElement>(null);
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        ref.current?.classList.add("pw-tw-on");
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <blockquote ref={ref} className="reveal reveal-d2 pw-tw" style={{
      borderLeft: `3px solid ${BRONZE}`, padding: "24px 28px",
      fontStyle: "italic", color: "#cdcdcd", fontSize: 16, lineHeight: 1.8,
      margin: "32px 0",
    }}>
      {words.map((w, i) => (
        <span key={i} className="pw-tw-w" style={{ ['--i' as any]: i }}>{w}</span>
      ))}
    </blockquote>
  );
};

const responseFor = (v: number) => {
  if (v <= 30) return "You're not alone. 97% of senior professionals are here — invisible despite years of deep expertise. Scroll to see why.";
  if (v <= 60) return "You've started, but the gap between what you know and what the market sees is still wide. Scroll to see what's possible.";
  if (v <= 80) return "You're ahead of most. But you know it could compound faster. Scroll to see how.";
  return "Rare. You know how hard this is to build — and how easy it is to lose. Scroll to see how to make it permanent.";
};

export default function PublicWelcome() {
  usePageMeta({
    title: "Aura — Make your expertise visible",
    description: "A strategic intelligence system for senior professionals. Turn what you already read into a digital presence that compounds.",
    path: "/",
  });

  const [slider, setSlider] = useState(30);
  const [moved, setMoved] = useState(false);
  const [responseText, setResponseText] = useState(responseFor(30));
  const [fading, setFading] = useState(false);

  // Gentle scroll-gate
  const [contentRevealed, setContentRevealed] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeSeen, setNudgeSeen] = useState(false);
  useEffect(() => {
    if (moved && !contentRevealed) setContentRevealed(true);
  }, [moved, contentRevealed]);

  // Floating mini-CTA pill: appears after "Until now.", hides at final CTA
  const untilNowRef = useRef<HTMLElement>(null);
  const finalCtaRef = useRef<HTMLElement>(null);
  const [showPill, setShowPill] = useState(false);
  useEffect(() => {
    if (!contentRevealed) return;
    const untilEl = untilNowRef.current;
    const finalEl = finalCtaRef.current;
    if (!untilEl || !finalEl) return;
    let pastUntil = false;
    let inFinal = false;
    const update = () => setShowPill(pastUntil && !inFinal);
    const io1 = new IntersectionObserver(([e]) => {
      if (e.isIntersecting || e.boundingClientRect.top < 0) pastUntil = true;
      update();
    }, { threshold: 0 });
    const io2 = new IntersectionObserver(([e]) => {
      inFinal = e.isIntersecting;
      update();
    }, { threshold: 0.15 });
    io1.observe(untilEl);
    io2.observe(finalEl);
    return () => { io1.disconnect(); io2.disconnect(); };
  }, [contentRevealed]);
  useEffect(() => {
    if (contentRevealed) return;
    const onAttempt = () => {
      if (moved || nudgeSeen) return;
      if (window.scrollY > 60) {
        setShowNudge(true);
        setNudgeSeen(true);
        setTimeout(() => { setShowNudge(false); setContentRevealed(true); }, 3000);
      }
    };
    window.addEventListener("scroll", onAttempt, { passive: true });
    window.addEventListener("wheel", onAttempt, { passive: true });
    window.addEventListener("touchmove", onAttempt, { passive: true });
    return () => {
      window.removeEventListener("scroll", onAttempt);
      window.removeEventListener("wheel", onAttempt);
      window.removeEventListener("touchmove", onAttempt);
    };
  }, [moved, nudgeSeen, contentRevealed]);

  // Eye pupil + scroll progress
  const [pupilR, setPupilR] = useState(5);
  const [scrollPct, setScrollPct] = useState(0);
  const [heroScroll, setHeroScroll] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      setPupilR(5 + p * 3);
      setScrollPct(p * 100);
      const h = window.innerHeight || 1;
      setHeroScroll(Math.min(window.scrollY / h, 1));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Slider response crossfade
  useEffect(() => {
    if (!moved) return;
    const next = responseFor(slider);
    if (next === responseText) return;
    setFading(true);
    const t = setTimeout(() => { setResponseText(next); setFading(false); }, 200);
    return () => clearTimeout(t);
  }, [slider, moved, responseText]);

  // Reveal observer
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div style={{
      background: BG,
      color: "#ededed",
      minHeight: "100vh",
      fontFamily: "'DM Sans', sans-serif",
      backgroundImage: "radial-gradient(circle at 1px 1px, #1a1a1a 1px, transparent 0)",
      backgroundSize: "40px 40px",
    }}>
      <style>{PW_CSS}</style>

      {/* Scroll progress bar — top on desktop, bottom on mobile */}
      <div aria-hidden className="pw-progress" style={{
        position: "fixed", left: 0, width: `${scrollPct}%`,
        background: BRONZE, zIndex: 100,
        transition: "width 80ms linear",
      }} />

      <main>
        {/* HERO */}
        <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", overflow: "hidden" }}>
          {/* ambient bronze glow */}
          <div aria-hidden style={{
            position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%)",
            width: 800, height: 800, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(176,141,58,0.05) 0%, rgba(176,141,58,0.02) 35%, transparent 65%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
            <div className="pw-eye-in pw-eye-pulse pw-eye-parallax" style={{
              transform: `translateY(${heroScroll * -20}px)`,
              transition: "transform 120ms linear",
            }}>
              <HorizonEye size={80} pupilR={pupilR} />
            </div>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(32px, 5vw, 48px)", color: "#fff", textAlign: "center", margin: 0, lineHeight: 1.15,
            }}>
              How visible is your expertise right now?
            </h1>
            <div className="pw-fade-up" style={{ width: "100%", maxWidth: 460, animationDelay: "0.8s", opacity: 0 }}>
              <input
                type="range" min={0} max={100} value={slider}
                onChange={(e) => { setSlider(Number(e.target.value)); if (!moved) setTimeout(() => setMoved(true), 500); }}
                className="pw-slider"
                aria-label="How visible is your expertise"
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12, color: "#a3a3a3" }}>
                <span>Only my clients know</span>
                <span>The market knows my name</span>
              </div>
            </div>
            <div style={{ minHeight: 90, maxWidth: 440, textAlign: "center" }}>
              {moved && (
                <p style={{
                  fontSize: 16, color: "#aaa", lineHeight: 1.7, margin: 0,
                  opacity: fading ? 0 : 1, transition: "opacity 300ms ease",
                }}>{responseText}</p>
              )}
              {showNudge && !moved && (
                <p className="pw-nudge" style={{
                  fontSize: 13, color: BRONZE, marginTop: 12,
                  fontFamily: "'DM Sans', sans-serif",
                }}>Move the slider to begin.</p>
              )}
            </div>
            <div className="pw-fade-up pw-bounce" style={{ fontSize: 13, color: contentRevealed ? BRONZE : "#8a8a8a", animationDelay: "1.8s", opacity: 0, marginTop: 8, transition: "color 400ms ease" }}>
              {contentRevealed ? "Scroll to discover what's possible ↓" : "↓"}
            </div>
          </div>
        </section>

        {/* Gated content below the hero */}
        <div style={{
          opacity: contentRevealed ? 1 : 0,
          pointerEvents: contentRevealed ? "auto" : "none",
          transition: "opacity 800ms ease",
        }}>
        <SectionDivider />

        {/* PAIN */}
        <section style={{ background: BG, padding: "100px 24px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>THE REAL PROBLEM</p>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(28px, 5vw, 44px)", color: "#fff", lineHeight: 1.2, marginTop: 20,
            }}>
              You've spent years becoming <em style={{ color: BRONZE, fontStyle: "italic" }}>exceptional</em>. The market has no idea.
            </h2>
            <TypewriterQuote text={`"You've led teams, shaped strategy, solved problems most people can't even name. But when someone outside your direct circle searches your name — they find almost nothing. No signal. No fingerprint. No proof of what you actually know."`} />
            <p className="reveal reveal-d1" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
              Meanwhile, professionals who publish consistently — even when their expertise is narrower than yours — are the ones getting invited to the table. The keynote slots. The advisory boards.
            </p>
            <p className="reveal reveal-d2" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
              The problem was never your expertise. It was never your ideas.
            </p>
            <p className="reveal reveal-d3" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
              <strong style={{ color: "#fff", fontWeight: 600 }}>The problem is that no one has helped you turn what's in your head into what the market sees.</strong>
            </p>
          </div>
        </section>

        {/* "Until now." — own moment */}
        <section ref={untilNowRef} style={{
          background: BG, minHeight: "40vh",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "80px 24px",
        }}>
          <p className="reveal" style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
            fontSize: "clamp(28px, 4vw, 40px)", color: BRONZE, margin: 0, textAlign: "center",
          }}>
            Until now.
          </p>
        </section>

        <div style={{ height: 80 }} />
        <SectionDivider />

        {/* STATS */}
        <section style={{ background: BG_ALT, padding: "100px 24px" }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>THE NUMBERS DON'T LIE</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
              <StatCard value={73} desc="of decision-makers trust expertise content over marketing" />
              <StatCard value={82} desc="trust companies more when leaders are visible online" />
              <StatCard value={54} desc="have rejected candidates for invisible online presence" />
              <StatCard literal="<3%" desc="of LinkedIn's 1B+ users create original content weekly" />
              <StatCard value={44} desc="of company value is tied to its leader's reputation" fullWidth />
            </div>
            <p className="reveal" style={{ fontSize: 11, color: "#9a9a9a", marginTop: 20 }}>
              Edelman-LinkedIn 2024/2025 · Weber Shandwick · Brunswick Group
            </p>
            <p className="reveal reveal-d1" style={{ fontSize: 17, color: "#ededed", lineHeight: 1.75, marginTop: 28 }}>
              You're already in the top 1% of expertise. Aura puts you in the top 1% of <strong style={{ color: BRONZE, fontWeight: 700 }}>visibility</strong> — without changing how you spend your week.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* BUILDER */}
        <section style={{ background: BG_WARM, padding: "100px 24px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>WHY I BUILT THIS</p>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(26px, 4.5vw, 38px)", color: "#fff", marginTop: 20,
            }}>
              Because I'm one of you.
            </h2>
            <p className="reveal reveal-d1" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 28 }}>
              I read 30+ articles a week. I see patterns in digital transformation that most reports miss. I hold opinions that could shape how organizations think about their future.
            </p>
            <p className="reveal reveal-d2" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
              But for years, all of that stayed locked in my head, my notes, my devices. The market had no idea.
            </p>
            <p className="reveal reveal-d3" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
              So I built the system I wished existed. One that takes what I already read, finds the strategic patterns, understands my voice and my expertise — and turns it into a digital presence that compounds over time.
            </p>
            <div aria-hidden className="reveal reveal-d4" style={{
              width: 60, height: 1, background: BRONZE, margin: "48px auto 0",
            }} />
            <p className="reveal reveal-d4" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(22px, 3.5vw, 30px)", color: BRONZE, marginTop: 32, textAlign: "center",
            }}>
              I called it Aura. And now it's ready for you.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* HOW — 2×2 engine cards */}
        <section style={{ background: BG_ALT, padding: "100px 24px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>HOW AURA WORKS</p>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(26px, 4.5vw, 38px)", color: "#fff", marginTop: 20, marginBottom: 40,
            }}>
              Four engines. One intelligence system.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Engine symbol="✦" title="The identity map" desc="Aura doesn't start with content. It starts with YOU. Your strengths. Your sector expertise. Your natural voice. It builds a complete map of who you are professionally — so nothing it creates is generic." />
              <Engine symbol="◆" title="The intelligence engine" desc="You read an article. Aura reads it too. It finds the strategic pattern you'd miss on a busy Tuesday — and connects it to what matters in your sector right now." />
              <Engine symbol="◇" title="The voice studio" desc="Aura writes in your voice. Not templates. Not AI speak. Content that sounds like you wrote it at your absolute best — the version of you that had 3 uninterrupted hours to think and write." />
              <Engine symbol="●" title="The presence score" desc="Aura tracks your digital visibility over time — what's working, what's growing, where the right people are noticing you. Your reputation, measured and compounding." />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* TIMELINE */}
        <section style={{ background: BG, padding: "100px 24px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>WHAT CHANGES FOR YOU</p>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(26px, 4.5vw, 38px)", color: "#fff", marginTop: 20, marginBottom: 48,
            }}>
              From invisible to <em style={{ color: BRONZE, fontStyle: "italic" }}>undeniable</em>.
            </h2>
            <Milestone preFilled label="DAY 1" title="Aura learns who you are." desc="Your strengths. Your sector. Your voice. By the end of your first session, Aura knows what makes you different from every other professional in your market." />
            <Milestone preFilled label="WEEK 1" title="Your first post goes live." desc="A LinkedIn post that sounds like you — not like AI. About a signal Aura found in what you read. Your expertise, visible for the first time to people who've never met you." />
            <Milestone label="MONTH 1" title="People start to notice." desc="Consistent, intelligent content builds recognition. Decision-makers in your sector start seeing your name next to insights they care about." />
            <Milestone label="MONTH 3" title="The invitations arrive." desc="Speaking panels. Advisory requests. DMs from people you've never met saying 'I've been following your content.' The market is finding you." />
            <Milestone label="YEAR 1" title="You own your space." desc="When someone in your industry mentions your topic — your name comes up. Not because you marketed yourself. Because your expertise finally has the fingerprint it always deserved." />
          </div>
        </section>

        <SectionDivider />

        {/* FIRST 10 MINUTES */}
        <section style={{
          background: STEPS_BG,
          padding: "100px 24px",
          borderTop: "1px solid #1a1a1a",
          borderBottom: "1px solid #1a1a1a",
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>YOUR FIRST 10 MINUTES</p>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(26px, 4.5vw, 38px)", color: "#fff", marginTop: 20, marginBottom: 40,
            }}>
              You'll feel the difference immediately.
            </h2>
            <div style={{ position: "relative" }}>
              <div aria-hidden style={{
                position: "absolute", left: 15, top: 16, bottom: 16, width: 1, background: "#2a2a2a",
              }} />
              {[
                { n: "01", t: "Accept your invitation", d: "A welcome that shows you this was built for someone at your level." },
                { n: "02", t: "Tell Aura who you are", d: "Paste your LinkedIn headline. Aura reads it in 3 seconds — no forms, no typing." },
                { n: "03", t: "Calibrate your edge", d: "10 quick strength sliders. Aura uses them to understand what truly sets you apart — and gives you instant insight on each one." },
                { n: "04", t: "See yourself through the market's eyes", d: "The moment that changes how you see your own expertise. People screenshot this. You'll understand why." },
              ].map((s, i) => (
                <div key={s.n} className={`reveal reveal-d${Math.min(i+1, 4)}`} style={{
                  display: "flex", gap: 16, alignItems: "flex-start",
                  marginBottom: 28, position: "relative",
                }}>
                  <div style={{
                    width: 32, height: 32, minWidth: 32, borderRadius: 8,
                    border: `1.5px solid ${BRONZE}`, background: STEPS_BG,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: BRONZE, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                    position: "relative", zIndex: 1,
                  }}>{s.n}</div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 16, color: "#fff", fontWeight: 700 }}>{s.t}</div>
                    <div style={{ fontSize: 14, color: "#b8b8b8", lineHeight: 1.6, marginTop: 6 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* FINAL CTA */}
        <section ref={finalCtaRef} style={{ background: BG, minHeight: "80vh", padding: "100px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
            <div className="pw-eye-pulse reveal" style={{ display: "flex", justifyContent: "center" }}>
              <HorizonEye size={56} />
            </div>
            <h2 className="reveal reveal-d1" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
              fontSize: "clamp(28px, 5vw, 42px)", color: "#fff", marginTop: 28, lineHeight: 1.2,
            }}>
              Stop being the best-kept secret in your field.
            </h2>
            <p className="reveal reveal-d2" style={{ fontSize: 16, color: "#bdbdbd", maxWidth: 440, margin: "24px auto 36px", lineHeight: 1.75 }}>
              Your expertise has earned its place. Give Aura 10 minutes — and it will show you who you really are in the market.
            </p>
            <Link to="/request-access" className="pw-cta pw-cta-shimmer pw-cta-breathe reveal reveal-d3">
              <span style={{ position: "relative", zIndex: 1 }}>
                Request Your Access →
              </span>
            </Link>
            <p className="reveal reveal-d3" style={{ fontSize: 12, color: "#666", marginTop: 14 }}>
              Takes 30 seconds. We respond within a week.
            </p>
            <p className="reveal reveal-d4" dir="rtl" style={{
              fontSize: 18, color: BRONZE, marginTop: 28,
              fontFamily: "'Cairo', 'DM Sans', sans-serif",
            }}>
              حتى السوق يعرفك قبل ما يشوفك ✦
            </p>
            <p className="reveal reveal-d4" style={{ fontSize: 11, letterSpacing: "2px", color: "#9a9a9a", marginTop: 20 }}>
              PRIVATE BETA · BY INVITATION ONLY
            </p>
            <p className="reveal reveal-d4" style={{ fontSize: 13, color: "#666", marginTop: 10 }}>
              Join 40+ professionals already on the list
            </p>
          </div>
        </section>
        </div>{/* /gated */}
      </main>

      {/* Floating mini-CTA */}
      <Link
        to="/request-access"
        aria-label="Request access"
        className="pw-pill"
        data-visible={showPill ? "true" : "false"}
      >
        Request access →
      </Link>

      {/* FOOTER */}
      <footer style={{ padding: 40, borderTop: "1px solid #1a1a1a", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#ededed" }}>Mohammad Mahafzah</div>
        <div style={{ fontSize: 12, color: "#a3a3a3", marginTop: 4 }}>Aura builder</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <HorizonEye size={16} color="#8a8a8a" />
          <span style={{ fontSize: 11, color: "#9a9a9a" }}>Aura · Strategic Intelligence · aura-intel.org</span>
        </div>
      </footer>
    </div>
  );
}

const PW_CSS = `
  html { scroll-behavior: smooth; }
  .pw-fade-up { opacity: 0; transform: translateY(20px); animation: pw-fadeUp 500ms ease-out forwards; }
  @keyframes pw-fadeUp { to { opacity: 1; transform: translateY(0); } }
  .pw-eye-in { opacity: 0; transform: scale(0.5); animation: pw-eyeIn 800ms ease-out 200ms forwards; }
  @keyframes pw-eyeIn { to { opacity: 1; transform: scale(1); } }
  .pw-eye-pulse { animation: pw-pulse 3s ease-in-out infinite; }
  @keyframes pw-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
  .pw-bounce { animation: pw-bnc 2s ease-in-out infinite; }
  @keyframes pw-bnc { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }

  .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease-out, transform 0.6s ease-out; }
  .reveal.visible { opacity: 1; transform: translateY(0); }
  .reveal-d1 { transition-delay: 0.15s; }
  .reveal-d2 { transition-delay: 0.30s; }
  .reveal-d3 { transition-delay: 0.45s; }
  .reveal-d4 { transition-delay: 0.60s; }

  .pw-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px; background: #333; outline: none; }
  .pw-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #B08D3A; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; border: none; }
  .pw-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #B08D3A; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; border: none; }

  .pw-cta {
    position: relative; overflow: hidden;
    background: #B08D3A; color: #fff; font-size: 16px; font-weight: 600;
    padding: 16px 36px; border-radius: 8px; display: inline-block;
    text-decoration: none; transition: transform 200ms ease, box-shadow 200ms ease;
  }
  .pw-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(176,141,58,0.25); }
  .pw-cta-shimmer::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,235,180,0.25) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: pw-shimmer 3s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes pw-shimmer {
    0% { transform: translateX(-100%); }
    60%, 100% { transform: translateX(100%); }
  }

  .pw-stat-card:hover { border-color: #B08D3A !important; }
  .pw-engine-card { cursor: default; }
  .pw-engine-card:hover { border-color: #B08D3A !important; }
  .pw-engine-card:hover .pw-engine-icon { box-shadow: 0 0 12px rgba(176,141,58,0.15); }

  .pw-milestone-pop { animation: pw-pop 300ms ease-out; }
  @keyframes pw-pop { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }

  /* Scroll progress bar — top desktop, bottom mobile (3px) */
  .pw-progress { top: env(safe-area-inset-top, 0px); height: 2px; }
  @media (max-width: 767px) {
    .pw-progress { top: auto; bottom: 0; height: 3px; }
  }

  /* Slider nudge */
  .pw-nudge { animation: pw-nudgeIn 280ms ease-out; }
  @keyframes pw-nudgeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  /* Stat-card: bronze glow on entry + number landing pulse + 54% accent */
  .pw-stat-card.pw-stat-flash.visible { animation: pw-statGlow 800ms ease-out; }
  @keyframes pw-statGlow {
    0% { box-shadow: 0 0 0 transparent; }
    40% { box-shadow: 0 0 16px rgba(176,141,58,0.28); }
    100% { box-shadow: 0 0 0 transparent; }
  }
  .pw-stat-pulse { animation: pw-statPulse 320ms ease-out; }
  @keyframes pw-statPulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
  .pw-stat-accent { border-left: 3px solid ${BRONZE} !important; }
  /* Desktop only: full-width capstone spans two columns */
  @media (min-width: 640px) {
    .pw-stat-fullwidth { grid-column: span 2 / span 2; border-top: 2px solid ${BRONZE} !important; }
  }

  /* Timeline dot ripple */
  .pw-dot-ripple::after {
    content: ""; position: absolute; inset: -2px; border-radius: 50%;
    border: 2px solid ${BRONZE};
    animation: pw-ripple 700ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes pw-ripple {
    from { transform: scale(1); opacity: 0.4; }
    to { transform: scale(2.5); opacity: 0; }
  }

  /* CTA breathing */
  .pw-cta-breathe { animation: pw-breathe 3s ease-in-out infinite; }
  .pw-cta-breathe:hover, .pw-cta-breathe:active { animation: none; }
  @keyframes pw-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.015); } }

  /* Section divider sweep */
  .pw-divider-sweep { transform: scaleX(0); transform-origin: center; transition: transform 800ms ease-out; }
  .pw-divider-sweep.pw-divider-sweep-on { transform: scaleX(1); }

  /* Typewriter pain quote — word-by-word reveal */
  .pw-tw .pw-tw-w { opacity: 0; transition: opacity 320ms ease-out; transition-delay: calc(var(--i, 0) * 30ms); }
  .pw-tw.pw-tw-on .pw-tw-w { opacity: 1; }

  /* Floating mini-CTA pill */
  .pw-pill {
    position: fixed; z-index: 90;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    right: 20px;
    background: rgba(26,25,23,0.92);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    border: 1px solid rgba(176,141,58,0.3);
    border-radius: 999px;
    padding: 10px 18px;
    font-size: 13px; font-weight: 500;
    color: #B08D3A;
    text-decoration: none;
    display: inline-flex; align-items: center;
    min-height: 44px;
    opacity: 0; pointer-events: none;
    transition: opacity 300ms ease, background 200ms ease, border-color 200ms ease, transform 200ms ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }
  .pw-pill[data-visible="true"] { opacity: 1; pointer-events: auto; }
  .pw-pill:hover { background: #1a1917; border-color: ${BRONZE}; transform: translateY(-1px); }
  @media (max-width: 767px) {
    .pw-pill {
      right: auto; left: 50%; transform: translateX(-50%);
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    }
    .pw-pill:hover { transform: translateX(-50%) translateY(-1px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .reveal, .pw-fade-up, .pw-eye-in { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
    .pw-eye-pulse, .pw-bounce, .pw-cta-shimmer::before, .pw-milestone-pop,
    .pw-cta-breathe, .pw-stat-flash, .pw-stat-pulse, .pw-dot-ripple::after,
    .pw-nudge { animation: none !important; }
    .pw-eye-parallax { transform: none !important; }
    .pw-divider-sweep { transform: scaleX(1) !important; transition: none !important; }
    .pw-tw .pw-tw-w { opacity: 1 !important; transition: none !important; }
  }
`;