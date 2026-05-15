import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown, Inbox, Radar, PenTool, TrendingUp,
  Home as HomeIcon, Compass, Sparkles, BarChart3, User,
} from "lucide-react";
import usePageMeta from "@/hooks/usePageMeta";

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "What does Aura actually do?", a: "Aura reads what you read. It detects the strategic patterns in your daily reading and turns them into signals — topics you're tracking more deeply than you realized. Then it generates LinkedIn content in your voice, grounded in your signals. The result: you build authority from intelligence you already have." },
  { q: "Where is my data stored?", a: "Your data is stored on Supabase (hosted on AWS) with industry-standard encryption. We do not sell, share, or monetize your data. AI processing is done per-request — we do not train models on your content." },
  { q: "Who is Aura built for?", a: "Senior professionals in the GCC — Directors, VPs, CIOs, CDOs — who read extensively but don't publish enough. Especially those in digital transformation, utilities, critical infrastructure, and Vision 2030 programs." },
  { q: "How is this different from ChatGPT?", a: "ChatGPT writes from general knowledge. Aura writes from YOUR knowledge — your captured articles, your detected signals, your professional voice. Every post references intelligence you've actually built, not generic AI output." },
  { q: "What languages does Aura support?", a: "English and Arabic. Arabic content uses contemporary formal Arabic with proper RTL formatting. Technical terms (AI, KPI, IoT) stay in English." },
  { q: "How long before I see value?", a: "5 minutes. Capture 3 articles → Aura detects your first signal. Generate your first post from that signal. Your authority score starts moving immediately." },
  { q: "Is this free during beta?", a: "Yes. The private beta is free. We'll introduce pricing ($49/month) after beta, with early access users receiving a founding member rate." },
  { q: "How do I get access?", a: "Apply at aura-intel.org/request-access. We review applications weekly. Current wait time: 3-5 business days." },
];

const STEPS = [
  { n: "01", Icon: Inbox, t: "Capture what you read", d: "Paste any URL, upload a document, or record a voice note. Aura extracts the intelligence and stores it." },
  { n: "02", Icon: Radar, t: "Aura detects patterns", d: "As you capture more, Aura identifies strategic signals — recurring themes across your reading that form your expertise map." },
  { n: "03", Icon: PenTool, t: "Create content from signals", d: "Generate LinkedIn posts in your voice, in English or Arabic. Each post is grounded in your real intelligence — not generic AI." },
  { n: "04", Icon: TrendingUp, t: "Watch authority compound", d: "Your Authority Score tracks signal depth (40%), published content (40%), and capture rhythm (20%). Rise from Observer to Strategist to Authority." },
];

const PAGES = [
  { Icon: HomeIcon, t: "Home", d: "Your daily command center" },
  { Icon: Compass, t: "Intelligence", d: "Your strategic radar" },
  { Icon: Sparkles, t: "Publish", d: "Your voice" },
  { Icon: BarChart3, t: "Impact", d: "Your authority trajectory" },
  { Icon: User, t: "My Story", d: "Your market position" },
];

const SCORE = [
  { label: "Signal Intelligence", pct: 40, desc: "Depth and breadth of captured signals." },
  { label: "Content Authority", pct: 40, desc: "Quality and cadence of published content." },
  { label: "Capture Consistency", pct: 20, desc: "Regular rhythm of new captures." },
];

