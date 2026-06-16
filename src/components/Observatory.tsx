/**
 * Observatory — dark Instrument shell for /intelligence.
 *
 * Replaces the legacy IntelligenceTab surface. This file is the canonical
 * intelligence shell going forward; IntelligenceTab.tsx remains on disk and
 * its inner pieces (SignalHero, TierSection, EditorialBlindSpots,
 * EditorialReadingList) are COMPOSED in via re-exports — never rebuilt.
 *
 * Zones:
 *   1. INSTRUMENTS — AuraDial (imprint_snapshots) + ImprintCore (facet_states)
 *      + three raw-count readouts (Signal / Published / Rhythm)
 *   2. THE SCAN — alerts, SignalHero (debounced), theme chips, TierSection list,
 *      EditorialBlindSpots, EditorialReadingList
 *   3. SOURCES — SourcesSubTab
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Archive, Brain, ChevronDown, Loader2, X,
  Zap, Leaf, Sprout, HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SectionError from "@/components/ui/section-error";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

import { useAuthReady } from "@/hooks/useAuthReady";
import { useJourneyState } from "@/hooks/useJourneyState";
import { applyPublishedFilter, filterPublishedRows } from "@/lib/postProvenance";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  SignalHero, TierSection, EditorialBlindSpots, EditorialReadingList,
  type Signal,
} from "@/components/tabs/IntelligenceTab";
import { daysUntilDormant } from "@/components/intelligence/VelocityIndicators";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface SignalDraftPrefill {
  topic: string;
  context: string;
  signalId?: string;
  signalTitle?: string;
  sourceType?: string;
  sourceTitle?: string;
}

interface ObservatoryProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
  onDraftToStudio?: (prefill: SignalDraftPrefill) => void;
}

/* ──────────────────────────────────────────────────────────
   Motion helpers
   ────────────────────────────────────────────────────────── */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

