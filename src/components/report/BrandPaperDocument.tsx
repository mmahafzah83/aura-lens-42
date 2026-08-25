// BrandPaperDocument — "The Aura Paper № 00 · The Assessment Finds You…"
// Fixed 4-sheet layout that renders a BrandPaper object through the same
// AuraPaper primitives used by the Strategic Identity Report. No pagination
// engine — brand paper content fits by construction.
//
// System-A tokens only. [data-report-page] + SHEET_W/SHEET_H mirror the
// identity report so exportReportPdf can rasterise this the same way.

import React from "react";
import {
  PaperHeader,
  PaperFooter,
  PaperFigure,
  ClosingPlate,
  CapabilityDotPlot,
  T,
  FONT,
} from "@/components/report/AuraPaper";
import { AuraLogo } from "@/components/brand/AuraLogo";
import { normaliseBrandPaper, type BrandPaper } from "@/lib/buildBrandPaper";

const SHEET_W = 794;
const SHEET_H = 1123;
const PAGE_PAD = 56;
export const PAPER_TITLE = "The Aura Paper № 00";

/** Trim to the last full sentence inside the cap — sheets do not reflow.
 *  With no sentence boundary, cut at the last word boundary and close it off
 *  so a capped line never reads as a hanging clause. */
function capAtSentence(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  const slice = s.slice(0, max);
  const cut = slice.lastIndexOf(". ");
  if (cut > max * 0.4) return slice.slice(0, cut + 1);
  const word = slice.lastIndexOf(" ");
  const base = (word > max * 0.4 ? slice.slice(0, word) : slice).trim();
  return base.replace(/[\s,;:—–-]+$/, "") + ".";
}

// ── Bidi / Arabic (SLICE 4d) ───────────────────────────────────────────
const AR_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const isAr = (v?: string | null) => !!v && AR_RE.test(v.trim().charAt(0));
/** Per-value RTL + Cairo, mirroring BrandReportSection's detection. */
function txt(v?: string | null): React.CSSProperties {
  if (!isAr(v)) return {};
  return {
    direction: "rtl",
    textAlign: "right",
    fontFamily: "'CairoAR', 'Cairo', sans-serif",
  };
}

function Sheet({ n, children, bleed }: { n: number; children: React.ReactNode; bleed?: boolean }) {
  return (
    <div
      className="aura-report-sheet"
      data-report-page
      data-theme="light"
      data-page={n}
      style={{
        width: SHEET_W,
        height: SHEET_H,
        overflow: "hidden",
        background: T.paper,
        color: T.ink,
        fontFamily: FONT.serif,
        padding: bleed ? 0 : PAGE_PAD,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
        margin: "0 auto 32px",
        letterSpacing: "normal",
      }}
    >
      {children}
    </div>
  );
}

function todayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return ""; }
}

// Archetype presentation: italicise the final word in --spot.
function ArchetypeTitle({ name, size = 64 }: { name: string; size?: number }) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const tail = parts.pop() || "";
  const head = parts.join(" ");
  return (
    <h1
      style={{
        fontFamily: FONT.serif,
        fontSize: size,
        fontWeight: 400,
        lineHeight: 1.04,
        color: T.ink,
        margin: 0,
        letterSpacing: "-0.01em",
      }}
    >
      {head ? <>{head}{" "}</> : null}
      <span style={{ fontStyle: "italic", color: T.spot }}>{tail}</span>
    </h1>
  );
}

function MonoLabel({ children, color = T.ink3, size = 10.5 }:
  { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <div style={{
      fontFamily: FONT.mono, fontSize: size, fontWeight: 700,
      letterSpacing: "0.16em", textTransform: "uppercase", color,
    }}>{children}</div>
  );
}

