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
  T,
  FONT,
} from "@/components/report/AuraPaper";
import { AuraLogo } from "@/components/brand/AuraLogo";
import type { BrandPaper } from "@/lib/buildBrandPaper";
import type { ReportData } from "@/lib/buildIdentityReport";

const SHEET_W = 794;
const SHEET_H = 1123;
const PAGE_PAD = 56;
const PAPER_TITLE = "The Aura Paper № 00";
const TOTAL_PAGES = 4;

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
function CoverSheet({ bp }: { bp: BrandPaper }) {
  const first = bp.profile.first_name || "";
  const last = bp.profile.last_name || "";
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  const level = bp.profile.level || "";
  const archetype = bp.primary_archetype || "Your Position";
  const lede = bp.natural_tone || (bp.market_read ? bp.market_read.split(/(?<=\.)\s+/)[0] : "");

  return (
    <Sheet n={1}>
      <PaperHeader label="The Assessment Paper" />
      <div style={{ marginTop: 34, flex: 1, display: "flex", flexDirection: "column" }}>
        <MonoLabel color={T.spot} size={13}>
          The Aura Paper · № 00 · The Assessment Finds You To Be
        </MonoLabel>
        <div style={{ marginTop: 22 }}>
          <ArchetypeTitle name={archetype} />
        </div>
        {lede ? (
          <p style={{
            fontFamily: FONT.serif, fontSize: 18, lineHeight: 1.55, color: T.ink2,
            margin: "22px 0 0", maxWidth: 560,
          }}>{lede}</p>
        ) : null}

        {/* Slogan band — carries positioning_statement */}
        {bp.positioning_statement ? (
          <div style={{
            marginTop: 40, marginInline: -PAGE_PAD, padding: `22px ${PAGE_PAD}px`,
            background: T.spot, color: T.paper,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 24,
          }}>
            <span style={{
              fontFamily: FONT.serif, fontStyle: "italic", fontSize: 20,
              color: T.paper, lineHeight: 1.35, flex: 1,
            }}>
              “{bp.positioning_statement}”
            </span>
            <span style={{
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: T.action, whiteSpace: "nowrap",
            }}>Your position, in one line</span>
          </div>
        ) : null}

        {/* Reading legend */}
        <div style={{
          marginTop: 34, border: `1.5px solid ${T.ink}`, background: T.paper2,
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${T.rule}`,
            fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase", color: T.ink,
          }}>
            How to read this paper — three colours, three meanings
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            <LegendCell swatch={T.spot} title="Oxblood — Finding" body="A conclusion drawn from your answers." />
            <LegendCell swatch={T.live} title="Movement" body="Something live and rising in your positioning." border />
            <LegendCell swatch={T.action} title="Action" body="Held by you, unclaimed — the next move." border />
          </div>
        </div>

        {/* Meta grid */}
        <div style={{
          marginTop: 34, paddingTop: 14, borderTop: `1px solid ${T.rule}`,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20,
        }}>
          <MetaCell label="Prepared for" value={fullName || "—"} sub={level} />
          <MetaCell label="Secondary read" value={bp.secondary_archetype || "—"} />
          <MetaCell label="Issued" value={todayLabel(bp.generated_at)} sub="Edition 0 · Assessment" />
        </div>
      </div>
      <PaperFooter n={1} total={TOTAL_PAGES} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

// ── Sheet 2 — Four findings ────────────────────────────────────────────
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
        }}>{f.body}</div>
      </div>
    </div>
  );
}

function FindingsSheet({ bp }: { bp: BrandPaper }) {
  const raw: (Finding | null)[] = [
    bp.market_read ? {
      code: "F · 1", body: bp.market_read,
      source: "Source — Assessment answers × capability calibration",
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
  const findings = raw.filter((f): f is Finding => f !== null);

  return (
    <Sheet n={2}>
      <PaperHeader label="Findings" />
      <div style={{ marginTop: 34, flex: 1 }}>
        <MonoLabel color={T.spot} size={11}>Chapter 01</MonoLabel>
        <h2 style={{
          fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1,
          color: T.ink, margin: "10px 0 6px", letterSpacing: "-0.01em",
        }}>
          Four findings, <span style={{ fontStyle: "italic", color: T.spot }}>evidenced</span>
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
      </div>
      <PaperFooter n={2} total={TOTAL_PAGES} paperTitle={PAPER_TITLE} />
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
          lineHeight: 1.25, marginBottom: 6, letterSpacing: "-0.005em",
        }}>{title}</div>
        {description ? (
          <div style={{ fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.55 }}>
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SpaceSheet({ bp }: { bp: BrandPaper }) {
  const hasInvest = bp.invest_next.length > 0;
  return (
    <Sheet n={3}>
      <PaperHeader label="Ground & Topics" />
      <div style={{ marginTop: 30, flex: 1 }}>
        {bp.uncontested_space ? (
          <PaperFigure
            index={1}
            label="The Uncontested Ground"
            findingBold="Finding —"
            findingRest="the space above is yours to occupy first."
          >
            <p style={{
              fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.6,
              color: T.ink, margin: 0,
            }}>{bp.uncontested_space}</p>
          </PaperFigure>
        ) : null}

        {bp.topics.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <MonoLabel color={T.spot} size={11}>Your three topics</MonoLabel>
            <div style={{ marginTop: 10, borderBottom: `1px solid ${T.rule}` }}>
              {bp.topics.slice(0, 3).map((t, i) => (
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
      <PaperFooter n={3} total={TOTAL_PAGES} paperTitle={PAPER_TITLE} />
    </Sheet>
  );
}

// ── Sheet 4 — ClosingPlate ─────────────────────────────────────────────
function ClosingSheet({ bp }: { bp: BrandPaper }) {
  const archetype = bp.primary_archetype || "Your Position";
  const parts = archetype.trim().split(/\s+/);
  const tail = parts.pop() || "";
  const head = parts.join(" ");
  const closingData: ReportData = {
    generated_at: bp.generated_at,
    user_id: "",
    profile: {
      first_name: bp.profile.first_name || null,
      last_name: bp.profile.last_name || null,
      level: bp.profile.level || null,
    },
    score: null,
    positioning: null,
    capabilities: null,
    market: null,
    // Any additional required fields are typed as nullable slices on ReportData.
  } as unknown as ReportData;

  return (
    <Sheet n={4} bleed>
      <ClosingPlate
        data={closingData}
        headline={
          <>
            {head ? <>{head} </> : null}
            <span style={{ fontStyle: "italic", color: T.action }}>{tail}</span>
          </>
        }
        body={bp.positioning_statement || undefined}
        ctaLabel="Find your position ↗"
      />
    </Sheet>
  );
}

// ── Root ───────────────────────────────────────────────────────────────
export default function BrandPaperDocument({ paper }: { paper: BrandPaper }) {
  return (
    <div style={{ background: T.paper2, padding: "24px 0" }}>
      <CoverSheet bp={paper} />
      <FindingsSheet bp={paper} />
      <SpaceSheet bp={paper} />
      <ClosingSheet bp={paper} />
    </div>
  );
}

// Small unused import guard to keep the AuraLogo bundle side effect stable.
void AuraLogo;