/** Hook: pause expensive motion when element is off-screen. */
function useOnScreen<T extends HTMLElement>(ref: React.RefObject<T>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

/* ──────────────────────────────────────────────────────────
   AuraDial — the Imprint dial
   Inline SVG with SMIL halo pulse + tick-sweep.
   Pulse omitted under prefers-reduced-motion.
   ────────────────────────────────────────────────────────── */
function useCountUpNum(target: number | null, reduce: boolean) {
  const [val, setVal] = useState<number>(target ?? 0);
  useEffect(() => {
    if (target == null) { setVal(0); return; }
    if (reduce) { setVal(target); return; }
    const from = val;
    const to = target;
    const duration = 700;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  return val;
}

const AuraDial = ({
  score, delta, loading, onScreen, weekShape,
}: { score: number | null; delta: number | null; loading: boolean; onScreen: boolean; weekShape: number[] }) => {
  const reduce = prefersReducedMotion();
  const displayed = useCountUpNum(score, reduce);

  // Tick-bezel geometry: a ring of 60 short radial ticks, with the first
  // round(score/100 * 60) ticks lit (var(--live)) and the rest dim.
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const rInner = 86;
  const rOuterMinor = 100;
  const rOuterMajor = 104;
  const TICKS = 60;
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const litCount = score == null ? 0 : Math.round(pct * TICKS);

  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const angle = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 5 === 0;
    const inner = rInner;
    const outer = isMajor ? rOuterMajor : rOuterMinor;
    const lit = i < litCount;
    return (
      <line key={i}
        x1={cx + Math.cos(angle) * inner} y1={cy + Math.sin(angle) * inner}
        x2={cx + Math.cos(angle) * outer} y2={cy + Math.sin(angle) * outer}
        stroke={lit ? "var(--live)" : "var(--hair)"}
        strokeWidth={isMajor ? 1.6 : 1.1}
        strokeLinecap="round"
        opacity={lit ? 1 : 0.55}
      />
    );
  });

  const deltaLabel =
    delta == null ? "—" :
    delta > 0 ? `▲${delta} this week` :
    delta < 0 ? `▼${Math.abs(delta)} this week` :
    "steady this week";
  const deltaColor =
    delta == null ? "var(--glass-2)" :
    delta > 0 ? "var(--pos)" :
    delta < 0 ? "var(--neg)" : "var(--glass-2)";

  // Sparkline (week shape) — small line of up-to-7 daily imprint values.
  const sparkW = 84;
  const sparkH = 24;
  const showSpark = weekShape.length >= 2;
  let sparkPath = "";
  if (showSpark) {
    const min = Math.min(...weekShape);
    const max = Math.max(...weekShape);
    const range = Math.max(1, max - min);
    const step = sparkW / (weekShape.length - 1);
    sparkPath = weekShape.map((v, i) => {
      const x = i * step;
      const y = sparkH - ((v - min) / range) * sparkH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
             aria-label={score != null ? `Imprint ${Math.round(score)} of 100` : "Imprint forming"}>
          <g>{ticks}</g>
          {/* numeric — serif */}
          <text x={cx} y={cy + 10} textAnchor="middle"
                fill="var(--glass)"
                fontFamily="var(--font-display, 'Newsreader', serif)"
                fontSize={56} fontWeight={500} style={{ fontVariantNumeric: "tabular-nums" }}>
            {loading ? "—" : score == null ? "—" : Math.round(displayed)}
          </text>
          <text x={cx} y={cy + 32} textAnchor="middle"
                fill="var(--glass-2)" fontFamily="'IBM Plex Mono', monospace"
                fontSize={10} letterSpacing="0.18em">
            IMPRINT
          </text>
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.06em" }}>
        <span style={{ color: deltaColor }}>{deltaLabel}</span>
        {showSpark && (
          <svg width={sparkW} height={sparkH} aria-label="Week shape" style={{ display: "block" }}>
            <path d={sparkPath} fill="none" stroke="var(--live)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          </svg>
        )}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   ImprintCore — seven facets, inline SVG
   Reads facet_states. Identity / Expertise / Voice / Focus / Audience
   show numeric values. Perception + Confidence render as forming
   (dashed, no live number) — the engine runs them silent for now.
   ────────────────────────────────────────────────────────── */
type FacetKey = "Identity" | "Expertise" | "Voice" | "Focus" | "Audience" | "Perception" | "Confidence";
const FACET_ORDER: FacetKey[] = ["Identity", "Expertise", "Voice", "Focus", "Audience", "Perception", "Confidence"];
const FORMING: ReadonlySet<FacetKey> = new Set<FacetKey>(["Perception", "Confidence"]);

/** facet_states stores lowercase canonical keys. Map → display facet name. */
const FACET_DB_TO_DISPLAY: Record<string, FacetKey> = {
  identity: "Identity",
  edge: "Expertise",
  voice: "Voice",
  focus: "Focus",
  audience: "Audience",
  discernment: "Perception",
  conviction: "Confidence",
};

interface FacetRow {
  facet: FacetKey;
  value: number | null;
  uncertainty: number | null;
}

const ImprintCore = ({
  facets, loading, onScreen,
}: { facets: FacetRow[]; loading: boolean; onScreen: boolean }) => {
  const reduce = prefersReducedMotion();
  const animate = !reduce && onScreen;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const ringR = 78;
  const n = FACET_ORDER.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Imprint core: 7 facets" style={{ overflow: "visible" }}>
        {/* outer guide ring */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--hair)" strokeWidth={0.5} />
        {/* core */}
        <circle cx={cx} cy={cy} r={14} fill="none" stroke="var(--live)" strokeWidth={1} opacity={0.7}>
          {animate && (
            <animate attributeName="r" values="14;18;14" dur="2.6s" repeatCount="indefinite" />
          )}
          {animate && (
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.6s" repeatCount="indefinite" />
          )}
        </circle>
        <circle cx={cx} cy={cy} r={4} fill="var(--live)" opacity={0.9} />

        {FACET_ORDER.map((key, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const row = facets.find(f => f.facet === key);
          const v = row?.value ?? null;
          const isForming = FORMING.has(key);
          const noValue = v == null;
          // Perception/Confidence ALWAYS render as a dashed "forming" ghost
          // outline regardless of value. Other facets are ghost only if no value.
          const ghost = isForming || noValue;
          // Certainty: opacity = clamp(1 − uncertainty, 0.4, 1.0). Only applies
          // to measured (non-forming) facets with a real value.
          const u = row?.uncertainty ?? null;
          const certainty = (!ghost && u != null)
            ? Math.max(0.4, Math.min(1, 1 - u))
            : (ghost ? 0.55 : 1);
          const dist = ringR;
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * dist;
          const labelDist = ringR + 26;
          const lx = cx + Math.cos(angle) * labelDist;
          const ly = cy + Math.sin(angle) * labelDist;

          const dotR = ghost ? 5 : 5 + Math.min(4, Math.max(0, (v ?? 0) / 25));
          return (
            <g key={key} opacity={certainty}>
              {/* spoke */}
              <line x1={cx} y1={cy} x2={px} y2={py}
                    stroke={ghost ? "var(--glass-3)" : "var(--live)"}
                    strokeWidth={0.5}
                    strokeDasharray={ghost ? "3 3" : undefined}
                    opacity={ghost ? 0.6 : 0.85} />
              {/* dot */}
              <circle cx={px} cy={py} r={dotR}
                      fill={ghost ? "transparent" : "var(--live)"}
                      stroke={ghost ? "var(--glass-2)" : "var(--live)"}
                      strokeWidth={1}
                      strokeDasharray={ghost ? "2 2" : undefined} />
              {/* label — widened box so full names render */}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                    fill="var(--glass-2)" fontFamily="'IBM Plex Mono', monospace"
                    fontSize={9} letterSpacing="0.06em">
                {key.toUpperCase()}
              </text>
              {/* value */}
              {!ghost && v != null && (
                <text x={lx} y={ly + 11} textAnchor="middle" dominantBaseline="middle"
                      fill="var(--glass)" fontFamily="'IBM Plex Mono', monospace"
                      fontSize={10} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: "var(--glass-2)", letterSpacing: "0.14em", textAlign: "center",
                    maxWidth: 260, lineHeight: 1.5 }}>
        {loading
          ? "CORE · LOADING"
          : "Perception & Confidence are still forming — your next frontier."}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   ContributionBar — three parts (Signal/Content/Rhythm) summing
   to the Imprint score. Reads imprint_snapshots.components.score_components.
   ────────────────────────────────────────────────────────── */
type ScoreComponents = { signal_score: number; content_score: number; capture_score: number };

const WEIGHTS = { signal: 0.40, content: 0.40, rhythm: 0.20 } as const;
const RHYTHM_TEAL = "color-mix(in srgb, var(--live) 55%, var(--glass) 5%)";

/** Round three values so they sum EXACTLY to `target`. Adjust the largest. */
function roundToSum(parts: [number, number, number], target: number): [number, number, number] {
  const rounded = parts.map(Math.round) as [number, number, number];
  const diff = target - (rounded[0] + rounded[1] + rounded[2]);
  if (diff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < 3; i++) if (parts[i] > parts[maxIdx]) maxIdx = i;
    rounded[maxIdx] = rounded[maxIdx] + diff;
  }
  return rounded;
}

const ContributionBar = ({
  imprint, components, loading,
}: { imprint: number | null; components: ScoreComponents | null; loading: boolean }) => {
  if (loading || imprint == null || !components) {
    return (
      <div style={{
        padding: 16, background: "var(--ob-panel)",
        border: "0.5px solid var(--hair)", borderRadius: 12,
      }}>
        <div style={{ height: 14, background: "var(--ob-field)", borderRadius: 4, opacity: 0.5 }} />
        <div style={{ marginTop: 10, height: 11, width: "60%", background: "var(--ob-field)", borderRadius: 4, opacity: 0.4 }} />
      </div>
    );
  }

  const sRaw = Math.max(0, Math.min(100, components.signal_score)) * WEIGHTS.signal;
  const cRaw = Math.max(0, Math.min(100, components.content_score)) * WEIGHTS.content;
  const rRaw = Math.max(0, Math.min(100, components.capture_score)) * WEIGHTS.rhythm;
  const target = Math.round(Math.max(0, Math.min(100, imprint)));
  const [s, c, r] = roundToSum([sRaw, cRaw, rRaw], target);

  // Bar geometry: each segment width = its rounded contribution (out of 100).
  const segs = [
    { key: "Signal",  v: s, color: "var(--live)",   slug: "signal-contribution",  text: "How strong and well-evidenced your signals are." },
    { key: "Content", v: c, color: "var(--action)", slug: "content-contribution", text: "How much you've published from your signals." },
    { key: "Rhythm",  v: r, color: RHYTHM_TEAL,     slug: "rhythm-contribution",  text: "How steadily you've been capturing, week to week." },
  ];

  // Lever: largest (gap-to-100 × weight).
  const levers = [
    { label: "Signal",  gap: (100 - components.signal_score)  * WEIGHTS.signal },
    { label: "Content", gap: (100 - components.content_score) * WEIGHTS.content },
    { label: "Rhythm",  gap: (100 - components.capture_score) * WEIGHTS.rhythm },
  ];
  const lever = levers.reduce((a, b) => (b.gap > a.gap ? b : a));

  return (
    <div style={{
      padding: 18, background: "var(--ob-panel)",
      border: "0.5px solid var(--hair)", borderRadius: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
          color: "var(--glass-2)", letterSpacing: "0.16em",
        }}>WHAT BUILDS YOUR IMPRINT</span>
        <InfoTooltip
          slug="imprint-composition"
          text="Your Imprint is built from three things: the strength of your signals, what you've published, and how steadily you show up."
          label="What builds your Imprint"
          side="top"
          triggerSize={13}
        />
      </div>

      {/* Bar — full width = 100. Three segments sized to contributions. */}
      <div role="img" aria-label={`Imprint ${target}: signal ${s}, content ${c}, rhythm ${r}`}
           style={{
             display: "flex", width: "100%", height: 14, borderRadius: 4,
             overflow: "hidden", background: "var(--ob-field)",
             border: "0.5px solid var(--hair)",
           }}>
        {segs.map(seg => (
          <div key={seg.key} title={`${seg.key} +${seg.v}`}
               style={{ width: `${seg.v}%`, background: seg.color, transition: "width 600ms cubic-bezier(.4,0,.2,1)" }} />
        ))}
      </div>

      {/* Legend dots */}
      <div style={{
        marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
        color: "var(--glass-2)", letterSpacing: "0.04em",
      }}>
        {segs.map(seg => (
          <span key={seg.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, background: seg.color,
              display: "inline-block",
            }} />
            <span style={{ color: "var(--glass)" }}>{seg.key}</span>
            <InfoTooltip text={seg.text} label={`${seg.key} contribution`} side="top" triggerSize={12} />
          </span>
        ))}
      </div>

      {/* Mono tally */}
      <div style={{
        marginTop: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
        color: "var(--glass)", letterSpacing: "0.02em",
        fontVariantNumeric: "tabular-nums",
      }}>
        Signal +{s} · Content +{c} · Rhythm +{r} = Imprint {target}
      </div>

      {/* Lever line */}
      <div style={{
        marginTop: 6, fontSize: 12, color: "var(--glass-2)", lineHeight: 1.5,
      }}>
        {lever.label} is your biggest lever right now — the fastest way up.
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   Theme chips (replaces TerritoryPanel's recharts radar)
   ────────────────────────────────────────────────────────── */
const humanizeTheme = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());

const ThemeChips = ({
  signals, selected, onSelect,
}: {
  signals: Signal[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) => {
  const themes = useMemo(() => {
    const map = new Map<string, number>();
    signals.forEach(s => (s.theme_tags || []).forEach(t => {
      const k = t.toLowerCase().trim();
      if (!k) return;
      map.set(k, (map.get(k) || 0) + 1);
    }));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [signals]);

  if (themes.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, marginBottom: 4 }}>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
        color: "var(--glass-2)", letterSpacing: "0.14em", alignSelf: "center",
        marginInlineEnd: 4,
      }}>THEMES</span>
      {themes.map(([k, count]) => {
        const active = selected === k;
        return (
          <button
            key={k}
            onClick={() => onSelect(active ? null : k)}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11, letterSpacing: "0.04em",
              padding: "4px 10px", borderRadius: 999,
              background: active ? "var(--live)" : "transparent",
              color: active ? "var(--ob-bg)" : "var(--glass)",
              border: `0.5px solid ${active ? "var(--live)" : "var(--hair)"}`,
              cursor: "pointer",
            }}
          >
            {humanizeTheme(k)} · {count}
          </button>
        );
      })}
      {selected && (
        <button onClick={() => onSelect(null)} aria-label="Clear theme filter"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11, padding: "4px 8px", borderRadius: 999,
                  background: "transparent", color: "var(--glass-2)",
                  border: "0.5px solid var(--hair)", cursor: "pointer",
                }}>
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   Sub-tab segmented control
   ────────────────────────────────────────────────────────── */
type SubTab = "signals" | "sources";
const SubTabs = ({
  value, onChange, entryCount,
}: { value: SubTab; onChange: (v: SubTab) => void; entryCount: number }) => {
  const items: Array<{ k: SubTab; label: string }> = [
    { k: "signals", label: "Signals" },
    { k: "sources", label: `Sources ${entryCount}` },
  ];
  return (
    <div role="tablist" style={{
      display: "inline-flex", padding: 3, borderRadius: 8,
      background: "var(--ob-field)", border: "0.5px solid var(--hair)",
      marginTop: 18, marginBottom: 8,
    }}>
      {items.map(it => {
        const active = value === it.k;
        return (
          <button
            key={it.k} role="tab" aria-selected={active}
            data-testid={it.k === "signals" ? "intel-tab-signals" : "intel-tab-sources"}
            onClick={() => onChange(it.k)}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12, letterSpacing: "0.06em",
              padding: "6px 14px", borderRadius: 6, cursor: "pointer",
              background: active ? "var(--ob-raised)" : "transparent",
              color: active ? "var(--glass)" : "var(--glass-2)",
              border: active ? "0.5px solid var(--hair)" : "0.5px solid transparent",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   Header — instrument-styled, mono
   ────────────────────────────────────────────────────────── */
const ObsHeader = ({
  entryCount, evidenceCount, signalsCount, movesCount,
}: { entryCount: number; evidenceCount: number; signalsCount: number; movesCount: number }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
      letterSpacing: "0.18em", color: "var(--glass-2)", textTransform: "uppercase",
    }}>
      Observatory
    </div>
    <h1 style={{
      fontFamily: "var(--font-display, 'Newsreader', serif)",
      fontSize: 32, fontWeight: 500, color: "var(--glass)",
      margin: "6px 0 6px",
    }}>
      The Scan
    </h1>
    <p style={{ fontSize: 13, color: "var(--glass-2)", margin: 0, lineHeight: 1.5 }}>
      What the market doesn't know you know.
    </p>
    <div style={{
      marginTop: 14, display: "inline-flex", gap: 18,
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
      color: "var(--glass-2)", letterSpacing: "0.06em",
    }}>
      <span><span style={{ color: "var(--glass)" }}>{entryCount || "—"}</span> sources</span>
      <span><span style={{ color: "var(--glass)" }}>{evidenceCount || "—"}</span> evidence</span>
      <span><span style={{ color: "var(--glass)" }}>{signalsCount || "—"}</span> signals</span>
      <span><span style={{ color: "var(--glass)" }}>{movesCount || "—"}</span> moves</span>
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────────
   Tier meta (mirrors IntelligenceTab so list reads identical)
   ────────────────────────────────────────────────────────── */
type TierKey = "live" | "evergreen" | "emerging" | "other";

/* ──────────────────────────────────────────────────────────
   Observatory — main component
   ────────────────────────────────────────────────────────── */
const Observatory = ({
  onOpenChat, onOpenCapture, onDraftToStudio,
}: ObservatoryProps) => {
  const { user: authUser, isReady: authReady } = useAuthReady();
  const journey = useJourneyState(authUser?.id);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Section state ──
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [imprint, setImprint] = useState<{
    score: number | null;
    delta: number | null;
    components: ScoreComponents | null;
    weekShape: number[];
    loading: boolean;
  }>({ score: null, delta: null, components: null, weekShape: [], loading: true });
  const [facets, setFacets] = useState<{ rows: FacetRow[]; loading: boolean }>({ rows: [], loading: true });

  const [activeSubTab, setActiveSubTab] = useState<SubTab>("signals");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // Debounce SignalHero re-mount when the top signal is unchanged.
  const [stableHeroId, setStableHeroId] = useState<string | null>(null);
  const heroDebounce = useRef<number | null>(null);

  // Off-screen pause for SMIL motion
  const instrumentsRef = useRef<HTMLDivElement>(null);
  const instrumentsOnScreen = useOnScreen(instrumentsRef);

  /* ── Loaders ──────────────────────────────────────────── */
  const loadSignals = useCallback(async (uid: string) => {
    setSignalsLoading(true); setLoadError(false);
    try {
      const [signalsRes, entriesRes, documentsRes, evidenceRes, movesRes] = await Promise.all([
        supabase.from("strategic_signals")
          .select("*, signal_velocity, velocity_status, commercial_validation_score")
          .eq("user_id", uid)
          .eq("status", "active").order("confidence", { ascending: false }).limit(50),
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("recommended_moves").select("id", { count: "exact", head: true })
          .eq("status", "active").eq("user_id", uid),
      ]);
      const raw = (signalsRes.data || []) as any[];

      // Live evidence + source count, batched (mirrors IntelligenceTab logic).
      const allIds = Array.from(new Set(raw.flatMap(s => (s.supporting_evidence_ids || []) as string[])));
      const fragToReg = new Map<string, string>();
      if (allIds.length) {
        const { data: existRows } = await supabase
          .from("evidence_fragments").select("id, source_registry_id")
          .eq("user_id", uid).in("id", allIds);
        (existRows || []).forEach((r: any) => fragToReg.set(r.id, r.source_registry_id));
      }
      const regIds = Array.from(new Set(Array.from(fragToReg.values()).filter(Boolean))) as string[];
      const regToSource = new Map<string, string>();
      if (regIds.length) {
        const { data: regRows } = await supabase.from("source_registry" as any)
          .select("id, source_id").in("id", regIds);
        (regRows || []).forEach((r: any) => regToSource.set(r.id, r.source_id || r.id));
      }
      const loaded = raw.map(s => {
        const liveIds = ((s.supporting_evidence_ids || []) as string[]).filter(id => fragToReg.has(id));
        const sourceKeys = new Set<string>();
        liveIds.forEach(id => {
          const reg = fragToReg.get(id); if (!reg) return;
          sourceKeys.add(regToSource.get(reg) || reg);
        });
        return { ...s, evidenceCount: liveIds.length, sourceCount: sourceKeys.size };
      }) as unknown as Signal[];

      setSignals(loaded);
      setEntryCount((entriesRes.count || 0) + (documentsRes.count || 0));
      setEvidenceCount(evidenceRes.count || 0);
      setMovesCount(movesRes.count || 0);
      if (loaded.length > 0 && !selectedSignalId) setSelectedSignalId(loaded[0].id);
    } catch (e) {
      console.error("[Observatory] signals load failed", e);
      setLoadError(true);
    } finally {
      setSignalsLoading(false);
    }
  // selectedSignalId intentionally excluded to avoid refetch on selection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadImprint = useCallback(async (uid: string) => {
    setImprint(s => ({ ...s, loading: true }));
    try {
      const { data, error } = await supabase
        .from("imprint_snapshots")
        .select("imprint, components, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = (data || []) as Array<{
        imprint: number | null;
        components: any;
        created_at: string;
      }>;
      const latestRow = rows[0];
      const latest = latestRow?.imprint != null ? Number(latestRow.imprint) : null;

      // 7-day-ago lookback. Among rows older than ~1 day before latest, pick
      // the one closest to latest.created_at − 7d. If none, delta = 0.
      let delta: number | null = null;
      if (latest != null && rows.length > 1) {
        const latestTs = new Date(latestRow.created_at).getTime();
        const targetTs = latestTs - 7 * 24 * 60 * 60 * 1000;
        const minGapMs = 24 * 60 * 60 * 1000;
        const candidates = rows.slice(1).filter(r =>
          r.imprint != null && (latestTs - new Date(r.created_at).getTime()) >= minGapMs,
        );
        if (candidates.length > 0) {
          const closest = candidates.reduce((best, r) => {
            const d = Math.abs(new Date(r.created_at).getTime() - targetTs);
            return d < best.d ? { row: r, d } : best;
          }, { row: candidates[0], d: Math.abs(new Date(candidates[0].created_at).getTime() - targetTs) });
          delta = Math.round(latest - Number(closest.row.imprint));
        } else {
          delta = 0;
        }
      }

      // Week shape: last up-to-7 daily imprint values (one per day, latest first → reverse).
      const dayMap = new Map<string, number>();
      for (const r of rows) {
        if (r.imprint == null) continue;
        const day = new Date(r.created_at).toISOString().slice(0, 10);
        if (!dayMap.has(day)) dayMap.set(day, Number(r.imprint));
      }
      const weekShape = Array.from(dayMap.entries())
        .slice(0, 7)
        .reverse()
        .map(([, v]) => v);

      // score_components from latest row (if present).
      const sc = latestRow?.components?.score_components;
      const components: ScoreComponents | null = sc && typeof sc === "object"
        ? {
            signal_score: Number(sc.signal_score ?? 0),
            content_score: Number(sc.content_score ?? 0),
            capture_score: Number(sc.capture_score ?? 0),
          }
        : null;

      setImprint({ score: latest, delta, components, weekShape, loading: false });
    } catch (e) {
      console.warn("[Observatory] imprint load failed", e);
      setImprint({ score: null, delta: null, components: null, weekShape: [], loading: false });
    }
  }, []);

  const loadFacets = useCallback(async (uid: string) => {
    setFacets(s => ({ ...s, loading: true }));
    try {
      const { data, error } = await (supabase.from("facet_states" as any) as any)
        .select("facet, value, uncertainty, last_reinforced_at")
        .eq("user_id", uid);
      if (error) throw error;
      const rows = (data || []) as Array<{ facet: string; value: number | null; uncertainty: number | null }>;
      // facet_states keys are lowercase canonical (identity, edge, voice, focus,
      // audience, discernment, conviction). Map to display facet names.
      const norm: FacetRow[] = rows
        .map(r => {
          const key = (r.facet || "").trim().toLowerCase();
          const display = FACET_DB_TO_DISPLAY[key];
          if (!display) return null;
          return {
            facet: display,
            value: r.value == null ? null : Number(r.value),
            uncertainty: r.uncertainty == null ? null : Number(r.uncertainty),
          } as FacetRow;
        })
        .filter((r): r is FacetRow => r !== null);
      setFacets({ rows: norm, loading: false });
    } catch (e) {
      console.warn("[Observatory] facets load failed", e);
      setFacets({ rows: [], loading: false });
    }
  }, []);

  // (loadActivity removed — the raw published/rhythm readouts are replaced by
  // the ContributionBar reading score_components from imprint_snapshots.)

  // ── Race-free bootstrap: gate every fetch on authReady + user ──
  useEffect(() => {
    if (!authReady) return;
    if (!authUser?.id) {
      setSignalsLoading(false);
      setImprint({ score: null, delta: null, components: null, weekShape: [], loading: false });
      setFacets({ rows: [], loading: false });
      return;
    }
    const uid = authUser.id;
    void loadSignals(uid);
    void loadImprint(uid);
    void loadFacets(uid);
  }, [authReady, authUser?.id, loadSignals, loadImprint, loadFacets]);

  // Refetch on capture-complete
  useEffect(() => {
    if (!authUser?.id) return;
    const handler = () => {
      const uid = authUser.id;
      void loadSignals(uid);
      void loadImprint(uid);
    };
    window.addEventListener("capture-complete", handler);
    return () => window.removeEventListener("capture-complete", handler);
  }, [authUser?.id, loadSignals, loadImprint]);

  // Realtime subscriptions (gated on user)
  useEffect(() => {
    if (!authUser?.id) return;
    const uid = authUser.id;
    const ch = supabase.channel(`observatory-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_signals", filter: `user_id=eq.${uid}` }, () => loadSignals(uid))
      .on("postgres_changes", { event: "*", schema: "public", table: "entries", filter: `user_id=eq.${uid}` }, () => { loadSignals(uid); loadImprint(uid); })
      .on("postgres_changes", { event: "*", schema: "public", table: "imprint_snapshots", filter: `user_id=eq.${uid}` }, () => loadImprint(uid))
      .on("postgres_changes", { event: "*", schema: "public", table: "facet_states", filter: `user_id=eq.${uid}` }, () => loadFacets(uid))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authUser?.id, loadSignals, loadImprint, loadFacets]);

  // Deep link ?signal=...
  useEffect(() => {
    const sigParam = searchParams.get("signal");
    if (sigParam && signals.length > 0) {
      const found = signals.find(s => s.id === sigParam);
      if (found) {
        setSelectedSignalId(sigParam);
        setActiveSubTab("signals");
        searchParams.delete("signal");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [signals, searchParams, setSearchParams]);

  /* ── Derived ──────────────────────────────────────────── */
  const sortedByConfidence = useMemo(() => {
    const order: Record<string, number> = { fading: 0, accelerating: 1, stable: 2, dormant: 3 };
    return [...signals].sort((a, b) => {
      const ao = order[a.velocity_status || "stable"] ?? 2;
      const bo = order[b.velocity_status || "stable"] ?? 2;
      if (ao !== bo) return ao - bo;
      return b.confidence - a.confidence;
    });
  }, [signals]);

  const sortedByTier = useMemo(() => {
    const tierOrder: Record<string, number> = { live: 0, evergreen: 1, emerging: 2 };
    return [...signals].sort((a, b) => {
      const ao = tierOrder[a.lifecycle_tier || ""] ?? 3;
      const bo = tierOrder[b.lifecycle_tier || ""] ?? 3;
      if (ao !== bo) return ao - bo;
      const aScore = a.strength_score ?? a.confidence;
      const bScore = b.strength_score ?? b.confidence;
      return bScore - aScore;
    });
  }, [signals]);

  const fadingSignals = useMemo(() => signals.filter(s => s.velocity_status === "fading"), [signals]);
  const dormantSignals = useMemo(() => signals.filter(s => s.velocity_status === "dormant"), [signals]);
  const topFading = useMemo(
    () => [...fadingSignals].sort((a, b) => b.confidence - a.confidence)[0] || null,
    [fadingSignals],
  );

  const selectedSignal = useMemo(
    () => sortedByConfidence.find(s => s.id === selectedSignalId) || sortedByConfidence[0] || null,
    [sortedByConfidence, selectedSignalId],
  );

  // Debounce hero id transitions so SignalHero doesn't refetch on every loadSignals
  // when the top signal hasn't changed.
  useEffect(() => {
    const next = selectedSignal?.id ?? null;
    if (next === stableHeroId) return;
    if (heroDebounce.current) window.clearTimeout(heroDebounce.current);
    heroDebounce.current = window.setTimeout(() => setStableHeroId(next), 250);
    return () => {
      if (heroDebounce.current) window.clearTimeout(heroDebounce.current);
    };
  }, [selectedSignal?.id, stableHeroId]);

  const heroSignal = useMemo(
    () => sortedByConfidence.find(s => s.id === stableHeroId) || selectedSignal,
    [sortedByConfidence, stableHeroId, selectedSignal],
  );

  const archiveDormant = async () => {
    if (dormantSignals.length === 0) return;
    const ids = dormantSignals.map(s => s.id);
    const { error } = await supabase.from("strategic_signals")
      .update({ status: "archived" } as any).in("id", ids);
    if (error) { toast.error("Couldn't archive signals"); return; }
    toast.success(`Archived ${ids.length} dormant signal${ids.length > 1 ? "s" : ""}`);
    if (authUser?.id) await loadSignals(authUser.id);
  };

  const draftFromSignal = async (s: Signal) => {
    await supabase.from("strategic_signals")
      .update({ priority_score: (s.priority_score || 0) + 0.05 }).eq("id", s.id);
    onDraftToStudio?.({
      topic: s.signal_title,
      context: [s.explanation, s.strategic_implications, s.what_it_means_for_you].filter(Boolean).join("\n\n"),
      signalId: s.id, signalTitle: s.signal_title,
    });
  };

  /* ── Render helpers ──────────────────────────────────── */
  const TIER_META: Record<TierKey, { label: string; Icon: typeof Zap; color: string }> = {
    live:      { label: "Live",      Icon: Zap,        color: "var(--live)" },
    evergreen: { label: "Evergreen", Icon: Leaf,       color: "var(--glass)" },
    emerging:  { label: "Emerging",  Icon: Sprout,     color: "var(--action)" },
    other:     { label: "Other",     Icon: HelpCircle, color: "var(--glass-2)" },
  };

  const renderRow = (s: Signal) => (
    <div
      key={s.id}
      data-testid="intel-signal-card"
      onClick={() => setSelectedSignalId(s.id)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 12,
        alignItems: "center",
        padding: "12px 16px",
        background: selectedSignalId === s.id ? "var(--ob-raised)" : "var(--ob-panel)",
        borderBottom: "0.5px solid var(--hair)",
        cursor: "pointer",
        transition: "background .15s",
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--glass)" }}>
          {s.signal_title}
        </div>
        <div style={{
          marginTop: 2, fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, color: "var(--glass-2)", letterSpacing: "0.04em",
        }}>
          {(() => {
            const ec = (s as any).evidenceCount ?? s.fragment_count ?? 0;
            const sc = (s as any).sourceCount ?? 0;
            return `${ec} EVIDENCE · ${sc} SOURCE${sc === 1 ? "" : "S"}`;
          })()}
          {s.velocity_status && s.velocity_status !== "stable" && ` · ${s.velocity_status.toUpperCase()}`}
        </div>
      </div>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 14, color: "var(--live)", fontVariantNumeric: "tabular-nums",
      }}>
        {Math.round(s.confidence * 100)}%
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); draftFromSignal(s); }}
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, letterSpacing: "0.06em",
          padding: "5px 10px", borderRadius: 6,
          background: "transparent", color: "var(--action)",
          border: "0.5px solid var(--action)", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        WRITE →
      </button>
    </div>
  );

  // Render the grouped signal list using composed TierSection
  const renderSignalList = () => {
    const filtered = selectedTheme
      ? sortedByTier.filter(s => (s.theme_tags || []).some(t => t.toLowerCase().trim() === selectedTheme))
      : sortedByTier;
    const byStrength = (a: Signal, b: Signal) =>
      (b.strength_score ?? b.confidence) - (a.strength_score ?? a.confidence);
    const live = filtered.filter(s => s.lifecycle_tier === "live").sort(byStrength);
    const everg = filtered.filter(s => s.lifecycle_tier === "evergreen").sort(byStrength);
    const emerg = filtered.filter(s => s.lifecycle_tier === "emerging").sort(byStrength);
    const other = filtered.filter(s =>
      s.lifecycle_tier !== "live" && s.lifecycle_tier !== "evergreen" && s.lifecycle_tier !== "emerging"
    ).sort(byStrength);

    return (
      <section style={{ marginTop: 28 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
          letterSpacing: "0.14em", color: "var(--glass-2)",
        }}>
          SIGNALS · {filtered.length}{selectedTheme ? ` OF ${sortedByTier.length}` : ""}
        </div>
        {filtered.length === 0 && selectedTheme ? (
          <div style={{ padding: "24px 0", textAlign: "center",
                        color: "var(--glass-2)", fontSize: 13 }}>
            No signals in this territory yet
          </div>
        ) : (
          <>
            <TierSection tierKey="live" signals={live} defaultOpen={true} renderRow={renderRow} />
            <TierSection tierKey="evergreen" signals={everg} defaultOpen={true} renderRow={renderRow} />
            <TierSection tierKey="emerging" signals={emerg} defaultOpen={false} renderRow={renderRow} />
            <TierSection tierKey="other" signals={other} defaultOpen={false} renderRow={renderRow} />
          </>
        )}
      </section>
    );
  };

  /* ── Loading skeleton: hold until BOTH signals & journey resolve ── */
  const fullyLoading = !authReady || signalsLoading || journey.loading;

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: "100vh", paddingBottom: 80,
      background: "var(--ob-bg)", color: "var(--glass)",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 0" }}>

        <ObsHeader
          entryCount={entryCount}
          evidenceCount={evidenceCount}
          signalsCount={signals.length}
          movesCount={movesCount}
        />

        {/* ZONE 1 — INSTRUMENTS */}
        <section ref={instrumentsRef} aria-label="Instruments"
                 style={{ marginTop: 28 }}>
          <div style={{
            display: "grid", gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            alignItems: "stretch",
          }}>
            <div style={{
              position: "relative",
              padding: 18, background: "var(--ob-panel)",
              border: "0.5px solid var(--hair)", borderRadius: 12,
              display: "flex", justifyContent: "center",
            }}>
              <div style={{ position: "absolute", top: 10, right: 12 }}>
                <InfoTooltip
                  slug="imprint"
                  text="How visible your expertise is, from 0 to 100. It rises as you read and publish."
                  label="Imprint"
                  side="left"
                  triggerSize={13}
                />
              </div>
              <AuraDial
                score={imprint.score}
                delta={imprint.delta}
                loading={imprint.loading}
                onScreen={instrumentsOnScreen}
                weekShape={imprint.weekShape}
              />
            </div>
            <div style={{
              position: "relative",
              padding: 18, background: "var(--ob-panel)",
              border: "0.5px solid var(--hair)", borderRadius: 12,
              display: "flex", justifyContent: "center",
            }}>
              <div style={{ position: "absolute", top: 10, right: 12 }}>
                <InfoTooltip
                  slug="imprint-facets"
                  text="The seven sides of your standing. A fuller shape means a rounder presence."
                  label="Facet wheel"
                  side="left"
                  triggerSize={13}
                />
              </div>
              <ImprintCore
                facets={facets.rows}
                loading={facets.loading}
                onScreen={instrumentsOnScreen}
              />
            </div>
          </div>

          {/* Contribution bar — three parts sum to the Imprint */}
          <div style={{ marginTop: 12 }}>
            <ContributionBar
              imprint={imprint.score}
              components={imprint.components}
              loading={imprint.loading}
            />
          </div>
        </section>

        {/* SUB-TABS */}
        <SubTabs value={activeSubTab} onChange={setActiveSubTab} entryCount={entryCount} />

        {loadError && (
          <div style={{ marginTop: 12 }}>
            <SectionError
              onRetry={() => authUser?.id && loadSignals(authUser.id)}
              message="We couldn't load your signals. "
            />
          </div>
        )}

        {activeSubTab === "signals" && (
          <>
            {/* ZONE 2 — THE SCAN */}
            {/* Alerts */}
            {fadingSignals.length > 0 && topFading && (
              <div role="status" style={{
                marginTop: 16, padding: "12px 14px", borderRadius: 10,
                border: "0.5px solid var(--action)",
                background: "color-mix(in srgb, var(--action) 8%, transparent)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    letterSpacing: "0.14em", color: "var(--action)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <AlertTriangle size={12} /> FADING
                  </span>
                  <span style={{ fontSize: 12, color: "var(--glass)" }}>
                    {fadingSignals.length} signal{fadingSignals.length > 1 ? "s" : ""} losing strength — new evidence in the next {daysUntilDormant(topFading.confidence)} days reverses the trend.
                  </span>
                  <button onClick={() => onOpenCapture?.()} style={{
                    background: "none", border: "none", color: "var(--action)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 0,
                  }}>
                    Capture for "{topFading.signal_title}" →
                  </button>
                </div>
              </div>
            )}

            {dormantSignals.length > 0 && (
              <div role="status" style={{
                marginTop: 12, padding: "12px 14px", borderRadius: 10,
                background: "var(--ob-panel)", border: "0.5px solid var(--hair)",
              }}>
                <div style={{ fontSize: 12, color: "var(--glass-2)", marginBottom: 8 }}>
                  ◌ {dormantSignals.length} signal{dormantSignals.length > 1 ? "s have" : " has"} gone dormant (60+ days without new evidence).
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11, padding: "5px 12px", borderRadius: 6,
                      background: "transparent", color: "var(--glass)",
                      border: "0.5px solid var(--hair)", cursor: "pointer",
                    }}>
                      <Archive size={11} style={{ display: "inline", marginInlineEnd: 6 }} />
                      ARCHIVE DORMANT
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive {dormantSignals.length} dormant signal{dormantSignals.length > 1 ? "s" : ""}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Archived signals are removed from your active radar. You can still find them in your data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={archiveDormant}>Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* Theme chips */}
            {!signalsLoading && signals.length > 0 && (
              <ThemeChips signals={signals} selected={selectedTheme} onSelect={setSelectedTheme} />
            )}

            {/* Body: skeleton, empty, or scan */}
            {fullyLoading ? (
              <div style={{ marginTop: 20 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    height: 84, marginBottom: 10, borderRadius: 10,
                    background: "var(--ob-panel)", border: "0.5px solid var(--hair)",
                  }} className="animate-pulse" />
                ))}
              </div>
            ) : signals.length === 0 ? (
              <div style={{ marginTop: 28 }}>
                <EmptyState
                  icon={Brain}
                  title="The scan is quiet — for now"
                  description={entryCount === 0
                    ? "Your radar activates with your first capture. Paste an article that made you think this week."
                    : entryCount < 3
                      ? `Aura needs at least 3 captures to detect strategic patterns. You have ${entryCount}/3.`
                      : "Aura is analysing your captures. Signals emerge when 3+ sources share a pattern."}
                  ctaLabel={entryCount === 0 ? "Capture your first source →" : "Capture another source →"}
                  ctaAction={() => onOpenCapture?.()}
                />
              </div>
            ) : (
              <>
                {heroSignal && (
                  <SignalHero
                    key={heroSignal.id}
                    signal={heroSignal}
                    onDraft={draftFromSignal}
                    onOpenChat={onOpenChat}
                  />
                )}
                {renderSignalList()}

                {/* Secondary editorial intel */}
                <EditorialBlindSpots signals={signals} onOpenCapture={onOpenCapture} />
                <EditorialReadingList signals={signals} onOpenCapture={onOpenCapture} />
              </>
            )}
          </>
        )}

        {activeSubTab === "sources" && (
          <div style={{ marginTop: 8 }}>
            <SourcesSubTab
              onOpenCapture={onOpenCapture}
              onSwitchToSignal={(signalId) => {
                setActiveSubTab("signals");
                setSelectedSignalId(signalId);
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
};

export default Observatory;