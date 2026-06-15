import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronDown } from "lucide-react";
import usePageMeta from "@/hooks/usePageMeta";
import { useGuideArticles } from "@/hooks/useGuideArticles";
import type { GuideArticle } from "@/hooks/useGuideArticles";

const SECTION_ORDER = [
  "getting-started",
  "tabs",
  "how-to",
  "tips",
  "scoring",
  "terms",
  "trust",
];

const SECTION_LABELS: Record<string, string> = {
  "getting-started": "Getting started",
  tabs: "Your pages",
  "how-to": "How to…",
  tips: "Tips & lessons",
  scoring: "Your score & formulas",
  terms: "Key terms",
  trust: "Trust & privacy",
};

function groupByCategory(articles: GuideArticle[]) {
  const map: Record<string, GuideArticle[]> = {};
  for (const a of articles) {
    const cat = a.category || "uncategorized";
    if (!map[cat]) map[cat] = [];
    map[cat].push(a);
  }
  return map;
}

function CollapsibleItem({
  item,
  open,
  onToggle,
}: {
  item: GuideArticle;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left py-5"
        style={{ background: "transparent", border: 0, cursor: "pointer", color: "hsl(var(--foreground))" }}
      >
        <span style={{ fontSize: 15, fontWeight: 500 }}>{item.question_en}</span>
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
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "hsl(var(--muted-foreground))", paddingBottom: 20, paddingRight: 34, whiteSpace: "pre-line" }}>
          {item.answer_en}
          {item.formula_note_en && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(197,165,90,0.08)",
                border: "1px solid rgba(197,165,90,0.2)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: 13,
                color: "var(--bronze)",
                lineHeight: 1.6,
              }}
            >
              {item.formula_note_en}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Guide = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [search, setSearch] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const { articles, loading, error } = useGuideArticles({ surface: "guide", forceFresh: true });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.question_en.toLowerCase().includes(q) ||
        a.answer_en.toLowerCase().includes(q)
    );
  }, [articles, search]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  const jsonLd = useMemo(() => {
    if (!articles.length) return undefined;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: articles.map(({ question_en, answer_en }) => ({
        "@type": "Question",
        name: question_en,
        acceptedAnswer: { "@type": "Answer", text: answer_en },
      })),
    };
  }, [articles]);

  usePageMeta({
    title: "Aura — How It Works",
    description: "How Aura turns your daily reading into market presence: capture, detect signals, generate content, and track your Imprint.",
    path: "/guide",
    jsonLd,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session));
  }, []);

  const hasSearch = search.trim().length > 0;

  return (
    <div
      className="min-h-screen bg-neutral-950"
      style={{ background: "var(--ink)", color: "var(--ink-7)", fontFamily: "var(--font-body)" }}
    >
      <style>{`
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
      <section className="px-5 sm:px-10 pt-20 pb-10 text-center max-w-3xl mx-auto">
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
          From what you already know to what the market sees.
        </p>
      </section>

      {/* Search */}
      <section className="px-5 sm:px-10 pb-6">
        <div className="max-w-3xl mx-auto relative">
          <Search
            size={18}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-4)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the guide…"
            className="w-full rounded-xl text-sm outline-none"
            style={{
              padding: "12px 16px 12px 42px",
              background: "var(--surface-ink-raised)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--ink-2)",
            }}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-5 sm:px-10 pb-20">
        <div className="max-w-3xl mx-auto">
          {loading && (
            <p style={{ fontSize: 14, color: "var(--ink-4)", textAlign: "center", padding: "40px 0" }}>Loading…</p>
          )}

          {error && (
            <p style={{ fontSize: 14, color: "var(--error)", textAlign: "center", padding: "40px 0" }}>
              The guide is loading — try again in a moment.
            </p>
          )}

          {!loading && !error && articles.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--ink-4)", textAlign: "center", padding: "40px 0" }}>
              The guide is loading — try again in a moment.
            </p>
          )}

          {!loading && !error && hasSearch && (
            <>
              {filtered.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--ink-4)", textAlign: "center", padding: "40px 0" }}>
                  No results for "{search.trim()}"
                </p>
              ) : (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  {filtered.map((item) => (
                    <CollapsibleItem
                      key={item.slug}
                      item={item}
                      open={openSlug === item.slug}
                      onToggle={() => setOpenSlug(openSlug === item.slug ? null : item.slug)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && !error && !hasSearch && (
            <>
              {SECTION_ORDER.map((cat) => {
                const items = grouped[cat];
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat} className="mb-12">
                    <p
                      className="text-xs tracking-[0.2em] uppercase mb-4"
                      style={{ color: "var(--bronze)" }}
                    >
                      {SECTION_LABELS[cat] || cat}
                    </p>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      {items.map((item) => (
                        <CollapsibleItem
                          key={item.slug}
                          item={item}
                          open={openSlug === item.slug}
                          onToggle={() => setOpenSlug(openSlug === item.slug ? null : item.slug)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
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
