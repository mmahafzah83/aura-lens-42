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
  withLatin,
} from "./AuraPaper";
import { pt, arStyle, arabicDate, detectPaperLang, quote, type PaperLang } from "@/components/report/paperText";
import { lastSentenceEnd } from "@/lib/buildBrandPaper";
import { AuraLogo } from "@/components/brand/AuraLogo";
import { normaliseBrandPaper, type BrandPaper } from "@/lib/buildBrandPaper";

const SHEET_W = 794;
const SHEET_H = 1123;
const PAGE_PAD = 56;
export const PAPER_TITLE = "The KnownBy Paper № 00";

/** Trim to the last full sentence inside the cap — sheets do not reflow.
 *  With no sentence boundary, cut at the last word boundary and close it off
 *  so a capped line never reads as a hanging clause. */
function capAtSentence(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  const slice = s.slice(0, max);
  const cut = lastSentenceEnd(slice);
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

/** Fixed text: the English literal stays exactly as before; Arabic reads paper.*. */
const L = (lang: PaperLang, key: string, english: string): string =>
  lang === "ar" ? pt(lang, key) : english;

/** Arabic title with the accent colour on the words after `split`, never italic. */
function AccentTail({ text, split }: { text: string; split: string }) {
  const i = text.indexOf(split);
  if (i === -1) return <>{text}</>;
  return <>{text.slice(0, i + split.length)}<span style={{ color: T.spot }}>{text.slice(i + split.length)}</span></>;
}

/** Brand-paper footer: the paper's own title, no product descriptor line. */
function Footer({ n, total, lang }: { n: number; total: number; lang: PaperLang }) {
  return (
    <PaperFooter
      n={n}
      total={total}
      lang={lang}
      showDescriptor={false}
      paperTitle={lang === "ar" ? pt(lang, "paper.title") : PAPER_TITLE}
    />
  );
}

function Sheet({ n, children, bleed, lang = "en" }: { n: number; children: React.ReactNode; bleed?: boolean; lang?: PaperLang }) {
  return (
    <div
      dir={lang === "ar" ? "rtl" : undefined}
      lang={lang === "ar" ? "ar" : undefined}
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
        letterSpacing: lang === "ar" ? 0 : "normal",
      }}
    >
      {children}
    </div>
  );
}

function todayLabel(iso: string, lang: PaperLang = "en"): string {
  if (lang === "ar") return arabicDate(iso);
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return ""; }
}

// Archetype presentation: italicise the final word in --spot.
function ArchetypeTitle({ name, size = 64, lang = "en" }: { name: string; size?: number; lang?: PaperLang }) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const tail = parts.pop() || "";
  const head = parts.join(" ");
  return (
    <h1
      style={{
        ...arStyle(lang, {
          fontFamily: FONT.serif,
          fontSize: lang === "ar" ? 52 : size,
          fontWeight: 400,
          lineHeight: 1.04,
          color: T.ink,
          margin: 0,
          letterSpacing: "-0.01em",
        }),
        ...txt(trimmed),
      }}
    >
      {head ? <>{head}{" "}</> : null}
      <span style={{ fontStyle: lang === "ar" ? "normal" : "italic", color: T.spot }}>{tail}</span>
    </h1>
  );
}

function MonoLabel({ children, color = T.ink3, size = 10.5, lang = "en" }:
  { children: React.ReactNode; color?: string; size?: number; lang?: PaperLang }) {
  return (
    <div style={arStyle(lang, {
      fontFamily: FONT.mono, fontSize: size, fontWeight: 700,
      letterSpacing: "0.16em", textTransform: "uppercase", color,
    })}>{children}</div>
  );
}

