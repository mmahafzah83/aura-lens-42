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
import { SEAT_CTA } from "@/lib/seatCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePublicText } from "@/hooks/usePublicText";

const AR_FONT = "var(--font-arabic)";

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

/* Section label keys: guide.sec.<category>. Unknown categories show as stored. */
const sectionLabel = (T: (k: string) => string, cat: string) =>
  SECTION_ORDER.includes(cat) ? T(`guide.sec.${cat}`) : cat;

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
  /* Articles exist in English only: always left-to-right, even on the Arabic page. */
  const { ar, T } = usePublicText();
  return (
    <div id={`a-${item.slug}`} dir={ar ? "ltr" : undefined} lang={ar ? "en" : undefined} style={{ borderBottom: "1px solid #E2E7EE", scrollMarginTop: 80, textAlign: ar ? "left" : undefined }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left py-5"
        style={{ background: "transparent", border: 0, cursor: "pointer", color: "#0F1519" }}
      >
        <span style={{ fontSize: 15, fontWeight: 500 }}>{item.question_en}</span>
        <ChevronDown
          size={18}
          style={{
            color: "#98A2AE",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms ease",
            flexShrink: 0,
            marginInlineStart: 16,
          }}
        />
      </button>
      {open && (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#3A434E", paddingBottom: 20, paddingInlineEnd: 34, whiteSpace: "pre-line" }}>
          {item.answer_en}
          {item.formula_note_en && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 6,
                background: "#FFFFFF",
                border: "1px solid #E2E7EE",
                borderInlineStart: "2px solid #00CEC9",
                fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
                fontSize: 13,
                color: "#3A434E",
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
              toast(T("guide.copied"));
            }}
            className="inline-flex items-center gap-1.5 mt-3"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 0,
              color: "#98A2AE",
              fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
              fontSize: 11,
              letterSpacing: ar ? 0 : "0.08em",
              textTransform: ar ? "none" : "uppercase",
              ...(ar ? { fontFamily: AR_FONT, fontSize: 13 } : {}),
            }}
            dir={ar ? "rtl" : undefined}
          >
            <Link2 size={12} /> {T("guide.copyLink")}
          </button>
        </div>
      )}
    </div>
  );
}

const LOOP_STEPS = ["01", "02", "03", "04", "05"];

