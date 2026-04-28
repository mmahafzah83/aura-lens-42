import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Link as LinkIcon, FileText, Mic, StickyNote, Image, Zap } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import carbonBg from "@/assets/carbon-bg.jpg";

if (typeof document !== "undefined") {
  document.title = "Aura — Strategic Intelligence OS";
}

/* ── Scroll-based reveal hook (works in iframes) ── */
const useReveal = () => {
  const ref = useRef<any>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || visible) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 50) {
        setVisible(true);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [visible]);
  return { ref, visible };
};

/* ── Animated counter with "+" only after completion ── */
const Counter = ({ target, visible }: { target: number; visible: boolean }) => {
  const [val, setVal] = useState(0);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    const duration = 1500;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(eased * target);
      setVal(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setVal(target);
        setDone(true);
      }
    };
    requestAnimationFrame(animate);
  }, [visible, target]);

  // Fallback: if after 3s still at 0, force final value
  useEffect(() => {
    const t = setTimeout(() => {
      if (val === 0 && !done) {
        setVal(target);
        setDone(true);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [val, done, target]);

  return <>{val}{done ? "+" : ""}</>;
};

/* ── Mobile scroll progress indicator ── */
const ScrollIndicator = () => {
  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const onScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  if (!isMobile) return null;

  return (
    <div style={{
      position: "fixed", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 100,
      width: 3, height: 120, background: "var(--surface-ink-subtle)", borderRadius: 2, overflow: "hidden",
    }}>
      <div style={{
        background: "var(--brand)", borderRadius: 2, width: "100%",
        height: `${progress}%`, transition: "height 0.3s ease",
      }} />
    </div>
  );
};

/* ── Mobile testimonial with swipe + dots ── */
const MobileTestimonials = ({ testimonials }: { testimonials: { q: string; a: string }[] }) => {
  const [active, setActive] = useState(0);
  const touchStart = useRef(0);
  const autoRef = useRef<ReturnType<typeof setInterval>>();
  const interacted = useRef(false);

  const startAuto = useCallback(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      if (!interacted.current) setActive(p => (p + 1) % testimonials.length);
    }, 5000);
  }, [testimonials.length]);

  useEffect(() => {
    startAuto();
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [startAuto]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
    interacted.current = true;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      setActive(p => diff > 0 ? Math.min(p + 1, testimonials.length - 1) : Math.max(p - 1, 0));
    }
    setTimeout(() => { interacted.current = false; startAuto(); }, 3000);
  };

  return (
    <div>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="overflow-hidden"
      >
        <div style={{ display: "flex", transition: "transform 0.4s ease", transform: `translateX(-${active * 100}%)` }}>
          {testimonials.map((t, i) => (
            <div key={i} className="w-full flex-shrink-0 px-1">
              <div className="p-5 rounded-xl" style={{ background: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}>
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--ink-6)" }}>"{t.q}"</p>
                <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>{t.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-4">
        {testimonials.map((_, i) => (
          <button
            key={i}
            onClick={() => { setActive(i); interacted.current = true; setTimeout(() => { interacted.current = false; startAuto(); }, 3000); }}
            style={{
              width: i === active ? 16 : 6, height: 6, borderRadius: 3,
              background: i === active ? "var(--brand)" : "var(--surface-ink-subtle)",
              transition: "all 0.3s ease", border: "none", cursor: "pointer", padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const Landing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/home", { replace: true });
      else setLoading(false);
    });
  }, [navigate]);


  /* reveal hooks */
  const pullQuote = useReveal();
  const diffQuote = useReveal();
  const stats = useReveal();
  const steps = [useReveal(), useReveal(), useReveal(), useReveal(), useReveal()];

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  if (loading) return <div className="min-h-screen" style={{ background: "var(--ink)" }} />;

  const testimonials = [
    { q: "I used to spend hours trying to write a LinkedIn post. Now I just capture what I read and Aura does the rest.", a: "— Sarah M. · Senior Consultant · Big Four · Riyadh" },
    { q: "It finally helped me see what I should be known for. I was an expert in too many things and known for none.", a: "— Khalid A. · VP Digital · Utilities · Dubai" },
    { q: "I finally know what topics to own. Aura showed me exactly where I can be the authority in my field.", a: "— Nour K. · Transformation Director · Abu Dhabi" },
  ];

  const stepData = [
    { n: "00", t: "Know yourself", d: "A short assessment reveals your strengths, your brand positioning, and the exact path to your career target." },
    { n: "01", t: "Capture anything", d: "Paste a link. Upload a document. Record a voice note. Aura reads it and saves it." },
    { n: "02", t: "Aura finds the patterns", d: "It connects what you read. It finds the ideas that keep coming up. It tells you what is important in your field right now." },
    { n: "03", t: "Create content in your voice", d: "One tap. Aura drafts a post, a framework, or an essay — in English or Arabic — that sounds like you." },
    { n: "04", t: "Watch your influence grow", d: "Track your LinkedIn growth. See which content works. Keep building on what is already working." },
  ];

  // Duplicate testimonials for seamless desktop carousel
  const desktopTestimonials = [...testimonials, ...testimonials, ...testimonials];

  return (
    <div
      className="landing-root min-h-screen text-ink-7"
      style={{ background: "var(--ink)", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @keyframes aura-breathe {
          0%, 100% { box-shadow: 0 0 30px rgba(197,165,90,0.3), 0 0 60px rgba(197,165,90,0.12), 0 0 100px rgba(197,165,90,0.06); transform: scale(1); }
          50% { box-shadow: 0 0 50px rgba(197,165,90,0.5), 0 0 90px rgba(197,165,90,0.2), 0 0 130px rgba(197,165,90,0.08); transform: scale(1.05); }
        }
        @keyframes orb-float { 0%, 100% { transform: translateY(-4px); } 50% { transform: translateY(4px); } }
        .orb-icon { transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease; will-change: transform; }
        .orb-icon:hover { transform: scale(1.2) !important; box-shadow: 0 0 16px rgba(197,165,90,0.35); border-color: rgba(197,165,90,0.5) !important; }
        @keyframes ring-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes draw-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes gold-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .glass-card {
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          background: rgba(20,20,20,0.6);
          border: 1px solid rgba(255,255,255,0.10);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          will-change: transform;
        }
        .glass-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .glass-card:hover .glass-icon {
          box-shadow: 0 0 20px rgba(197,165,90,0.4);
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Desktop testimonial auto-scroll carousel */
        .testimonial-track {
          display: flex;
          gap: 16px;
          animation: scroll-left 40s linear infinite;
          width: max-content;
        }
        .testimonial-track:hover {
          animation-play-state: paused;
        }

        /* Mobile layout — compact sections, no snap scroll */
        @media (max-width: 768px) {
          html { scroll-behavior: smooth; }
          .landing-hero {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .landing-compact {
            min-height: unset !important;
            height: auto !important;
            justify-content: flex-start !important;
            padding-top: 40px !important;
            padding-bottom: 40px !important;
          }
          .landing-compact-cta {
            min-height: unset !important;
            height: auto !important;
            padding-top: 48px !important;
            padding-bottom: 48px !important;
          }
          .landing-compact-footer {
            min-height: unset !important;
            height: auto !important;
            padding-top: 32px !important;
            padding-bottom: 32px !important;
          }
          .section-label {
            margin-bottom: 14px !important;
          }
        }
      `}</style>

      <ScrollIndicator />

      {/* Section 1 — Nav */}
      <nav className="landing-nav flex items-center justify-between px-5 sm:px-10 py-5 sticky top-0 z-[200]" style={{
        background: "rgba(13,13,13,0.95)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--surface-ink-subtle)",
        paddingTop: "max(env(safe-area-inset-top), 16px)",
      }}>
        <span className="text-lg font-bold tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "'Playfair Display', Georgia, serif" }}>AURA</span>
        <button onClick={() => navigate("/auth")} className="text-sm px-4 py-2 rounded-lg border transition-colors hover:bg-brand/10" style={{ color: "var(--brand)", borderColor: "#F9731633" }}>
          Sign in
        </button>
      </nav>

      {/* Section 2 — Hero */}
      <section className="landing-hero relative overflow-hidden px-5 sm:px-10 pt-16 pb-20 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
          willChange: "transform",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(to bottom, rgba(13,13,13,0.95) 0%, rgba(13,13,13,0.60) 40%, rgba(13,13,13,0.60) 60%, rgba(13,13,13,0.95) 100%)",
        }} />
        <div className="relative z-10 max-w-2xl mx-auto">
          <p className="text-[10px] tracking-[0.2em] uppercase mb-6" style={{ color: "var(--ink-4)" }}>For senior professionals worldwide</p>
          <h1 className="text-[28px] sm:text-[38px] leading-[1.15] font-medium mb-5 font-sans">
            Everything you read.<br />Turned into <span style={{ color: "var(--brand)" }}>authority</span>.
          </h1>
          {/* Improvement 9: larger hero subtitle on mobile */}
          <p className="leading-relaxed max-w-lg mx-auto mb-10 text-[15px] md:text-[16px]" style={{ color: "var(--ink-5)", lineHeight: window.innerWidth <= 768 ? 1.65 : undefined }}>
            Aura reads what you capture, finds the patterns, and helps you create content that builds your name in your field.
          </p>

          {/* Capture orb */}
          <div className="relative w-[220px] h-[220px] mx-auto mb-10">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--brand), #a88c3a)", animation: "aura-breathe 3s ease-in-out infinite" }}>
                <span className="text-[10px] font-bold text-[#0d0d0d] tracking-wider">AURA</span>
              </div>
            </div>
            {[80, 100, 110].map((r, i) => (
              <div key={i} className="absolute rounded-full" style={{
                width: r * 2, height: r * 2,
                left: `calc(50% - ${r}px)`, top: `calc(50% - ${r}px)`,
                border: `1px solid rgba(197,165,90,${0.12 - i * 0.03})`,
                animation: `ring-pulse ${4 + i * 0.7}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }} />
            ))}
            {[
              { Icon: LinkIcon, label: "link", angle: 0, delay: 0 },
              { Icon: FileText, label: "document", angle: 60, delay: 0.5 },
              { Icon: Mic, label: "voice", angle: 120, delay: 1 },
              { Icon: StickyNote, label: "note", angle: 180, delay: 1.5 },
              { Icon: Image, label: "image", angle: 240, delay: 2 },
              { Icon: Zap, label: "quick capture", angle: 300, delay: 2.5 },
            ].map(({ Icon, label, angle, delay }) => {
              const rad = (angle - 90) * (Math.PI / 180);
              const x = 110 + Math.cos(rad) * 95;
              const y = 110 + Math.sin(rad) * 95;
              return (
                <div key={label} className="absolute flex flex-col items-center" style={{ left: x - 18, top: y - 18, animation: "orb-float 3s ease-in-out infinite", animationDelay: `${delay}s`, willChange: "transform" }}>
                  <div className="orb-icon rounded-full flex items-center justify-center cursor-default" style={{ width: 36, height: 36, background: "transparent", border: "1.5px solid var(--brand)", borderRadius: "50%" }}>
                    <Icon size={16} style={{ color: "var(--brand)" }} />
                  </div>
                  <span className="mt-1 whitespace-nowrap" style={{ fontSize: "9px", color: "var(--ink-4)" }}>{label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => navigate("/auth")} className="px-6 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110" style={{ background: "var(--brand)", color: "var(--ink)", fontWeight: 500 }}>
              Get early access
            </button>
            <button onClick={scrollToHowItWorks} className="px-6 py-3 rounded-xl text-sm transition-colors hover:bg-white/5" style={{ color: "var(--ink-5)", border: "0.5px solid var(--ink-4)", background: "transparent", fontWeight: 400 }}>
              See how it works
            </button>
          </div>
        </div>
      </section>

      {/* Section 3 — Stats */}
      <section ref={stats.ref} className="landing-compact flex items-center justify-center gap-0 py-10 px-5">
        {[
          { num: 47, label: "Sources captured", sub: "articles, links and documents added" },
          { num: 7, label: "Signals detected", sub: "strategic patterns identified" },
          { num: 90, label: "Authority score", sub: "out of 100 — tracks your growth" },
        ].map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && <div className="w-px h-14 mx-6 sm:mx-10" style={{ background: "var(--ink-3)" }} />}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <span style={{ fontSize: 14, color: "var(--brand)" }}>↑</span>
                <span className="font-semibold" style={{ fontSize: 40, color: "var(--brand)", fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>
                  <Counter target={s.num} visible={stats.visible} />
                </span>
              </div>
              <div className="mt-1 uppercase tracking-[0.15em]" style={{ fontSize: 9, color: "var(--ink-4)" }}>{s.label}</div>
              <div className="mt-0.5" style={{ fontSize: 10, color: "var(--ink-4)" }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Section 4 — Pull quote (scroll reveal) */}
      <section ref={pullQuote.ref} className="landing-compact px-5 sm:px-10 py-14 max-w-2xl mx-auto">
        <p className="section-label text-[9px] uppercase tracking-[0.2em] mb-4" style={{ color: "var(--ink-4)" }}>The problem</p>
        <div className="relative pl-5">
          {/* Animated gold line */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
            background: "var(--brand)",
            transformOrigin: "top",
            transform: pullQuote.visible ? "scaleY(1)" : "scaleY(0)",
            transition: "transform 0.8s cubic-bezier(0.22,1,0.36,1)",
          }} />
          <div style={{
            opacity: pullQuote.visible ? 1 : 0,
            transform: pullQuote.visible ? "translateY(0)" : "translateY(50px)",
            transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
          }}>
            <p className="text-[18px] sm:text-[22px] font-medium leading-snug mb-4" style={{ fontFamily: "'Playfair Display', serif", color: "var(--ink-7)" }}>
              "You know your field. But no one knows you."
            </p>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--ink-5)" }}>
              You read reports. You attend meetings. You have real expertise. But it stays in your head. Aura changes that — it captures what you read, finds what matters, and helps you share it.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5 — What makes Aura different (carbon fiber bg + glassmorphism) */}
      <section ref={diffQuote.ref} className="landing-compact relative py-16 px-5 sm:px-10" style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `url(${carbonBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
          opacity: 0.20,
          willChange: "transform",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(10,10,10,0.80)" }} />
        <div className="relative max-w-2xl mx-auto">
          <p className="section-label text-[9px] uppercase tracking-[0.2em] mb-4" style={{ color: "var(--ink-4)" }}>What makes Aura different</p>
          <div className="relative pl-5 mb-10">
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
              background: "var(--brand)",
              transformOrigin: "top",
              transform: diffQuote.visible ? "scaleY(1)" : "scaleY(0)",
              transition: "transform 0.8s cubic-bezier(0.22,1,0.36,1)",
            }} />
            <div style={{
              opacity: diffQuote.visible ? 1 : 0,
              transform: diffQuote.visible ? "translateY(0)" : "translateY(50px)",
              transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
            }}>
              <p className="text-[16px] sm:text-[18px] font-medium leading-snug mb-3" style={{ fontFamily: "'Playfair Display', serif", color: "var(--ink-7)" }}>
                "Aura does not just help you create content. It first helps you understand what to stand for."
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-5)" }}>
                Most professionals skip this step. They start posting without a clear positioning. The result is content that gets ignored. Aura starts with the foundation — who you are, what you are best at, and where you should focus.
              </p>
            </div>
          </div>

          {/* Glassmorphism feature cards */}
          <div className="flex flex-col gap-4 mb-10">
            {[
              { icon: "◈", title: "Discover your strengths", desc: "A short assessment based on proven frameworks. Aura finds what you do better than almost anyone else." },
              { icon: "◎", title: "Find your brand positioning", desc: "Where you can be the known authority. Based on your strengths, experience, and what your market needs." },
              { icon: "↗", title: "Map your path to your career target", desc: "What stands between you and the role you want. Aura shows you the specific gaps and how to close them." },
            ].map((c, i) => (
              <div key={i} className="glass-card flex gap-4 p-5 rounded-[10px]">
                <div className="glass-icon w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm transition-shadow duration-300" style={{ background: "rgba(197,165,90,0.12)", color: "var(--brand)", border: "1px solid rgba(197,165,90,0.2)" }}>
                  {c.icon}
                </div>
                <div>
                  <div className="text-[14px] font-medium mb-1" style={{ color: "var(--ink-7)" }}>{c.title}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: "var(--ink-5)" }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Framework pills */}
          <p className="text-[9px] uppercase tracking-[0.15em] mb-3 text-center" style={{ color: "var(--ink-4)" }}>Inspired by proven frameworks</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Gallup CliftonStrengths", "Personal brand positioning", "Career gap analysis", "Voice profiling"].map(f => (
              <span key={f} className="px-3 py-1.5 rounded-full text-[11px]" style={{ color: "var(--brand)", border: "1px solid rgba(197,165,90,0.25)", background: "var(--surface-ink-subtle)" }}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Section 6 — Built for (Improvement 6: horizontal compact cards on mobile) */}
      <section className="landing-compact py-16 px-5 sm:px-10">
        <div className="max-w-3xl mx-auto">
          <p className="section-label text-[9px] uppercase tracking-[0.2em] mb-8 text-center" style={{ color: "var(--ink-4)" }}>Built for</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/></svg>, title: "Senior consultants", desc: "Who want to be recognised as the go-to expert in their practice area" },
              { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>, title: "Executives and leaders", desc: "Who need a consistent personal brand to attract opportunities and board visibility" },
              { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>, title: "Independent experts", desc: "Coaches, advisors, and founders who want to build influence without a marketing team" },
            ].map((p, i) => (
              <div key={i} className="sm:text-center p-5 sm:p-5 rounded-[10px] flex sm:flex-col items-center sm:items-center gap-[14px] sm:gap-0" style={{ background: "var(--surface-ink-raised)", border: "1px solid rgba(197,165,90,0.3)", padding: undefined }}>
                <div className="w-10 h-10 sm:w-[44px] sm:h-[44px] rounded-full sm:mx-auto sm:mb-4 flex items-center justify-center shrink-0" style={{ border: "1px solid rgba(197,165,90,0.3)" }}>
                  {p.icon}
                </div>
                <div className="text-left sm:text-center">
                  <div className="text-[13px] font-medium mb-1" style={{ color: "var(--ink-7)" }}>{p.title}</div>
                  <div className="text-[11px] leading-relaxed" style={{ color: "var(--ink-5)" }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 7 — How it works (Improvement 7: tighter mobile spacing) */}
      <section id="how-it-works" className="landing-compact relative py-16 px-5 sm:px-10" style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(180deg, var(--ink) 0%, #0a0e18 40%, #0a0e18 60%, var(--ink) 100%)",
        }} />
        <div className="relative max-w-2xl mx-auto">
          <p className="section-label text-[9px] uppercase tracking-[0.2em] mb-10 text-center" style={{ color: "var(--ink-4)" }}>How it works</p>
          <div className="flex flex-col gap-10 md:gap-10" style={{}}>
            {stepData.map((s, i) => (
              <div
                key={s.n}
                ref={steps[i].ref}
                className="flex gap-5 items-start mb-0 md:mb-0"
                style={{
                  opacity: steps[i].visible ? 1 : 0,
                  transform: steps[i].visible ? "translateX(0)" : "translateX(40px)",
                  transition: `opacity 0.5s ease ${i * 0.12}s, transform 0.5s ease ${i * 0.12}s`,
                  willChange: "transform, opacity",
                  marginBottom: window.innerWidth <= 768 ? 24 : undefined,
                }}
              >
                <div className="font-bold shrink-0 w-12 text-[28px] md:text-[32px]" style={{ color: "var(--surface-ink-subtle)", fontFamily: "'Playfair Display', serif" }}>{s.n}</div>
                <div>
                  <div className="text-[16px] md:text-[15px] font-medium mb-1" style={{ color: "var(--ink-7)" }}>{s.t}</div>
                  <div className="text-[13px] leading-[1.6]" style={{ color: "var(--ink-5)" }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 8 — Social proof (Improvement 8: desktop auto-scroll, mobile swipe) */}
      <section className="landing-compact py-16 px-5 sm:px-10" style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}>
        <div className="max-w-4xl mx-auto overflow-hidden">
          {/* Desktop: CSS auto-scroll carousel */}
          <div className="hidden md:block">
            <div className="testimonial-track">
              {desktopTestimonials.map((t, i) => (
                <div key={i} className="flex-shrink-0 w-[340px] p-5 rounded-xl" style={{ background: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}>
                  <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--ink-6)" }}>"{t.q}"</p>
                  <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>{t.a}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Mobile: single card with swipe + dots */}
          <div className="md:hidden">
            <MobileTestimonials testimonials={testimonials} />
          </div>
        </div>
      </section>

      {/* Section 9 — CTA band (gold shimmer) */}
      <section className="landing-compact-cta relative py-14 px-5 sm:px-10 text-center overflow-hidden" style={{ background: "var(--brand)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
          animation: "gold-shimmer 5s ease-in-out infinite",
          willChange: "transform",
        }} />
        <div className="relative">
          <h2 className="text-[22px] sm:text-[28px] font-semibold mb-3" style={{ color: "var(--ink)", fontFamily: "'Playfair Display', serif" }}>Your authority starts here.</h2>
          <p className="text-[13px] mb-6" style={{ color: "#0d0d0d99" }}>Free to start. No credit card needed. Takes 2 minutes to set up.</p>
          <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-90" style={{ background: "var(--ink)", color: "var(--ink-7)" }}>
            Get early access
          </button>
        </div>
      </section>

      {/* Section 10 — Footer */}
      <footer className="landing-compact-footer py-10 px-5 sm:px-10 text-center" style={{ borderTop: "1px solid var(--surface-ink-subtle)" }}>
        <span className="text-sm font-bold tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "'Playfair Display', serif" }}>AURA</span>
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-4)" }}>Strategic intelligence for senior professionals.</p>
      </footer>
    </div>
  );
};

export default Landing;