function LegendCell({ swatch, title, body, border, lang = "en" }:
  { swatch: string; title: string; body: string; border?: boolean; lang?: PaperLang }) {
  return (
    <div style={{ padding: "14px 14px", borderInlineStart: border ? `1px solid ${T.rule}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span aria-hidden style={{ display: "inline-block", width: 16, height: 16, background: swatch }} />
        <span style={arStyle(lang, {
          fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
        })}>{title}</span>
      </div>
      <div style={arStyle(lang, { fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.5, color: T.ink2 })}>{body}</div>
    </div>
  );
}

function MetaCell({ label, value, sub, lang = "en" }: { label: string; value: string; sub?: string; lang?: PaperLang }) {
  return (
    <div>
      <MonoLabel lang={lang}>{label}</MonoLabel>
      <div style={{ ...arStyle(lang, { fontFamily: FONT.serif, fontSize: 17, color: T.ink, lineHeight: 1.3, marginTop: 6 }), ...txt(value) }}>{value}</div>
      {sub ? (
        <div style={{ ...arStyle(lang, { fontFamily: FONT.mono, fontSize: 11, color: T.ink3, marginTop: 3, letterSpacing: "0.06em" }), ...txt(sub) }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── Sheet 1 — Cover ────────────────────────────────────────────────────
function CoverSheet({ bp, total, lang }: { bp: BrandPaper; total: number; lang: PaperLang }) {
  const first = bp.profile.first_name || "";
  const last = bp.profile.last_name || "";
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  const level = bp.profile.level || "";
  const archetype = bp.primary_archetype || (lang === "ar" ? pt(lang, "paper.positionFallback") : "Your Position");
  const lede = bp.natural_tone || (bp.market_read ? bp.market_read.split(/(?<=\.)\s+/)[0] : "");
  // A legend is a key to a map. Only name the classes of content this paper
  // actually carries — and if it carries none of them, drop the block.
  const hasFinding = buildFindings(bp, lang).length > 0;
  const hasMovement = !!(bp.uncontested_space || bp.topics.length > 0 || bp.capabilities.length > 0);
  const hasAction = bp.invest_next.length > 0;
  const legendCount = [hasFinding, hasMovement, hasAction].filter(Boolean).length;

  return (
    <Sheet n={1} lang={lang}>
      <PaperHeader lang={lang} label={lang === "ar" ? pt(lang, "paper.brand") as string : "The KnownBy Paper"} />
      <div style={{ marginTop: 34, flex: 1, display: "flex", flexDirection: "column" }}>
        <MonoLabel color={T.spot} size={13} lang={lang}>
          {lang === "ar"
            ? withLatin(`${pt(lang, "paper.title")} · ${pt(lang, "paper.cover.kicker")}`, lang)
            : <>{PAPER_TITLE.replace(" №", " · №")} · The Read Finds You To Be</>}
        </MonoLabel>
        <div style={{ marginTop: 22 }}>
          <ArchetypeTitle name={archetype} lang={lang} />
        </div>
        {lede ? (
          <p style={lang === "ar" ? { ...arStyle(lang, {
            fontFamily: FONT.serif, fontSize: 18, lineHeight: 1.55, color: T.ink2,
            margin: "22px 0 0", maxWidth: 560 }), ...txt(lede) } : {
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
              ...arStyle(lang, {
                fontFamily: FONT.serif, fontStyle: "italic", fontSize: 20,
                color: T.paper, lineHeight: 1.35, flex: 1,
              }),
              ...txt(bp.positioning_statement),
            }}>
              {quote(lang, bp.positioning_statement)}
            </span>
            <span style={arStyle(lang, {
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: "#FFFFFF", whiteSpace: "nowrap",
            })}>{lang === "ar" ? pt(lang, "paper.oneLine") : "Your position, in one line"}</span>
          </div>
        ) : null}

        {/* Reading legend — only for content that exists */}
        {legendCount > 0 ? (
        <div style={{
          marginTop: 34, border: `1.5px solid ${T.ink}`, background: T.paper2,
        }}>
          <div style={arStyle(lang, {
            padding: "10px 14px", borderBottom: `1px solid ${T.rule}`,
            fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
          })}>
            {lang === "ar" ? pt(lang, `paper.legend.${legendCount}`) : legendCount === 1
              ? "How to read this paper — one colour, one meaning"
              : `How to read this paper — ${spellCount(legendCount).toLowerCase()} colours, ${spellCount(legendCount).toLowerCase()} meanings`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${legendCount}, 1fr)` }}>
            {hasFinding ? (
              <LegendCell lang={lang} swatch={T.spot} title={L(lang, "paper.legend.finding", "Finding")} body={L(lang, "paper.legend.findingBody", "A conclusion drawn from your answers.")} />
            ) : null}
            {hasMovement ? (
              <LegendCell lang={lang} swatch={T.live} title={L(lang, "paper.legend.movement", "Movement")} body={L(lang, "paper.legend.movementBody", "Something live and rising in your positioning.")} border={hasFinding} />
            ) : null}
            {hasAction ? (
              <LegendCell lang={lang} swatch="var(--a-500)" title={L(lang, "paper.legend.action", "Action")} body={L(lang, "paper.legend.actionBody", "Held by you, unclaimed — the next move.")} border={hasFinding || hasMovement} />
            ) : null}
          </div>
        </div>
        ) : null}

        {/* Meta grid */}
        <div style={{
          marginTop: 34, paddingTop: 14, borderTop: `1px solid ${T.rule}`,
          display: "grid", gridTemplateColumns: fullName ? "1fr 1fr 1fr" : "1fr 1fr", gap: 20,
        }}>
          {fullName ? <MetaCell lang={lang} label={L(lang, "paper.preparedFor", "Prepared for")} value={fullName} sub={level} /> : null}
          <MetaCell lang={lang} label={L(lang, "paper.secondary", "Secondary read")} value={bp.secondary_archetype || ""} />
          <MetaCell lang={lang} label={L(lang, "paper.issued", "Issued")} value={todayLabel(bp.generated_at, lang)} sub={L(lang, "paper.edition", "Edition 0 · Your read")} />
        </div>
      </div>
      <Footer n={1} total={total} lang={lang} />
    </Sheet>
  );
}

