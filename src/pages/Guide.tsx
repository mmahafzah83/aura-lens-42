import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronDown, ArrowLeft } from "lucide-react";
import usePageMeta from "@/hooks/usePageMeta";
import AuraLogo from "@/components/brand/AuraLogo";
import { useGuideArticles } from "@/hooks/useGuideArticles";
import type { GuideArticle } from "@/hooks/useGuideArticles";
import PublicFooter from "@/components/PublicFooter";

const SECTION_ORDER = [
  "getting-started",
  "tabs",
  "how-to",
  "tips",
  "signals",
  "scoring",
  "terms",
  "trust",
];

const SECTION_LABELS: Record<string, string> = {
  "getting-started": "Getting started",
  tabs: "Your pages",
  "how-to": "How to…",
  tips: "Tips & lessons",
  signals: "Signals",
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
    <div style={{ borderBottom: "1px solid var(--rule)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left py-5"
        style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink)" }}
      >
        <span style={{ fontSize: 15, fontWeight: 500 }}>{item.question_en}</span>
        <ChevronDown
          size={18}
          style={{
            color: "var(--ink-3)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms ease",
            flexShrink: 0,
            marginLeft: 16,
          }}
        />
      </button>
      {open && (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", paddingBottom: 20, paddingRight: 34, whiteSpace: "pre-line" }}>
          {item.answer_en}
          {item.formula_note_en && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 6,
                background: "var(--paper-2)",
                border: "1px solid var(--rule)",
                borderLeft: "2px solid var(--live)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: 13,
                color: "var(--ink-2)",
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
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Dark instrument top bar */}
      <header
        className="flex items-center justify-between px-6 sm:px-10 py-4 sticky top-0 z-40"
        style={{ background: "var(--ob-bg)", borderBottom: "1px solid var(--hair)" }}
      >
        <Link to="/" className="flex items-center gap-2" aria-label="Aura home">
          <AuraLogo size={26} variant="dark" />
          <span
            className="text-sm font-bold tracking-[0.2em]"
            style={{ color: "var(--glass)", fontFamily: "var(--font-display)" }}
          >
            AURA
          </span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-xs">
          <Link
            to="/auth"
            style={{ color: "var(--glass-2)", fontWeight: 500, transition: "color 150ms ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--live)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--glass-2)")}
          >
            Log in
          </Link>
          <Link
            to="/request-access"
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--hair)",
            }}
          >
            Request access
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-5 sm:px-10 pt-16 pb-10 text-center max-w-3xl mx-auto w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={{ fontSize: 12, color: "var(--ink-3)" }}
        >
          <ArrowLeft size={13} /> Back to home
        </Link>
        <p
          className="uppercase tracking-[0.12em] mb-4"
          style={{ color: "var(--live)", fontFamily: "var(--font-mono)", fontSize: 12 }}
        >
          The Aura Guide
        </p>
        <h1
          className="mb-5"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: 1.375,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            fontWeight: 500,
          }}
        >
          How Aura works
        </h1>
        <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.625 }}>
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
              color: "var(--ink-3)",
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
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              color: "var(--ink)",
            }}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-5 sm:px-10 pb-20 flex-1">
        <div className="max-w-3xl mx-auto">
          {loading && (
            <p style={{ fontSize: 14, color: "var(--ink-3)", textAlign: "center", padding: "40px 0" }}>Loading…</p>
          )}

          {error && (
            <p style={{ fontSize: 14, color: "var(--ink-3)", textAlign: "center", padding: "40px 0" }}>
              The guide is loading — try again in a moment.
            </p>
          )}

          {!loading && !error && articles.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--ink-3)", textAlign: "center", padding: "40px 0" }}>
              The guide is loading — try again in a moment.
            </p>
          )}

          {!loading && !error && hasSearch && (
            <>
              {filtered.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--ink-3)", textAlign: "center", padding: "40px 0" }}>
                  No results for "{search.trim()}"
                </p>
              ) : (
                <div style={{ borderTop: "1px solid var(--rule)" }}>
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
                      style={{ color: "var(--live)", fontFamily: "var(--font-mono)" }}
                    >
                      {SECTION_LABELS[cat] || cat}
                    </p>
                    <div style={{ borderTop: "1px solid var(--rule)" }}>
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
      <section className="px-5 sm:px-10 py-20 text-center" style={{ borderTop: "1px solid var(--rule)" }}>
        <h2 className="mb-5" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 40px)", color: "var(--ink)", fontWeight: 500 }}>
          Ready to start?
        </h2>
        <p className="mb-8 max-w-md mx-auto" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.625 }}>
          {authed ? "Jump back into your dashboard and keep building." : "Join the private beta. We review applications weekly."}
        </p>
        <button
          onClick={() => navigate("/request-access")}
          className="px-7 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-110"
          style={{ background: "var(--action)", color: "var(--paper)", fontWeight: 500 }}
        >
          Request access
        </button>
      </section>

      <PublicFooter />
    </div>
  );
};

export default Guide;