const Guide = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { ar, T, shared } = usePublicText();
  const arT = (s: React.CSSProperties): React.CSSProperties =>
    ar ? { ...s, fontFamily: AR_FONT, letterSpacing: 0, textTransform: "none", lineHeight: 1.9 } : s;
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
    title: t("guide.metaTitle"),
    description: t("guide.metaDesc"),
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
        background: "#F2F5F9",
        color: "#0F1519",
        fontFamily: ar ? AR_FONT : "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <PublicMasthead authed={authed} />

      {/* Hero */}
      <section className="px-5 sm:px-10 pt-16 pb-10 text-center max-w-3xl mx-auto w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={{ fontSize: ar ? 14 : 12, color: "#98A2AE" }}
        >
          <ArrowLeft size={13} style={ar ? { transform: "scaleX(-1)" } : undefined} /> {T("pubpg.backHome")}
        </Link>
        <p
          className="uppercase tracking-[0.12em] mb-4"
          style={arT({ color: "#00807B", fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: ar ? 14 : 12 })}
        >
          {T("guide.kicker")}
        </p>
        <h1
          className="mb-5"
          style={{
            fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: ar ? 1.7 : 1.375,
            letterSpacing: ar ? 0 : "-0.02em",
            color: "#0F1519",
            fontWeight: 700,
            ...(ar ? { fontFamily: AR_FONT } : {}),
          }}
        >
          {T("guide.h1")}
        </h1>
        <p style={arT({ fontSize: 16, color: "#3A434E", lineHeight: 1.625 })}>
          {T("guide.sub")}
        </p>
      </section>

      {/* The loop */}
      <section className="px-5 sm:px-10 pb-10">
        <div
          className="max-w-3xl mx-auto"
          style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 16, padding: "24px 22px" }}
        >
          <p
            className="uppercase tracking-[0.2em] mb-5"
            style={arT({ color: "#00807B", fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: ar ? 14 : 11 })}
          >
            {T("guide.loop")}
          </p>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
            {LOOP_STEPS.map((n, i) => (
              <li key={n} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
                    fontSize: 12,
                    color: "#00807B",
                    letterSpacing: "0.1em",
                    flexShrink: 0,
                  }}
                >
                  {n}
                </span>
                <span style={arT({ fontSize: 15, lineHeight: 1.65, color: "#3A434E" })}>{T(`guide.loop.${i + 1}`)}</span>
              </li>
            ))}
          </ol>
          <p style={arT({ marginTop: 18, fontSize: 13, color: "#98A2AE", lineHeight: 1.6 })}>
            {T("guide.loopEnd")}
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
              insetInlineStart: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#98A2AE",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("guide.search")}
            className="w-full rounded-xl text-sm outline-none"
            style={{
              paddingBlock: 12,
              paddingInlineStart: 42,
              paddingInlineEnd: 16,
              ...(ar ? { fontFamily: AR_FONT } : {}),
              background: "#FFFFFF",
              border: "1px solid #E2E7EE",
              color: "#0F1519",
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
                  border: "1px solid #E2E7EE",
                  color: "#3A434E",
                  cursor: "pointer",
                  ...(ar ? { fontFamily: AR_FONT, fontSize: 13, lineHeight: 1.7 } : {}),
                }}
              >
                {sectionLabel(T, cat)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Content */}
      <section className="px-5 sm:px-10 pb-20 flex-1">
        <div className="max-w-3xl mx-auto">
          {loading && (
            <p style={arT({ fontSize: 14, color: "#98A2AE", textAlign: "center", padding: "40px 0" })}>{T("guide.loading")}</p>
          )}

          {error && (
            <p style={arT({ fontSize: 14, color: "#98A2AE", textAlign: "center", padding: "40px 0" })}>
              {T("guide.notReady")}
            </p>
          )}

          {!loading && !error && articles.length === 0 && (
            <p style={arT({ fontSize: 14, color: "#98A2AE", textAlign: "center", padding: "40px 0" })}>
              {T("guide.notReady")}
            </p>
          )}

          {!loading && !error && hasSearch && (
            <>
              {filtered.length === 0 ? (
                <p style={arT({ fontSize: 14, color: "#98A2AE", textAlign: "center", padding: "40px 0" })}>
                  {T("guide.noResults", { q: search.trim() })}
                </p>
              ) : (
                <>
                <p style={arT({ fontSize: 13, color: "#98A2AE", marginBottom: 10 })}>
                  {T(filtered.length === 1 ? "guide.resultOne" : "guide.resultMany", { n: filtered.length, q: search.trim() })}
                </p>
                <div style={{ borderTop: "1px solid #E2E7EE" }}>
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
              {ar && articles.length > 0 && (
                <p style={arT({ fontSize: 13, color: "#5B6673", marginBottom: 18 })}>{T("guide.englishOnly")}</p>
              )}
              {SECTION_ORDER.map((cat) => {
                const items = grouped[cat];
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat} className="mb-12">
                    <p
                      id={`s-${cat}`}
                      className="text-xs tracking-[0.2em] uppercase mb-4"
                      style={arT({ color: "#00807B", fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", scrollMarginTop: 80, ...(ar ? { fontSize: 14, fontWeight: 600 } : {}) })}
                    >
                      {sectionLabel(T, cat)}
                    </p>
                    <div style={{ borderTop: "1px solid #E2E7EE" }}>
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
      <section className="px-5 sm:px-10 py-20 text-center" style={{ borderTop: "1px solid #E2E7EE" }}>
        <h2 className="mb-5" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif", fontSize: "clamp(28px, 4vw, 40px)", color: "#0F1519", fontWeight: 700, letterSpacing: ar ? 0 : "-0.02em", ...(ar ? { fontFamily: AR_FONT, lineHeight: 1.7 } : {}) }}>
          {T(authed ? "guide.ctaKeep" : "guide.ctaStart")}
        </h2>
        <p className="mb-8 max-w-md mx-auto" style={arT({ fontSize: 15, color: "#3A434E", lineHeight: 1.625 })}>
          {T(authed ? "guide.ctaBodyIn" : "guide.ctaBodyOut")}
        </p>
        <button
          onClick={() => navigate(authed ? "/dashboard" : "/request-access")}
          className="px-7 py-3 rounded-full text-sm font-medium transition-all hover:brightness-110"
          style={{ background: "#0F1519", color: "#FFFFFF", fontWeight: 500, ...(ar ? { fontFamily: AR_FONT } : {}) }}
        >
          {authed ? T("guide.backDash") : ar ? shared.seatCta : SEAT_CTA}
        </button>
      </section>

      <PublicFooter />
    </div>
  );
};

export default Guide;