const Guide = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  usePageMeta({
    title: "Guide — How Aura Works",
    description: "How Aura turns your daily reading into market authority: capture, detect signals, generate content, and track your authority score.",
    path: "/guide",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session));
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--ink)", color: "var(--ink-7)", fontFamily: "var(--font-body)" }}
    >
      <style>{`
        .guide-step { transition: transform .25s ease, border-color .25s ease, background .25s ease; }
        .guide-step:hover { transform: translateY(-3px); border-color: var(--brand) !important; }
        .guide-page-card { transition: transform .25s ease, border-color .25s ease; }
        .guide-page-card:hover { transform: translateY(-2px); border-color: var(--brand) !important; }
        .guide-bar-fill { background: linear-gradient(90deg, var(--brand), #a88c3a); height: 8px; border-radius: 999px; }
        .guide-footer a { color: rgba(255,255,255,0.4); transition: color .15s ease; }
        .guide-footer a:hover { color: rgba(255,255,255,0.7); }
        @media (max-width: 768px) {
          .guide-footer-grid { grid-template-columns: 1fr !important; text-align: center; gap: 20px !important; }
          .guide-footer-col-center, .guide-footer-col-right { text-align: center !important; }
        }
      `}</style>

      {/* Nav */}
      <nav
        className="flex items-center justify-between px-5 sm:px-10 py-5 sticky top-0 z-50"
        style={{
          background: "rgba(13,13,13,0.95)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--surface-ink-subtle)",
          paddingTop: "max(env(safe-area-inset-top), 16px)",
        }}
      >
        <Link to="/" className="text-lg font-bold tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}>
          AURA
        </Link>
        <button
          onClick={() => navigate(authed ? "/home" : "/auth")}
          className="text-sm px-4 py-2 rounded-lg border transition-colors hover:bg-brand/10"
          style={{ color: "var(--brand)", borderColor: "var(--bronze-line)" }}
        >
          {authed ? "Open app" : "Sign in"}
        </button>
      </nav>

      {/* Hero */}
      <section className="px-5 sm:px-10 pt-20 pb-14 text-center max-w-3xl mx-auto">
        <p className="text-[10px] tracking-[0.2em] uppercase mb-5" style={{ color: "var(--ink-4)" }}>The Aura Guide</p>
        <h1
          className="mb-5"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "var(--ink-7)",
            fontWeight: 500,
          }}
        >
          How Aura works
        </h1>
        <p style={{ fontSize: 16, color: "var(--ink-5)", lineHeight: 1.6 }}>
          From first capture to market authority — in 4 steps.
        </p>
      </section>

      {/* 4-step journey */}
      <section className="px-5 sm:px-10 pb-20">
        <div className="max-w-6xl mx-auto grid gap-5 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, Icon, t, d }) => (
            <div
              key={n}
              className="guide-step rounded-2xl p-7"
              style={{ background: "var(--surface-ink-raised)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-6">
                <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--brand)", letterSpacing: "0.05em" }}>{n}</span>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(197,165,90,0.1)", border: "1px solid rgba(197,165,90,0.2)" }}
                >
                  <Icon size={22} style={{ color: "var(--brand)" }} />
                </div>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink-7)", marginBottom: 10, lineHeight: 1.25 }}>{t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-5)" }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Your pages */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-[10px] tracking-[0.2em] uppercase mb-4 text-center" style={{ color: "var(--ink-4)" }}>The interface</p>
          <h2 className="text-center mb-12" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-7)", fontWeight: 500 }}>
            Your pages
          </h2>
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {PAGES.map(({ Icon, t, d }) => (
              <div
                key={t}
                className="guide-page-card rounded-xl p-6 flex items-start gap-4"
                style={{ background: "var(--surface-ink-raised)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(197,165,90,0.1)", border: "1px solid rgba(197,165,90,0.2)" }}
                >
                  <Icon size={18} style={{ color: "var(--brand)" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-7)", marginBottom: 4 }}>{t}</h3>
                  <p style={{ fontSize: 13, color: "var(--ink-5)", lineHeight: 1.55 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Authority score */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] tracking-[0.2em] uppercase mb-4 text-center" style={{ color: "var(--ink-4)" }}>The score</p>
          <h2 className="text-center mb-3" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-7)", fontWeight: 500 }}>
            How authority is calculated
          </h2>
          <p className="text-center mb-12" style={{ fontSize: 14, color: "var(--ink-5)", lineHeight: 1.6 }}>
            One number. Three components. Built from real activity, not vanity metrics.
          </p>
          <div className="space-y-7">
            {SCORE.map(({ label, pct, desc }) => (
              <div key={label}>
                <div className="flex items-baseline justify-between mb-2">
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-7)" }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--brand)" }}>{pct}%</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                  <div className="guide-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-5)", marginTop: 8, lineHeight: 1.55 }}>{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { tier: "Observer", range: "0–34", desc: "Building your foundation." },
              { tier: "Strategist", range: "35–64", desc: "Patterns are forming." },
              { tier: "Authority", range: "65–100", desc: "Recognized in your field." },
            ].map((t) => (
              <div
                key={t.tier}
                className="rounded-xl p-5 text-center"
                style={{ background: "var(--surface-ink-raised)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--brand)", marginBottom: 4 }}>{t.tier}</p>
                <p style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.08em", marginBottom: 8 }}>{t.range}</p>
                <p style={{ fontSize: 13, color: "var(--ink-5)", lineHeight: 1.5 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center mb-12" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-7)", fontWeight: 500, letterSpacing: "-0.01em" }}>
            Frequently asked questions
          </h2>
          <div className="flex flex-col">
            {FAQ_ITEMS.map((item, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  style={{ borderTop: i === 0 ? "1px solid rgba(255,255,255,0.1)" : undefined, borderBottom: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between text-left py-5"
                    style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-7)" }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{item.q}</span>
                    <ChevronDown
                      size={18}
                      style={{
                        color: "rgba(255,255,255,0.6)",
                        transform: open ? "rotate(180deg)" : "none",
                        transition: "transform 200ms ease",
                        flexShrink: 0,
                        marginLeft: 16,
                      }}
                    />
                  </button>
                  {open && (
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", paddingBottom: 20, paddingRight: 34 }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 sm:px-10 py-20 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h2 className="mb-5" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 40px)", color: "var(--ink-7)", fontWeight: 500 }}>
          Ready to start?
        </h2>
        <p className="mb-8 max-w-md mx-auto" style={{ fontSize: 15, color: "var(--ink-5)", lineHeight: 1.6 }}>
          {authed ? "Jump back into your dashboard and keep building." : "Join the private beta. We review applications weekly."}
        </p>
        <button
          onClick={() => navigate(authed ? "/home" : "/request-access")}
          className="px-7 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110"
          style={{ background: "var(--brand)", color: "var(--ink)", fontWeight: 500 }}
        >
          {authed ? "Open Aura" : "Request access"}
        </button>
      </section>

      {/* Footer (mirrors landing) */}
      <footer
        className="guide-footer"
        style={{
          background: "#0D0D0D",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "48px 40px",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        <div
          className="guide-footer-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 32,
            alignItems: "start",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          <div>
            <div className="flex items-center gap-2" style={{ height: 24 }}>
              <span className="text-base font-bold tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "var(--font-display)", lineHeight: "24px" }}>AURA</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Strategic Intelligence OS</span>
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
              © 2026 Aura Intelligence. All rights reserved.
            </p>
          </div>
          <div className="guide-footer-col-center" style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: 10, fontSize: 12 }}>
              <Link to="/terms">Terms</Link>
              <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
              <Link to="/privacy">Privacy</Link>
              <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
              <Link to="/guide">Guide</Link>
              <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
              <Link to="/request-access">Request Access</Link>
            </div>
          </div>
          <div className="guide-footer-col-right" style={{ textAlign: "right" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Contact: <a href="mailto:mohammad.mahafdhah@aura-intel.org">mohammad.mahafdhah@aura-intel.org</a>
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
              Built in Riyadh for the world
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Guide;