// ── Sheet 2 — Findings ─────────────────────────────────────────────────
interface Finding { code: string; source: string; body: string }

function FindingRow({ f, lang }: { f: Finding; lang: PaperLang }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "56px 1fr",
      borderTop: `1px solid ${T.rule}`, padding: "18px 0",
    }}>
      <div>
        <div style={arStyle(lang, {
          fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
          letterSpacing: "0.08em", color: T.spot,
        })}>{f.code}</div>
      </div>
      <div>
        <div style={arStyle(lang, {
          fontFamily: FONT.mono, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase", color: T.ink3,
          marginBottom: 6,
        })}>{f.source}</div>
        <div style={{
          ...arStyle(lang, { fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.55, color: T.ink }),
          ...txt(f.body),
        }}>{f.body}</div>
      </div>
    </div>
  );
}

/** The private panel — it lives on Sheet 2 unless the findings crowd it out. */
function GapPanel({ bp, style, lang }: { bp: BrandPaper; style?: React.CSSProperties; lang: PaperLang }) {
  if (!bp.the_gap && !bp.own_words_quote) return null;
  return (
    <div style={{ padding: 20, background: T.paper2, border: `1px solid ${T.rule}`, ...style }}>
      <MonoLabel color={T.spot} size={10.5} lang={lang}>{L(lang, "paper.onlyYou", "Only you see this")}</MonoLabel>
      <h3 style={arStyle(lang, {
        fontFamily: FONT.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.2,
        color: T.ink, margin: "8px 0 0",
      })}>{L(lang, "paper.gap", "The gap")}</h3>
      {bp.the_gap ? (
        <p style={{ ...arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink2,
          margin: "10px 0 0" }), ...txt(bp.the_gap),
        }}>{bp.the_gap}</p>
      ) : null}
      {bp.own_words_quote ? (
        <p style={{ ...arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink,
          fontStyle: "italic", margin: "14px 0 0" }), ...txt(bp.own_words_quote),
          ...(lang === "ar" ? { fontStyle: "normal" as const } : {}),
        }}>{quote(lang, bp.own_words_quote)}</p>
      ) : null}
      {bp.own_words_read ? (
        <p style={{ ...arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.6, color: T.ink2,
          margin: "8px 0 0" }), ...txt(bp.own_words_read),
        }}>{bp.own_words_read}</p>
      ) : null}
    </div>
  );
}

/** Spelled counts, so a heading can never promise more rows than exist. */
const spellCount = (n: number) =>
  ["No", "One", "Two", "Three", "Four", "Five", "Six"][n] ?? String(n);

function buildFindings(bp: BrandPaper, lang: PaperLang = "en"): Finding[] {
  const code = (n: number) => pt(lang, "paper.findingCode", { n });
  const raw: (Finding | null)[] = [
    bp.market_read ? {
      code: code(1), body: bp.market_read,
      source: pt(lang, "paper.source1"),
    } : null,
    bp.trust_pattern ? {
      code: code(2), body: bp.trust_pattern,
      source: pt(lang, "paper.source2"),
    } : null,
    bp.unique_capability ? {
      code: code(3), body: bp.unique_capability,
      source: pt(lang, "paper.source3"),
    } : null,
    bp.honest_truth ? {
      code: code(4), body: bp.honest_truth,
      source: pt(lang, "paper.source4"),
    } : null,
  ];
  return raw.filter((f): f is Finding => f !== null);
}

