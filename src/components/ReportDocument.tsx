// W2-G-2a — Strategic Identity Report document ("The Aura Paper № 01").
// Pure render from ReportData (built by @/lib/buildIdentityReport).
// Each section gates on its null flag; whole pages omitted if empty.
//
// Colours are System-A tokens only (var(--x)); SVG attributes mirror the
// same tokens. Chrome + figures come from ./report/AuraPaper. The
// measure-then-pack paginator and the [data-report-page] attribute are
// preserved verbatim — Settings.tsx html2canvas relies on both.

import { rankFromLevel } from "@/lib/marketPersonas";
import { formatSkillLabel } from "@/lib/formatSkillLabel";
import type { ReportData, CapabilitiesSection } from "@/lib/buildIdentityReport";
import CvCrosscheck, { hasCvCrosscheck } from "@/components/report/CvCrosscheck";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSeniorityTitles, titleLabel, type SeniorityTitle } from "@/lib/seniorityTitles";
import { attachCapabilityNamesAr, type CapabilityNameRow } from "@/lib/buildBrandPaper";
import { pt, arStyle, arabicDate, reportLang, type PaperLang } from "@/components/report/paperText";
import { reportOverflowingSheets } from "@/components/report/BrandPaperDocument";
import {
  PaperHeader,
  PaperFooter,
  PaperCover,
  PaperFigure,
  ImprintDial,
  ComponentBar,
  ImprintSparkline,
  CapabilityDotPlot,
  PaperPersonaCard,
  ClosingPlate,
  useImprintDelta,
  valStyle,
  valDir,
  withLatin,
  T,
  FONT,
} from "@/components/report/AuraPaper";

/** Fixed text: Arabic from the locale file, English exactly as written. */
const L = (lang: PaperLang, key: string, english: string, vars?: Record<string, string | number>) =>
  lang === "ar" ? pt(lang, key, vars) : english;
const shortDate = (iso: string, lang: PaperLang) =>
  lang === "ar" ? arabicDate(iso) : new Date(iso).toLocaleDateString("en-GB");

// ── Layout constants ───────────────────────────────────────────────────
const SHEET_W = 794;   // A4 @ 96dpi
const SHEET_H = 1123;  // A4 @ 96dpi
const PAGE_PAD = 56;

