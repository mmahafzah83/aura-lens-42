// W2-G-2a — Strategic Identity Report document.
// Pure render from ReportData (built by @/lib/buildIdentityReport).
// Each section gates on its null flag; whole pages omitted if empty.
// Styling inlined (literal hex / px / pt) so html2canvas in W2-G-2b
// snapshots faithfully without depending on Tailwind tokens.

import { rankFromLevel } from "@/lib/marketPersonas";
import { formatSkillLabel } from "@/lib/formatSkillLabel";
import type { ReportData, CapabilitiesSection } from "@/lib/buildIdentityReport";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

// ── Design tokens (locked to literals for export fidelity) ──────────────
// §18: exports are LIGHT-CANONICAL and SELF-CONTAINED. html2canvas runs on a
// node that may live inside a dark-themed Settings shell whose global rules
// (e.g. `[data-theme="dark"] h1 { color: var(--ink) }`) would otherwise repaint
// our headings cream. Every visible element therefore sets `color` inline from
// these literals, never from CSS vars or inheritance alone. Each constant is
// annotated with the Standard token it mirrors (same pattern as cardStyles.ts).
const INK         = "#2B2723";              // mirrors light var(--ink)
const PAPER       = "#F8F5F0";              // mirrors light var(--paper)
const BRONZE      = "#B08D3A";              // mirrors var(--bronze)
const BRONZE_TEXT = "#8A6D2A";              // mirrors light var(--bronze-text) (AA on paper)
const BRONZE_DEEP = BRONZE_TEXT;            // alias kept for existing call-sites
const MUTED       = "#7A7164";              // mirrors light var(--ink-3)
const INK_2       = INK;                    // body copy uses canonical INK
const INK_3       = MUTED;                  // secondary copy
const INK_4       = "#9A9286";              // caption/meta (decorative, no token)
const HAIRLINE    = "rgba(43,39,35,0.14)";  // mirrors var(--hairline) on paper
const RULE        = HAIRLINE;               // alias kept for existing call-sites
const BRONZE_FAINT = "rgba(176,141,58,0.12)"; // decorative chip wash
const DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY = "'DM Sans', system-ui, -apple-system, sans-serif";
const ARABIC = "'Cairo', 'DM Sans', sans-serif";
// §18.5: data digits use a mono face so columns of numbers (score bars,
// capability values, footprint stats, content-engine counts) align and read
// as data, not display. The hero brand numeral (Page 1 score) stays Cormorant.
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const NUM_RE = /^\s*-?\d[\d,.\s]*\s*$/;

const SHEET_W = 794;   // A4 @ 96dpi
const SHEET_H = 1123;  // A4 @ 96dpi
const PAGE_PAD = 56;

// ── Helpers ─────────────────────────────────────────────────────────────
function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