function FindingsSheet({ bp, n, total, lang }: { bp: BrandPaper; n: number; total: number; lang: PaperLang }) {
  const findings = buildFindings(bp, lang);
  // An empty sheet is worse than no sheet.
  if (findings.length === 0) return null;

  return (
    <Sheet n={n} lang={lang}>
      <PaperHeader lang={lang} label={L(lang, "paper.findings", "Findings")} />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11} lang={lang}>{L(lang, "paper.chapter1", "Chapter 01")}</MonoLabel>
        <h2 style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        })}>
          {lang === "ar" ? (
            <AccentTail text={pt(lang, `paper.findingsTitle.${findings.length}`)} split="، " />
          ) : (
            <>
              {spellCount(findings.length)} {findings.length === 1 ? "finding" : "findings"},{" "}
              <span style={{ fontStyle: "italic", color: T.spot }}>evidenced</span>
            </>
          )}
        </h2>
        <p style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 20px", maxWidth: 560,
        })}>
          {lang === "ar" ? pt(lang, "paper.findingsLede") : <>Each row is a conclusion drawn from your own record. The tag under each
          finding names the evidence path it followed.</>}
        </p>
        <div style={{ borderBottom: `1px solid ${T.rule}` }}>
          {findings.map((f) => <FindingRow key={f.code} f={f} lang={lang} />)}
        </div>
        {/* The gap panel always lives at the top of Sheet 3 — never here. */}
      </div>
        <Footer n={n} total={total} lang={lang} />
    </Sheet>
  );
}