// ── Bidi helpers (Arabic shaping in raster export) ─────────────────────
const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function hasArabic(s: string | null | undefined): boolean {
  return !!s && AR_RE.test(s);
}
function renderBidi(value: string): React.ReactNode {
  if (!hasArabic(value)) return value;
  const parts: React.ReactNode[] = [];
  const RUN = /([A-Za-z][A-Za-z0-9 '’"“”\-\.,;:!\?\(\)&/]{0,400}[A-Za-z0-9\.\?!"”\)])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = RUN.exec(value)) !== null) {
    if (m.index > last) parts.push(value.slice(last, m.index));
    parts.push(<bdi key={`b${i++}`}>{m[0]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < value.length) parts.push(value.slice(last));
  return parts;
}
function stripParenTail(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
function todayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return ""; }
}

// ── Sheet chassis ──────────────────────────────────────────────────────
function Sheet({ children, bleed, lang = "en", page }: { children: React.ReactNode; bleed?: boolean; lang?: PaperLang; page?: number }) {
  return (
    <div
      className="aura-report-sheet"
      data-report-page
      data-page={page}
      dir={lang === "ar" ? "rtl" : undefined}
      lang={lang === "ar" ? "ar" : undefined}
      data-theme="light"
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

function SectionLabel({ children, lang = "en" }: { children: React.ReactNode; lang?: PaperLang }) {
  return (
    <div
      style={arStyle(lang, {
        fontFamily: FONT.mono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: T.spot,
        marginBottom: 12,
      })}
    >
      {children}
    </div>
  );
}

// ── Block sub-renderers ────────────────────────────────────────────────
function SectionTitle({ title, kicker, lang = "en" }: { title: string; kicker?: string; lang?: PaperLang }) {
  return (
    <div>
      {kicker ? (
        <div style={valStyle(lang, { fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.spot, fontWeight: 700, marginBottom: 8 }, lang === "ar" && !/[A-Za-z]/.test(kicker) ? kicker : null)}>
          {lang === "ar" ? <span dir={valDir(lang, kicker)} style={{ unicodeBidi: "isolate" }}>{kicker}</span> : kicker}
        </div>
      ) : null}
      <h2 style={arStyle(lang, { fontFamily: FONT.serif, fontSize: 34, fontWeight: 500, margin: 0, color: T.ink, lineHeight: 1.15 })}>
        {withLatin(title, lang)}
      </h2>
    </div>
  );
}

function ImprintFigure({ score, userId, generatedAt, lang = "en" }: {
  score: NonNullable<ReportData["score"]>;
  userId: string;
  generatedAt: string;
  lang?: PaperLang;
}) {
  const c = score.components;
  const ar = lang === "ar";
  return (
    <PaperFigure
      lang={lang}
      index={1}
      label={ar ? (withLatin(pt(lang, "report.doc.imprintInstrument"), lang) as unknown as string) : "The Imprint Instrument"}
      meta={shortDate(score.snapshot_at || generatedAt, lang)}
      findingBold={ar
        ? pt(lang, score.tier ? "report.doc.standingTier" : "report.doc.standing", { score: score.score, tier: score.tier || "" })
        : `Your standing is at ${score.score} of 100${score.tier ? " · " + score.tier + " tier" : ""}.`}
      findingRest={L(lang, "report.doc.weighting", "Weighting: Signal 40 · Content 40 · Consistency 20.")}
    >
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 30, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <ImprintDial score={score.score} tier={score.tier} lang={lang} />
          <ImprintSparkline userId={userId} lang={lang} />
        </div>
        <div>
          <ComponentBar lang={lang} label={L(lang, "report.doc.signal", "Signal")}      weight={40} value={c.signal}  weighted={c.signal_weighted} />
          <ComponentBar lang={lang} label={L(lang, "report.doc.content", "Content")}     weight={40} value={c.content} weighted={c.content_weighted} />
          <ComponentBar lang={lang} label={L(lang, "report.doc.consistency", "Consistency")} weight={20} value={c.capture} weighted={c.capture_weighted} isConsistency />
        </div>
      </div>
    </PaperFigure>
  );
}

function ProfileGrid({ items, lang = "en" }: { items: { label: string; value: string }[]; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
        {items.map((it) => (
          <div key={it.label}>
            <div style={valStyle(lang, { fontFamily: FONT.mono, fontSize: 10.5, color: T.spot, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }, it.label)}>
              {it.label}
            </div>
            <div style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 15, color: T.ink }, it.value)}>
              <span dir={valDir(lang, it.value)} style={{ unicodeBidi: "isolate" }}>{it.value}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: T.spot, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
            {it.label}
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: 15, color: T.ink }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function GoalRow({ g, i, lang }: { g: string; i: number; lang: PaperLang }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.rule}` }}>
      <span dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 12, color: T.spot, minWidth: 26, fontWeight: 700, unicodeBidi: "isolate" }}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <span dir={valDir(lang, g)} style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 15, color: T.ink }, g)}>{g}</span>
    </div>
  );
}

function NorthStarBlock({ goals }: { goals: string[] }) {
  return (
    <div>
      <SectionLabel>North Star</SectionLabel>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {goals.map((g, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 0",
              borderBottom: `1px solid ${T.rule}`,
              fontFamily: FONT.serif,
              fontSize: 15,
              color: T.ink,
            }}
          >
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.spot, minWidth: 26, fontWeight: 700 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{g}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PillarsBlock({ pillars, lang = "en" }: { pillars: string[]; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div>
        <SectionLabel lang={lang}>{pt(lang, "report.doc.pillars")}</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {pillars.map((p) => (
            <span key={p} dir={valDir(lang, p)} style={valStyle(lang, { padding: "6px 12px", fontFamily: FONT.mono, fontSize: 11, color: T.ink, background: T.paper2, border: `1px solid ${T.rule}`, fontWeight: 700 }, p)}>
              {p}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <SectionLabel>Brand Pillars</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {pillars.map((p) => (
          <span
            key={p}
            style={{
              padding: "6px 12px",
              fontFamily: FONT.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.ink,
              background: T.paper2,
              border: `1px solid ${T.rule}`,
              fontWeight: 700,
            }}
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function CapabilityFigure({ data }: { data: CapabilitiesSection }) {
  const assessed = data.filter((c) => (c.score ?? 0) > 0);
  const top = assessed.slice().sort((a, b) => b.score - a.score)[0];
  return (
    <PaperFigure
      index={2}
      label="Capability Distribution"
      meta={`${assessed.length} dimensions rated`}
      findingBold={top ? `${top.name} leads at ${top.score}.` : "Capability signal is partial."}
      findingRest="Elite band (70–100) shaded teal; hollow dots mark gaps under 50."
    >
      <CapabilityDotPlot data={assessed} />
    </PaperFigure>
  );
}

function IntelSummary({ text, lang = "en" }: { text: string; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div dir={valDir(lang, text)} style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 17, color: T.ink2, lineHeight: 1.55, borderInlineStart: `2px solid ${T.spot}`, paddingInlineStart: 14 }, text)}>
        {text}
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: FONT.serif,
        fontStyle: "italic",
        fontSize: 17,
        color: T.ink2,
        lineHeight: 1.55,
        borderLeft: `2px solid ${T.spot}`,
        paddingLeft: 14,
      }}
    >
      {text}
    </div>
  );
}

function ThemeCard({ t, lang = "en" }: { t: { theme: string; rationale: string }; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div style={{ padding: "12px 14px", border: `1px solid ${T.rule}`, borderInlineStart: `2px solid ${T.spot}`, background: T.paper2 }}>
        <div dir={valDir(lang, t.theme)} style={valStyle(lang, { fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 4 }, t.theme)}>
          {t.theme}
        </div>
        <div dir={valDir(lang, t.rationale)} style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.6 }, t.rationale)}>{t.rationale}</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${T.rule}`, borderLeft: `2px solid ${T.spot}`, background: T.paper2 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {t.theme}
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.6 }}>{t.rationale}</div>
    </div>
  );
}

function ChipRow({ items, lang = "en" }: { items: string[]; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((e) => (
          <span key={e} dir={valDir(lang, e)} style={valStyle(lang, { padding: "5px 10px", fontFamily: FONT.mono, fontSize: 11, color: T.ink2, border: `1px solid ${T.rule}` }, e)}>
            {e}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((e) => (
        <span
          key={e}
          style={{
            padding: "5px 10px",
            fontFamily: FONT.mono,
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.ink2,
            border: `1px solid ${T.rule}`,
          }}
        >
          {e}
        </span>
      ))}
    </div>
  );
}

function TerritoriesBlock({ pillars, tags, lang = "en" }: { pillars?: string[]; tags: string[]; lang?: PaperLang }) {
  const hasPillars = !!pillars && pillars.length > 0;
  if (lang === "ar") {
    return (
      <div>
        <SectionLabel lang={lang}>{pt(lang, hasPillars ? "report.doc.territory" : "report.doc.territories")}</SectionLabel>
        {hasPillars ? (
          <div style={{ borderInlineStart: `2px solid ${T.spot}`, paddingInlineStart: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {pillars!.map((p) => (
              <div key={p} dir={valDir(lang, p)} style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 16, color: T.ink, lineHeight: 1.5 }, p)}>{p}</div>
            ))}
          </div>
        ) : (
          <ChipRow lang={lang} items={tags.map((t) => formatSkillLabel(t))} />
        )}
        {hasPillars && tags.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={arStyle(lang, { fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: T.ink3, marginBottom: 8 })}>
              {pt(lang, "report.doc.alsoTracking")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tags.map((t) => {
                const v = formatSkillLabel(t);
                return (
                  <span key={t} dir={valDir(lang, v)} style={valStyle(lang, { padding: "3px 8px", fontFamily: FONT.mono, fontSize: 10.5, color: T.ink2, border: `1px solid ${T.rule}` }, v)}>
                    {v}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  if (!hasPillars) {
    return (
      <div>
        <SectionLabel>Strategic Territories</SectionLabel>
        <ChipRow items={tags.map((t) => formatSkillLabel(t))} />
      </div>
    );
  }
  return (
    <div>
      <SectionLabel>Strategic Territory</SectionLabel>
      <div style={{ borderLeft: `2px solid ${T.spot}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {pillars!.map((p) => (
          <div key={p} style={{ fontFamily: FONT.serif, fontSize: 16, color: T.ink, lineHeight: 1.5 }}>
            {p}
          </div>
        ))}
      </div>
      {tags.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.ink3,
              marginBottom: 8,
            }}
          >
            Also tracking
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: "3px 8px",
                  fontFamily: FONT.mono,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: T.ink2,
                  border: `1px solid ${T.rule}`,
                }}
              >
                {formatSkillLabel(t)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PositioningBlock({ statement, lang = "en" }: { statement: string; lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div>
        <SectionLabel lang={lang}>{pt(lang, "report.doc.position")}</SectionLabel>
        <div dir={valDir(lang, statement)} style={valStyle(lang, { borderInlineStart: `2px solid ${T.spot}`, paddingInlineStart: 14, maxWidth: 576, fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.7, color: T.ink }, statement)}>
          {statement}
        </div>
      </div>
    );
  }
  return (
    <div>
      <SectionLabel>The Position</SectionLabel>
      <div
        style={{
          borderLeft: `2px solid ${T.spot}`,
          paddingLeft: 14,
          maxWidth: 576,
          fontFamily: FONT.serif,
          fontSize: 16,
          lineHeight: 1.7,
          color: T.ink,
        }}
      >
        {statement}
      </div>
    </div>
  );
}

function FootprintFigure({ fp, lang = "en" }: { fp: NonNullable<ReportData["footprint"]>; lang?: PaperLang }) {
  const items = [
    { n: fp.sources,  l: L(lang, "report.doc.fp.sources", "Sources captured") },
    { n: fp.evidence, l: L(lang, "report.doc.fp.evidence", "Evidence fragments") },
    { n: fp.signals,  l: L(lang, "report.doc.fp.signals", "Active strategic signals") },
    { n: fp.themes,   l: L(lang, "report.doc.fp.themes", "Themes owned") },
  ];
  return (
    <PaperFigure
      lang={lang}
      index={3}
      label={L(lang, "report.doc.fp.label", "Intelligence Footprint")}
      meta={L(lang, "report.doc.fp.meta", `${fp.sources} sources · ${fp.evidence} fragments`, { n: fp.sources, m: fp.evidence })}
      findingBold={L(lang, "report.doc.fp.bold", "Your record is what the paper reads from.")}
      findingRest={L(lang, "report.doc.fp.rest", "No inference beyond these counts.")}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {items.map((s, i) => (
          <div key={i} style={{ padding: "16px 12px", border: `1px solid ${T.rule}`, background: T.paper, textAlign: "center" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 700, color: T.ink, lineHeight: 1.05 }}>{s.n}</div>
            <div style={arStyle(lang, { marginTop: 8, fontFamily: FONT.mono, fontSize: 10.5, color: T.ink3, letterSpacing: "0.12em", textTransform: "uppercase" })}>
              {s.l}
            </div>
          </div>
        ))}
      </div>
    </PaperFigure>
  );
}

function ContentEngineCard({ c, lang = "en" }: { c: NonNullable<ReportData["content"]>; lang?: PaperLang }) {
  return (
    <div style={{ border: `1.5px solid ${T.ink}`, background: T.paper2, padding: "14px 16px" }}>
      <SectionLabel lang={lang}>{L(lang, "report.doc.ce.title", "Content Engine")}</SectionLabel>
      <Row lang={lang} label={L(lang, "report.doc.ce.live", "Posts live on LinkedIn")} value={String(c.publishedCount)} />
      {c.frameworks[0] ? <Row lang={lang} label={L(lang, "report.doc.ce.lead", "Lead framework")} value={c.frameworks[0].framework_type} /> : null}
      {c.frameworks.length > 1 ? (
        <Row lang={lang} label={L(lang, "report.doc.ce.also", "Also using")} value={c.frameworks.slice(1, 4).map((f) => f.framework_type).join(lang === "ar" ? "، " : " · ")} />
      ) : null}
      <Row lang={lang} label={L(lang, "report.doc.ce.tracked", "Tracked posts")} value={String(c.trackedCount)} />
    </div>
  );
}

function Row({ label, value, lang = "en" }: { label: string; value: string; lang?: PaperLang }) {
  const ar = hasArabic(value);
  if (lang === "ar") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.rule}`, fontSize: 12 }}>
        <span style={arStyle(lang, { fontFamily: FONT.mono, fontSize: 11, color: T.ink3, fontWeight: 600 })}>{withLatin(label, lang)}</span>
        <span dir={valDir(lang, value)} style={{ ...valStyle(lang, { fontFamily: FONT.serif, fontSize: 14, color: T.ink, maxWidth: "60%" }, value), unicodeBidi: "isolate" }}>
          {ar ? renderBidi(value) : value}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.rule}`, fontSize: 12 }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: T.ink3, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: ar ? FONT.arabic : FONT.serif,
          fontSize: 14,
          color: T.ink,
          textAlign: "right",
          maxWidth: "60%",
          letterSpacing: ar ? "normal" : undefined,
        }}
        dir={ar ? "rtl" : "auto"}
        lang={ar ? "ar" : undefined}
      >
        {ar ? renderBidi(value) : value}
      </span>
    </div>
  );
}

function StackedRow({ label, value, lang = "en" }: { label: string; value: string; lang?: PaperLang }) {
  const ar = hasArabic(value);
  let arHead = value;
  let latinBlock: string | null = null;
  if (ar) {
    const LONG_LATIN = /[A-Za-z][A-Za-z0-9 '’"“”\-\.,;:!\?\(\)&/]{40,}[A-Za-z0-9\.\?!"”\)]/;
    const m = value.match(LONG_LATIN);
    if (m && typeof m.index === "number") {
      latinBlock = m[0];
      arHead = (value.slice(0, m.index) + value.slice(m.index + m[0].length))
        .replace(/\s+/g, " ")
        .replace(/\s*[:،,]\s*$/, "")
        .trim();
    }
  }
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.rule}` }} dir={ar ? "rtl" : undefined} lang={ar ? "ar" : undefined}>
      <div style={arStyle(lang, { fontFamily: FONT.mono, fontSize: 10.5, color: T.spot, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5, fontWeight: 700 })}>
        {label}
      </div>
      <div
        style={{
          fontFamily: ar ? FONT.arabic : FONT.serif,
          fontSize: 14,
          color: T.ink,
          lineHeight: ar ? 1.85 : 1.65,
          letterSpacing: ar ? (lang === "ar" ? 0 : "normal") : undefined,
        }}
        dir={ar ? "rtl" : "auto"}
        lang={ar ? "ar" : undefined}
      >
        {ar ? (arHead ? renderBidi(arHead) : null) : value}
      </div>
      {latinBlock ? (
        <div dir="ltr" lang="en" style={{ marginTop: 6, fontFamily: FONT.serif, fontStyle: lang === "ar" ? "normal" : "italic", fontSize: 13, color: T.ink2, lineHeight: 1.55 }}>
          {latinBlock}
        </div>
      ) : null}
    </div>
  );
}

function VoiceHeader({ lang = "en" }: { lang?: PaperLang }) {
  if (lang === "ar") {
    return (
      <div>
        <SectionLabel lang={lang}>{pt(lang, "report.doc.voice")}</SectionLabel>
        <div style={arStyle(lang, { fontFamily: FONT.serif, fontSize: 13, color: T.ink3, marginTop: -6 })}>{pt(lang, "report.doc.voiceSub")}</div>
      </div>
    );
  }
  return (
    <div>
      <SectionLabel>Voice Signature</SectionLabel>
      <div style={{ fontFamily: FONT.serif, fontSize: 13, color: T.ink3, lineHeight: 1.6, marginTop: -6 }}>
        Captured in the language of your primary voice
        <span style={{ margin: "0 6px", color: T.spot }}>·</span>
        <span style={{ fontFamily: FONT.arabic }} dir="rtl" lang="ar">بلغة صوتك الأساسي</span>
      </div>
    </div>
  );
}

function Next90Head({ lang }: { lang: PaperLang }) {
  return (
    <div>
      <SectionLabel lang={lang}>{L(lang, "report.doc.next90", "Where to Point the Next 90 Days")}</SectionLabel>
      <div style={arStyle(lang, { fontFamily: FONT.serif, fontSize: 13, color: T.ink3, lineHeight: 1.6, marginBottom: lang === "ar" ? 0 : 14 })}>
        {L(lang, "report.doc.next90Sub", "Gaps the market would notice — each one is a content move.")}
      </div>
    </div>
  );
}

function GapRow({ g, lang }: { g: string; lang: PaperLang }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.rule}` }}>
      <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, background: T.action, flexShrink: 0, marginTop: 6 }} />
      <span dir={valDir(lang, g)} style={valStyle(lang, { fontFamily: FONT.serif, fontSize: 15, color: T.ink, lineHeight: 1.6 }, g)}>{g}</span>
    </div>
  );
}

function Next90Block({ gaps }: { gaps: string[] }) {
  return (
    <div>
      <SectionLabel>Where to Point the Next 90 Days</SectionLabel>
      <div style={{ fontFamily: FONT.serif, fontSize: 13, color: T.ink3, lineHeight: 1.6, marginBottom: 14 }}>
        Gaps the market would notice — each one is a content move.
      </div>
      {gaps.map((g, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            padding: "10px 0",
            borderBottom: `1px solid ${T.rule}`,
            fontFamily: FONT.serif,
            fontSize: 15,
            color: T.ink,
            lineHeight: 1.6,
          }}
        >
          <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, background: T.action, flexShrink: 0, marginTop: 6 }} />
          <span>{g}</span>
        </div>
      ))}
    </div>
  );
}

function Footnotes({ score, footprint, lang = "en" }: { score: ReportData["score"]; footprint: ReportData["footprint"]; lang?: PaperLang }) {
  if (lang === "ar") {
    const sup = { fontFamily: FONT.mono, color: T.spot, fontWeight: 700, marginInlineEnd: 4 } as const;
    return (
      <div style={arStyle(lang, { marginTop: 24, paddingTop: 14, borderTop: `1.5px solid ${T.ink}`, fontFamily: FONT.serif, fontSize: 13, color: T.ink2, lineHeight: 1.7 })}>
        <div>
          <sup style={sup}>1</sup>
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>Imprint</span>
          {pt(lang, "report.doc.fn1").replace(/^Imprint/, "")}
          {score?.snapshot_at ? pt(lang, "report.doc.fnSnap", { date: arabicDate(score.snapshot_at) }) : ""}
        </div>
        {footprint ? (
          <div>
            <sup style={sup}>2</sup>
            {pt(lang, "report.doc.fn2", { n: footprint.sources, m: footprint.evidence })}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 14,
        borderTop: `1.5px solid ${T.ink}`,
        fontFamily: FONT.serif,
        fontSize: 13,
        color: T.ink2,
        lineHeight: 1.7,
      }}
    >
      <div>
        <sup style={{ fontFamily: FONT.mono, color: T.spot, fontWeight: 700, marginRight: 4 }}>1</sup>
        Imprint = Signal 40% + Content 40% + Consistency 20%
        {score?.snapshot_at ? ` · snapshot ${new Date(score.snapshot_at).toLocaleDateString("en-GB")}` : ""}
      </div>
      {footprint ? (
        <div>
          <sup style={{ fontFamily: FONT.mono, color: T.spot, fontWeight: 700, marginRight: 4 }}>2</sup>
          Built from {footprint.sources} sources and {footprint.evidence} evidence fragments in your vault.
        </div>
      ) : null}
    </div>
  );
}

// ── Measure-then-pack paginator (unchanged shape) ──────────────────────
type SectionKey = "identity" | "capability" | "market" | "footprint";
const SECTION_LABEL: Record<SectionKey, string> = {
  identity:   "Section I · Strategic Identity",
  capability: "Section II · Capability & Intelligence",
  market:     "Section III · Market Position",
  footprint:  "Section IV · Strategic Footprint",
};

interface Block {
  key: string;
  section: SectionKey;
  spacing: number;
  node: React.ReactNode;
  /** Arabic only: a title that must not end a sheet without its first block. */
  keepWithNext?: boolean;
}

const CONTENT_W = SHEET_W - 2 * PAGE_PAD; // 682
const HEADER_RESERVE = 60;
const FOOTER_RESERVE = 70; // taller footer w/ ticks + secondary row
const CONTENT_H = SHEET_H - 2 * PAGE_PAD - HEADER_RESERVE - FOOTER_RESERVE - 6;

// Law #111 / D97: the legacy ten capability dimensions are not in
// capability_dimensions. Do not render fabricated figures until the real
// map (derived from evidence per band) is wired.
const CAPABILITY_FIGURE_ENABLED = false;

function buildBlocks(d: ReportData, lang: PaperLang = "en"): Block[] {
  const ar = lang === "ar";
  const blocks: Block[] = [];
  const name = [d.profile?.first_name, d.profile?.last_name].filter(Boolean).join(" ").trim();

  // ── IDENTITY (post-cover) ────────────────────────────────────────────
  if (d.score) {
    blocks.push({
      key: "i-score",
      section: "identity",
      spacing: 8,
      node: <ImprintFigure score={d.score} userId={d.user_id} generatedAt={d.generated_at} lang={lang} />,
    });
  }
  // Full positioning statement — cover shows sentence 1 only; give the
  // complete 3-sentence text a proper home when it's meaningfully longer.
  if (d.positioning?.statement && d.positioning.statement.length > 200) {
    blocks.push({
      key: "i-position",
      section: "identity",
      spacing: 24,
      node: <PositioningBlock statement={d.positioning.statement} lang={lang} />,
    });
  }
  const p = d.profile;
  if (p) {
    const items: { label: string; value: string }[] = [];
    if (p.core_practice)  items.push({ label: L(lang, "report.doc.corePractice", "Core Practice"), value: p.core_practice });
    if (p.sector_focus)   items.push({ label: L(lang, "report.doc.sectorFocus", "Sector Focus"), value: p.sector_focus });
    if (p.years_experience_raw) items.push({ label: L(lang, "report.doc.experience", "Experience"), value: stripParenTail(p.years_experience_raw) });
    if (p.linkedin_handle) items.push({ label: "LinkedIn", value: `/in/${p.linkedin_handle.replace(/^\/?in\//, "")}` });
    if (items.length > 0) blocks.push({ key: "i-grid", section: "identity", spacing: 26, node: <ProfileGrid items={items} lang={lang} /> });
    const goals = p.north_star_goals ?? [];
    if (goals.length > 0) {
      if (ar) {
        // Arabic: one block per goal so a long list splits at a row, never mid-row.
        blocks.push({ key: "i-northstar", section: "identity", spacing: 24, keepWithNext: true, node: <SectionLabel lang={lang}>{pt(lang, "report.doc.northStar")}</SectionLabel> });
        goals.forEach((g, i) => blocks.push({ key: `i-northstar-${i}`, section: "identity", spacing: 0, node: <GoalRow g={g} i={i} lang={lang} /> }));
      } else {
        blocks.push({ key: "i-northstar", section: "identity", spacing: 24, node: <NorthStarBlock goals={goals} /> });
      }
    }
  }
  if (d.brand_position?.pillars.length)
    blocks.push({ key: "i-pillars", section: "identity", spacing: 22, node: <PillarsBlock pillars={d.brand_position.pillars} lang={lang} /> });

  // ── CAPABILITY ───────────────────────────────────────────────────────
  if (d.capabilities || d.profile_intelligence) {
    blocks.push({ key: "c-title", section: "capability", spacing: 20, keepWithNext: ar, node: <SectionTitle lang={lang} title={L(lang, "report.doc.capTitle", "Capability & Intelligence")} kicker={name || L(lang, "report.doc.capKicker", "Capability")} /> });
    if (CAPABILITY_FIGURE_ENABLED && d.capabilities && d.capabilities.length > 0) {
      blocks.push({ key: "c-radar", section: "capability", spacing: 18, node: <CapabilityFigure data={d.capabilities} /> });
    } else if (d.capabilities && d.capabilities.length > 0) {
      blocks.push({
        key: "c-radar-honest",
        section: "capability",
        spacing: 4,
        node: (
          <div style={arStyle(lang, { maxWidth: 576, fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.7, color: T.ink2 })}>
            {L(lang, "report.doc.capAbsent", "Your capability map is being rebuilt on the evidence behind each claim. It is deliberately absent here rather than estimated.")}
          </div>
        ),
      });
    }
    const intel = d.profile_intelligence;
    if (intel) {
      blocks.push({ key: "c-intel-label", section: "capability", spacing: 26, keepWithNext: ar, node: <SectionLabel lang={lang}>{ar ? withLatin(pt(lang, "report.doc.intel"), lang) : "Profile Intelligence"}</SectionLabel> });
      if (intel.identity_summary)
        blocks.push({ key: "c-intel-summary", section: "capability", spacing: 4, node: <IntelSummary text={intel.identity_summary} lang={lang} /> });
      if (intel.authority_themes.length > 0)
        intel.authority_themes.forEach((t, i) =>
          blocks.push({ key: `c-theme-${i}`, section: "capability", spacing: 10, node: <ThemeCard t={t} lang={lang} /> })
        );
      else if (intel.expertise_areas.length > 0)
        blocks.push({ key: "c-chips", section: "capability", spacing: 10, node: <ChipRow items={intel.expertise_areas} lang={lang} /> });
    }
  }

  // ── CV AGAINST LINKEDIN ──────────────────────────────────────────────
  if (hasCvCrosscheck(d.cv_crosscheck)) {
    blocks.push({
      key: "c-cv-crosscheck",
      section: "capability",
      spacing: 22,
      node: <CvCrosscheck data={d.cv_crosscheck} />,
    });
  }

  // ── MARKET ───────────────────────────────────────────────────────────
  const showMarket = !!d.market_mirror && d.market_mirror.persona_set === rankFromLevel(d.profile?.level);
  if (showMarket) {
    blocks.push({ key: "m-title", section: "market", spacing: 20, keepWithNext: ar, node: <SectionTitle lang={lang} title={L(lang, "report.doc.marketTitle", "Market Position")} kicker={L(lang, "report.doc.marketKicker", "How the market reads you")} /> });
    d.market_mirror!.perspectives.forEach((p, i) =>
      blocks.push({ key: `m-persona-${i}`, section: "market", spacing: 16, node: <PaperPersonaCard p={p} lang={lang} /> })
    );
  }

  // ── FOOTPRINT ────────────────────────────────────────────────────────
  if (d.territories || d.footprint || d.content || d.voice) {
    blocks.push({ key: "f-title", section: "footprint", spacing: 20, keepWithNext: ar, node: <SectionTitle lang={lang} title={L(lang, "report.doc.fpTitle", "Strategic Footprint")} kicker={name || L(lang, "report.doc.fpKicker", "Footprint")} /> });
    if (d.territories || d.brand_position?.pillars.length)
      blocks.push({
        key: "f-terr",
        section: "footprint",
        spacing: 22,
        node: <TerritoriesBlock pillars={d.brand_position?.pillars} tags={d.territories ?? []} lang={lang} />,
      });
    if (d.footprint)   blocks.push({ key: "f-fp",   section: "footprint", spacing: 24, node: <FootprintFigure fp={d.footprint} lang={lang} /> });
    if (d.content)     blocks.push({ key: "f-content", section: "footprint", spacing: 22, node: <ContentEngineCard c={d.content} lang={lang} /> });
    if (d.voice) {
      const join = ar ? "، " : " · ";
      blocks.push({ key: "f-v-h", section: "footprint", spacing: 22, keepWithNext: ar, node: <VoiceHeader lang={lang} /> });
      if (d.voice.tone) blocks.push({ key: "f-v-tone", section: "footprint", spacing: 6, node: <StackedRow lang={lang} label={L(lang, "report.doc.tone", "Tone")} value={d.voice.tone} /> });
      if (d.voice.preferred_structures.length > 0) blocks.push({ key: "f-v-struct", section: "footprint", spacing: 0, node: <StackedRow lang={lang} label={L(lang, "report.doc.structure", "Structure")} value={d.voice.preferred_structures.join(join)} /> });
      if (d.voice.storytelling_patterns.length > 0) blocks.push({ key: "f-v-pat", section: "footprint", spacing: 0, node: <StackedRow lang={lang} label={L(lang, "report.doc.patterns", "Patterns")} value={d.voice.storytelling_patterns.join(join)} /> });
      if (d.voice.vocabulary_preferences.prefer && d.voice.vocabulary_preferences.prefer.length > 0)
        blocks.push({ key: "f-v-pref", section: "footprint", spacing: 0, node: <StackedRow lang={lang} label={L(lang, "report.doc.prefers", "Prefers")} value={d.voice.vocabulary_preferences.prefer.join(ar ? "، " : ", ")} /> });
    }
    if (d.market_mirror) {
      const gaps = d.market_mirror.perspectives.map((p) => p.gap).filter(Boolean);
      if (gaps.length > 0) {
        if (ar) {
          blocks.push({ key: "f-next90", section: "footprint", spacing: 24, keepWithNext: true, node: <Next90Head lang={lang} /> });
          gaps.forEach((g, i) => blocks.push({ key: `f-next90-${i}`, section: "footprint", spacing: i === 0 ? 14 : 0, node: <GapRow g={g} lang={lang} /> }));
        } else {
          blocks.push({ key: "f-next90", section: "footprint", spacing: 24, node: <Next90Block gaps={gaps} /> });
        }
      }
    }
    blocks.push({ key: "f-footnotes", section: "footprint", spacing: 20, node: <Footnotes score={d.score} footprint={d.footprint} lang={lang} /> });
  }

  return blocks;
}

interface PackedBlock extends Block { height: number; effectiveSpacing: number; }
interface PackedSheet { section: SectionKey; blocks: PackedBlock[]; }

function packSheets(blocks: Block[], heights: number[], keepTitles = false): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  let cur: PackedSheet | null = null;
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = heights[i] || 0;
    if (!cur) {
      cur = { section: b.section, blocks: [] };
      sheets.push(cur);
      used = 0;
    }
    const isFirst = cur.blocks.length === 0;
    const spacing = isFirst ? 0 : b.spacing;
    // Arabic: a title only stays when its first block fits under it too.
    const nextNeed = keepTitles && b.keepWithNext && i + 1 < blocks.length
      ? blocks[i + 1].spacing + (heights[i + 1] || 0)
      : 0;
    if (!isFirst && used + spacing + h + nextNeed > CONTENT_H) {
      cur = { section: b.section, blocks: [] };
      sheets.push(cur);
      used = 0;
      cur.blocks.push({ ...b, height: h, effectiveSpacing: 0 });
      used = h;
      continue;
    }
    cur.blocks.push({ ...b, height: h, effectiveSpacing: spacing });
    used += spacing + h;
  }
  return sheets;
}

/** Arabic display copy: level, tier, persona and capability names in Arabic. Saved data untouched. */
function arabicDisplay(d: ReportData, titles: SeniorityTitle[], caps: CapabilityNameRow[] | null): ReportData {
  const level = d.profile?.level;
  const row = level ? titles.find((t) => t.title === level) : null;
  const tierKey = d.score?.tier ? `tier.${d.score.tier.toLowerCase()}` : null;
  const tierAr = tierKey ? pt("ar", tierKey) : null;
  const who = (w: string) => { const v = pt("ar", `mirror.persona.${w}`); return v.startsWith("mirror.persona.") ? w : v; };
  return {
    ...d,
    profile: d.profile ? { ...d.profile, level: row ? titleLabel(row, "ar") : level ?? null } : d.profile,
    score: d.score ? { ...d.score, tier: tierAr && tierAr !== tierKey ? tierAr : d.score.tier } : d.score,
    capabilities: d.capabilities ? attachCapabilityNamesAr(d.capabilities, caps) : d.capabilities,
    market_mirror: d.market_mirror
      ? { ...d.market_mirror, perspectives: d.market_mirror.perspectives.map((p) => ({ ...p, who: who(p.who) })) }
      : d.market_mirror,
  };
}

// ── Root ───────────────────────────────────────────────────────────────
export default function ReportDocument({ data, lang: langProp }: { data: ReportData; lang?: PaperLang }) {
  const lang: PaperLang = langProp ?? reportLang(data as any);
  const safeData: ReportData = useMemo(() => {
    if (!data.market_mirror) return data;
    const wanted = rankFromLevel(data.profile?.level);
    if (data.market_mirror.persona_set !== wanted) return { ...data, market_mirror: null };
    return data;
  }, [data]);

  // Arabic names are read for display only.
  const [titles, setTitles] = useState<SeniorityTitle[] | null>(lang === "ar" ? null : []);
  const [caps, setCaps] = useState<CapabilityNameRow[] | null>(null);
  useEffect(() => {
    if (lang !== "ar") return;
    let off = false;
    fetchSeniorityTitles().then((r) => { if (!off) setTitles(r); }).catch(() => { if (!off) setTitles([]); });
    (supabase.from("capability_dimensions" as any) as any).select("name, name_ar")
      .then(({ data: rows }: any) => { if (!off) setCaps(rows || null); });
    return () => { off = true; };
  }, [lang]);

  const shown: ReportData = useMemo(
    () => (lang === "ar" ? arabicDisplay(safeData, titles ?? [], caps) : safeData),
    [lang, safeData, titles, caps],
  );
  const blocks = useMemo(() => buildBlocks(shown, lang), [shown, lang]);

  if (lang === "ar" && titles === null) return null;
  return <Paginated key={safeData.user_id + ":" + safeData.generated_at + ":" + lang} blocks={blocks} data={shown} lang={lang} />;
}

function Paginated({ blocks, data, lang = "en" }: { blocks: Block[]; data: ReportData; lang?: PaperLang }) {
  const ar = lang === "ar";
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [heights, setHeights] = useState<number[] | null>(null);
  const { delta: sparkDelta } = useImprintDelta(data.user_id);

  useLayoutEffect(() => {
    if (heights !== null) return;
    if (ar) {
      // Arabic: measure only after the fonts settle, so Cairo line heights count.
      let off = false;
      const measure = () => {
        if (off) return;
        const next = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
        if (next.some((h) => h === 0)) { setTimeout(measure, 80); return; }
        setHeights(next);
      };
      const ready = (document as any).fonts?.ready;
      if (ready) ready.then(() => setTimeout(measure, 50)); else setTimeout(measure, 80);
      return () => { off = true; };
    }
    const next = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
    if (next.some((h) => h === 0)) {
      const t = setTimeout(() => {
        const retry = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
        setHeights(retry);
      }, 80);
      return () => clearTimeout(t);
    }
    setHeights(next);
  }, [blocks, heights, ar]);

  // Any sheet that still overflows is marked and logged.
  useEffect(() => {
    if (!heights || !rootRef.current) return;
    const root = rootRef.current;
    let off = false;
    const check = () => { if (!off) reportOverflowingSheets(root); };
    check();
    (document as any).fonts?.ready?.then(() => setTimeout(check, 100));
    return () => { off = true; };
  }, [heights]);

  if (!heights) {
    return (
      <div
        aria-hidden
        data-theme="light"
        dir={ar ? "rtl" : undefined}
        lang={ar ? "ar" : undefined}
        style={{
          position: "fixed", left: -99999, top: 0,
          width: CONTENT_W, background: T.paper, color: T.ink,
          fontFamily: FONT.serif, letterSpacing: ar ? 0 : "normal", visibility: "hidden",
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={b.key}
            ref={(el) => { measureRefs.current[i] = el; }}
            style={{ width: CONTENT_W }}
          >
            {b.node}
          </div>
        ))}
      </div>
    );
  }

  const packed = packSheets(blocks, heights, ar);
  const totalPacked = packed.length;
  // Total pages including cover (1) + packed + closing (1)
  const total = totalPacked + 2;
  const footerTitle = ar ? pt(lang, "paper.rp.kicker") : undefined;

  return (
    <div ref={rootRef} style={{ background: T.paper3, padding: "24px 0" }} data-report-ready="true">
      {/* Cover — page 1 */}
      <Sheet lang={lang} page={1}>
        <PaperHeader lang={lang} label={L(lang, "report.doc.prepared", "Prepared for you · Edition 1")} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginTop: 24 }}>
          <PaperCover data={data} lang={lang} />
        </div>
        <PaperFooter n={1} total={total} lang={lang} paperTitle={footerTitle} showDescriptor={false} showTagline={false} />
      </Sheet>

      {/* Packed body — pages 2..N-1 */}
      {packed.map((sheet, i) => (
        <Sheet key={i} lang={lang} page={i + 2}>
          <PaperHeader lang={lang} label={ar ? (withLatin(pt(lang, `report.doc.sec.${sheet.section}`), lang) as unknown as string) : SECTION_LABEL[sheet.section]} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginTop: 20 }}>
            {sheet.blocks.map((b) => (
              <div key={b.key} style={{ marginTop: b.effectiveSpacing, width: "100%" }}>
                {b.node}
              </div>
            ))}
          </div>
          <PaperFooter n={i + 2} total={total} lang={lang} paperTitle={footerTitle} showDescriptor={false} showTagline={false} />
        </Sheet>
      ))}

      {/* Closing plate — final page (full-bleed) */}
      <Sheet bleed lang={lang} page={total}>
        <ClosingPlate
          lang={lang}
          data={data}
          activeSignals={data.footprint?.signals ?? 0}
          evidenceCount={data.footprint?.evidence ?? 0}
          sparkDelta={sparkDelta}
        />
      </Sheet>
    </div>
  );
}

// preserve today-label export helper (no external consumers, but retained
// for parity with the pre-rebuild module shape).
export { todayLabel };
