// SLICE 4b — the Brand Assessment Report's permanent on-screen home.
// Renders diagnostic_profiles.brand_assessment_results as native, responsive,
// collapsible sections (an interface, not a scaled document).

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isArabicText } from "@/lib/utils";

/** System-B "Signal" — module scope, literal, no retired press tokens. */
const CARD = "#FFFFFF";
const INK = "#0F1519";
const INK2 = "#5B6673";
const INK3 = "#5B6673";
const SPOT = "#0670C4";
const RULE = "#E2E7EE";
const RULE_SOFT = "#E2E7EE";
const BODY = "Inter, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const ARABIC = "'Cairo', Inter, sans-serif";

/** Shared outer shell for every top-level card in "What you can show". */
const SHELL: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${RULE}`,
  borderRadius: 20,
  padding: 20,
  color: INK,
  fontFamily: BODY,
};

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
  isArabicText(s) ? `'CairoAR', ${ARABIC}` : BODY;

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
      borderRadius: 4,
      border: `0.5px solid ${RULE}`,
      background: CARD,
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
  /** `diagnostic_profiles.brand_assessment_completed_at` — the age of these lists. */
  assessedAt?: string | null;
}

export default function BrandReportSection({ results, hasAssessment, onCompleteAssessment, assessedAt }: Props) {
  const r = results && typeof results === "object" ? results : null;

  const headline = asString(r?.primary_archetype);
  const secondary = asString(r?.secondary_archetype);
  const standfirst = asString(r?.positioning_statement);

  /** One list only. `topics` and `content_pillars` are the same items in two
   *  shapes, so `topics` wins (it carries a description) and the pillars are
   *  the fallback for older rows. Nothing is truncated. */
  const workPairs = useMemo<Pair[]>(() => {
    if (!r) return [];
    const fromTopics = asPairs(r.topics, "title", "description");
    if (fromTopics.length > 0) return fromTopics;
    return asStringList(r.content_pillars).map((t) => ({ heading: t, body: "" }));
  }, [r]);

  const madeOn = assessedAt
    ? `From your brand assessment on ${new Date(assessedAt).toLocaleDateString()}.`
    : "From your brand assessment. No date was recorded for it.";

  const blocks = useMemo<Block[]>(() => {
    if (!r) return [];
    const raw: Block[] = [
      { id: "market-read", label: "How the market sees you", kind: "prose", parts: [asString(r.market_read)] },
      { id: "honest-truth", label: "The honest truth", kind: "prose", parts: [asString(r.honest_truth)] },
      { id: "only-you", label: "What only you can do", kind: "prose", parts: [asString(r.unique_capability), asString(r.zone_of_genius)] },
      { id: "space", label: "The space nobody else owns", kind: "prose", parts: [asString(r.uncontested_space)] },
      // Stable id — anything deep-linking to #brand-report-topics still lands here.
      { id: "topics", label: "What you write about", kind: "pairs", pairs: workPairs },
      { id: "voice", label: "How you sound", kind: "prose", parts: [asString(r.voice_signature), asString(r.natural_tone)] },
      { id: "trust", label: "How you build trust", kind: "prose", parts: [asString(r.trust_pattern), asString(r.authority_style)] },
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
  }, [r, workPairs]);

  /** Every block starts closed. A closed row still says what it holds. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? false;
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));

  /** The first few words of a block's own content, truncated — no new text. */
  const preview = (b: Block): string => {
    const raw = b.kind === "prose"
      ? b.parts.filter(Boolean).join(" ")
      : b.kind === "chips"
        ? b.items.join(", ")
        : b.pairs.map((p) => p.heading || p.body).filter(Boolean).join(", ");
    const flat = raw.replace(/\s+/g, " ").trim();
    return flat.length > 90 ? `${flat.slice(0, 90).trimEnd()}…` : flat;
  };


  const cardStyle: React.CSSProperties = SHELL;

  if (!hasAssessment || !r || (!headline && !standfirst && blocks.length === 0)) {
    return (
      <section style={cardStyle}>
        <p className="text-sm" style={{ color: INK3, margin: 0, fontFamily: BODY }}>
          Complete your brand assessment to generate your reports.
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="default" size="sm" onClick={onCompleteAssessment}>
            Complete brand assessment
          </Button>
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
              fontFamily: BODY,
              fontSize: 30,
              fontWeight: 700,
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

      {/* Jump index — one wrapping row of small links, at every width. */}
      {blocks.length > 1 ? (
        <nav
          aria-label="Report sections"
          className="flex"

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
                borderRadius: 8,
                border: `0.5px solid ${RULE}`,
                background: CARD,
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
                              fontFamily: BODY,
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
                                fontFamily: BODY,
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

                  {b.id === "topics" ? (
                    <p style={{ margin: "12px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", color: INK3 }}>
                      {madeOn}
                    </p>
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