// ── Sheet 3 — Space + topics ───────────────────────────────────────────
function TopicBlock({ n, title, description, lang }: { n: string; title: string; description: string; lang: PaperLang }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 1fr",
      borderTop: `1px solid ${T.rule}`, padding: "16px 0", gap: 16,
    }}>
      <div style={{
        background: T.ink, color: T.paper,
        fontFamily: FONT.mono, fontSize: 18, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 46, letterSpacing: lang === "ar" ? 0 : "0.04em",
      }}>{n}</div>
      <div>
        <div style={{ ...arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 20, color: T.ink,
          lineHeight: 1.25, marginBottom: 6, letterSpacing: "-0.005em" }), ...txt(title),
        }}>{title}</div>
        {description ? (
          <div style={{ ...arStyle(lang, { fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.55 }), ...txt(description) }}>
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

function SpaceSheet({ bp, n, total, lang }: { bp: BrandPaper; n: number; total: number; lang: PaperLang }) {
  const hasInvest = bp.invest_next.length > 0;
  // Older rows carry pillars but no structured topics — fall back so the
  // topics block is never silently empty.
  const topics = bp.topics.length > 0
    ? bp.topics
    : bp.content_pillars.slice(0, 3).map((t) => ({ title: t, description: "" }));
  // A sheet with nothing on it is never printed.
  if (!spaceSheetHasContent(bp)) return null;
  return (
    <Sheet n={n} lang={lang}>
      <PaperHeader lang={lang} label={L(lang, "paper.groundTopics", "Ground & Topics")} />
      <div style={{ marginTop: 30, flex: 1 }}>
        <GapPanel bp={bp} style={{ marginBottom: 24 }} lang={lang} />
        {bp.uncontested_space ? (
          <PaperFigure
            lang={lang}
            index={1}
            label={L(lang, "paper.uncontested", "The Uncontested Ground")}
            findingBold={L(lang, "paper.uncontestedBold", "Finding —")}
            findingRest={L(lang, "paper.uncontestedRest", "the space above is yours to occupy first.")}
          >
            <p style={{ ...arStyle(lang, {
              fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.6,
              color: T.ink, margin: 0 }), ...txt(bp.uncontested_space),
            }}>{bp.uncontested_space}</p>
          </PaperFigure>
        ) : null}

        {topics.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <MonoLabel color={T.spot} size={11} lang={lang}>
              {L(lang, "paper.writeAbout", "What you write about")}
            </MonoLabel>
            <div style={{ marginTop: 10, borderBottom: `1px solid ${T.rule}` }}>
              {topics.slice(0, 3).map((t, i) => (
                <TopicBlock
                  key={i}
                  n={String(i + 1).padStart(2, "0")}
                  title={t.title}
                  description={t.description}
                  lang={lang}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasInvest ? (
          <div style={{ marginTop: 24, background: T.paper2, border: `1.5px solid ${T.ink}` }}>
            <div style={arStyle(lang, {
              padding: "10px 14px", borderBottom: `1px solid ${T.rule}`,
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
            })}>{L(lang, "paper.investNext", "Where to invest next")}</div>
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
                  <div style={{ ...arStyle(lang, {
                    fontFamily: FONT.mono, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
                    marginBottom: 4,
                  }), ...txt(x.area), ...(isAr(x.area) ? { letterSpacing: 0, textTransform: "none" as const } : {}) }}>{x.area}</div>
                  {x.insight ? (
                    <div style={{ ...arStyle(lang, { fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.55 }), ...txt(x.insight) }}>
                      {x.insight}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Footer n={n} total={total} lang={lang} />
    </Sheet>
  );
}


// ── Sheet 4 — Voice, trust, pillars, what to strengthen (SLICE 4d) ──────
function ProsePair({ label, parts, lang }: { label: string; parts: (string | null)[]; lang: PaperLang }) {
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
      <MonoLabel color={T.spot} size={10.5} lang={lang}>{label}</MonoLabel>
      {shown.map((x, i) => (
        <p
          key={i}
          style={{ ...arStyle(lang, {
            fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: T.ink2,
            margin: i === 0 ? "8px 0 0" : "8px 0 0" }), ...txt(x),
          }}
        >
          {x}
        </p>
      ))}
    </div>
  );
}

function PaperChips({ label, items, lang }: { label: string; items: string[]; lang: PaperLang }) {
  if (items.length === 0) return null;
  return (
    <div style={{ borderTop: `1px solid ${T.rule}`, padding: "16px 0" }}>
      <MonoLabel color={T.spot} size={10.5} lang={lang}>{label}</MonoLabel>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
        {items.map((t, i) => (
          <span
            key={i}
            style={{ ...arStyle(lang, {
              fontFamily: FONT.serif, fontSize: 13.5, color: T.ink,
              display: "inline-block", boxSizing: "border-box",
              padding: "6px 12px", border: `1px solid ${T.rule}`, background: T.paper2,
              lineHeight: 1.35, maxWidth: 600, whiteSpace: "normal" }), ...txt(t),
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

function VoiceSheet({ bp, n, total, lang }: { bp: BrandPaper; n: number; total: number; lang: PaperLang }) {
  return (
    <Sheet n={n} lang={lang}>
      <PaperHeader lang={lang} label={L(lang, "paper.voiceGround", "Voice & Ground")} />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11} lang={lang}>{L(lang, "paper.chapter2", "Chapter 02")}</MonoLabel>
        <h2 style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        })}>
          {lang === "ar"
            ? <AccentTail text={pt(lang, "paper.voiceTitle")} split="، " />
            : <>How you sound, <span style={{ fontStyle: "italic", color: T.spot }}>and stand</span></>}
        </h2>
        <p style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 14px", maxWidth: 560,
        })}>
          {lang === "ar" ? pt(lang, "paper.voiceLede") : <>The voice the market already hears from you, the ground you hold, and
          the parts worth strengthening next.</>}
        </p>
        {/* natural_tone is the cover's lede — saying it twice reads as padding. */}
        <ProsePair lang={lang} label={L(lang, "paper.howSound", "How you sound")} parts={[bp.voice_signature]} />
        <ProsePair lang={lang} label={L(lang, "paper.howTrust", "How you build trust")} parts={[bp.trust_pattern, bp.authority_style]} />
        <ProsePair lang={lang} label={L(lang, "paper.strongest", "Where you are strongest")} parts={[bp.zone_of_genius]} />
        <PaperChips lang={lang} label={L(lang, "paper.pillars", "Your content pillars")} items={bp.content_pillars} />
        <PaperChips lang={lang} label={L(lang, "paper.strengthen", "Areas to strengthen")} items={bp.growth_areas} />
        <ProsePair lang={lang} label={L(lang, "paper.holdingBack", "What is holding you back")} parts={[bp.key_barrier]} />
      </div>
      <Footer n={n} total={total} lang={lang} />
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
function PlacementsSheet({ bp, n, total, lang }: { bp: BrandPaper; n: number; total: number; lang: PaperLang }) {
  if (bp.capabilities.length === 0) return null;
  return (
    <Sheet n={n} lang={lang}>
      <PaperHeader lang={lang} label={L(lang, "paper.placements", "Your own placements")} />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11} lang={lang}>{L(lang, "paper.ownWords", "In your own words")}</MonoLabel>
        <h2 style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        })}>
          {lang === "ar"
            ? <>أين وضعت <span style={{ color: T.spot }}>نفسك</span></>
            : <>Where you placed <span style={{ fontStyle: "italic", color: T.spot }}>yourself</span></>}
        </h2>
        <p style={arStyle(lang, {
          fontFamily: FONT.serif, fontSize: 15, color: T.ink2, lineHeight: 1.55,
          margin: "0 0 22px", maxWidth: 560,
        })}>
          {lang === "ar" ? pt(lang, "paper.placedLede") : <>These are the placements you made yourself, in the words you were given.
          They are not scores and they are not grades — nobody marked you. They
          record where you put yourself on the day you answered.</>}
        </p>
        <CapabilityDotPlot data={bp.capabilities} lang={lang} />
      </div>
      <Footer n={n} total={total} lang={lang} />
    </Sheet>
  );
}

function ClosingSheet({ bp, n, total, stats, lang }: {
  bp: BrandPaper; n: number; total: number; stats?: PaperStats | null; lang: PaperLang;
}) {
  const archetype = bp.primary_archetype || L(lang, "paper.positionFallback", "Your Position");
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
  const ar = lang === "ar";
  const ninety = named(1) || (bp.key_barrier
    ? (ar ? pt(lang, "paper.moveDecide", { barrier: bp.key_barrier }) : `Decide: ${bp.key_barrier}`) : "");
  const moves = [
    firstTopic ? { horizon: ar ? pt(lang, "paper.h30") : "30d", text: ar ? pt(lang, "paper.move30", { topic: firstTopic }) : `Publish once from "${firstTopic}"` } : null,
    sixty ? { horizon: ar ? pt(lang, "paper.h60") : "60d", text: sixty } : null,
    ninety ? { horizon: ar ? pt(lang, "paper.h90") : "90d", text: ninety } : null,
  ].filter((m): m is { horizon: string; text: string } => !!m)
    .map((m) => ({ horizon: m.horizon, text: capAtSentence(m.text, 180) }));
  // No fabricated ReportData and no hardcoded null pretending to be a score.
  // The plate takes the member's name directly and only the counts we hold.
  const personName = [bp.profile.first_name, bp.profile.last_name]
    .filter(Boolean).join(" ").trim() || null;

  return (
    <Sheet n={n} bleed lang={lang}>
      <ClosingPlate
        lang={lang}
        personName={personName}
        evidenceCount={stats?.evidence ?? null}
        activeSignals={stats?.signals ?? null}
        headline={
          <>
            {head ? <>{head} </> : null}
            <span style={{ fontStyle: ar ? "normal" : "italic", color: T.action }}>{tail}</span>
          </>
        }
        body={bp.positioning_statement || undefined}
        moves={moves.length ? moves : undefined}
        paperTitle={ar ? pt(lang, "paper.title") : PAPER_TITLE}
        pageLine={ar
          ? pt(lang, "paper.pageLine", { n: String(n).padStart(2, "0"), total: String(total).padStart(2, "0") })
          : `Page ${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
        ctaLabel={ar ? pt(lang, "paper.cta") : "Find your position ↗"}
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
  // One language for every sheet: the language the report was written in.
  const lang = detectPaperLang(paper);
  const hasVoice = voiceSheetHasContent(paper);
  // A findings sheet with no findings is dropped, so the sheet count follows.
  const hasFindings = buildFindings(paper, lang).length > 0;
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
      <CoverSheet bp={paper} total={total} lang={lang} />
      {hasFindings ? <FindingsSheet bp={paper} n={findingsN} total={total} lang={lang} /> : null}
      {hasSpace ? <SpaceSheet bp={paper} n={spaceN} total={total} lang={lang} /> : null}
      {hasPlacements ? <PlacementsSheet bp={paper} n={placementsN} total={total} lang={lang} /> : null}
      {hasVoice ? <VoiceSheet bp={paper} n={voiceN} total={total} lang={lang} /> : null}
      {showClosing ? <ClosingSheet bp={paper} n={total} total={total} stats={stats} lang={lang} /> : null}
    </div>
  );
}

// Small unused import guard to keep the AuraLogo bundle side effect stable.
void AuraLogo;