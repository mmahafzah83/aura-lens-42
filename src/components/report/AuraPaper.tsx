// AuraPaper — visual primitives for the Strategic Identity Report
// (AKA "The Aura Paper № 01"). Colours are System-A tokens only. SVG
// attribute colours mirror the same tokens (var(--x)) so html2canvas
// resolves the exact page palette at raster time.
//
// Pure presentation. No data shape changes here — every consumer feeds
// existing ReportData slices from @/lib/buildIdentityReport.

import React, { useEffect, useState } from "react";
import { AuraLogo } from "@/components/brand/AuraLogo";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData, CapabilitiesSection } from "@/lib/buildIdentityReport";

// ── Tokens (System-A) ──────────────────────────────────────────────────
export const T = {
  ink:    "var(--ink)",
  ink2:   "var(--ink-2)",
  ink3:   "var(--ink-3)",
  paper:  "var(--paper)",
  paper2: "var(--paper-2)",
  paper3: "var(--paper-3)",
  rule:   "var(--rule)",
  spot:   "var(--spot)",
  live:   "var(--live)",
  action: "var(--action)",
};

export const FONT = {
  serif:  "'Newsreader', Georgia, 'Times New Roman', serif",
  mono:   "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  arabic: "'Cairo', sans-serif",
};

// ── Small helpers ──────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }

function todayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return ""; }
}

// ── PaperHeader ────────────────────────────────────────────────────────
export function PaperHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 12,
        borderBottom: `1.5px solid ${T.ink}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.ink }}>
        <AuraLogo size={34} variant="light" />
        <span
          style={{
            fontFamily: FONT.serif,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: T.ink,
            lineHeight: 1,
          }}
        >
          Aura
        </span>
      </div>
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.ink2,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── PaperFooter ────────────────────────────────────────────────────────
export function PaperFooter({
  n, total, paperTitle = "The Aura Paper № 01",
}: { n: number; total: number; paperTitle?: string }) {
  const ticks = Array.from({ length: total }, (_, i) => (
    <span
      key={i}
      aria-hidden
      style={{
        display: "inline-block",
        width: 22,
        height: 5,
        background: i === n - 1 ? T.spot : T.paper3,
        marginRight: i === total - 1 ? 0 : 4,
      }}
    />
  ));
  return (
    <div style={{ marginTop: "auto", paddingTop: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: `1.5px solid ${T.ink}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.ink,
          }}
        >
          {paperTitle}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center" }}>{ticks}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: T.ink,
            color: T.paper,
            fontFamily: FONT.mono,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            padding: "4px 10px",
          }}
        >
          <span style={{ color: T.action }}>PAGE {pad2(n)}</span>
          <span style={{ color: T.paper }}> / {pad2(total)}</span>
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: FONT.mono,
          fontSize: 10.5,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: T.ink2,
        }}
      >
        <span>aura-intel.org</span>
        <span>
          Turns your expertise into presence
          <span style={{ margin: "0 8px", color: T.spot }}>·</span>
          <span
            style={{ fontFamily: FONT.arabic, textTransform: "none", letterSpacing: "normal" }}
            dir="rtl"
            lang="ar"
          >
            حوّل خبرتك إلى حضور
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Ghost mark (Aura ray group at low opacity, bleeds off right edge) ──
function GhostMark() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 40,
        right: -240,
        width: 720,
        height: 720,
        opacity: 0.055,
        color: T.ink,
        pointerEvents: "none",
      }}
    >
      <AuraLogo size={720} variant="light" />
    </div>
  );
}

