import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Link as LinkIcon, FileText, Mic, StickyNote, Image, Zap } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import carbonBg from "@/assets/carbon-bg.jpg";

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

/* ── Animated counter ── */
const Counter = ({ target, visible }: { target: number; visible: boolean }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const id = setInterval(() => { start = Math.min(start + step, target); setVal(start); if (start >= target) clearInterval(id); }, 30);
    return () => clearInterval(id);
  }, [visible, target]);
  return <>{val}</>;
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

  /* testimonial auto-scroll */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = setInterval(() => { if (!paused && el) el.scrollLeft += 1; }, 30);
    return () => clearInterval(id);
  }, [paused]);

  /* reveal hooks */
  const pullQuote = useReveal();
  const diffQuote = useReveal();
  const stats = useReveal();
  const steps = [useReveal(), useReveal(), useReveal(), useReveal(), useReveal()];

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  if (loading) return <div className="min-h-screen" style={{ background: "#0d0d0d" }} />;

  const testimonials = [
    { q: "I used to spend hours trying to write a LinkedIn post. Now I just capture what I read and Aura does the rest.", a: "— Sarah M. · Senior Consultant · Big Four · Riyadh" },
    { q: "It finally helped me see what I should be known for. I was an expert in too many things and known for none.", a: "— Khalid A. · VP Digital · Utilities · Dubai" },
    { q: "I used to spend hours trying to write a LinkedIn post. Now I just capture what I read and Aura does the rest.", a: "— Sarah M. · Senior Consultant · Big Four · Riyadh" },
    { q: "It finally helped me see what I should be known for. I was an expert in too many things and known for none.", a: "— Khalid A. · VP Digital · Utilities · Dubai" },
  ];

  const stepData = [
    { n: "00", t: "Know yourself", d: "A short assessment reveals your strengths, your brand positioning, and the exact path to your career target." },
    { n: "01", t: "Capture anything", d: "Paste a link. Upload a document. Record a voice note. Aura reads it and saves it." },
    { n: "02", t: "Aura finds the patterns", d: "It connects what you read. It finds the ideas that keep coming up. It tells you what is important in your field right now." },
    { n: "03", t: "Create content in your voice", d: "One tap. Aura drafts a post, a framework, or an essay — in English or Arabic — that sounds like you." },
    { n: "04", t: "Watch your influence grow", d: "Track your LinkedIn growth. See which content works. Keep building on what is already working." },
  ];

  return (
    <div className="min-h-screen text-[#f0f0f0]" style={{ background: "#0d0d0d", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes aura-breathe {
          0%, 100% { box-shadow: 0 0 30px rgba(197,165,90,0.3), 0 0 60px rgba(197,165,90,0.12), 0 0 100px rgba(197,165,90,0.06); transform: scale(1); }
          50% { box-shadow: 0 0 50px rgba(197,165,90,0.5), 0 0 90px rgba(197,165,90,0.2), 0 0 130px rgba(197,165,90,0.08); transform: scale(1.05); }
        }
        @keyframes orb-float-1 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes orb-float-2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes orb-float-3 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .orb-icon { transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease; will-change: transform; }
        .orb-icon:hover { transform: scale(1.2) !important; box-shadow: 0 0 16px rgba(197,165,90,0.35); border-color: rgba(197,165,90,0.5) !important; }
        @keyframes ring-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes draw-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes gold-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
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
      `}</style>

      {/* Section 1 — Nav */}
      <nav className="flex items-center justify-between px-5 sm:px-10 py-5 sticky top-0 z-50" style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a" }}>
        <span className="text-lg font-bold tracking-[0.15em]" style={{ color: "#C5A55A", fontFamily: "'Playfair Display', Georgia, serif" }}>AURA</span>
        <button onClick={() => navigate("/auth")} className="text-sm px-4 py-2 rounded-lg border transition-colors hover:bg-[#C5A55A]/10" style={{ color: "#C5A55A", borderColor: "#C5A55A33" }}>
          Sign in
        </button>
      </nav>

      {/* Section 2 — Hero */}
      <section className="relative overflow-hidden px-5 sm:px-10 pt-16 pb-20 text-center">
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
          <p className="text-[10px] tracking-[0.2em] uppercase mb-6" style={{ color: "#3a3a3a" }}>For senior professionals in the GCC</p>
          <h1 className="text-[28px] sm:text-[38px] leading-[1.15] font-medium mb-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Everything you read.<br />Turned into <span style={{ color: "#C5A55A" }}>authority</span>.
          </h1>
          <p className="text-[14px] sm:text-[16px] leading-relaxed max-w-lg mx-auto mb-10" style={{ color: "#666" }}>
            Aura reads what you capture, finds the patterns, and helps you create content that builds your name in your field.
          </p>

          {/* Capture orb */}
          <div className="relative w-[220px] h-[220px] mx-auto mb-10">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #C5A55A, #a88c3a)", animation: "aura-breathe 3s ease-in-out infinite" }}>
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
              { Icon: LinkIcon, label: "link", angle: 0, float: 1 },
              { Icon: FileText, label: "document", angle: 60, float: 2 },
              { Icon: Mic, label: "voice", angle: 120, float: 3 },
              { Icon: StickyNote, label: "note", angle: 180, float: 1 },
              { Icon: Image, label: "image", angle: 240, float: 2 },
              { Icon: Zap, label: "quick capture", angle: 300, float: 3 },
            ].map(({ Icon, label, angle, float }) => {
              const rad = (angle - 90) * (Math.PI / 180);
              const x = 110 + Math.cos(rad) * 95;
              const y = 110 + Math.sin(rad) * 95;
              const durations = [3.2, 3.8, 2.9];
              const delays = [0, 0.5, 1.1];
              return (
                <div key={label} className="absolute flex flex-col items-center" style={{ left: x - 16, top: y - 16, animation: `orb-float-${float} ${durations[float - 1]}s ease-in-out infinite`, animationDelay: `${delays[float - 1]}s`, willChange: "transform" }}>
                  <div className="orb-icon rounded-full flex items-center justify-center cursor-default" style={{ width: 32, height: 32, background: "#1a1a1a", border: "1px solid #252525" }}>
                    <Icon size={14} style={{ color: "#C5A55A" }} />
                  </div>
                  <span className="mt-1 whitespace-nowrap" style={{ fontSize: "9px", color: "#3a3a3a" }}>{label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => navigate("/auth")} className="px-6 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110" style={{ background: "#C5A55A", color: "#0d0d0d", fontWeight: 500 }}>
              Get early access
            </button>
            <button onClick={scrollToHowItWorks} className="px-6 py-3 rounded-xl text-sm transition-colors hover:bg-white/5" style={{ color: "#666666", border: "0.5px solid #3a3a3a", background: "transparent", fontWeight: 400 }}>
              See how it works
            </button>
          </div>
        </div>
      </section>

      {/* Section 3 — Stats */}
      <section ref={stats.ref} className="flex items-center justify-center gap-0 py-10 px-5">
        {[
          { num: 47, label: "Sources captured" },
          { num: 7, label: "Signals detected" },
          { num: 90, label: "Authority score" },
        ].map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && <div className="w-px h-10 mx-6 sm:mx-10" style={{ background: "#252525" }} />}
            <div className="text-center">
              <div className="font-semibold" style={{ fontSize: 28, color: "#C5A55A", fontFamily: "'Playfair Display', serif" }}>
                <Counter target={s.num} visible={stats.visible} />
              </div>
              <div className="mt-1 uppercase tracking-[0.15em]" style={{ fontSize: 9, color: "#3a3a3a" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Section 4 — Pull quote (scroll reveal) */}
      <section ref={pullQuote.ref} className="px-5 sm:px-10 py-14 max-w-2xl mx-auto">
        <p className="text-[9px] uppercase tracking-[0.2em] mb-4" style={{ color: "#3a3a3a" }}>The problem</p>
        <div className="relative pl-5">
          {/* Animated gold line */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
            background: "#C5A55A",
            transformOrigin: "top",
            transform: pullQuote.visible ? "scaleY(1)" : "scaleY(0)",
            transition: "transform 0.8s cubic-bezier(0.22,1,0.36,1)",
          }} />
          <div style={{
            opacity: pullQuote.visible ? 1 : 0,
            transform: pullQuote.visible ? "translateY(0)" : "translateY(50px)",
            transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
          }}>
            <p className="text-[18px] sm:text-[22px] font-medium leading-snug mb-4" style={{ fontFamily: "'Playfair Display', serif", color: "#f0f0f0" }}>
              "You know your field. But no one knows you."
            </p>
            <p className="text-[14px] leading-relaxed" style={{ color: "#666" }}>
              You read reports. You attend meetings. You have real expertise. But it stays in your head. Aura changes that — it captures what you read, finds what matters, and helps you share it.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5 — What makes Aura different (carbon fiber bg + glassmorphism) */}
      <section ref={diffQuote.ref} className="relative py-16 px-5 sm:px-10" style={{ borderTop: "1px solid #1a1a1a" }}>
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
          <p className="text-[9px] uppercase tracking-[0.2em] mb-4" style={{ color: "#3a3a3a" }}>What makes Aura different</p>
          <div className="relative pl-5 mb-10">
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
              background: "#C5A55A",
              transformOrigin: "top",
              transform: diffQuote.visible ? "scaleY(1)" : "scaleY(0)",
              transition: "transform 0.8s cubic-bezier(0.22,1,0.36,1)",
            }} />
            <div style={{
              opacity: diffQuote.visible ? 1 : 0,
              transform: diffQuote.visible ? "translateY(0)" : "translateY(50px)",
              transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
            }}>
              <p className="text-[16px] sm:text-[18px] font-medium leading-snug mb-3" style={{ fontFamily: "'Playfair Display', serif", color: "#f0f0f0" }}>
                "Aura does not just help you create content. It first helps you understand what to stand for."
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "#666" }}>
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
                <div className="glass-icon w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm transition-shadow duration-300" style={{ background: "rgba(197,165,90,0.12)", color: "#C5A55A", border: "1px solid rgba(197,165,90,0.2)" }}>
                  {c.icon}
                </div>
                <div>
                  <div className="text-[14px] font-medium mb-1" style={{ color: "#f0f0f0" }}>{c.title}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: "#666" }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Framework pills */}
          <p className="text-[9px] uppercase tracking-[0.15em] mb-3 text-center" style={{ color: "#3a3a3a" }}>Inspired by proven frameworks</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Gallup CliftonStrengths", "Personal brand positioning", "Career gap analysis", "Voice profiling"].map(f => (
              <span key={f} className="px-3 py-1.5 rounded-full text-[11px]" style={{ color: "#C5A55A", border: "1px solid rgba(197,165,90,0.25)", background: "#1e1a10" }}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Section 6 — Built for */}
      <section className="py-16 px-5 sm:px-10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[9px] uppercase tracking-[0.2em] mb-8 text-center" style={{ color: "#3a3a3a" }}>Built for</p>
          <div className="flex justify-center gap-6 sm:gap-10">
            {[
              { title: "Senior consultants", desc: "Who want to be seen as the go-to expert in their practice area" },
              { title: "Executives", desc: "Who need a visible personal brand to attract board seats and opportunities" },
            ].map((p, i) => (
              <div key={i} className="text-center max-w-[160px]">
                <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-[16px] font-medium tracking-wider" style={{ background: "#141414", border: "1px solid rgba(197,165,90,0.3)", color: "#C5A55A" }}>
                  {i === 0 ? "SC" : "EX"}
                </div>
                <div className="text-[13px] font-medium mb-1" style={{ color: "#f0f0f0" }}>{p.title}</div>
                <div className="text-[11px] leading-relaxed" style={{ color: "#666" }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 7 — How it works (sequential reveal + navy gradient) */}
      <section id="how-it-works" className="relative py-16 px-5 sm:px-10" style={{ borderTop: "1px solid #1a1a1a" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(180deg, #0d0d0d 0%, #0a0e18 40%, #0a0e18 60%, #0d0d0d 100%)",
        }} />
        <div className="relative max-w-2xl mx-auto">
          <p className="text-[9px] uppercase tracking-[0.2em] mb-10 text-center" style={{ color: "#3a3a3a" }}>How it works</p>
          <div className="flex flex-col gap-10">
            {stepData.map((s, i) => (
              <div
                key={s.n}
                ref={steps[i].ref}
                className="flex gap-5 items-start"
                style={{
                  opacity: steps[i].visible ? 1 : 0,
                  transform: steps[i].visible ? "translateX(0)" : "translateX(40px)",
                  transition: `opacity 0.5s ease ${i * 0.12}s, transform 0.5s ease ${i * 0.12}s`,
                  willChange: "transform, opacity",
                }}
              >
                <div className="text-[32px] font-bold shrink-0 w-12" style={{ color: "#1f1f1f", fontFamily: "'Playfair Display', serif" }}>{s.n}</div>
                <div>
                  <div className="text-[15px] font-medium mb-1" style={{ color: "#f0f0f0" }}>{s.t}</div>
                  <div className="text-[13px] leading-relaxed" style={{ color: "#666" }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 8 — Social proof (infinite carousel) */}
      <section className="py-16 px-5 sm:px-10" style={{ borderTop: "1px solid #1a1a1a" }}>
        <div className="max-w-4xl mx-auto overflow-hidden">
          <div
            ref={scrollRef}
            className="flex gap-4 hide-scrollbar"
            style={{ overflowX: "auto", scrollBehavior: "auto" }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {testimonials.map((t, i) => (
              <div key={i} className="flex-shrink-0 w-[300px] sm:w-[340px] p-5 rounded-xl" style={{ background: "#141414", border: "1px solid #252525" }}>
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: "#999" }}>"{t.q}"</p>
                <p className="text-[11px]" style={{ color: "#3a3a3a" }}>{t.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 9 — CTA band (gold shimmer) */}
      <section className="relative py-14 px-5 sm:px-10 text-center overflow-hidden" style={{ background: "#C5A55A" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
          animation: "gold-shimmer 5s ease-in-out infinite",
          willChange: "transform",
        }} />
        <div className="relative">
          <h2 className="text-[22px] sm:text-[28px] font-semibold mb-3" style={{ color: "#0d0d0d", fontFamily: "'Playfair Display', serif" }}>Your authority starts here.</h2>
          <p className="text-[13px] mb-6" style={{ color: "#0d0d0d99" }}>Free to start. No credit card needed. Takes 2 minutes to set up.</p>
          <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-90" style={{ background: "#0d0d0d", color: "#f0f0f0" }}>
            Get early access
          </button>
        </div>
      </section>

      {/* Section 10 — Footer */}
      <footer className="py-10 px-5 sm:px-10 text-center" style={{ borderTop: "1px solid #1a1a1a" }}>
        <span className="text-sm font-bold tracking-[0.15em]" style={{ color: "#C5A55A", fontFamily: "'Playfair Display', serif" }}>AURA</span>
        <p className="mt-2 text-[11px]" style={{ color: "#3a3a3a" }}>Strategic intelligence for GCC professionals.</p>
      </footer>
    </div>
  );
};

export default Landing;
