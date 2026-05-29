import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown, Inbox, Radar, PenTool, TrendingUp,
  Home as HomeIcon, Compass, Sparkles, BarChart3, User,
} from "lucide-react";
import usePageMeta from "@/hooks/usePageMeta";

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "What does Aura actually do?", a: "You read constantly. Articles, reports, market updates — you consume more intelligence in a week than most people do in a month. But none of it is visible.\n\nAura watches what you read, detects the patterns you're tracking deeper than you realized, and generates LinkedIn content in your voice — grounded in your real intelligence. Not a template. Not a prompt. Your signal, your tone, your sector.\n\nThe result? People start noticing what you know before you walk in the room." },
  { q: "I barely have time to read — how is this not more work?", a: "That's the point. Aura doesn't ask you to write. It asks you to keep reading — which you already do. Paste one URL instead of closing the tab. That's the entire input.\n\nMost users spend under 10 minutes a week on Aura. The platform does the pattern detection, the writing, and the tracking. Your job is just to keep being curious." },
  { q: "Will people know the content is AI-generated?", a: "Not if you're using Aura correctly. Every post is generated from YOUR captures, trained on YOUR writing style, and grounded in YOUR strategic signals. It doesn't sound like ChatGPT because it doesn't use ChatGPT's generic knowledge — it uses yours.\n\nThat said: always review before publishing. Aura writes the draft. The final voice is yours." },
  { q: "How is this different from ChatGPT?", a: "ChatGPT writes from the internet's knowledge. Aura writes from yours.\n\nWhen you ask ChatGPT to write about digital transformation in GCC utilities, it gives you what every article on the internet says. When Aura generates the same post, it pulls from the 47 articles you captured about Value-Based P&L models, the Deloitte report you read last Tuesday, and the signal it detected about regulatory shifts in Q1 2026.\n\nSame topic. Completely different depth." },
  { q: "Who is this built for?", a: "If you've spent 15+ years building real expertise but your LinkedIn is either silent or full of reposts — Aura is for you.\n\nSpecifically: Directors, VPs, CIOs, CDOs, and senior consultants in the GCC who know more than their digital presence shows. Especially in digital transformation, utilities, critical infrastructure, and Vision 2030.\n\nYou're not missing ideas. You're missing a system that turns what you already know into something the market can see." },
  { q: "Where is my data stored?", a: "On Supabase infrastructure with industry-standard encryption at rest and in transit. We don't sell your data. We don't share it with advertisers. We don't use it to train AI models.\n\nWhen Aura processes your captures through AI (Anthropic Claude, Google Gemini, Perplexity), it's per-request only — nothing is retained by providers beyond standard processing.\n\nYour data is yours. Period." },
  { q: "What languages does Aura support?", a: "English and Arabic — both for content generation, not just the interface. Arabic writing follows dedicated Gulf professional patterns: single-line breathing, story-first structure, contemplative tone. Not translated English. Arabic that reads like it was written by someone who thinks in Arabic.\n\nSwitch between languages per post, or use both." },
  { q: "How long before I see value?", a: "Your first strategic signal appears within 3-5 captures — usually day one. Your first AI-generated post can be ready in under 10 minutes. Your Digital Presence Score starts moving immediately.\n\nWithin 2-3 weeks, Aura starts showing you patterns across your reading that you hadn't consciously connected. That's when it gets interesting." },
  { q: "Is this free during beta?", a: "Yes. Aura is in invite-only beta. All features are free during beta. When we introduce pricing, every beta user gets advance notice and a founder's rate." },
  { q: "How do I get access?", a: "Aura is invite-only. Request access at aura-intel.org/request-access. We review applications weekly. Or ask someone already using it — every user can invite one colleague." },
];

const STEPS = [
  { n: "01", Icon: User, t: "Aura learns who you are", d: "Connect your LinkedIn and answer a few calibration questions. Aura maps your seniority, your sector, your expertise gaps, and how you naturally communicate. Everything from this point forward is built around you — not a template." },
  { n: "02", Icon: Inbox, t: "Capture what you already read", d: "You already read 10+ articles a week. Instead of letting that intelligence disappear in browser tabs, paste the URL into Aura. Or upload a document. Or record a 30-second voice note after a meeting. Aura extracts what matters and stores it." },
  { n: "03", Icon: Radar, t: "Aura finds what you didn't notice", d: "As captures accumulate, Aura detects strategic signals — topics you're tracking more deeply than you realized. Patterns emerge across sources. Themes connect. What felt like scattered reading becomes a clear expertise map." },
  { n: "04", Icon: PenTool, t: "Publish in your voice, not AI's", d: "One tap generates a LinkedIn post grounded in your signals, written in your tone — not generic AI. In English or Arabic. Every post sounds like you on your best day, because it's built from what you actually read and think." },
  { n: "05", Icon: TrendingUp, t: "Watch the right people notice", d: "Your Digital Presence Score moves every time you capture, publish, or get engagement. Upload your LinkedIn analytics and see exactly who follows you — by seniority, industry, and company. The score tells you if you're visible. The audience data tells you if you're visible to the right people." },
];

