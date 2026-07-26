// SLICE 4b — the Brand Assessment Report's permanent on-screen home.
// Renders diagnostic_profiles.brand_assessment_results as native, responsive,
// collapsible sections (an interface, not a scaled document).

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AuraButton } from "@/components/ui/AuraButton";
import { isArabicText } from "@/lib/utils";

/** Mirrors BrandAssessmentModal's stripMd so no literal ** leaks on screen. */
const stripMd = (s: string) =>
  (s || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();

const dir = (s: string) => (isArabicText(s) ? "rtl" : "ltr");
const fontFor = (s: string) =>
  isArabicText(s) ? "'CairoAR', 'Cairo', sans-serif" : "var(--font-body)";

const textStyle = (s: string): React.CSSProperties => ({
  direction: dir(s),
  textAlign: isArabicText(s) ? "right" : "left",
  fontFamily: fontFor(s),
});

const asString = (v: any) => (typeof v === "string" ? stripMd(v) : "");
const asStringList = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? stripMd(x) : "")).filter(Boolean) : [];

interface Pair { heading: string; body: string }
const asPairs = (v: any, kA: string, kB: string): Pair[] =>
  Array.isArray(v)
    ? v
        .map((x) => ({
          heading: stripMd(String(x?.[kA] ?? "")),
          body: stripMd(String(x?.[kB] ?? "")),
        }))
        .filter((p) => p.heading || p.body)
    : [];

type Block =
  | { id: string; label: string; kind: "prose"; parts: string[] }
  | { id: string; label: string; kind: "chips"; items: string[] }
  | { id: string; label: string; kind: "pairs"; pairs: Pair[] };

const Chip = ({ text }: { text: string }) => (
  <span
    style={{
      display: "inline-block",
      padding: "5px 10px",
      borderRadius: 999,
      border: "0.5px solid var(--brand-line, rgba(0,0,0,0.12))",
      background: "var(--aura-surface, rgba(0,0,0,0.02))",
      fontSize: 12,
      lineHeight: 1.4,
      color: "var(--ink-2)",
      maxWidth: "100%",
      ...textStyle(text),
    }}
  >
    {text}
  </span>
);

interface Props {
  results: Record<string, any> | null | undefined;
  hasAssessment: boolean;
  onCompleteAssessment: () => void;
}