// ── Bidi rendering ──────────────────────────────────────────────────────
// html2canvas rasterises CSS letter-spacing literally and uses the resolved
// font-family at the leaf element — both of those break Arabic shaping when
// the value inherits DM Sans + non-zero tracking. We:
//   (1) detect Arabic presence,
//   (2) force Cairo + dir="rtl" + lang="ar" + letterSpacing:"normal",
//   (3) wrap embedded Latin runs in <bdi> so bidi reordering can't fracture
//       the surrounding Arabic shaping around parentheses or quoted English.
const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function hasArabic(s: string | null | undefined): boolean {
  return !!s && AR_RE.test(s);
}
function renderBidi(value: string): React.ReactNode {
  if (!hasArabic(value)) return value;
  // Split into runs: Arabic-or-neutral vs Latin. Wrap each Latin run in <bdi>.
  const parts: React.ReactNode[] = [];
  // Match a full embedded Latin run — letters, digits, common punctuation —
  // so an entire English sentence wrapped inside an Arabic paragraph stays in
  // ONE <bdi>, keeping line-wrapping and bidi-resolution coherent. The cap is
  // generous so a full quoted sentence is captured as a single run.
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

function todayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

// Strip trailing parenthetical like "18y total / 7y consulting (Industry Expert Pivot)".
function stripParenTail(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Condense to a true one-liner: take first 1–2 items from a " · " joined list,
// then hard-cap the final string to ~90 chars + "…" regardless of item count.
function shortSnippet(value: string, maxItems = 2, maxLen = 90): string {
  if (!value) return "";
  let out = value;
  if (out.includes(" · ")) {
    const parts = out.split(" · ").map((p) => p.trim()).filter(Boolean);
    out = parts.slice(0, maxItems).join(" · ");
  }
  if (out.length > maxLen) {
    out = out.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return out;
}

// ── Shared chrome ───────────────────────────────────────────────────────
function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 14, borderBottom: `1px solid ${RULE}` }}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: "0.18em", color: INK }}>AURA</div>
        <div style={{ fontFamily: BODY, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: INK_4, marginTop: 2 }}>
          Strategic Digital Presence
        </div>
      </div>
      {subtitle ? (
        <div style={{ fontFamily: BODY, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: INK_3 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function PageFooter({ n, total }: { n: number; total: number }) {
  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 14,
        borderTop: `1px solid ${RULE}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: BODY,
        fontSize: 10,
        color: INK_4,
        letterSpacing: "0.06em",
      }}
    >
      <span>aura-intel.org</span>
      <span>
        Turns your expertise into presence
        <span style={{ margin: "0 8px", color: BRONZE }}>·</span>
        <span style={{ fontFamily: ARABIC }} dir="rtl">حوّل خبرتك إلى حضور</span>
      </span>
      <span>
        {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="aura-report-sheet"
      data-report-page
      data-theme="light"
      style={{
        width: SHEET_W,
        height: SHEET_H,
        overflow: "hidden",
        background: PAPER,
        color: INK,
        fontFamily: BODY,
        padding: PAGE_PAD,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
        margin: "0 auto 32px",
        // Defensive: zero out any inherited Arabic-breaking tracking from
        // a parent dark-shell. Per-element tracking is set explicitly below.
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
        fontFamily: BODY,
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: BRONZE_DEEP,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Diamond({ size = 8, color = BRONZE }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        background: color,
        transform: "rotate(45deg)",
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        // §18: symmetric vertical padding + lineHeight:1 keeps the glyph
        // optically centred in the pill at html2canvas raster time
        // (asymmetric padding pushed descenders into the bottom border).
        padding: "6px 14px",
        marginRight: 8,
        marginBottom: 8,
        fontSize: 12,
        lineHeight: 1,
        verticalAlign: "middle",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
        fontFamily: BODY,
        color: INK_2,
        background: BRONZE_FAINT,
        border: `1px solid ${BRONZE}`,
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          background: BRONZE,
          transform: "rotate(45deg)",
          flexShrink: 0,
        }}
      />
      <span style={{ display: "inline-block", lineHeight: 1 }}>{children}</span>
    </span>
  );
}

// ── Radar (generic N-axis) ──────────────────────────────────────────────
function CapabilityRadar({ data }: { data: CapabilitiesSection }) {
  const N = data.length;
  const cx = 260;
  const cy = 150;
  const R = 100;
  const angles = data.map((_, i) => (-90 + (360 / N) * i) * (Math.PI / 180));

  const rings = [0.25, 0.5, 0.75, 1].map((k, i) => (
    <circle key={i} cx={cx} cy={cy} r={R * k} fill="none" stroke={RULE} strokeWidth={1} />
  ));
  const axes = angles.map((a, i) => (
    <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke={RULE} strokeWidth={1} />
  ));
  const pts = data.map((d, i) => {
    const r = (R * Math.max(0, Math.min(100, d.score))) / 100;
    return [cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i])] as const;
  });
  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const labels = data.map((d, i) => {
    const a = angles[i];
    const lx = cx + (R + 14) * Math.cos(a);
    const ly = cy + (R + 14) * Math.sin(a);
    const cosA = Math.cos(a);
    const anchor: "start" | "middle" | "end" =
      cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
    return (
      <text
        key={i}
        x={lx}
        y={ly}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontFamily={BODY}
        fontSize={9}
        fill={INK_3}
      >
        {d.name}
      </text>
    );
  });

  return (
    <svg viewBox="0 0 520 300" width="100%" style={{ maxWidth: 520 }}>
      {rings}
      {axes}
      <polygon points={path} fill={BRONZE} fillOpacity={0.18} stroke={BRONZE} strokeWidth={1.5} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} fill={BRONZE_DEEP} />
      ))}
      {labels}
    </svg>
  );
}

// ── Atomic block sub-renderers ─────────────────────────────────────────
// Each component below renders ONE atomic block. The paginator measures
// each one's height in an offscreen pass, then packs them sequentially
// into A4 sheets. No block knows its sheet index — all chrome (header,
// footer, page numbers) is added by <Paginated/>.

function HeroIntro({ data }: { data: ReportData }) {
  const p = data.profile;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  const role = p?.level ? (p.firm ? `${p.level}  ·  ${p.firm}` : p.level) : "";
  const statement = data.positioning?.statement || data.positioning?.title || "";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, color: INK_3, letterSpacing: "0.04em" }}>
          Strategic Identity Report
        </div>
        <div style={{ fontFamily: BODY, fontSize: 11, color: INK_4 }}>{todayLabel(data.generated_at)}</div>
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 500, margin: "16px 0 6px", letterSpacing: "0.005em", color: INK }}>
        {name || "Your Strategic Identity"}
      </h1>
      {role ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: INK_3, letterSpacing: "0.04em" }}>{role}</div>
      ) : null}
      {statement ? (
        <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, color: INK_2, margin: "18px 0 0", lineHeight: 1.4, borderLeft: `2px solid ${BRONZE}`, paddingLeft: 14 }}>
          “{statement}”
        </div>
      ) : null}
    </div>
  );
}

function ScoreCard({ score }: { score: NonNullable<ReportData["score"]> }) {
  return (
    <div style={{ padding: 18, border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
      <SectionLabel>Digital Presence Score</SectionLabel>
      <div style={{ display: "flex", alignItems: "stretch", gap: 32, marginTop: 12 }}>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", justifyContent: "flex-start", borderRight: `1px solid ${RULE}`, paddingRight: 32, paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 500, color: INK, lineHeight: 1, margin: 0 }}>{score.score}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, color: INK_4, lineHeight: 1, margin: 0 }}>/100</span>
            {score.tier ? (
              <span style={{ fontFamily: BODY, fontSize: 11, color: BRONZE_DEEP, letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1, margin: "0 0 0 10px" }}>
                ◆ {titleCase(score.tier)}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, paddingTop: 14 }}>
          {[
            { label: "Signal", weight: 40, v: score.components.signal },
            { label: "Content", weight: 40, v: score.components.content },
            { label: "Capture", weight: 20, v: score.components.capture },
          ].map((b) => (
            <div key={b.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 30px", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 11, color: INK_2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {b.label}<span style={{ color: INK_4, marginLeft: 6 }}>{b.weight}%</span>
              </div>
              <div style={{ height: 7, background: RULE, borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${Math.max(0, Math.min(100, b.v))}%`, background: `linear-gradient(90deg, ${BRONZE}, ${BRONZE_DEEP})`, borderRadius: 4 }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: BRONZE_DEEP, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(b.v)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ fontSize: 10, color: BRONZE_DEEP, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>{it.label}</div>
          <div style={{ fontSize: 13, color: INK }}>{it.value}</div>
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
          <li key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 13 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, color: BRONZE_DEEP, minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ color: INK }}>{g}</span>
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
      <div>{pillars.map((p2) => <Chip key={p2}>{p2}</Chip>)}</div>
    </div>
  );
}

