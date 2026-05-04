import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { HelpCircle, X, ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import AuraButton from "@/components/ui/AuraButton";

const FAQ = [
  { q: "How does the authority score work?", a: "Your score combines three components: Signal (40%) — how many active, high-confidence signals you've built from captures. Content (40%) — how many posts you've published through Aura in the last 30 days. Capture (20%) — how many of the last 12 weeks you captured at least one source. The formula rewards depth and consistency, not volume." },
  { q: "How do signals get stronger?", a: "Every time you capture something that relates to an existing signal, that signal's confidence increases. Signals also strengthen when evidence comes from multiple different organizations. Conversely, signals gradually fade if no new evidence arrives — this keeps your intelligence current." },
  { q: "What does the positioning statement mean?", a: "Your positioning statement is how the market would describe your expertise in 3 sentences. It starts based on your assessment answers, then evolves as your signal graph and content performance provide real evidence. A market-validated positioning means it's backed by both intelligence and audience engagement." },
  { q: "How does voice matching work?", a: "Aura analyzes your real LinkedIn posts to extract your writing DNA — your tone, sentence rhythm, structural patterns, and vocabulary. Every post Aura generates mirrors these patterns so the output sounds like you, not like AI. You can retrain your voice any time by adding more example posts." },
  { q: "Why should I capture regularly?", a: "Captures are the fuel for everything. They feed signals, which feed content recommendations, which feed your authority score. Capturing 3-4 sources per week is more valuable than 20 in one day — the system rewards rhythm over volume. Each capture takes 10 seconds. The compounding effect takes weeks to feel, but it's real." },
  { q: "How do I track my LinkedIn performance?", a: "Go to linkedin.com/analytics/creator, click Export, download the .xlsx file, then upload it on the Impact page. This takes 30 seconds and connects your publishing output to real engagement data. When a post performs well, the signal it was generated from gets a boost — closing the intelligence loop." },
];

type ContextKey = "home" | "identity" | "intelligence" | "authority" | "influence";

const CONTEXT_COPY: Record<ContextKey, { title: string; body: string }> = {
  home: {
    title: "Your Command Center",
    body: "This is your daily intelligence briefing. The score at the top reflects your authority momentum — it's built from three forces: signal depth, content output, and capture consistency. The card below your score tells you the single most impactful action you can take right now. Start there.",
  },
  identity: {
    title: "Your Intelligence Portrait",
    body: "Everything on this page is derived from your assessment, your captures, and your signals. The more you use Aura, the sharper this portrait becomes. Your positioning statement evolves as real evidence accumulates — it's not static. The focus areas and signal coverage sections show where your intelligence runs deepest.",
  },
  intelligence: {
    title: "Your Strategic Radar",
    body: "Every article, document, or insight you capture gets analyzed for strategic patterns. When multiple captures point to the same theme, a signal emerges. Signals grow stronger with more evidence and fade when no new evidence arrives. The stronger your signals, the more targeted your content recommendations become.",
  },
  authority: {
    title: "Your Content Engine",
    body: "Create content grounded in your real intelligence — not generic templates. The sidebar shows your strongest signals. Publishing from these builds authority fastest because the content is backed by evidence. Flash mode gives you 3 variations in 60 seconds. Every post is voice-matched to sound like you, not like AI.",
  },
  influence: {
    title: "Your Authority Trajectory",
    body: "This page shows how your authority compounds over time. The score formula weighs signal strength (40%), content output (40%), and capture consistency (20%). Upload your LinkedIn analytics to close the feedback loop — when you see which topics get the most engagement, you know where to double down.",
  },
};

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--brand-line)", padding: "10px 0" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>{q}</span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--ink-3)", flexShrink: 0, marginTop: 4,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms",
          }}
        />
      </button>
      {open && (
        <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7, marginTop: 8 }}>{a}</div>
      )}
    </div>
  );
}

export function HelpPanel({ open, onClose, activeTab }: { open: boolean; onClose: () => void; activeTab?: string }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 49,
        }}
      />
      <aside
        role="dialog"
        aria-label="How Aura works"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          maxWidth: "100vw",
          background: "var(--vellum)",
          borderLeft: "1px solid var(--brand-line)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "auraSlideIn 220ms ease-out",
        }}
      >
        <style>{`
          @keyframes auraSlideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes auraStepIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Fixed header */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "20px 22px 16px",
            borderBottom: "1px solid var(--brand-line)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", lineHeight: 1.2 }}>
              How Aura works
            </div>
            <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
              Contextual help for the page you're on
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close help"
            style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 4 }}
          >
            <X size={18} />
          </button>
        </header>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: "18px 18px", flex: 1 }}>
          {/* Contextual section */}
          {(() => {
            const ctx = (activeTab && (CONTEXT_COPY as any)[activeTab]) || CONTEXT_COPY.home;
            return (
              <div
                style={{
                  background: "var(--surface-subtle, #fff)",
                  border: "1px solid var(--brand-line)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 22,
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)", lineHeight: 1.3 }}>
                  {ctx.title}
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
                  {ctx.body}
                </p>
              </div>
            );
          })()}

          {/* FAQ */}
          <div style={{ marginBottom: 18 }}>
            <SectionHeader label="Frequently asked" />
            <div style={{ marginTop: 8 }}>
              {FAQ.map(qa => <FaqItem key={qa.q} q={qa.q} a={qa.a} />)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
            <Link to="/terms" style={{ color: "var(--brand)", textDecoration: "none" }}>Terms</Link>
            <Link to="/privacy" style={{ color: "var(--brand)", textDecoration: "none" }}>Privacy</Link>
          </div>
        </div>

        {/* Fixed footer */}
        <footer style={{ padding: "14px 18px", borderTop: "1px solid var(--brand-line)", flexShrink: 0 }}>
          <AuraButton
            variant="secondary"
            style={{ width: "100%" }}
            onClick={() => { onClose(); navigate("/guide"); }}
          >
            Read the full guide →
          </AuraButton>
          <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
            Aura Private Beta · Questions?{" "}
            <a
              href="mailto:mohammad.mahafdhah@aura-intel.org"
              style={{ color: "var(--brand)", textDecoration: "none" }}
            >
              Reach out to your invite contact
            </a>
          </div>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Help"
      style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "transparent", border: 0, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: hover ? "var(--brand)" : "var(--ink-3)",
        transition: "color 150ms",
      }}
    >
      <HelpCircle size={18} strokeWidth={1.75} />
    </button>
  );
}

export default HelpPanel;
