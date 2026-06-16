import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { HelpCircle, X, ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import AuraButton from "@/components/ui/AuraButton";
import { useGuideArticles, type GuideArticle } from "@/hooks/useGuideArticles";

const TAB_MAP: Record<string, string> = {
  home: "home",
  intelligence: "intelligence",
  authority: "publish",
  influence: "impact",
  identity: "mystory",
};

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--rule)", padding: "10px 0" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>{q}</span>
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
        <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.7, marginTop: 8 }}>{a}</div>
      )}
    </div>
  );
}

export function HelpPanel({ open, onClose, activeTab }: { open: boolean; onClose: () => void; activeTab?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { articles: allArticles, loading, error, refetch } = useGuideArticles();

  // Force fresh fetch every time the drawer opens (TTL-bypass) so edits show immediately.
  useEffect(() => {
    if (open) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bySlug = (s: string) => allArticles.find(a => a.slug === s);
  const disambig = bySlug("difference-guide-ask-aura");
  const startHere: GuideArticle[] = ["what-is-aura", "how-to-start"]
    .map(bySlug)
    .filter(Boolean) as GuideArticle[];
  const mappedTab = activeTab ? TAB_MAP[activeTab] : undefined;
  const contextual = mappedTab
    ? allArticles.filter(
        a =>
          a.tab === mappedTab &&
          (a.surfaces?.includes("faq") || a.surfaces?.includes("guide")),
      )
    : [];

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
        data-testid="help-panel"
        aria-label="How Aura works"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          maxWidth: "100vw",
          background: "var(--paper-2)",
          borderLeft: "1px solid var(--rule)",
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
            borderBottom: "1px solid var(--rule)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", lineHeight: 1.2 }}>
              How Aura works
            </div>
            <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
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
          {loading && allArticles.length === 0 ? (
            <div style={{ fontSize: 14, color: "var(--ink-3)", padding: "8px 2px" }}>Loading…</div>
          ) : error && allArticles.length === 0 ? (
            <div style={{ fontSize: 14, color: "var(--ink-3)", padding: "8px 2px" }}>
              Help content is loading — try again in a moment.
            </div>
          ) : (
            <>
              {/* Disambiguation: Guide vs Ask Aura */}
              {disambig && (
                <div
                  style={{
                    background: "var(--surface-subtle, #fff)",
                    border: "1px solid var(--rule)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 22,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "#2D2820", lineHeight: 1.3 }}>
                    {disambig.question_en}
                  </div>
                  <p style={{ fontSize: 14, color: "#5A5347", lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
                    {disambig.answer_en}
                  </p>
                </div>
              )}

              {/* Start here */}
              {startHere.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <SectionHeader label="Start here" />
                  <div style={{ marginTop: 8 }}>
                    {startHere.map(a => (
                      <FaqItem key={a.slug} q={a.question_en} a={a.answer_en} />
                    ))}
                  </div>
                </div>
              )}

              {/* Contextual FAQs for current tab */}
              {contextual.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <SectionHeader label="On this page" />
                  <div style={{ marginTop: 8 }}>
                    {contextual.map(a => (
                      <FaqItem
                        key={a.slug}
                        q={a.question_en}
                        a={a.formula_note_en ? `${a.answer_en}\n\n${a.formula_note_en}` : a.answer_en}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
            <Link to="/terms" style={{ color: "var(--action)", textDecoration: "none" }}>Terms</Link>
            <Link to="/privacy" style={{ color: "var(--action)", textDecoration: "none" }}>Privacy</Link>
          </div>
        </div>

        {/* Fixed footer */}
        <footer style={{ padding: "14px 18px", borderTop: "1px solid var(--rule)", flexShrink: 0 }}>
          <AuraButton
            variant="secondary"
            style={{ width: "100%" }}
            onClick={() => { onClose(); navigate("/guide"); }}
          >
            Read the full guide →
          </AuraButton>
          <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
            Aura Private Beta · Questions?{" "}
            <a
              href="mailto:support@aura-intel.org"
              style={{ color: "var(--action)", textDecoration: "none" }}
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
      data-testid="nav-help"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Help"
      style={{
        width: 44, height: 44, borderRadius: "50%",
        background: "transparent", border: 0, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: hover ? "var(--action)" : "var(--ink-3)",
        transition: "color 150ms",
      }}
    >
      <HelpCircle size={18} strokeWidth={1.75} />
    </button>
  );
}

export default HelpPanel;
