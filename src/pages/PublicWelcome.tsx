import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import usePageMeta from "@/hooks/usePageMeta";

const BRONZE = "#B08D3A";
const BG = "#0a0a08";
const BG_WARM = "#0f0e0c";
const CARD_BG = "#151412";

const HorizonEye = ({ size = 60, color = BRONZE, pupilR = 4 }: { size?: number; color?: string; pupilR?: number }) => (
  <svg width={size} height={size * 0.55} viewBox="0 0 60 33" fill="none" aria-hidden>
    <path d="M2 16.5 C 12 4, 48 4, 58 16.5 C 48 29, 12 29, 2 16.5 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <circle cx="30" cy="16.5" r="9" stroke={color} strokeWidth="1" fill="none" opacity="0.55" />
    <circle cx="30" cy="16.5" r={pupilR} fill={color} style={{ transition: "r 600ms ease-out" }} />
  </svg>
);

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
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const counted = useCountUp(value ?? 0, visible);
  return (
    <div ref={ref} className={`reveal ${fullWidth ? "sm:col-span-2" : ""}`} style={{
      background: CARD_BG, border: "1px solid #1f1f1f", borderRadius: 10, padding: "20px 16px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 32, color: BRONZE, lineHeight: 1.1 }}>
        {literal ?? `${counted}${suffix}`}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#a3a3a3", lineHeight: 1.45, marginTop: 8 }}>
        {desc}
      </div>
    </div>
  );
};

const Milestone = ({ label, title, desc, preFilled }: { label: string; title: string; desc: string; preFilled?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(!!preFilled);
  useEffect(() => {
    if (preFilled || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setFilled(true); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [preFilled]);
  return (
    <div ref={ref} className="relative pl-10 pb-10">
      <div
        aria-hidden
        style={{
          position: "absolute", left: 7, top: 0, bottom: 0, width: 1,
          background: filled ? BRONZE : "#2a2a2a",
          transition: "background 600ms ease-out",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", left: 0, top: 2, width: 16, height: 16, borderRadius: "50%",
          border: `1.5px solid ${BRONZE}`,
          background: filled ? BRONZE : "transparent",
          transition: "background 400ms ease-out",
        }}
      />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "2px", color: BRONZE, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, color: "#fff", fontWeight: 500, marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#999", lineHeight: 1.55, marginTop: 6 }}>{desc}</div>
    </div>
  );
};

const Engine = ({ symbol, title, desc }: { symbol: string; title: string; desc: string }) => (
  <div className="reveal flex gap-4 items-start mb-6">
    <div style={{
      width: 36, height: 36, minWidth: 36, borderRadius: "50%", border: `1.5px solid ${BRONZE}`,
      display: "flex", alignItems: "center", justifyContent: "center", color: BRONZE, fontWeight: 600,
    }}>{symbol}</div>
    <div>
      <div style={{ fontSize: 15, color: "#fff", fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6, marginTop: 4 }}>{desc}</div>
    </div>
  </div>
);

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

  // Eye pupil scroll response
  const [pupilR, setPupilR] = useState(4);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      setPupilR(4 + p * 3);
    };
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
    <div style={{ background: BG, color: "#ededed", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        html { scroll-behavior: smooth; }
        .pw-fade-up { opacity: 0; transform: translateY(20px); animation: pw-fadeUp 500ms ease-out forwards; }
        @keyframes pw-fadeUp { to { opacity: 1; transform: translateY(0); } }
        .pw-eye-in { opacity: 0; transform: scale(0.5); animation: pw-eyeIn 800ms ease-out 500ms forwards; }
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
        .pw-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${BRONZE}; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; border: none; }
        .pw-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${BRONZE}; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; border: none; }

        .pw-cta { background: ${BRONZE}; color: #fff; font-size: 16px; font-weight: 600; padding: 16px 36px; border-radius: 8px; display: inline-block; text-decoration: none; transition: transform 200ms ease, box-shadow 200ms ease; }
        .pw-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(176,141,58,0.25); }

        @media (prefers-reduced-motion: reduce) {
          .reveal, .pw-fade-up, .pw-eye-in { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
          .pw-eye-pulse, .pw-bounce { animation: none !important; }
        }
      `}</style>

      <main>
      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div className="pw-eye-in pw-eye-pulse">
            <HorizonEye size={60} pupilR={pupilR} />
          </div>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300,
            fontSize: "clamp(22px, 4vw, 28px)", color: "#fff", textAlign: "center", margin: 0,
          }}>
            How visible is your expertise right now?
          </h1>
          <div className="pw-fade-up" style={{ width: "100%", maxWidth: 400, animationDelay: "1.8s", opacity: 0 }}>
            <input
              type="range" min={0} max={100} value={slider}
              onChange={(e) => { setSlider(Number(e.target.value)); if (!moved) setTimeout(() => setMoved(true), 500); }}
              className="pw-slider"
              aria-label="How visible is your expertise"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#a3a3a3" }}>
              <span>Only my clients know</span>
              <span>The market knows my name</span>
            </div>
          </div>
          <div style={{ minHeight: 80, maxWidth: 380, textAlign: "center" }}>
            {moved && (
              <p style={{
                fontSize: 15, color: "#bdbdbd", lineHeight: 1.65, margin: 0,
                opacity: fading ? 0 : 1, transition: "opacity 300ms ease",
              }}>{responseText}</p>
            )}
          </div>
          <div className="pw-fade-up pw-bounce" style={{ fontSize: 12, color: "#8a8a8a", animationDelay: "2.5s", opacity: 0, marginTop: 8 }}>↓</div>
        </div>
      </section>

      {/* PAIN */}
      <section style={{ background: BG, padding: "80px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>THE REAL PROBLEM</p>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", lineHeight: 1.2, marginTop: 16 }}>
            You've spent years becoming <em style={{ color: BRONZE, fontStyle: "italic" }}>exceptional</em>. The market has no idea.
          </h2>
          <blockquote className="reveal reveal-d2" style={{ borderLeft: "2px solid #333", padding: "20px 24px", fontStyle: "italic", color: "#bbb", fontSize: 15, lineHeight: 1.75, margin: "32px 0" }}>
            "You've led teams, shaped strategy, solved problems most people can't even name. But when someone outside your direct circle searches your name — they find almost nothing. No signal. No fingerprint. No proof of what you actually know."
          </blockquote>
          <p className="reveal reveal-d1" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            Meanwhile, professionals who publish consistently — even when their expertise is narrower than yours — are the ones getting invited to the table. The keynote slots. The advisory boards.
          </p>
          <p className="reveal reveal-d2" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            The problem was never your expertise. It was never your ideas.
          </p>
          <p className="reveal reveal-d3" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            <strong style={{ color: "#fff", fontWeight: 600 }}>The problem is that no one has helped you turn what's in your head into what the market sees.</strong>
          </p>
          <p className="reveal reveal-d4" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(22px, 3.5vw, 28px)", color: BRONZE, marginTop: 40 }}>
            Until now.
          </p>
        </div>
      </section>

      {/* STATS */}
      <section style={{ background: BG_WARM, padding: "80px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>THE NUMBERS DON'T LIE</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
            <StatCard value={73} desc="of decision-makers trust expertise content over marketing" />
            <StatCard value={82} desc="trust companies more when leaders are visible online" />
            <StatCard value={54} desc="have rejected candidates for invisible online presence" />
            <StatCard literal="<3%" desc="of LinkedIn's 1B+ users create original content weekly" />
            <StatCard value={44} desc="of company value is tied to its leader's reputation" fullWidth />
          </div>
          <p className="reveal" style={{ fontSize: 11, color: "#9a9a9a", marginTop: 16 }}>
            Edelman-LinkedIn 2024/2025 · Weber Shandwick · Brunswick Group
          </p>
          <p className="reveal reveal-d1" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 20 }}>
            You're already in the top 1% of expertise. Aura puts you in the top 1% of visibility — without changing how you spend your week.
          </p>
        </div>
      </section>

      {/* BUILDER */}
      <section style={{ background: BG, padding: "80px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>WHY I BUILT THIS</p>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", marginTop: 16 }}>
            Because I'm one of you.
          </h2>
          <p className="reveal reveal-d1" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            I read 30+ articles a week. I see patterns in digital transformation that most reports miss. I hold opinions that could shape how organizations think about their future.
          </p>
          <p className="reveal reveal-d2" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            But for years, all of that stayed locked in my head, my notes, my devices. The market had no idea.
          </p>
          <p className="reveal reveal-d3" style={{ fontSize: 15, color: "#ededed", lineHeight: 1.75, marginTop: 24 }}>
            So I built the system I wished existed. One that takes what I already read, finds the strategic patterns, understands my voice and my expertise — and turns it into a digital presence that compounds over time.
          </p>
          <p className="reveal reveal-d4" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(20px, 3vw, 26px)", color: BRONZE, marginTop: 32 }}>
            I called it Aura. And now it's ready for you.
          </p>
        </div>
      </section>

      {/* HOW */}
      <section style={{ background: BG_WARM, padding: "80px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>HOW AURA WORKS</p>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", marginTop: 16, marginBottom: 32 }}>
            Four engines. One intelligence system.
          </h2>
          <Engine symbol="✦" title="The identity map" desc="Aura doesn't start with content. It starts with YOU. Your strengths. Your sector expertise. Your natural voice. It builds a complete map of who you are professionally — so nothing it creates is generic." />
          <Engine symbol="◆" title="The intelligence engine" desc="You read an article. Aura reads it too. It finds the strategic pattern you'd miss on a busy Tuesday — and connects it to what matters in your sector right now." />
          <Engine symbol="◇" title="The voice studio" desc="Aura writes in your voice. Not templates. Not AI speak. Content that sounds like you wrote it at your absolute best — the version of you that had 3 uninterrupted hours to think and write." />
          <Engine symbol="●" title="The presence score" desc="Aura tracks your digital visibility over time — what's working, what's growing, where the right people are noticing you. Your reputation, measured and compounding." />
        </div>
      </section>

      {/* TIMELINE */}
      <section style={{ background: BG, padding: "80px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>WHAT CHANGES FOR YOU</p>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", marginTop: 16, marginBottom: 40 }}>
            From invisible to undeniable.
          </h2>
          <Milestone preFilled label="DAY 1" title="Aura learns who you are." desc="Your strengths. Your sector. Your voice. By the end of your first session, Aura knows what makes you different from every other professional in your market." />
          <Milestone preFilled label="WEEK 1" title="Your first post goes live." desc="A LinkedIn post that sounds like you — not like AI. About a signal Aura found in what you read. Your expertise, visible for the first time to people who've never met you." />
          <Milestone label="MONTH 1" title="People start to notice." desc="Consistent, intelligent content builds recognition. Decision-makers in your sector start seeing your name next to insights they care about." />
          <Milestone label="MONTH 3" title="The invitations arrive." desc="Speaking panels. Advisory requests. DMs from people you've never met saying 'I've been following your content.' The market is finding you." />
          <Milestone label="YEAR 1" title="You own your space." desc="When someone in your industry mentions your topic — your name comes up. Not because you marketed yourself. Because your expertise finally has the fingerprint it always deserved." />
        </div>
      </section>

      {/* FIRST 10 MINUTES */}
      <section style={{ background: CARD_BG, padding: "80px 24px", borderTop: "1px solid #1a1a1a", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p className="reveal" style={{ fontSize: 10, letterSpacing: "2.5px", color: BRONZE, fontWeight: 600, margin: 0 }}>YOUR FIRST 10 MINUTES</p>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", marginTop: 16, marginBottom: 32 }}>
            You'll feel the difference immediately.
          </h2>
          {[
            { n: "01", t: "Accept your invitation", d: "A welcome that shows you this was built for someone at your level." },
            { n: "02", t: "Tell Aura who you are", d: "Paste your LinkedIn headline. Aura reads it in 3 seconds — no forms, no typing." },
            { n: "03", t: "Calibrate your edge", d: "10 quick strength sliders. Aura uses them to understand what truly sets you apart — and gives you instant insight on each one." },
            { n: "04", t: "See yourself through the market's eyes", d: "The moment that changes how you see your own expertise. People screenshot this. You'll understand why." },
          ].map((s, i) => (
            <div key={s.n} className={`reveal reveal-d${Math.min(i+1, 4)}`} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: BRONZE, fontWeight: 600 }}>{s.n}</div>
              <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginTop: 4 }}>{s.t}</div>
              <div style={{ fontSize: 13, color: "#999", lineHeight: 1.55, marginTop: 4 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: BG, minHeight: "80vh", padding: "80px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div className="pw-eye-pulse reveal" style={{ display: "flex", justifyContent: "center" }}>
            <HorizonEye size={48} />
          </div>
          <h2 className="reveal reveal-d1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: "clamp(24px, 4vw, 34px)", color: "#fff", marginTop: 24 }}>
            Stop being the best-kept secret in your field.
          </h2>
          <p className="reveal reveal-d2" style={{ fontSize: 15, color: "#999", maxWidth: 380, margin: "20px auto 32px", lineHeight: 1.7 }}>
            Your expertise has earned its place. Give Aura 10 minutes — and it will show you who you really are in the market.
          </p>
          <Link to="/request-access" className="pw-cta reveal reveal-d3">Accept Your Invitation →</Link>
          <p className="reveal reveal-d4" dir="rtl" style={{ fontSize: 16, color: BRONZE, marginTop: 24, fontFamily: "'Cairo', 'DM Sans', sans-serif" }}>
            حتى يعرف السوق قيمتك قبل أن يقابلك ✦
          </p>
          <p className="reveal reveal-d4" style={{ fontSize: 11, letterSpacing: "2px", color: "#9a9a9a", marginTop: 16 }}>
            PRIVATE BETA · BY INVITATION ONLY
          </p>
        </div>
      </section>
      </main>

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