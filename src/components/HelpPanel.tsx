import { useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { HelpCircle, X, ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import AuraButton from "@/components/ui/AuraButton";

const itemStyle = {
  fontSize: 13,
  color: "var(--ink-3)",
  lineHeight: 1.7,
  margin: "6px 0",
};

function Section({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ marginBottom: 14, borderBottom: "1px solid var(--brand-line)", paddingBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: open ? 12 : 0,
        }}
      >
        <SectionHeader label={label} />
        <ChevronDown
          size={14}
          style={{
            color: "var(--ink-3)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms",
            marginBottom: 16,
          }}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

const QUICK_START = [
  { icon: "📎", title: "Capture", desc: "Paste a link, upload a doc, or record a voice note" },
  { icon: "✦", title: "Detect", desc: "Aura finds patterns across everything you read" },
  { icon: "✍", title: "Publish", desc: "Create LinkedIn posts in your voice from signals" },
  { icon: "📈", title: "Grow", desc: "Watch your authority score compound weekly" },
];

const FAQ = [
  { q: "What is a signal?", a: "A strategic pattern Aura detects across your captures. If you keep reading about \"digital water utilities\", Aura identifies this as a signal." },
  { q: "What's the confidence percentage?", a: "How strongly Aura detected a signal. 80%+ = deep coverage from multiple sources." },
  { q: "How is this different from bookmarks?", a: "Bookmarks store links. Aura reads what you bookmark, finds patterns, and turns them into publishable intelligence." },
  { q: "Why did my score drop?", a: "Your score includes Capture Consistency (20%). If you didn't capture this week, that component decreases. One capture restores it." },
  { q: "Can I edit generated content?", a: "Yes. Every generated post is a draft. Copy it, edit it, make it yours." },
  { q: "Is Aura actually reading my articles?", a: "Yes. When you paste a URL, Aura extracts the key content and looks for patterns across everything you've captured. You can see the evidence by clicking any signal on the Intelligence page." },
  { q: "Am I wasting my time?", a: "If you read industry articles anyway, no. Aura turns reading you already do into published authority. The only extra step is pasting the URL — under 10 seconds." },
  { q: "What should I capture?", a: "Anything you'd bookmark, forward to a colleague, or reference in a meeting. Industry reports, competitor announcements, technology trends, regulatory updates. If it matters to your field, capture it." },
  { q: "How do I know if my posts are good?", a: "Every generated post gets a quality score (out of 80). Above 60 is LinkedIn-ready. The score checks hook strength, structure, voice match, and formatting." },
  { q: "Can my colleagues see what I capture?", a: "No. Aura is completely private. Your captures, signals, and content are visible only to you." },
];

export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-label="Welcome to Aura"
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
              Welcome to Aura
            </div>
            <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
              Your strategic intelligence companion
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
          {/* Quick start cards (always visible) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {QUICK_START.map((s, i) => (
              <div
                key={s.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--surface-subtle, #fff)",
                  border: "1px solid var(--brand-line)",
                  borderRadius: 12,
                  opacity: 0,
                  animation: `auraStepIn 320ms ease-out ${i * 50}ms forwards`,
                }}
              >
                <span
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "var(--brand-ghost, var(--brand-pale))",
                    color: "var(--brand)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {s.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 2 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <Section label="◎ Understanding your score" defaultOpen>
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Signal intelligence (40%):</strong> How many articles you've captured and what Aura learned from them</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Content authority (40%):</strong> Posts you've published that reference your real expertise</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Capture consistency (20%):</strong> Whether you captured something this week — Aura rewards rhythm, not volume</li>
            </ul>
          </Section>

          <Section label="☰ Your pages">
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Home:</strong> Your daily command center — what to do now</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Intelligence:</strong> Signals detected from your captures</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Publish:</strong> Create content from your strongest signals</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Impact:</strong> Your authority growth trajectory</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>My Story:</strong> How the market sees your expertise</li>
            </ul>
          </Section>

          <Section label="? Common questions">
            {FAQ.map((qa) => (
              <div key={qa.q} style={{ paddingLeft: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", lineHeight: 1.5 }}>{qa.q}</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7, marginTop: 2 }}>{qa.a}</div>
              </div>
            ))}
          </Section>

          <Section label="💡 Tips">
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}>Capture 3 articles this week. That's the minimum for Aura to detect your first signal. Just paste the URL — it takes 10 seconds each.</li>
              <li style={itemStyle}>Publish 1 post this week. Go to Publish, click your top signal, hit Generate. Edit it, make it yours, post it on LinkedIn.</li>
              <li style={itemStyle}>On the go? Hit Capture → Voice and dictate a thought. Aura transcribes it and adds it to your intelligence.</li>
              <li style={itemStyle}>Need a strategy document? Open Ask Aura and say: "Draft a 90-day plan for digital transformation in water utilities." It uses your real signals.</li>
            </ul>
          </Section>

          <Section label="§ Legal">
            <div style={itemStyle}>
              <Link to="/terms" style={{ color: "var(--brand)", textDecoration: "none" }}>Terms of Service</Link>
            </div>
            <div style={itemStyle}>
              <Link to="/privacy" style={{ color: "var(--brand)", textDecoration: "none" }}>Privacy Policy</Link>
            </div>
          </Section>
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
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <a
              href="mailto:mohammad.mahafdhah@aura-intel.org"
              style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none" }}
            >
              Questions? mohammad.mahafdhah@aura-intel.org
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