// ── PaperCover ─────────────────────────────────────────────────────────
export function PaperCover({ data }: { data: ReportData }) {
  const p = data.profile;
  const first = p?.first_name || "";
  const last = p?.last_name || "";
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  const level = p?.level || "";
  const scoreVal = data.score?.score ?? null;
  const tier = data.score?.tier || "";
  const statement = data.positioning?.statement || data.positioning?.title || "";

  return (
    <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <GhostMark />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: T.spot,
            marginBottom: 28,
          }}
        >
          The Aura Paper · № 01
        </div>
        <h1
          style={{
            fontFamily: FONT.serif,
            fontSize: 64,
            fontWeight: 400,
            lineHeight: 1.04,
            color: T.ink,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          A Strategic Identity Report,
          <br />
          <span style={{ fontStyle: "italic" }}>{fullName || "for you"}</span>
        </h1>
        {statement ? (
          <p
            style={{
              fontFamily: FONT.serif,
              fontSize: 20,
              lineHeight: 1.5,
              color: T.ink2,
              margin: "26px 0 0",
              maxWidth: 560,
              display: "-webkit-box",
              WebkitLineClamp: 6,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {statement}
          </p>
        ) : null}
      </div>

      {/* Slogan band — full bleed inside the sheet padding */}
      <div
        style={{
          marginTop: 28,
          marginInline: -56,
          padding: "22px 56px",
          background: T.spot,
          color: T.paper,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: FONT.serif,
            fontStyle: "italic",
            fontSize: 21,
            color: T.paper,
            lineHeight: 1.3,
          }}
        >
          Your expertise is invisible. Aura fixes that.
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: T.action,
            whiteSpace: "nowrap",
          }}
        >
          Built from your record alone
        </span>
      </div>

      {/* Reading legend */}
      <div
        style={{
          marginTop: 24,
          border: `1.5px solid ${T.ink}`,
          background: T.paper2,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${T.rule}`,
            fontFamily: FONT.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: T.ink,
          }}
        >
          How to read this paper — three colours, three meanings
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
          <LegendCell swatch={T.spot} title="Oxblood — Finding" body="A conclusion drawn from your evidence." />
          <LegendCell swatch={T.live} title="Movement" body="Something live and rising in your record." border />
          <LegendCell swatch={T.action} title="Action" body="Held by you, unclaimed — the next move." border />
        </div>
      </div>

      {/* Meta grid */}
      <div
        style={{
          marginTop: 26,
          paddingTop: 14,
          borderTop: `1px solid ${T.rule}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 20,
          position: "relative",
          zIndex: 1,
        }}
      >
        <MetaCell
          label="Prepared for"
          value={fullName || "—"}
          sub={level}
        />
        <MetaCell
          label="Standing at issue"
          value={scoreVal !== null ? `Imprint ${scoreVal}` : "—"}
          sub={tier ? `${tier} tier` : ""}
        />
        <MetaCell
          label="Issued"
          value={todayLabel(data.generated_at)}
          sub="Edition 1"
        />
      </div>
    </div>
  );
}

function LegendCell({ swatch, title, body, border }:
  { swatch: string; title: string; body: string; border?: boolean }) {
  return (
    <div style={{ padding: "14px 14px", borderLeft: border ? `1px solid ${T.rule}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span aria-hidden style={{ display: "inline-block", width: 16, height: 16, background: swatch }} />
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: T.ink,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.55, color: T.ink2 }}>{body}</div>
    </div>
  );
}

function MetaCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: T.ink3,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 17, color: T.ink, lineHeight: 1.3 }}>{value}</div>
      {sub ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.ink3, marginTop: 3, letterSpacing: "0.06em" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── PaperFigure ────────────────────────────────────────────────────────
export function PaperFigure({
  index, label, meta, findingBold, findingRest, children,
}: {
  index: number;
  label: string;         // e.g. "THE IMPRINT INSTRUMENT"
  meta?: string;
  findingBold: string;
  findingRest?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1.5px solid ${T.ink}`, background: T.paper2 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${T.rule}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: T.spot,
          }}
        >
          Figure {index} · {label}
        </span>
        {meta ? (
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.ink2,
            }}
          >
            {meta}
          </span>
        ) : null}
      </div>
      <div style={{ padding: "18px 18px" }}>{children}</div>
      <div style={{ borderTop: `1px solid ${T.rule}`, background: T.paper, padding: "10px 14px" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.ink, fontWeight: 700 }}>{findingBold}</span>
        {findingRest ? (
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.ink2, fontWeight: 400 }}>
            {" "}{findingRest}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── ImprintDial ────────────────────────────────────────────────────────
