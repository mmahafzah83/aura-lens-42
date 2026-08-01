import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronDown, ArrowLeft, Link2 } from "lucide-react";
import { toast } from "sonner";
import usePageMeta from "@/hooks/usePageMeta";
import { useGuideArticles } from "@/hooks/useGuideArticles";
import type { GuideArticle } from "@/hooks/useGuideArticles";
import PublicFooter from "@/components/PublicFooter";
import PublicMasthead from "@/components/PublicMasthead";

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
    <div id={`a-${item.slug}`} style={{ borderBottom: "1px solid var(--rule)", scrollMarginTop: 80 }}>
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
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.6,
              }}
            >
              {item.formula_note_en}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#${item.slug}`;
              navigator.clipboard?.writeText(url);
              toast("Link copied");
            }}
            className="inline-flex items-center gap-1.5 mt-3"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 0,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <Link2 size={12} /> Copy link
          </button>
        </div>
      )}
    </div>
  );
}

const LOOP_STEPS: { n: string; text: string }[] = [
  { n: "01", text: "You read what you already read. Paste a link, forward a PDF, drop a note. That is the only work Aura asks of you." },
  { n: "02", text: "Aura reads it with you. Overnight it pulls the evidence out of what you saved and files it by theme." },
  { n: "03", text: "Patterns become signals. When several independent sources point the same way, that becomes a signal, with its sources attached." },
  { n: "04", text: "Drafts arrive in your voice. Aura writes from your own signals, in your register, English or Arabic. Nothing publishes itself." },
  { n: "05", text: "Your Imprint compounds. You approve, you publish, and the record builds week over week." },
];

const Guide = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [search, setSearch] = useState("");
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());
  const hashHandled = useRef(false);

  const { articles, loading, error } = useGuideArticles({ surface: "guide", forceFresh: true });

  const toggleSlug = useCallback((slug: string) => {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        if (window.location.hash === `#${slug}`) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else {
        next.add(slug);
        window.history.replaceState(null, "", `${window.location.pathname}#${slug}`);
      }
      return next;
    });
  }, []);

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

  useEffect(() => {
    if (hashHandled.current || !articles.length) return;
    const slug = window.location.hash.replace(/^#/, "");
    if (!slug) return;
    if (!articles.some((a) => a.slug === slug)) return;
    hashHandled.current = true;
    setOpenSlugs(new Set([slug]));
    requestAnimationFrame(() => {
      document.getElementById(`a-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [articles]);

  const jumpTo = (cat: string) => {
    document.getElementById(`s-${cat}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
      <PublicMasthead authed={authed} />

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

      {/* The loop */}
      <section className="px-5 sm:px-10 pb-10">
        <div
          className="max-w-3xl mx-auto"
          style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 16, padding: "24px 22px" }}
        >
          <p
            className="uppercase tracking-[0.2em] mb-5"
            style={{ color: "var(--live)", fontFamily: "var(--font-mono)", fontSize: 11 }}
          >
            The loop
          </p>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
            {LOOP_STEPS.map((s) => (
              <li key={s.n} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--live)",
                    letterSpacing: "0.1em",
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.65, color: "var(--ink-2)" }}>{s.text}</span>
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 18, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Everything below is detail. This is the whole system.
          </p>
        </div>
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
        {!hasSearch && (
          <div className="max-w-3xl mx-auto mt-4 flex flex-wrap gap-2">
            {SECTION_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => jumpTo(cat)}
                className="rounded-full"
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  color: "var(--ink-2)",
                  cursor: "pointer",
                }}
              >
                {SECTION_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        )}
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
                <>
                <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 10 }}>
                  {filtered.length} {filtered.length === 1 ? "result" : "results"} for "{search.trim()}"
                </p>
                <div style={{ borderTop: "1px solid var(--rule)" }}>
                  {filtered.map((item) => (
                    <CollapsibleItem
                      key={item.slug}
                      item={item}
                      open={openSlugs.has(item.slug)}
                      onToggle={() => toggleSlug(item.slug)}
                    />
                  ))}
                </div>
                </>
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
                      id={`s-${cat}`}
                      className="text-xs tracking-[0.2em] uppercase mb-4"
                      style={{ color: "var(--live)", fontFamily: "var(--font-mono)", scrollMarginTop: 80 }}
                    >
                      {SECTION_LABELS[cat] || cat}
                    </p>
                    <div style={{ borderTop: "1px solid var(--rule)" }}>
                      {items.map((item) => (
                        <CollapsibleItem
                          key={item.slug}
                          item={item}
                          open={openSlugs.has(item.slug)}
                          onToggle={() => toggleSlug(item.slug)}
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
          {authed ? "Ready to keep going?" : "Ready to start?"}
        </h2>
        <p className="mb-8 max-w-md mx-auto" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.625 }}>
          {authed ? "Jump back into your dashboard and keep building." : "Join the founding fifty. Every application is read personally and answered within twenty-four hours."}
        </p>
        <button
          onClick={() => navigate(authed ? "/dashboard" : "/request-access")}
          className="px-7 py-3 rounded-full text-sm font-medium transition-all hover:brightness-110"
          style={{ background: "#0F1519", color: "#FFFFFF", fontWeight: 500 }}
        >
          {authed ? "Back to your dashboard" : "Request a founder seat"}
        </button>
      </section>

      <PublicFooter />
    </div>
  );
};

export default Guide;
