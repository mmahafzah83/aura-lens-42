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
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  T,
  FONT,
} from "@/components/report/AuraPaper";

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
function Sheet({ children, bleed }: { children: React.ReactNode; bleed?: boolean }) {
  return (
    <div
      className="aura-report-sheet"
      data-report-page
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
        letterSpacing: "normal",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: T.spot,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// ── Block sub-renderers ────────────────────────────────────────────────
function SectionTitle({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div>
      {kicker ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.spot, fontWeight: 700, marginBottom: 8 }}>
          {kicker}
        </div>
      ) : null}
      <h2 style={{ fontFamily: FONT.serif, fontSize: 34, fontWeight: 500, margin: 0, color: T.ink, lineHeight: 1.15 }}>
        {title}
      </h2>
    </div>
  );
}

function ImprintFigure({ score, userId, generatedAt }: {
  score: NonNullable<ReportData["score"]>;
  userId: string;
  generatedAt: string;
}) {
  const c = score.components;
  return (
    <PaperFigure
      index={1}
      label="The Imprint Instrument"
      meta={new Date(score.snapshot_at || generatedAt).toLocaleDateString("en-GB")}
      findingBold={`Your imprint stands at ${score.score} of 100${score.tier ? " · " + score.tier + " tier" : ""}.`}
      findingRest="Weighting: Signal 40 · Content 40 · Consistency 20."
    >
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 30, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <ImprintDial score={score.score} tier={score.tier} />
          <ImprintSparkline userId={userId} />
        </div>
        <div>
          <ComponentBar label="Signal"      weight={40} value={c.signal}  weighted={c.signal_weighted} />
          <ComponentBar label="Content"     weight={40} value={c.content} weighted={c.content_weighted} />
          <ComponentBar label="Consistency" weight={20} value={c.capture} weighted={c.capture_weighted} isConsistency />
        </div>
      </div>
    </PaperFigure>
  );
}