export function ImprintDial({ score, tier }: { score: number; tier: string | null }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 86;
  const stroke = 10;
  const C = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * C;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} stroke={T.paper3} strokeWidth={stroke} fill="none" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={T.spot}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${C - dash}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="butt"
      />
      {[0, 25, 50, 75].map((v, i) => {
        const angle = (-90 + (v / 100) * 360) * (Math.PI / 180);
        const lx = cx + (r + 14) * Math.cos(angle);
        const ly = cy + (r + 14) * Math.sin(angle);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={FONT.mono}
            fontSize={11}
            fill={T.ink3}
          >
            {v}
          </text>
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={FONT.mono}
        fontSize={52}
        fontWeight={600}
        fill={T.ink}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 30}
        textAnchor="middle"
        fontFamily={FONT.mono}
        fontSize={10.5}
        fontWeight={700}
        letterSpacing="1.6"
        fill={T.spot}
      >
        IMPRINT · {(tier || "—").toUpperCase()}
      </text>
    </svg>
  );
}

// ── ComponentBar ───────────────────────────────────────────────────────
export function ComponentBar({
  label, weight, value, weighted, isConsistency,
}: {
  label: string;
  weight: number;
  value: number;
  weighted?: number | null;
  isConsistency?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = isConsistency ? T.action : T.spot;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: T.ink,
          }}
        >
          {label}
          <span style={{ color: T.ink3, marginLeft: 8, fontWeight: 400 }}>{weight}% weight</span>
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 14,
            fontWeight: 700,
            color: T.ink,
          }}
        >
          {Math.round(value)}
        </span>
      </div>
      <div style={{ position: "relative", height: 12, background: T.paper3 }}>
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${tick}%`,
              width: 1,
              background: T.paper,
            }}
          />
        ))}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: fill }} />
      </div>
      <div style={{ marginTop: 5, fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.12em", color: T.ink3, textTransform: "uppercase" }}>
        Contributes {weighted != null ? Math.round(weighted) : Math.round((value * weight) / 100)} of {weight} weighted points
      </div>
    </div>
  );
}

// ── useImprintDelta ────────────────────────────────────────────────────
// Shared query for the trailing ~8 weekly imprint samples. Fetches
// snapshots from the last 63 days ascending, then buckets to one point
// per ISO week (last snapshot per week), capped at 8 buckets. Returns
// the bucketed series plus (last − first) delta. Used by both the
// sparkline and the closing plate so the score_snapshots query lives
// in exactly one place.
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
export function useImprintDelta(userId: string): { rows: { score: number }[] | null; delta: number } {
  const [rows, setRows] = useState<{ score: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 63 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("score_snapshots")
          .select("score, created_at")
          .eq("user_id", userId)
          .gte("created_at", since)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const raw = (data || []) as { score: number; created_at: string }[];
        const byWeek = new Map<string, { score: number }>();
        for (const r of raw) {
          const key = isoWeekKey(new Date(r.created_at));
          byWeek.set(key, { score: r.score }); // last write wins → last snapshot in week
        }
        const buckets = Array.from(byWeek.values()).slice(-8);
        setRows(buckets);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const delta = rows && rows.length >= 2 ? rows[rows.length - 1].score - rows[0].score : 0;
  return { rows, delta };
}

// ── ImprintSparkline ───────────────────────────────────────────────────
export function ImprintSparkline({ userId }: { userId: string }) {
  const { rows, delta } = useImprintDelta(userId);

  if (!rows || rows.length < 2) {
    return <div style={{ width: 220, height: 60 }} aria-hidden />;
  }
  const vals = rows.map((r) => r.score);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(1, max - min);
  const W = 220;
  const H = 60;
  const step = W / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * (H - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",").map(Number);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <polyline points={pts.join(" ")} fill="none" stroke={T.spot} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r={3.5} fill={T.live} />
      </svg>
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 30,
          fontWeight: 700,
          color: T.live,
          letterSpacing: "0.02em",
        }}
      >
        {delta >= 0 ? "+" : ""}{delta}
      </span>
    </div>
  );
}

// ── CapabilityDotPlot ──────────────────────────────────────────────────
export function CapabilityDotPlot({ data }: { data: CapabilitiesSection }) {
  const rowH = 30;
  const height = data.length * rowH + 24;
  const leftLabel = 190;
  const railStart = leftLabel + 8;
  const W = 720;
  const railEnd = W - 40;
  const railW = railEnd - railStart;
  const bandStart = railStart + (railW * 0.70);
  const bandEnd = railStart + railW;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%">
      {/* Axis header */}
      {[0, 25, 50, 75, 100].map((v) => {
        const x = railStart + (railW * v) / 100;
        return (
          <text
            key={v}
            x={x}
            y={12}
            textAnchor="middle"
            fontFamily={FONT.mono}
            fontSize={10.5}
            fill={T.ink3}
          >
            {v}
          </text>
        );
      })}
      {/* Elite band 70-100 */}
      <rect
        x={bandStart}
        y={20}
        width={bandEnd - bandStart}
        height={height - 24}
        fill={T.live}
        fillOpacity={0.12}
      />
      <line x1={bandStart} y1={20} x2={bandStart} y2={height - 4} stroke={T.live} strokeWidth={0.75} strokeDasharray="3 3" />
      <line x1={bandEnd} y1={20} x2={bandEnd} y2={height - 4} stroke={T.live} strokeWidth={0.75} strokeDasharray="3 3" />

      {data.map((d, i) => {
        const y = 24 + i * rowH + rowH / 2;
        const pct = Math.max(0, Math.min(100, d.score));
        const x = railStart + (railW * pct) / 100;
        const low = d.score < 50;
        return (
          <g key={d.name}>
            <text
              x={leftLabel - 4}
              y={y + 4}
              textAnchor="end"
              fontFamily={FONT.mono}
              fontSize={11}
              fontWeight={low ? 700 : 500}
              fill={low ? T.spot : T.ink}
            >
              {d.name}
            </text>
            <line x1={railStart} y1={y} x2={railEnd} y2={y} stroke={T.rule} strokeWidth={3} />
            {low ? (
              <circle cx={x} cy={y} r={7} fill={T.paper2} stroke={T.spot} strokeWidth={2.5} />
            ) : (
              <circle cx={x} cy={y} r={7} fill={T.ink} />
            )}
            <text
              x={x + 14}
              y={y + 4}
              fontFamily={FONT.mono}
              fontSize={11}
              fontWeight={700}
              fill={low ? T.spot : T.ink}
            >
              {d.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── PersonaCard (Market Mirror) ────────────────────────────────────────
export function PaperPersonaCard({ p }: { p: { who: string; sees: string; gap: string } }) {
  return (
    <div style={{ border: `1.5px solid ${T.ink}`, background: T.paper }}>
      <div
        style={{
          padding: "10px 14px",
          background: T.paper2,
          borderBottom: `1px solid ${T.rule}`,
          fontFamily: FONT.mono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: T.ink,
        }}
      >
        The {p.who}
      </div>
      {p.sees ? (
        <div style={{ padding: "14px 16px", fontFamily: FONT.serif, fontSize: 14, color: T.ink2, lineHeight: 1.65 }}>
          {p.sees}
        </div>
      ) : null}
      {p.gap ? (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.rule}`, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.12em" }}>
          <span style={{ color: T.spot, fontWeight: 700, textTransform: "uppercase" }}>Would notice: </span>
          <span style={{ color: T.ink2, textTransform: "none", fontFamily: FONT.serif, fontSize: 13, letterSpacing: "normal" }}>
            {p.gap}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── ClosingPlate ───────────────────────────────────────────────────────
