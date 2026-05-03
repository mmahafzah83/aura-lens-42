import { useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link } from "react-router-dom";
import { HelpCircle, X, ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

const itemStyle = {
  fontSize: 13,
  color: "var(--ink-3)",
  lineHeight: 1.6,
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
          marginBottom: open ? 8 : 0,
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

export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape + body scroll lock
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
          width: 360,
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
        <style>{`@keyframes auraSlideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 18px", borderBottom: "1px solid var(--brand-line)",
          }}
        >
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)" }}>
            How Aura works
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close help"
            style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 4 }}
          >
            <X size={18} />
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: "16px 18px", flex: 1 }}>
          <Section label="GETTING STARTED" defaultOpen>
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}>Capture articles, reports, and insights you read daily</li>
              <li style={itemStyle}>Aura detects patterns and builds strategic signals</li>
              <li style={itemStyle}>Create content from your signals to build authority</li>
              <li style={itemStyle}>Track your authority score as it grows</li>
            </ul>
          </Section>

          <Section label="UNDERSTANDING YOUR SCORE">
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Signal intelligence (40%):</strong> Captured knowledge that forms patterns</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Content authority (40%):</strong> Posts published from your signals</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Capture consistency (20%):</strong> Weekly rhythm of capturing</li>
            </ul>
          </Section>

          <Section label="YOUR PAGES">
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Home:</strong> Your daily command center — what to do now</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Intelligence:</strong> Signals detected from your captures</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Publish:</strong> Create content from your strongest signals</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>Impact:</strong> Your authority growth trajectory</li>
              <li style={itemStyle}><strong style={{ color: "var(--ink)" }}>My Story:</strong> How the market sees your expertise</li>
            </ul>
          </Section>

          <Section label="TIPS">
            <ul style={{ listStyle: "disc", paddingLeft: 18, margin: 0 }}>
              <li style={itemStyle}>Capture 3–5 articles per week for best signal detection</li>
              <li style={itemStyle}>Publish at least 1 post per week from your top signal</li>
              <li style={itemStyle}>Voice captures count — dictate thoughts on the go</li>
              <li style={itemStyle}>Ask Aura can draft memos, decks, and 90-day plans</li>
            </ul>
          </Section>

          <Section label="COMMON QUESTIONS">
            <div style={itemStyle}>
              <div style={{ color: "var(--ink)", fontWeight: 500 }}>What is a signal?</div>
              A strategic pattern Aura detects across your captures. If you keep reading about "digital water utilities", Aura identifies this as a signal.
            </div>
            <div style={itemStyle}>
              <div style={{ color: "var(--ink)", fontWeight: 500, marginTop: 8 }}>What's the confidence percentage?</div>
              How strongly Aura detected a signal. 80%+ = deep coverage from multiple sources.
            </div>
            <div style={itemStyle}>
              <div style={{ color: "var(--ink)", fontWeight: 500, marginTop: 8 }}>How is this different from bookmarks?</div>
              Bookmarks store links. Aura reads what you bookmark, finds patterns, and turns them into publishable intelligence.
            </div>
            <div style={itemStyle}>
              <div style={{ color: "var(--ink)", fontWeight: 500, marginTop: 8 }}>Why did my score drop?</div>
              Your score includes Capture Consistency (20%). If you didn't capture this week, that component decreases. One capture restores it.
            </div>
            <div style={itemStyle}>
              <div style={{ color: "var(--ink)", fontWeight: 500, marginTop: 8 }}>Can I edit generated content?</div>
              Yes. Every generated post is a draft. Copy it, edit it, make it yours.
            </div>
          </Section>

          <Section label="LEGAL">
            <div style={itemStyle}>
              <Link to="/terms" style={{ color: "var(--brand)", textDecoration: "none" }}>Terms of Service</Link>
            </div>
            <div style={itemStyle}>
              <Link to="/privacy" style={{ color: "var(--brand)", textDecoration: "none" }}>Privacy Policy</Link>
            </div>
          </Section>
        </div>

        <footer style={{ padding: "14px 18px", borderTop: "1px solid var(--brand-line)" }}>
          <a
            href="https://aura-intel.org/guide"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: "var(--brand)", fontWeight: 500, textDecoration: "none" }}
          >
            Read the full guide →
          </a>
          <div style={{ marginTop: 6 }}>
            <a
              href="mailto:mohammad.mahafdhah@aura-intel.org"
              style={{ fontSize: 11, color: "var(--ink-3)", textDecoration: "none" }}
            >
              Feedback? mohammad.mahafdhah@aura-intel.org
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