function ProfileGrid({ items }: { items: { label: string; value: string }[] }) {
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

function PillarsBlock({ pillars }: { pillars: string[] }) {
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

function IntelSummary({ text }: { text: string }) {
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

function ThemeCard({ t }: { t: { theme: string; rationale: string } }) {
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${T.rule}`, borderLeft: `2px solid ${T.spot}`, background: T.paper2 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {t.theme}
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.6 }}>{t.rationale}</div>
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
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

function TerritoriesBlock({ items }: { items: string[] }) {
  return (
    <div>
      <SectionLabel>Strategic Territories</SectionLabel>
      <ChipRow items={items.map((t) => formatSkillLabel(t))} />
    </div>
  );
}

function FootprintFigure({ fp }: { fp: NonNullable<ReportData["footprint"]> }) {
  const items = [
    { n: fp.sources,  l: "Sources captured" },
    { n: fp.evidence, l: "Evidence fragments" },
    { n: fp.signals,  l: "Active strategic signals" },
    { n: fp.themes,   l: "Themes owned" },
  ];
  return (
    <PaperFigure
      index={3}
      label="Intelligence Footprint"
      meta={`${fp.sources} sources · ${fp.evidence} fragments`}
      findingBold="Your record is what the paper reads from."
      findingRest="No inference beyond these counts."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {items.map((s, i) => (
          <div key={i} style={{ padding: "16px 12px", border: `1px solid ${T.rule}`, background: T.paper, textAlign: "center" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 700, color: T.ink, lineHeight: 1.05 }}>{s.n}</div>
            <div style={{ marginTop: 8, fontFamily: FONT.mono, fontSize: 10.5, color: T.ink3, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {s.l}
            </div>
          </div>
        ))}
      </div>
    </PaperFigure>
  );
}

function ContentEngineCard({ c }: { c: NonNullable<ReportData["content"]> }) {
  return (
    <div style={{ border: `1.5px solid ${T.ink}`, background: T.paper2, padding: "14px 16px" }}>
      <SectionLabel>Content Engine</SectionLabel>
      <Row label="Posts published" value={String(c.publishedCount)} />
      {c.frameworks[0] ? <Row label="Lead framework" value={c.frameworks[0].framework_type} /> : null}
      {c.frameworks.length > 1 ? (
        <Row label="Also using" value={c.frameworks.slice(1, 4).map((f) => f.framework_type).join(" · ")} />
      ) : null}
      <Row label="Tracked posts" value={String(c.trackedCount)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const ar = hasArabic(value);
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

function StackedRow({ label, value }: { label: string; value: string }) {
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
      <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: T.spot, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5, fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: ar ? FONT.arabic : FONT.serif,
          fontSize: 14,
          color: T.ink,
          lineHeight: ar ? 1.85 : 1.65,
          letterSpacing: ar ? "normal" : undefined,
        }}
        dir={ar ? "rtl" : "auto"}
        lang={ar ? "ar" : undefined}
      >
        {ar ? (arHead ? renderBidi(arHead) : null) : value}
      </div>
      {latinBlock ? (
        <div dir="ltr" lang="en" style={{ marginTop: 6, fontFamily: FONT.serif, fontStyle: "italic", fontSize: 13, color: T.ink2, lineHeight: 1.55 }}>
          {latinBlock}
        </div>
      ) : null}
    </div>
  );
}

function VoiceHeader() {
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

function Next90Block({ gaps }: { gaps: string[] }) {
  return (
    <div>
      <SectionLabel>Where to Point the Next 90 Days</SectionLabel>
      <div style={{ fontFamily: FONT.serif, fontSize: 13, color: T.ink3, lineHeight: 1.6, marginBottom: 14 }}>
        Three gaps the market would notice — each one is a content move.
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

function Footnotes({ score, footprint }: { score: ReportData["score"]; footprint: ReportData["footprint"] }) {
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
}

const CONTENT_W = SHEET_W - 2 * PAGE_PAD; // 682
const HEADER_RESERVE = 60;
const FOOTER_RESERVE = 70; // taller footer w/ ticks + secondary row
const CONTENT_H = SHEET_H - 2 * PAGE_PAD - HEADER_RESERVE - FOOTER_RESERVE - 6;

function buildBlocks(d: ReportData): Block[] {
  const blocks: Block[] = [];
  const name = [d.profile?.first_name, d.profile?.last_name].filter(Boolean).join(" ").trim();

  // ── IDENTITY (post-cover) ────────────────────────────────────────────
  if (d.score) {
    blocks.push({
      key: "i-score",
      section: "identity",
      spacing: 8,
      node: <ImprintFigure score={d.score} userId={d.user_id} generatedAt={d.generated_at} />,
    });
  }
  const p = d.profile;
  if (p) {
    const items: { label: string; value: string }[] = [];
    if (p.core_practice)  items.push({ label: "Core Practice", value: p.core_practice });
    if (p.sector_focus)   items.push({ label: "Sector Focus", value: p.sector_focus });
    if (p.years_experience_raw) items.push({ label: "Experience", value: stripParenTail(p.years_experience_raw) });
    if (p.linkedin_handle) items.push({ label: "LinkedIn", value: `/in/${p.linkedin_handle.replace(/^\/?in\//, "")}` });
    if (items.length > 0) blocks.push({ key: "i-grid", section: "identity", spacing: 26, node: <ProfileGrid items={items} /> });
    if ((p.north_star_goals ?? []).length > 0)
      blocks.push({ key: "i-northstar", section: "identity", spacing: 24, node: <NorthStarBlock goals={p.north_star_goals} /> });
  }
  if (d.brand_position?.pillars.length)
    blocks.push({ key: "i-pillars", section: "identity", spacing: 22, node: <PillarsBlock pillars={d.brand_position.pillars} /> });

  // ── CAPABILITY ───────────────────────────────────────────────────────
  if (d.capabilities || d.profile_intelligence) {
    blocks.push({ key: "c-title", section: "capability", spacing: 20, node: <SectionTitle title="Capability & Intelligence" kicker={name || "Capability"} /> });
    if (d.capabilities && d.capabilities.length > 0)
      blocks.push({ key: "c-radar", section: "capability", spacing: 18, node: <CapabilityFigure data={d.capabilities} /> });
    const intel = d.profile_intelligence;
    if (intel) {
      blocks.push({ key: "c-intel-label", section: "capability", spacing: 26, node: <SectionLabel>Profile Intelligence</SectionLabel> });
      if (intel.identity_summary)
        blocks.push({ key: "c-intel-summary", section: "capability", spacing: 4, node: <IntelSummary text={intel.identity_summary} /> });
      if (intel.authority_themes.length > 0)
        intel.authority_themes.forEach((t, i) =>
          blocks.push({ key: `c-theme-${i}`, section: "capability", spacing: 10, node: <ThemeCard t={t} /> })
        );
      else if (intel.expertise_areas.length > 0)
        blocks.push({ key: "c-chips", section: "capability", spacing: 10, node: <ChipRow items={intel.expertise_areas} /> });
    }
  }

  // ── MARKET ───────────────────────────────────────────────────────────
  const showMarket = !!d.market_mirror && d.market_mirror.persona_set === rankFromLevel(d.profile?.level);
  if (showMarket) {
    blocks.push({ key: "m-title", section: "market", spacing: 20, node: <SectionTitle title="Market Position" kicker="How the market reads you" /> });
    d.market_mirror!.perspectives.forEach((p, i) =>
      blocks.push({ key: `m-persona-${i}`, section: "market", spacing: 16, node: <PaperPersonaCard p={p} /> })
    );
  }

  // ── FOOTPRINT ────────────────────────────────────────────────────────
  if (d.territories || d.footprint || d.content || d.voice) {
    blocks.push({ key: "f-title", section: "footprint", spacing: 20, node: <SectionTitle title="Strategic Footprint" kicker={name || "Footprint"} /> });
    if (d.territories) blocks.push({ key: "f-terr", section: "footprint", spacing: 22, node: <TerritoriesBlock items={d.territories} /> });
    if (d.footprint)   blocks.push({ key: "f-fp",   section: "footprint", spacing: 24, node: <FootprintFigure fp={d.footprint} /> });
    if (d.content)     blocks.push({ key: "f-content", section: "footprint", spacing: 22, node: <ContentEngineCard c={d.content} /> });
    if (d.voice) {
      blocks.push({ key: "f-v-h", section: "footprint", spacing: 22, node: <VoiceHeader /> });
      if (d.voice.tone) blocks.push({ key: "f-v-tone", section: "footprint", spacing: 6, node: <StackedRow label="Tone" value={d.voice.tone} /> });
      if (d.voice.preferred_structures.length > 0) blocks.push({ key: "f-v-struct", section: "footprint", spacing: 0, node: <StackedRow label="Structure" value={d.voice.preferred_structures.join(" · ")} /> });
      if (d.voice.storytelling_patterns.length > 0) blocks.push({ key: "f-v-pat", section: "footprint", spacing: 0, node: <StackedRow label="Patterns" value={d.voice.storytelling_patterns.join(" · ")} /> });
      if (d.voice.vocabulary_preferences.prefer && d.voice.vocabulary_preferences.prefer.length > 0)
        blocks.push({ key: "f-v-pref", section: "footprint", spacing: 0, node: <StackedRow label="Prefers" value={d.voice.vocabulary_preferences.prefer.join(", ")} /> });
    }
    if (d.market_mirror) {
      const gaps = d.market_mirror.perspectives.map((p) => p.gap).filter(Boolean);
      if (gaps.length > 0)
        blocks.push({ key: "f-next90", section: "footprint", spacing: 24, node: <Next90Block gaps={gaps} /> });
    }
    blocks.push({ key: "f-footnotes", section: "footprint", spacing: 20, node: <Footnotes score={d.score} footprint={d.footprint} /> });
  }

  return blocks;
}

interface PackedBlock extends Block { height: number; effectiveSpacing: number; }
interface PackedSheet { section: SectionKey; blocks: PackedBlock[]; }

function packSheets(blocks: Block[], heights: number[]): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  let cur: PackedSheet | null = null;
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = heights[i] || 0;
    if (!cur || cur.section !== b.section) {
      cur = { section: b.section, blocks: [] };
      sheets.push(cur);
      used = 0;
    }
    const isFirst = cur.blocks.length === 0;
    const spacing = isFirst ? 0 : b.spacing;
    if (!isFirst && used + spacing + h > CONTENT_H) {
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

// ── Root ───────────────────────────────────────────────────────────────
export default function ReportDocument({ data }: { data: ReportData }) {
  const safeData: ReportData = useMemo(() => {
    if (!data.market_mirror) return data;
    const wanted = rankFromLevel(data.profile?.level);
    if (data.market_mirror.persona_set !== wanted) return { ...data, market_mirror: null };
    return data;
  }, [data]);

  const blocks = useMemo(() => buildBlocks(safeData), [safeData]);

  return <Paginated key={safeData.user_id + ":" + safeData.generated_at} blocks={blocks} data={safeData} />;
}

function Paginated({ blocks, data }: { blocks: Block[]; data: ReportData }) {
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[] | null>(null);
  const { delta: sparkDelta } = useImprintDelta(data.user_id);

  useLayoutEffect(() => {
    if (heights !== null) return;
    const next = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
    if (next.some((h) => h === 0)) {
      const t = setTimeout(() => {
        const retry = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
        setHeights(retry);
      }, 80);
      return () => clearTimeout(t);
    }
    setHeights(next);
  }, [blocks, heights]);

  if (!heights) {
    return (
      <div
        aria-hidden
        data-theme="light"
        style={{
          position: "fixed", left: -99999, top: 0,
          width: CONTENT_W, background: T.paper, color: T.ink,
          fontFamily: FONT.serif, letterSpacing: "normal", visibility: "hidden",
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

  const packed = packSheets(blocks, heights);
  const totalPacked = packed.length;
  // Total pages including cover (1) + packed + closing (1)
  const total = totalPacked + 2;

  return (
    <div style={{ background: T.paper3, padding: "24px 0" }} data-report-ready="true">
      {/* Cover — page 1 */}
      <Sheet>
        <PaperHeader label="Prepared for you · Edition 1" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginTop: 24 }}>
          <PaperCover data={data} />
        </div>
        <PaperFooter n={1} total={total} />
      </Sheet>

      {/* Packed body — pages 2..N-1 */}
      {packed.map((sheet, i) => (
        <Sheet key={i}>
          <PaperHeader label={SECTION_LABEL[sheet.section]} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginTop: 20 }}>
            {sheet.blocks.map((b) => (
              <div key={b.key} style={{ marginTop: b.effectiveSpacing, width: "100%" }}>
                {b.node}
              </div>
            ))}
          </div>
          <PaperFooter n={i + 2} total={total} />
        </Sheet>
      ))}

      {/* Closing plate — final page (full-bleed) */}
      <Sheet bleed>
        <ClosingPlate
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