function SectionTitle({ title, name }: { title: string; name?: string }) {
  return (
    <div>
      <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 500, color: INK }}>{title}</div>
      {name ? <div style={{ fontSize: 12, color: INK_4, letterSpacing: "0.06em", marginTop: 4 }}>{name}</div> : null}
    </div>
  );
}

function CapabilityBlock({ data }: { data: CapabilitiesSection }) {
  const assessed = data.filter((c) => (c.score ?? 0) > 0);
  return (
    <div>
      <SectionLabel>Capability Radar</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 24, alignItems: "center" }}>
        {assessed.length >= 3 ? <CapabilityRadar data={assessed} /> : <div />}
        <div>
          {assessed.map((c) => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 12 }}>
              <span style={{ color: INK_2 }}>{c.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: BRONZE_DEEP, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{c.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntelSummary({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 17, color: INK_2, lineHeight: 1.45, borderLeft: `2px solid ${BRONZE}`, paddingLeft: 14 }}>
      {text}
    </div>
  );
}

function ThemeCard({ t }: { t: { theme: string; rationale: string } }) {
  return (
    <div style={{ padding: "10px 12px", border: `1px solid ${RULE}`, borderLeft: `2px solid ${BRONZE}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 2 }}>{t.theme}</div>
      <div style={{ fontSize: 12, color: INK_3, lineHeight: 1.5 }}>{t.rationale}</div>
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return <div>{items.map((e) => <Chip key={e}>{e}</Chip>)}</div>;
}

function PersonaCard({ p }: { p: { who: string; sees: string; gap: string } }) {
  return (
    <div style={{ padding: "14px 16px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
      <div style={{ fontSize: 11, color: BRONZE_DEEP, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
        The {p.who}
      </div>
      {p.sees ? <div style={{ fontSize: 12.5, color: INK_2, lineHeight: 1.55, marginBottom: p.gap ? 8 : 0 }}>{p.sees}</div> : null}
      {p.gap ? (
        <div style={{ fontSize: 12, color: INK_3, lineHeight: 1.5, paddingLeft: 12, borderLeft: `1px solid ${BRONZE}` }}>
          <span style={{ color: BRONZE_DEEP, fontWeight: 600 }}>Would notice: </span>{p.gap}
        </div>
      ) : null}
    </div>
  );
}

function TerritoriesBlock({ items }: { items: string[] }) {
  return (
    <div>
      <SectionLabel>Strategic Territories</SectionLabel>
      <div>{items.map((t) => <Chip key={t}>{formatSkillLabel(t)}</Chip>)}</div>
    </div>
  );
}

function FootprintBlock({ fp }: { fp: NonNullable<ReportData["footprint"]> }) {
  return (
    <div>
      <SectionLabel>Intelligence Footprint</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { n: fp.sources, l: "Sources\nCaptured" },
          { n: fp.evidence, l: "Pieces of\nEvidence" },
          { n: fp.signals, l: "Strategic\nSignals" },
          { n: fp.themes, l: "Themes\nOwned" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "14px 12px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 500, color: INK, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{s.n}</div>
            <div style={{ marginTop: 8, fontSize: 10, color: INK_3, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "pre-line" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentEngineCard({ c }: { c: NonNullable<ReportData["content"]> }) {
  return (
    <div style={{ padding: "14px 16px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
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

function ProvenanceLine({ sources, evidence }: { sources: number; evidence: number }) {
  return (
    <div style={{ fontSize: 11, color: INK_4, lineHeight: 1.5, fontFamily: BODY }}>
      Built from your{" "}
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sources}</span>{" "}
      sources and{" "}
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{evidence}</span>{" "}
      evidence fragments
      <span style={{ margin: "0 6px", color: BRONZE }}>·</span>
      <span style={{ fontFamily: ARABIC }} dir="rtl" lang="ar">بُني من بياناتك وحدها</span>
    </div>
  );
}

function Next90Block({ gaps }: { gaps: string[] }) {
  return (
    <div>
      <SectionLabel>Where to Point the Next 90 Days</SectionLabel>
      <div style={{ fontSize: 11, color: INK_3, lineHeight: 1.6, marginBottom: 14 }}>
        Three gaps the market would notice — each one is a content move.
      </div>
      {gaps.map((g, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "8px 0",
            borderBottom: `1px solid ${RULE}`,
            fontSize: 12.5,
            color: INK,
            lineHeight: 1.55,
          }}
        >
          <Diamond size={6} color={BRONZE} />
          <span>{g}</span>
        </div>
      ))}
    </div>
  );
}

function VoiceHeader() {
  return (
    <div>
      <SectionLabel>Voice Signature</SectionLabel>
      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.6, marginTop: -6 }}>
        Captured in the language of your primary voice
        <span style={{ margin: "0 6px", color: BRONZE }}>·</span>
        <span style={{ fontFamily: ARABIC }} dir="rtl" lang="ar">بلغة صوتك الأساسي</span>
      </div>
    </div>
  );
}

function Row({ label, value, valueAlign = "right" }: { label: string; value: string; valueAlign?: "left" | "right" }) {
  const ar = hasArabic(value);
  const num = !ar && NUM_RE.test(value);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 12 }}>
      <span style={{ color: INK_3, letterSpacing: "0.04em" }}>{label}</span>
      <span
        style={{
          color: INK,
          fontWeight: 500,
          textAlign: valueAlign,
          maxWidth: "60%",
          fontFamily: ar ? ARABIC : num ? MONO : BODY,
          fontVariantNumeric: num ? "tabular-nums" : undefined,
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

// Stacked variant: label on its own line, value left-aligned full-width below.
function StackedRow({ label, value }: { label: string; value: string }) {
  const ar = hasArabic(value);
  // §18 — Long embedded Latin runs (e.g. a signature English quote inside an
  // Arabic paragraph) cannot survive html2canvas line-wrap reordering when
  // wrapped only in <bdi>: the quote fragments across lines. Detect any Latin
  // run ≥ 40 chars and promote it to its OWN block-level element rendered
  // LTR below the Arabic sentence that introduces it.
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
    <div
      style={{ padding: "8px 0", borderBottom: `1px solid ${RULE}` }}
      dir={ar ? "rtl" : undefined}
      lang={ar ? "ar" : undefined}
    >
      <div style={{ fontSize: 10, color: BRONZE_DEEP, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: INK,
          fontWeight: 500,
          lineHeight: ar ? 1.85 : 1.65,
          textAlign: "start",
          fontFamily: ar ? ARABIC : BODY,
          letterSpacing: ar ? "normal" : undefined,
        }}
        dir={ar ? "rtl" : "auto"}
        lang={ar ? "ar" : undefined}
      >
        {ar ? (arHead ? renderBidi(arHead) : null) : value}
      </div>
      {latinBlock ? (
        <div
          dir="ltr"
          lang="en"
          style={{
            display: "block",
            marginTop: 6,
            fontSize: 12,
            color: INK_2,
            fontWeight: 500,
            fontStyle: "italic",
            lineHeight: 1.55,
            textAlign: ar ? "right" : "left",
            fontFamily: BODY,
            letterSpacing: "normal",
          }}
        >
          {latinBlock}
        </div>
      ) : null}
    </div>
  );
}

// ── Dynamic measure-then-pack paginator ─────────────────────────────────
// 1. Build atomic blocks per section.
// 2. Render them once into an offscreen container at the exact sheet
//    content width (CONTENT_W) to measure each one's offsetHeight.
// 3. Pack blocks sequentially into sheets of fixed CONTENT_H. A block
//    that doesn't fit the remaining space moves WHOLE to the next sheet.
//    A section change always forces a fresh sheet. Continuation sheets
//    keep the same header subtitle; the page-title block is NOT repeated.
// 4. Number sheets as 0N / 0M using the final sheet count.

type SectionKey = "identity" | "capability" | "market" | "footprint";
const SECTION_SUBTITLE: Record<SectionKey, string> = {
  identity: "Strategic Identity Report",
  capability: "Capability & Intelligence",
  market: "Market Position",
  footprint: "Strategic Footprint",
};

interface Block {
  key: string;
  section: SectionKey;
  spacing: number; // top margin if not first block on the sheet
  node: React.ReactNode;
}

// Content width = sheet width minus padding on both sides.
const CONTENT_W = SHEET_W - 2 * PAGE_PAD; // 682
// Reserve header (~60) + footer (~40) + safety inside the padding box.
const HEADER_RESERVE = 60;
const FOOTER_RESERVE = 44;
const CONTENT_H = SHEET_H - 2 * PAGE_PAD - HEADER_RESERVE - FOOTER_RESERVE - 6; // ≈ 901

function buildBlocks(d: ReportData): Block[] {
  const blocks: Block[] = [];
  const name = [d.profile?.first_name, d.profile?.last_name].filter(Boolean).join(" ").trim();

  // ── IDENTITY ─────────────────────────────────────────────────────────
  const identityShown =
    !!d.profile && Boolean(name || d.score || d.positioning || d.brand_position?.pillars.length);
  if (identityShown) {
    blocks.push({ key: "i-hero", section: "identity", spacing: 18, node: <HeroIntro data={d} /> });
    if (d.score) blocks.push({ key: "i-score", section: "identity", spacing: 24, node: <ScoreCard score={d.score} /> });
    if (d.score && d.footprint) {
      blocks.push({
        key: "i-prov",
        section: "identity",
        spacing: 10,
        node: <ProvenanceLine sources={d.footprint.sources} evidence={d.footprint.evidence} />,
      });
    }
    const p = d.profile!;
    const items: { label: string; value: string }[] = [];
    if (p.core_practice) items.push({ label: "Core Practice", value: p.core_practice });
    if (p.sector_focus) items.push({ label: "Sector Focus", value: p.sector_focus });
    if (p.years_experience_raw) items.push({ label: "Experience", value: stripParenTail(p.years_experience_raw) });
    if (p.linkedin_handle) items.push({ label: "LinkedIn", value: `/in/${p.linkedin_handle.replace(/^\/?in\//, "")}` });
    if (items.length > 0) blocks.push({ key: "i-grid", section: "identity", spacing: 22, node: <ProfileGrid items={items} /> });
    const goals = p.north_star_goals ?? [];
    const pillars = d.brand_position?.pillars ?? [];
    if (goals.length > 0) blocks.push({ key: "i-northstar", section: "identity", spacing: 22, node: <NorthStarBlock goals={goals} /> });
    if (pillars.length > 0) blocks.push({ key: "i-pillars", section: "identity", spacing: 22, node: <PillarsBlock pillars={pillars} /> });
  }

  // ── CAPABILITY ───────────────────────────────────────────────────────
  if (d.capabilities || d.profile_intelligence) {
    blocks.push({ key: "c-title", section: "capability", spacing: 20, node: <SectionTitle title="Capability & Intelligence" name={name} /> });
    if (d.capabilities) blocks.push({ key: "c-radar", section: "capability", spacing: 18, node: <CapabilityBlock data={d.capabilities} /> });
    const intel = d.profile_intelligence;
    if (intel) {
      blocks.push({ key: "c-intel-label", section: "capability", spacing: 26, node: <SectionLabel>Profile Intelligence</SectionLabel> });
      if (intel.identity_summary) {
        blocks.push({ key: "c-intel-summary", section: "capability", spacing: 4, node: <IntelSummary text={intel.identity_summary} /> });
      }
      if (intel.authority_themes.length > 0) {
        intel.authority_themes.forEach((t, i) =>
          blocks.push({ key: `c-theme-${i}`, section: "capability", spacing: 10, node: <ThemeCard t={t} /> })
        );
      } else if (intel.expertise_areas.length > 0) {
        blocks.push({ key: "c-chips", section: "capability", spacing: 10, node: <ChipRow items={intel.expertise_areas} /> });
      }
    }
  }

  // ── MARKET ───────────────────────────────────────────────────────────
  const showMarket =
    !!d.market_mirror && d.market_mirror.persona_set === rankFromLevel(d.profile?.level);
  if (showMarket) {
    blocks.push({ key: "m-title", section: "market", spacing: 20, node: <SectionTitle title="Market Position" name={name} /> });
    blocks.push({ key: "m-label", section: "market", spacing: 20, node: <SectionLabel>How the Market Reads You</SectionLabel> });
    d.market_mirror!.perspectives.forEach((p, i) =>
      blocks.push({ key: `m-persona-${i}`, section: "market", spacing: 14, node: <PersonaCard p={p} /> })
    );
  }

  // ── FOOTPRINT ────────────────────────────────────────────────────────
  if (d.territories || d.footprint || d.content || d.voice) {
    blocks.push({ key: "f-title", section: "footprint", spacing: 20, node: <SectionTitle title="Strategic Footprint" name={name} /> });
    if (d.territories) blocks.push({ key: "f-terr", section: "footprint", spacing: 20, node: <TerritoriesBlock items={d.territories} /> });
    if (d.footprint) blocks.push({ key: "f-fp", section: "footprint", spacing: 24, node: <FootprintBlock fp={d.footprint} /> });
    if (d.content) blocks.push({ key: "f-content", section: "footprint", spacing: 22, node: <ContentEngineCard c={d.content} /> });
    if (d.voice) {
      blocks.push({ key: "f-v-h", section: "footprint", spacing: 22, node: <VoiceHeader /> });
      if (d.voice.tone) blocks.push({ key: "f-v-tone", section: "footprint", spacing: 6, node: <StackedRow label="Tone" value={d.voice.tone} /> });
      if (d.voice.preferred_structures.length > 0) blocks.push({ key: "f-v-struct", section: "footprint", spacing: 0, node: <StackedRow label="Structure" value={d.voice.preferred_structures.join(" · ")} /> });
      if (d.voice.storytelling_patterns.length > 0) blocks.push({ key: "f-v-pat", section: "footprint", spacing: 0, node: <StackedRow label="Patterns" value={d.voice.storytelling_patterns.join(" · ")} /> });
      if (d.voice.vocabulary_preferences.prefer && d.voice.vocabulary_preferences.prefer.length > 0) {
        blocks.push({ key: "f-v-pref", section: "footprint", spacing: 0, node: <StackedRow label="Prefers" value={d.voice.vocabulary_preferences.prefer.join(", ")} /> });
      }
    }
    // Closing guidance — reposition the three market-mirror gap strings as
    // actionable content moves (only when the mirror data is present and
    // persona-matched; safeData already strips stale mirrors).
    if (d.market_mirror) {
      const gaps = d.market_mirror.perspectives.map((p) => p.gap).filter(Boolean);
      if (gaps.length > 0) {
        blocks.push({ key: "f-next90", section: "footprint", spacing: 24, node: <Next90Block gaps={gaps} /> });
      }
    }
  }

  return blocks;
}

interface PackedBlock extends Block {
  height: number;
  effectiveSpacing: number;
}
interface PackedSheet {
  section: SectionKey;
  blocks: PackedBlock[];
}

function packSheets(blocks: Block[], heights: number[]): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  let cur: PackedSheet | null = null;
  let used = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = heights[i] || 0;

    // Section break → always start a new sheet.
    if (!cur || cur.section !== b.section) {
      cur = { section: b.section, blocks: [] };
      sheets.push(cur);
      used = 0;
    }

    const isFirst = cur.blocks.length === 0;
    const spacing = isFirst ? 0 : b.spacing;

    // Doesn't fit remaining space — overflow to a continuation sheet.
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

// ── Root ────────────────────────────────────────────────────────────────
export default function ReportDocument({ data }: { data: ReportData }) {
  // Pre-strip stale market mirror so persona-mismatched cards never render.
  const safeData: ReportData = useMemo(() => {
    if (!data.market_mirror) return data;
    const wanted = rankFromLevel(data.profile?.level);
    if (data.market_mirror.persona_set !== wanted) {
      return { ...data, market_mirror: null };
    }
    return data;
  }, [data]);

  const blocks = useMemo(() => buildBlocks(safeData), [safeData]);

  return <Paginated key={safeData.user_id + ":" + safeData.generated_at} blocks={blocks} />;
}

function Paginated({ blocks }: { blocks: Block[] }) {
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    if (heights !== null) return;
    const next = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
    // Guard: if any block is still 0 (fonts not ready, layout not done), retry next tick.
    if (next.some((h) => h === 0)) {
      const t = setTimeout(() => {
        const retry = blocks.map((_, i) => measureRefs.current[i]?.offsetHeight ?? 0);
        setHeights(retry);
      }, 80);
      return () => clearTimeout(t);
    }
    setHeights(next);
  }, [blocks, heights]);

  // Phase 1 — invisible measurement pass.
  if (!heights) {
    return (
      <div
        aria-hidden
        data-theme="light"
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          width: CONTENT_W,
          background: PAPER,
          color: INK,
          fontFamily: BODY,
          letterSpacing: "normal",
          visibility: "hidden",
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={b.key}
            ref={(el) => {
              measureRefs.current[i] = el;
            }}
            style={{ width: CONTENT_W }}
          >
            {b.node}
          </div>
        ))}
      </div>
    );
  }

  // Phase 2 — pack and render real sheets.
  const sheets = packSheets(blocks, heights);
  const total = sheets.length;

  return (
    <div style={{ background: "#f5f3ee", padding: "24px 0" }} data-report-ready="true">
      {sheets.map((sheet, i) => (
        <Sheet key={i}>
          <PageHeader subtitle={SECTION_SUBTITLE[sheet.section]} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {sheet.blocks.map((b) => (
              <div key={b.key} style={{ marginTop: b.effectiveSpacing, width: "100%" }}>
                {b.node}
              </div>
            ))}
          </div>
          <PageFooter n={i + 1} total={total} />
        </Sheet>
      ))}
    </div>
  );
}