const PAGES = [
  { Icon: HomeIcon, t: "Home", d: "Your daily command center" },
  { Icon: Compass, t: "Intelligence", d: "Your strategic radar" },
  { Icon: Sparkles, t: "Publish", d: "Your content engine" },
  { Icon: BarChart3, t: "Impact", d: "Your digital presence growth" },
  { Icon: User, t: "My Story", d: "Your professional identity" },
];

const SCORE = [
  { label: "Signal Intelligence", pct: 40, desc: "How deep and diverse are the topics you're tracking? More captures from different sources on the same theme = higher confidence. Aura rewards depth, not volume." },
  { label: "Content Presence", pct: 40, desc: "Are you publishing? Imported LinkedIn posts and Aura-generated content both count. The market can't see what you don't share." },
  { label: "Capture Consistency", pct: 20, desc: "Are you showing up regularly? Weekly capture rhythm matters more than how much you capture at once. Consistency compounds." },
];

const Guide = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  usePageMeta({
    title: "Aura — How It Works",
    description: "How Aura turns your daily reading into market presence: capture, detect signals, generate content, and track your digital presence score.",
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
        <Link to="/" className="text-lg font-medium tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}>
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
        <p className="text-xs tracking-[0.2em] uppercase mb-5" style={{ color: "var(--bronze)" }}>The Aura Guide</p>
        <h1
          className="mb-5"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: 1.375,
            letterSpacing: "-0.02em",
            color: "var(--ink-2)",
            fontWeight: 500,
          }}
        >
          How Aura works
        </h1>
        <p style={{ fontSize: 16, color: "var(--ink-3)", lineHeight: 1.625 }}>
          From what you already know to what the market sees — in 5 steps.
        </p>
      </section>

      {/* 5-step journey */}
      <section className="px-5 sm:px-10 pb-20">
        <div className="max-w-6xl mx-auto grid gap-5 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
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
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink-7)", marginBottom: 10, lineHeight: 1.375 }}>{t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-5)" }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Your pages */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs tracking-[0.2em] uppercase mb-4 text-center" style={{ color: "var(--bronze)" }}>The interface</p>
          <h2 className="text-center mb-12" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-2)", fontWeight: 500 }}>
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
                  <p style={{ fontSize: 14, color: "var(--ink-5)", lineHeight: 1.625 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Authority score */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs tracking-[0.2em] uppercase mb-4 text-center" style={{ color: "var(--bronze)" }}>The score</p>
          <h2 className="text-center mb-3" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-2)", fontWeight: 500 }}>
            How your score works
          </h2>
          <p className="text-center mb-12" style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.625 }}>
            One number that reflects whether your expertise is becoming visible — built from real activity, not vanity metrics.
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
                <p style={{ fontSize: 14, color: "var(--ink-5)", marginTop: 8, lineHeight: 1.625 }}>{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { tier: "Observer", range: "0–14", desc: "You're getting started. Aura is learning who you are.", accent: false },
              { tier: "Explorer", range: "15–34", desc: "Patterns are forming. Your first signals have emerged.", accent: false },
              { tier: "Strategist", range: "35–59", desc: "Your expertise is becoming visible. Keep publishing.", accent: false },
              { tier: "Voice", range: "60–79", desc: "The market is starting to recognize your signal.", accent: false },
              { tier: "Presence", range: "80–100", desc: "You're known before you walk in the room.", accent: true },
            ].map((t) => (
              <div
                key={t.tier}
                className="rounded-xl p-5 text-center"
                style={{
                  background: t.accent ? "rgba(197,165,90,0.08)" : "var(--surface-ink-raised)",
                  border: t.accent ? "1px solid rgba(197,165,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--brand)", marginBottom: 4 }}>{t.tier}</p>
                <p style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.08em", marginBottom: 8 }}>{t.range}</p>
                <p style={{ fontSize: 14, color: "var(--ink-5)", lineHeight: 1.5 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 sm:px-10 py-20" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center mb-12" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 3.5vw, 36px)", color: "var(--ink-2)", fontWeight: 500, letterSpacing: "-0.01em" }}>
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
                    style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-2)" }}
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
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", paddingBottom: 20, paddingRight: 34, whiteSpace: "pre-line" }}>
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
        <h2 className="mb-5" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 40px)", color: "var(--ink-2)", fontWeight: 500 }}>
          Ready to start?
        </h2>
        <p className="mb-8 max-w-md mx-auto" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.625 }}>
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
              <span className="text-base font-medium tracking-[0.15em]" style={{ color: "var(--brand)", fontFamily: "var(--font-display)", lineHeight: "24px" }}>AURA</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Turns your expertise into presence</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
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
              Contact: <a href="mailto:support@aura-intel.org">support@aura-intel.org</a>
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
              Built in Riyadh for the world.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Guide;