// SLICE 4b — the Brand Assessment Report's permanent on-screen home.
// Renders diagnostic_profiles.brand_assessment_results as native, responsive,
// collapsible sections (an interface, not a scaled document).

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AuraButton } from "@/components/ui/AuraButton";
import { isArabicText } from "@/lib/utils";
import { PAPER, INK, INK2, SPOT, RULE, RULE_SOFT, SERIF, MONO, ARABIC } from "@/components/broadsheet/pressTokens";

/** Muted ink tint — pressTokens has no INK-3 equivalent. */
const INK3 = "rgba(27,23,18,0.62)";

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
  isArabicText(s) ? `'CairoAR', ${ARABIC}` : "var(--font-body)";

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
      borderRadius: 2,
      border: `0.5px solid ${RULE}`,
      background: PAPER,
      fontSize: 12,
      lineHeight: 1.4,
      color: INK2,
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
    background: PAPER,
    border: `0.5px solid ${RULE}`,
    borderRadius: 4,
    padding: "24px 20px",
    color: INK,
  };

  if (!hasAssessment || !r || (!headline && !standfirst && blocks.length === 0)) {
    return (
      <section style={cardStyle}>
        <p className="text-sm" style={{ color: INK3, margin: 0, fontFamily: "var(--font-body)" }}>
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
      <header style={{ marginBottom: 24 }}>
        {headline ? (
          <h3
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.15,
              color: INK,
              ...textStyle(headline),
            }}
          >
            {/^you are\b/i.test(headline) ? headline : `You are ${headline}`}
          </h3>
        ) : null}
        {standfirst ? (
          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              fontSize: 15,
              lineHeight: 1.75,
              color: INK2,
              ...textStyle(standfirst),
            }}
          >
            {standfirst}
          </p>
        ) : null}
        {secondary ? (
          <p style={{ marginTop: 14, marginBottom: 0, fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: SPOT, ...textStyle(secondary) }}>
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
            paddingBottom: 16,
            marginBottom: 8,
            borderBottom: `0.5px solid ${RULE}`,
          }}
        >
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => jump(b.id)}
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "5px 9px",
                borderRadius: 2,
                border: `0.5px solid ${RULE}`,
                background: PAPER,
                color: INK3,
                cursor: "pointer",
                transition: "color 140ms ease, border-color 140ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = SPOT;
                e.currentTarget.style.borderColor = SPOT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = INK3;
                e.currentTarget.style.borderColor = RULE;
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
              style={{ borderTop: `0.5px solid ${idx === 0 ? RULE : RULE_SOFT}` }}
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
                  padding: "14px 0",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: SPOT }}>
                  {b.label}
                </span>
                <ChevronDown
                  size={14}
                  style={{
                    color: INK3,
                    flexShrink: 0,
                    transform: openNow ? "rotate(180deg)" : "none",
                    transition: "transform 160ms ease",
                  }}
                />
              </button>

              {openNow ? (
                <div style={{ paddingBottom: 20 }}>
                  {b.kind === "prose"
                    ? b.parts
                        .filter(Boolean)
                        .map((p, i) => (
                          <p
                            key={i}
                            style={{
                              margin: i === 0 ? 0 : "8px 0 0",
                              fontFamily: "var(--font-body)",
                              fontSize: 14,
                              lineHeight: 1.75,
                              color: INK2,
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
                                fontFamily: SERIF,
                                fontSize: 16,
                                fontWeight: 600,
                                color: INK,
                                lineHeight: 1.4,
                                ...textStyle(p.heading),
                              }}
                            >
                              {p.heading}
                            </div>
                          ) : null}
                          {p.body ? (
                            <p
                              style={{
                                margin: "5px 0 0",
                                fontSize: 14,
                                lineHeight: 1.75,
                                color: INK2,
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