export function ClosingPlate({
  data, activeSignals = null, evidenceCount = null, sparkDelta = null,
  headline, body, ctaLabel = "Built from my own record ↗",
}: {
  data: ReportData;
  activeSignals?: number | null;
  evidenceCount?: number | null;
  sparkDelta?: number | null;
  headline?: React.ReactNode;
  body?: React.ReactNode;
  ctaLabel?: string;
}) {
  const p = data.profile;
  const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  const scoreVal = data.score?.score ?? null;
  const showStats =
    scoreVal !== null ||
    activeSignals !== null ||
    evidenceCount !== null ||
    sparkDelta !== null;

  return (
    <div
      style={{
        background: T.ink,
        color: T.paper,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        margin: 0,
        padding: 0,
        position: "relative",
      }}
    >
      <div style={{ height: 6, background: T.spot }} />
      <div style={{ padding: "56px 56px 40px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: T.paper }}>
            <AuraLogo size={40} variant="dark" />
            <span
              style={{
                fontFamily: FONT.serif,
                fontSize: 22,
                letterSpacing: "0.06em",
                color: T.paper,
              }}
            >
              Aura
            </span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: T.action,
            }}
          >
            Closing plate · 90-day pointer
          </span>
        </div>

        <h2
          style={{
            fontFamily: FONT.serif,
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 1.12,
            color: T.paper,
            margin: 0,
            maxWidth: 560,
          }}
        >
          {headline ?? (
            <>
              Ninety days is enough to{" "}
              <span style={{ fontStyle: "italic", color: T.action }}>close</span> the gap
              between your record and how the market reads it.
            </>
          )}
        </h2>
        {body ? (
          <p
            style={{
              fontFamily: FONT.serif,
              fontSize: 18,
              lineHeight: 1.5,
              color: "rgba(241,236,225,0.86)",
              margin: "18px 0 0",
              maxWidth: 560,
            }}
          >
            {body}
          </p>
        ) : null}

        {showStats ? (
        <div
          style={{
            marginTop: 60,
            paddingTop: 20,
            paddingBottom: 20,
            borderTop: "1px solid rgba(241,236,225,0.28)",
            borderBottom: "1px solid rgba(241,236,225,0.28)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
          }}
        >
          {scoreVal !== null ? (
            <ClosingStat label="Imprint" value={String(scoreVal)} deltaTeal={sparkDelta && sparkDelta > 0 ? `▲ +${sparkDelta}` : null} />
          ) : null}
          {activeSignals !== null ? (
            <ClosingStat label="Active signals" value={String(activeSignals)} />
          ) : null}
          {evidenceCount !== null ? (
            <ClosingStat label="Evidence fragments" value={String(evidenceCount)} />
          ) : null}
          <ClosingStat label="90 days to close the gap" value="" />
        </div>
        ) : null}

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.paper,
            }}
          >
            <div>{fullName || "—"}</div>
            <div style={{ color: "rgba(241,236,225,0.6)", marginTop: 3 }}>The Aura Paper № 01 · aura-intel.org</div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              border: `1.5px solid ${T.action}`,
              color: T.action,
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {ctaLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function ClosingStat({ label, value, deltaTeal }: { label: string; value: string; deltaTeal?: string | null }) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(241,236,225,0.65)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {value ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 34, fontWeight: 700, color: T.paper, lineHeight: 1 }}>
            {value}
          </span>
          {deltaTeal ? (
            <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: T.live }}>{deltaTeal}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default {
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
  T,
  FONT,
};