function LegendCell({ swatch, title, body, border }:
  { swatch: string; title: string; body: string; border?: boolean }) {
  return (
    <div style={{ padding: "14px 14px", borderLeft: border ? `1px solid ${T.rule}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span aria-hidden style={{ display: "inline-block", width: 16, height: 16, background: swatch }} />
        <span style={{
          fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
        }}>{title}</span>
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.5, color: T.ink2 }}>{body}</div>
    </div>
  );
}

function MetaCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <MonoLabel>{label}</MonoLabel>
      <div style={{ fontFamily: FONT.serif, fontSize: 17, color: T.ink, lineHeight: 1.3, marginTop: 6 }}>{value}</div>
      {sub ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.ink3, marginTop: 3, letterSpacing: "0.06em" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── Sheet 1 — Cover ────────────────────────────────────────────────────
function CoverSheet({ bp, total }: { bp: BrandPaper; total: number }) {
  const first = bp.profile.first_name || "";
  const last = bp.profile.last_name || "";
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  const level = bp.profile.level || "";
  const archetype = bp.primary_archetype || "Your Position";
  const lede = bp.natural_tone || (bp.market_read ? bp.market_read.split(/(?<=\.)\s+/)[0] : "");
  // A legend is a key to a map. Only name the classes of content this paper
  // actually carries — and if it carries none of them, drop the block.
  const hasFinding = buildFindings(bp).length > 0;
  const hasMovement = !!(bp.uncontested_space || bp.topics.length > 0 || bp.capabilities.length > 0);
  const hasAction = bp.invest_next.length > 0;
  const legendCount = [hasFinding, hasMovement, hasAction].filter(Boolean).length;

  return (
    <Sheet n={1}>
      <PaperHeader label="The Aura Paper" />
      <div style={{ marginTop: 34, flex: 1, display: "flex", flexDirection: "column" }}>
        <MonoLabel color={T.spot} size={13}>
          {PAPER_TITLE.replace(" №", " · №")} · The Read Finds You To Be
        </MonoLabel>
        <div style={{ marginTop: 22 }}>
          <ArchetypeTitle name={archetype} />
        </div>
        {lede ? (
          <p style={{
            fontFamily: FONT.serif, fontSize: 18, lineHeight: 1.55, color: T.ink2,
            margin: "22px 0 0", maxWidth: 560, ...txt(lede),
          }}>{lede}</p>
        ) : null}

        {/* Slogan band — carries positioning_statement */}
        {bp.positioning_statement ? (
          <div style={{
            marginTop: 40, marginInline: -PAGE_PAD, padding: `22px ${PAGE_PAD}px`,
            background: "var(--b-600)", color: T.paper,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 24,
          }}>
            <span style={{
              fontFamily: FONT.serif, fontStyle: "italic", fontSize: 20,
              color: T.paper, lineHeight: 1.35, flex: 1,
              ...txt(bp.positioning_statement),
            }}>
              “{bp.positioning_statement}”
            </span>
            <span style={{
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: "#FFFFFF", whiteSpace: "nowrap",
            }}>Your position, in one line</span>
          </div>
        ) : null}

        {/* Reading legend — only for content that exists */}
        {legendCount > 0 ? (
        <div style={{
          marginTop: 34, border: `1.5px solid ${T.ink}`, background: T.paper2,
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${T.rule}`,
            fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
          }}>
            {legendCount === 1
              ? "How to read this paper — one colour, one meaning"
              : `How to read this paper — ${spellCount(legendCount).toLowerCase()} colours, ${spellCount(legendCount).toLowerCase()} meanings`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${legendCount}, 1fr)` }}>
            {hasFinding ? (
              <LegendCell swatch={T.spot} title="Finding" body="A conclusion drawn from your answers." />
            ) : null}
            {hasMovement ? (
              <LegendCell swatch={T.live} title="Movement" body="Something live and rising in your positioning." border={hasFinding} />
            ) : null}
            {hasAction ? (
              <LegendCell swatch="var(--a-500)" title="Action" body="Held by you, unclaimed — the next move." border={hasFinding || hasMovement} />
            ) : null}
          </div>
        </div>
        ) : null}

        {/* Meta grid */}
        <div style={{
          marginTop: 34, paddingTop: 14, borderTop: `1px solid ${T.rule}`,
          display: "grid", gridTemplateColumns: fullName ? "1fr 1fr 1fr" : "1fr 1fr", gap: 20,
        }}>
          {fullName ? <MetaCell label="Prepared for" value={fullName} sub={level} /> : null}
          <MetaCell label="Secondary read" value={bp.secondary_archetype || ""} />
          <MetaCell label="Issued" value={todayLabel(bp.generated_at)} sub="Edition 0 · Your read" />
        </div>
      </div>
      <PaperFooter n={1} total={total} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

// ── Sheet 2 — Findings ─────────────────────────────────────────────────
interface Finding { code: string; source: string; body: string }

function FindingRow({ f }: { f: Finding }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "56px 1fr",
      borderTop: `1px solid ${T.rule}`, padding: "18px 0",
    }}>
      <div>
        <div style={{
          fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
          letterSpacing: "0.08em", color: T.spot,
        }}>{f.code}</div>
      </div>
      <div>
        <div style={{
          fontFamily: FONT.mono, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase", color: T.ink3,
          marginBottom: 6,
        }}>{f.source}</div>
        <div style={{
          fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.55, color: T.ink,
          ...txt(f.body),
        }}>{f.body}</div>
      </div>
    </div>
  );
}

/** The private panel — it lives on Sheet 2 unless the findings crowd it out. */
function GapPanel({ bp, style }: { bp: BrandPaper; style?: React.CSSProperties }) {
  if (!bp.the_gap && !bp.own_words_quote) return null;
  return (
    <div style={{ padding: 20, background: T.paper2, border: `1px solid ${T.rule}`, ...style }}>
      <MonoLabel color={T.spot} size={10.5}>Only you see this</MonoLabel>
      <h3 style={{
        fontFamily: FONT.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.2,
        color: T.ink, margin: "8px 0 0",
      }}>The gap</h3>
      {bp.the_gap ? (
        <p style={{
          fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink2,
          margin: "10px 0 0", ...txt(bp.the_gap),
        }}>{bp.the_gap}</p>
      ) : null}
      {bp.own_words_quote ? (
        <p style={{
          fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink,
          fontStyle: "italic", margin: "14px 0 0", ...txt(bp.own_words_quote),
        }}>“{bp.own_words_quote}”</p>
      ) : null}
      {bp.own_words_read ? (
        <p style={{
          fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.6, color: T.ink2,
          margin: "8px 0 0", ...txt(bp.own_words_read),
        }}>{bp.own_words_read}</p>
      ) : null}
    </div>
  );
}

/** Spelled counts, so a heading can never promise more rows than exist. */
const spellCount = (n: number) =>
  ["No", "One", "Two", "Three", "Four", "Five", "Six"][n] ?? String(n);

function buildFindings(bp: BrandPaper): Finding[] {
  const raw: (Finding | null)[] = [
    bp.market_read ? {
      code: "F · 1", body: bp.market_read,
      source: "Source — Your answers × your ratings",
    } : null,
    bp.trust_pattern ? {
      code: "F · 2", body: bp.trust_pattern,
      source: "Source — Question 1, 2 · trust archetype cluster",
    } : null,
    bp.unique_capability ? {
      code: "F · 3", body: bp.unique_capability,
      source: "Source — Capability audit × sector focus",
    } : null,
    bp.honest_truth ? {
      code: "F · 4", body: bp.honest_truth,
      source: "Source — Question 10 · barrier reframe",
    } : null,
  ];
  return raw.filter((f): f is Finding => f !== null);
}

function FindingsSheet({ bp, n, total }: { bp: BrandPaper; n: number; total: number }) {
  const findings = buildFindings(bp);
  // An empty sheet is worse than no sheet.
  if (findings.length === 0) return null;

  return (
    <Sheet n={n}>
      <PaperHeader label="Findings" />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11}>Chapter 01</MonoLabel>
        <h2 style={{
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        }}>
          {spellCount(findings.length)} {findings.length === 1 ? "finding" : "findings"},{" "}
          <span style={{ fontStyle: "italic", color: T.spot }}>evidenced</span>
        </h2>
        <p style={{
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 20px", maxWidth: 560,
        }}>
          Each row is a conclusion drawn from your own record. The tag under each
          finding names the evidence path it followed.
        </p>
        <div style={{ borderBottom: `1px solid ${T.rule}` }}>
          {findings.map((f) => <FindingRow key={f.code} f={f} />)}
        </div>
        {/* The gap panel always lives at the top of Sheet 3 — never here. */}
      </div>
        <PaperFooter n={n} total={total} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

// ── Sheet 3 — Space + topics ───────────────────────────────────────────
function TopicBlock({ n, title, description }: { n: string; title: string; description: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 1fr",
      borderTop: `1px solid ${T.rule}`, padding: "16px 0", gap: 16,
    }}>
      <div style={{
        background: T.ink, color: T.paper,
        fontFamily: FONT.mono, fontSize: 18, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 46, letterSpacing: "0.04em",
      }}>{n}</div>
      <div>
        <div style={{
          fontFamily: FONT.serif, fontSize: 20, color: T.ink,
          lineHeight: 1.25, marginBottom: 6, letterSpacing: "-0.005em", ...txt(title),
        }}>{title}</div>
        {description ? (
          <div style={{ fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.55, ...txt(description) }}>
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function spaceSheetHasContent(bp: BrandPaper): boolean {
  const topics = bp.topics.length > 0 ? bp.topics : bp.content_pillars.slice(0, 3);
  return !!(
    bp.the_gap || bp.own_words_quote || bp.own_words_read ||
    bp.uncontested_space || topics.length > 0 || bp.invest_next.length > 0
  );
}

function SpaceSheet({ bp, n, total }: { bp: BrandPaper; n: number; total: number }) {
  const hasInvest = bp.invest_next.length > 0;
  // Older rows carry pillars but no structured topics — fall back so the
  // topics block is never silently empty.
  const topics = bp.topics.length > 0
    ? bp.topics
    : bp.content_pillars.slice(0, 3).map((t) => ({ title: t, description: "" }));
  // A sheet with nothing on it is never printed.
  if (!spaceSheetHasContent(bp)) return null;
  return (
    <Sheet n={n}>
      <PaperHeader label="Ground & Topics" />
      <div style={{ marginTop: 30, flex: 1 }}>
        <GapPanel bp={bp} style={{ marginBottom: 24 }} />
        {bp.uncontested_space ? (
          <PaperFigure
            index={1}
            label="The Uncontested Ground"
            findingBold="Finding —"
            findingRest="the space above is yours to occupy first."
          >
            <p style={{
              fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.6,
              color: T.ink, margin: 0, ...txt(bp.uncontested_space),
            }}>{bp.uncontested_space}</p>
          </PaperFigure>
        ) : null}

        {topics.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <MonoLabel color={T.spot} size={11}>
              {"What you write about"}
            </MonoLabel>
            <div style={{ marginTop: 10, borderBottom: `1px solid ${T.rule}` }}>
              {topics.slice(0, 3).map((t, i) => (
                <TopicBlock
                  key={i}
                  n={String(i + 1).padStart(2, "0")}
                  title={t.title}
                  description={t.description}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasInvest ? (
          <div style={{ marginTop: 24, background: T.paper2, border: `1.5px solid ${T.ink}` }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${T.rule}`,
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
            }}>Where to invest next</div>
            {bp.invest_next.slice(0, 2).map((x, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "16px 1fr",
                gap: 14, padding: "12px 14px",
                borderTop: i === 0 ? undefined : `1px solid ${T.rule}`,
                alignItems: "start",
              }}>
                <span aria-hidden style={{
                  display: "inline-block", width: 12, height: 12,
                  background: T.action, marginTop: 6,
                }} />
                <div>
                  <div style={{
                    fontFamily: FONT.mono, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
                    marginBottom: 4,
                  }}>{x.area}</div>
                  {x.insight ? (
                    <div style={{ fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.55 }}>
                      {x.insight}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <PaperFooter n={n} total={total} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}


// ── Sheet 4 — Voice, trust, pillars, what to strengthen (SLICE 4d) ──────
function ProsePair({ label, parts }: { label: string; parts: (string | null)[] }) {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "").slice(0, 60);
  const seen: string[] = [];
  const shown = parts.filter((x): x is string => !!x).filter((x) => {
    const k = norm(x);
    if (k && seen.includes(k)) return false;
    if (k) seen.push(k);
    return true;
  });
  if (shown.length === 0) return null;
  return (
    <div style={{ borderTop: `1px solid ${T.rule}`, padding: "16px 0" }}>
      <MonoLabel color={T.spot} size={10.5}>{label}</MonoLabel>
      {shown.map((x, i) => (
        <p
          key={i}
          style={{
            fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink2,
            margin: i === 0 ? "8px 0 0" : "8px 0 0", ...txt(x),
          }}
        >
          {x}
        </p>
      ))}
    </div>
  );
}

function PaperChips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ borderTop: `1px solid ${T.rule}`, padding: "16px 0" }}>
      <MonoLabel color={T.spot} size={10.5}>{label}</MonoLabel>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
        {items.map((t, i) => (
          <span
            key={i}
            style={{
              fontFamily: FONT.serif, fontSize: 13.5, color: T.ink,
              display: "inline-block", boxSizing: "border-box",
              padding: "6px 12px", border: `1px solid ${T.rule}`, background: T.paper2,
              lineHeight: 1.35, maxWidth: 600, whiteSpace: "normal", ...txt(t),
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function voiceSheetHasContent(bp: BrandPaper): boolean {
  return !!(
    bp.voice_signature || bp.trust_pattern || bp.authority_style ||
    bp.zone_of_genius || bp.key_barrier ||
    bp.content_pillars.length > 0 || bp.growth_areas.length > 0
  );
}

function VoiceSheet({ bp, n, total }: { bp: BrandPaper; n: number; total: number }) {
  return (
    <Sheet n={n}>
      <PaperHeader label="Voice & Ground" />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11}>Chapter 02</MonoLabel>
        <h2 style={{
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        }}>
          How you sound, <span style={{ fontStyle: "italic", color: T.spot }}>and stand</span>
        </h2>
        <p style={{
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 14px", maxWidth: 560,
        }}>
          The voice the market already hears from you, the ground you hold, and
          the parts worth strengthening next.
        </p>
        {/* natural_tone is the cover's lede — saying it twice reads as padding. */}
        <ProsePair label="How you sound" parts={[bp.voice_signature]} />
        <ProsePair label="How you build trust" parts={[bp.trust_pattern, bp.authority_style]} />
        <ProsePair label="Where you are strongest" parts={[bp.zone_of_genius]} />
        <PaperChips label="Your content pillars" items={bp.content_pillars} />
        <PaperChips label="Areas to strengthen" items={bp.growth_areas} />
        <ProsePair label="What is holding you back" parts={[bp.key_barrier]} />
      </div>
      <PaperFooter n={n} total={total} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

// ── Final sheet — ClosingPlate ─────────────────────────────────────────────
/** Real counts, supplied by the caller from the snapshot's footprint. */
export interface PaperStats {
  sources?: number | null;
  evidence?: number | null;
  signals?: number | null;
  themes?: number | null;
}

// ── Placements sheet — the member's own numbers, in his own words ──────
function PlacementsSheet({ bp, n, total }: { bp: BrandPaper; n: number; total: number }) {
  if (bp.capabilities.length === 0) return null;
  return (
    <Sheet n={n}>
      <PaperHeader label="Your own placements" />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11}>In your own words</MonoLabel>
        <h2 style={{
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        }}>
          Where you placed <span style={{ fontStyle: "italic", color: T.spot }}>yourself</span>
        </h2>
        <p style={{
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 22px", maxWidth: 560,
        }}>
          These are the placements you made yourself, in the words you were given.
          They are not scores and they are not grades — nobody marked you. They
          record where you put yourself on the day you answered.
        </p>
        <CapabilityDotPlot data={bp.capabilities} />
      </div>
      <PaperFooter n={n} total={total} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

function ClosingSheet({ bp, n, total, stats }: {
  bp: BrandPaper; n: number; total: number; stats?: PaperStats | null;
}) {
  const archetype = bp.primary_archetype || "Your Position";
  const parts = archetype.trim().split(/\s+/);
  const tail = parts.pop() || "";
  const head = parts.join(" ");
  const firstTopic = bp.topics[0]?.title || bp.content_pillars[0] || "";
  const named = (i: number): string => {
    const x = bp.invest_next[i];
    if (!x?.insight) return "";
    return x.area ? `${x.area} — ${x.insight}` : x.insight;
  };
  const sixty = named(0) || bp.uncontested_space || "";
  const ninety = named(1) || (bp.key_barrier ? `Decide: ${bp.key_barrier}` : "");
  const moves = [
    firstTopic ? { horizon: "30d", text: `Publish once from "${firstTopic}"` } : null,
    sixty ? { horizon: "60d", text: sixty } : null,
    ninety ? { horizon: "90d", text: ninety } : null,
  ].filter((m): m is { horizon: string; text: string } => !!m)
    .map((m) => ({ horizon: m.horizon, text: capAtSentence(m.text, 180) }));
  // No fabricated ReportData and no hardcoded null pretending to be a score.
  // The plate takes the member's name directly and only the counts we hold.
  const personName = [bp.profile.first_name, bp.profile.last_name]
    .filter(Boolean).join(" ").trim() || null;

  return (
    <Sheet n={n} bleed>
      <ClosingPlate
        personName={personName}
        evidenceCount={stats?.evidence ?? null}
        activeSignals={stats?.signals ?? null}
        headline={
          <>
            {head ? <>{head} </> : null}
            <span style={{ fontStyle: "italic", color: T.action }}>{tail}</span>
          </>
        }
        body={bp.positioning_statement || undefined}
        moves={moves.length ? moves : undefined}
        paperTitle={PAPER_TITLE}
        pageLine={`Page ${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
        ctaLabel="Find your position ↗"
      />
    </Sheet>
  );
}

// ── Root ───────────────────────────────────────────────────────────────
export default function BrandPaperDocument({
  paper: rawPaper,
  showClosing = true,
  stats = null,
}: {
  paper: BrandPaper;
  /** false when this paper is bound into the combined report (SLICE 4d). */
  showClosing?: boolean;
  /** Real counts from the snapshot's footprint — never invented. */
  stats?: PaperStats | null;
}) {
  // Frozen snapshots can predate any field on BrandPaper — normalise first so a
  // missing array can never throw mid-render and blank "What you can show".
  const paper = normaliseBrandPaper(rawPaper);
  const hasVoice = voiceSheetHasContent(paper);
  // A findings sheet with no findings is dropped, so the sheet count follows.
  const hasFindings = buildFindings(paper).length > 0;
  const hasSpace = spaceSheetHasContent(paper);
  const hasPlacements = paper.capabilities.length > 0;
  // Pages are numbered by what actually prints — no header over an empty page.
  let next = 2;
  const findingsN = hasFindings ? next++ : 0;
  const spaceN = hasSpace ? next++ : 0;
  const placementsN = hasPlacements ? next++ : 0;
  const voiceN = hasVoice ? next++ : 0;
  const total = next - 1 + (showClosing ? 1 : 0);
  return (
    <div style={{ background: T.paper2, padding: "24px 0" }}>
      <CoverSheet bp={paper} total={total} />
      {hasFindings ? <FindingsSheet bp={paper} n={findingsN} total={total} /> : null}
      {hasSpace ? <SpaceSheet bp={paper} n={spaceN} total={total} /> : null}
      {hasPlacements ? <PlacementsSheet bp={paper} n={placementsN} total={total} /> : null}
      {hasVoice ? <VoiceSheet bp={paper} n={voiceN} total={total} /> : null}
      {showClosing ? <ClosingSheet bp={paper} n={total} total={total} stats={stats} /> : null}
    </div>
  );
}

// Small unused import guard to keep the AuraLogo bundle side effect stable.
void AuraLogo;