export default function BrandReportSection({ results, hasAssessment, onCompleteAssessment }: Props) {
  const r = results && typeof results === "object" ? results : null;

  const headline = asString(r?.primary_archetype);
  const secondary = asString(r?.secondary_archetype);
  const standfirst = asString(r?.positioning_statement);

  const blocks = useMemo<Block[]>(() => {
    if (!r) return [];
    const raw: Block[] = [
      { id: "market-read", label: "How the market sees you", kind: "prose", parts: [asString(r.market_read)] },
      { id: "honest-truth", label: "The honest truth", kind: "prose", parts: [asString(r.honest_truth)] },
      { id: "only-you", label: "What only you can do", kind: "prose", parts: [asString(r.unique_capability), asString(r.zone_of_genius)] },
      { id: "space", label: "The space nobody else owns", kind: "prose", parts: [asString(r.uncontested_space)] },
      { id: "topics", label: "Your topics", kind: "pairs", pairs: asPairs(r.topics, "title", "description") },
      { id: "voice", label: "How you sound", kind: "prose", parts: [asString(r.voice_signature), asString(r.natural_tone)] },
      { id: "trust", label: "How you build trust", kind: "prose", parts: [asString(r.trust_pattern), asString(r.authority_style)] },
      { id: "pillars", label: "Your content pillars", kind: "chips", items: asStringList(r.content_pillars) },
      { id: "grow", label: "Where to invest next", kind: "pairs", pairs: asPairs(r.invest_next, "area", "insight") },
      { id: "growth-areas", label: "Areas to strengthen", kind: "chips", items: asStringList(r.growth_areas) },
      { id: "barrier", label: "What is holding you back", kind: "prose", parts: [asString(r.key_barrier)] },
    ];
    // Never render an empty block.
    return raw.filter((b) => {
      if (b.kind === "prose") return b.parts.some((p) => p && p.length > 0);
      if (b.kind === "chips") return b.items.length > 0;
      return b.pairs.length > 0;
    });
  }, [r]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, idx: number) => open[id] ?? idx < 2;
  const toggle = (id: string, idx: number) =>
    setOpen((prev) => ({ ...prev, [id]: !(prev[id] ?? idx < 2) }));

  const cardStyle: React.CSSProperties = {
    background: "var(--aura-card)",
    border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
    borderRadius: 12,
    padding: 16,
  };

  if (!hasAssessment || !r || (!headline && !standfirst && blocks.length === 0)) {
    return (
      <section style={cardStyle}>
        <p className="text-sm" style={{ color: "var(--ink-3)", margin: 0 }}>
          Complete your brand assessment to generate your reports.
        </p>
        <div style={{ marginTop: 12 }}>
          <AuraButton variant="primary" size="sm" onClick={onCompleteAssessment}>
            Complete brand assessment
          </AuraButton>
        </div>
      </section>
    );
  }

  const jump = (id: string) => {
    setOpen((prev) => ({ ...prev, [id]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`brand-report-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      {/* Header */}
      <header style={{ marginBottom: 16 }}>
        {headline ? (
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-display, 'Cormorant Garamond')",
              fontSize: 24,
              lineHeight: 1.2,
              color: "var(--ink)",
              ...textStyle(headline),
            }}
          >
            {/^you are\b/i.test(headline) ? headline : `You are ${headline}`}
          </h3>
        ) : null}
        {standfirst ? (
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              ...textStyle(standfirst),
            }}
          >
            {standfirst}
          </p>
        ) : null}
        {secondary ? (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 11, color: "var(--ink-4)", ...textStyle(secondary) }}>
            Second nature: {secondary}
          </p>
        ) : null}
      </header>

      {/* Desktop jump-nav — hidden on phones (Tailwind md breakpoint) */}
      {blocks.length > 1 ? (
        <nav
          aria-label="Report sections"
          className="hidden md:flex"
          style={{
            flexWrap: "wrap",
            gap: 6,
            paddingBottom: 12,
            marginBottom: 12,
            borderBottom: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
          }}
        >
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => jump(b.id)}
              style={{
                fontSize: 11,
                padding: "4px 9px",
                borderRadius: 999,
                border: "0.5px solid var(--brand-line, rgba(0,0,0,0.12))",
                background: "transparent",
                color: "var(--ink-3)",
                cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </nav>
      ) : null}

      {/* Accordion */}
      <div>
        {blocks.map((b, idx) => {
          const openNow = isOpen(b.id, idx);
          return (
            <div
              key={b.id}
              id={`brand-report-${b.id}`}
              style={{ borderTop: idx === 0 ? "none" : "0.5px solid var(--brand-line, rgba(0,0,0,0.08))" }}
            >
              <button
                type="button"
                onClick={() => toggle(b.id, idx)}
                aria-expanded={openNow}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 0",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink)" }}>
                  {b.label}
                </span>
                <ChevronDown
                  size={14}
                  style={{
                    color: "var(--ink-4)",
                    flexShrink: 0,
                    transform: openNow ? "rotate(180deg)" : "none",
                    transition: "transform 160ms ease",
                  }}
                />
              </button>

              {openNow ? (
                <div style={{ paddingBottom: 14 }}>
                  {b.kind === "prose"
                    ? b.parts
                        .filter(Boolean)
                        .map((p, i) => (
                          <p
                            key={i}
                            style={{
                              margin: i === 0 ? 0 : "8px 0 0",
                              fontSize: 13,
                              lineHeight: 1.7,
                              color: "var(--ink-2)",
                              ...textStyle(p),
                            }}
                          >
                            {p}
                          </p>
                        ))
                    : null}

                  {b.kind === "chips" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {b.items.map((t, i) => (
                        <Chip key={i} text={t} />
                      ))}
                    </div>
                  ) : null}

                  {b.kind === "pairs" ? (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                      {b.pairs.map((p, i) => (
                        <li key={i}>
                          {p.heading ? (
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ink)",
                                lineHeight: 1.5,
                                ...textStyle(p.heading),
                              }}
                            >
                              {p.heading}
                            </div>
                          ) : null}
                          {p.body ? (
                            <p
                              style={{
                                margin: "4px 0 0",
                                fontSize: 13,
                                lineHeight: 1.7,
                                color: "var(--ink-3)",
                                ...textStyle(p.body),
                              }}
                            >
                              {p.body}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
