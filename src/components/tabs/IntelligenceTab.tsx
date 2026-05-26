import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2, Archive, RefreshCw, Layers, Brain, AlertTriangle, ChevronDown,
  EyeOff, Info, Lightbulb, TrendingUp, ExternalLink, Plus, BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import SectionError from "@/components/ui/section-error";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import { useJourneyState } from "@/hooks/useJourneyState";
import { useAuthReady } from "@/hooks/useAuthReady";
import { showQueryErrorToast } from "@/lib/safeQuery";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import type { Database } from "@/integrations/supabase/types";
import { daysUntilDormant } from "@/components/intelligence/VelocityIndicators";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface SignalDraftPrefill {
  topic: string;
  context: string;
  signalId?: string;
  signalTitle?: string;
  sourceType?: string;
  sourceTitle?: string;
}

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenCapture?: () => void;
  onDraftToStudio?: (prefill: SignalDraftPrefill) => void;
}

interface Signal {
  id: string;
  signal_title: string;
  explanation: string;
  strategic_implications: string;
  confidence: number;
  confidence_explanation: string | null;
  what_it_means_for_you: string | null;
  supporting_evidence_ids: string[];
  theme_tags: string[];
  fragment_count: number;
  unique_orgs: number;
  priority_score: number;
  status: string;
  created_at: string;
  updated_at: string;
  user_signal_feedback?: string | null;
  signal_velocity?: number | null;
  velocity_status?: "accelerating" | "stable" | "fading" | "dormant" | null;
  commercial_validation_score?: number | null;
}

interface EvidenceFragmentRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  source_kind?: "capture" | "aura" | "unknown";
  source_label?: string;
}

/* ── Helpers ── */
function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function domainFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

type SubTab = "signals" | "sources";

/* ═══════════════════════════════════════════
   EXPANDABLE TRANSPARENCY PANEL
   ═══════════════════════════════════════════ */
const ExpandablePanel = ({
  label, children, align = "left",
}: { label: string; children: React.ReactNode; align?: "left" | "right" }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ textAlign: align as any }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "var(--ink-3)",
        }}
      >
        <Info size={12} />
        <span>{label}</span>
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
      </button>
      <div style={{ maxHeight: open ? 600 : 0, overflow: "hidden", transition: "max-height .25s ease" }}>
        <div style={{
          marginTop: 10, padding: "14px 16px", borderRadius: 10,
          background: "var(--surface-ink-raised)", border: "0.5px solid var(--surface-ink-subtle)",
          fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6, textAlign: "left",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   INTELLIGENCE RADAR
   ═══════════════════════════════════════════ */
const IntelligenceRadar = ({ signals, captureCount = 0 }: { signals: Signal[]; captureCount?: number }) => {
  // Build unique themes with strongest signal per theme
  const themeMap = new Map<string, Signal>();
  signals.forEach(s => {
    (s.theme_tags || []).forEach(t => {
      const key = t.toLowerCase().trim();
      if (!key) return;
      const existing = themeMap.get(key);
      if (!existing || s.confidence > existing.confidence) themeMap.set(key, s);
    });
  });
  const themes = Array.from(themeMap.entries()).map(([k, s]) => ({ name: k, sig: s }));
  if (themes.length < 3) return null;

  const cx = 130, cy = 130;
  const topConfId = [...themes].sort((a, b) => b.sig.confidence - a.sig.confidence)[0].sig.id;

  const nodes = themes.map((t, i) => {
    const angle = (i / themes.length) * Math.PI * 2 - Math.PI / 2;
    const r = 30 + Math.min(Math.max(t.sig.confidence, 0), 1) * 70;
    const conf = t.sig.confidence;
    const radius = conf > 0.5 ? 8 : conf > 0.3 ? 4 : 3;
    const color = t.sig.id === topConfId
      ? "var(--color-text-warning, var(--brand))"
      : conf > 0.3
        ? "var(--color-text-info, var(--info))"
        : "var(--ink-3)";
    const opacity = t.sig.id === topConfId ? 1 : conf > 0.3 ? 0.45 : 0.25;
    const lx = cx + Math.cos(angle) * (r + 22);
    const ly = cy + Math.sin(angle) * (r + 22);
    // Humanise: underscores → spaces, title case
    const human = t.name
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
    const display = human.length > 18 ? human.slice(0, 17) + "…" : human;
    return {
      x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
      lx, ly, radius, color, opacity,
      name: display, isTop: t.sig.id === topConfId,
    };
  });

  const polygonPts = nodes.map(n => `${n.x},${n.y}`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "32px 0" }}>
      <svg width={230} height={230} viewBox="0 0 260 260" style={{ overflow: "visible" }}>
        {[110, 75, 40].map(r => (
          <circle key={r} cx={cx} cy={cy} r={r}
            fill="none" stroke="var(--color-border-tertiary, var(--surface-ink-subtle))"
            strokeWidth={0.3} strokeDasharray="3 5" />
        ))}
        <line x1={cx} y1={cy - 110} x2={cx} y2={cy + 110} stroke="var(--surface-ink-subtle)" strokeWidth={0.2} />
        <line x1={cx - 110} y1={cy} x2={cx + 110} y2={cy} stroke="var(--surface-ink-subtle)" strokeWidth={0.2} />
        <line x1={cx - 78} y1={cy - 78} x2={cx + 78} y2={cy + 78} stroke="var(--surface-ink-subtle)" strokeWidth={0.2} />
        <line x1={cx - 78} y1={cy + 78} x2={cx + 78} y2={cy - 78} stroke="var(--surface-ink-subtle)" strokeWidth={0.2} />

        <polygon points={polygonPts}
          fill="var(--color-text-warning, var(--brand))" fillOpacity={0.08}
          stroke="var(--color-text-warning, var(--brand))" strokeOpacity={0.3} strokeWidth={0.7} />

        <circle cx={cx} cy={cy} r={3} fill="var(--color-text-warning, var(--brand))">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="4s" repeatCount="indefinite" />
        </circle>

        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.radius} fill={n.color} opacity={n.opacity}>
              {n.isTop && <animate attributeName="r" values={`${n.radius};${n.radius + 1};${n.radius}`} dur="3s" repeatCount="indefinite" />}
            </circle>
            <text x={n.lx} y={n.ly} textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill="var(--ink-4)">
              {n.name}
            </text>
          </g>
        ))}
      </svg>

      <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 11, color: "var(--ink-3)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text-warning, var(--brand))" }} /> Strong
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-text-info, var(--info))", opacity: 0.5 }} /> Emerging
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ink-3)", opacity: 0.5 }} /> Weak
        </span>
      </div>

      {captureCount > 0 && (
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", textAlign: "center" }}>
          Themes detected from your {captureCount} capture{captureCount === 1 ? "" : "s"} — each node is a pattern Aura found.
        </p>
      )}

      <div style={{ marginTop: 14, width: "100%", maxWidth: 520 }}>
        <ExpandablePanel label="How does the radar work?" align="left">
          <p style={{ margin: "0 0 10px" }}>Every article you capture is analysed for strategic patterns. When multiple captures share a theme, Aura detects a signal.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            <div>Size = confidence level</div>
            <div>Position = strength (outer = stronger)</div>
            <div>Color = gold is actionable, blue is emerging, grey needs more data</div>
          </div>
          <div style={{ paddingTop: 8, borderTop: "0.5px solid var(--surface-ink-subtle)" }}>
            <strong style={{ color: "var(--ink-5)" }}>Confidence:</strong> 40% AI analysis + 35% source diversity + 15% organisation breadth + 10% recency
          </div>
        </ExpandablePanel>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   SIGNAL HERO
   ═══════════════════════════════════════════ */
const SignalHero = ({
  signal, onDraft, onOpenChat,
}: {
  signal: Signal;
  onDraft: (s: Signal) => void;
  onOpenChat?: (msg?: string) => void;
}) => {
  const [evidence, setEvidence] = useState<EvidenceFragmentRow[]>([]);
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    (async () => {
      if (!signal.supporting_evidence_ids?.length) { setEvidence([]); return; }
      const { data: frags } = await supabase
        .from("evidence_fragments")
        .select("id, title, content, created_at, source_registry_id")
        .in("id", signal.supporting_evidence_ids)
        .order("created_at", { ascending: false })
        .limit(20);
      const fs = (frags || []) as any[];
      const regIds = Array.from(new Set(fs.map(f => f.source_registry_id).filter(Boolean)));
      let regMap = new Map<string, any>();
      let entryMap = new Map<string, any>();
      if (regIds.length) {
        const sr = await supabase.from("source_registry" as any).select("id, source_type, source_id, title").in("id", regIds);
        (sr.data || []).forEach((r: any) => regMap.set(r.id, r));
        const entryIds = Array.from(new Set((sr.data || []).filter((r: any) => r.source_type === "entry" && r.source_id).map((r: any) => r.source_id)));
        if (entryIds.length) {
          const ents = await supabase.from("entries").select("id, title, type, account_name").in("id", entryIds);
          (ents.data || []).forEach((e: any) => entryMap.set(e.id, e));
        }
      }
      const seen = new Set<string>();
      const out: EvidenceFragmentRow[] = [];
      for (const f of fs) {
        const reg = f.source_registry_id ? regMap.get(f.source_registry_id) : null;
        let kind: "capture" | "aura" | "unknown" = "unknown";
        let label = f.title || "Untitled source";
        let key = f.id;
        if (reg) {
          key = reg.id;
          if (reg.source_type === "entry" && reg.source_id) {
            const ent = entryMap.get(reg.source_id);
            if (ent) {
              const isAura = (ent.account_name || "").toLowerCase().includes("aura") || (ent.type || "").toLowerCase().includes("onboarding") || (ent.type || "").toLowerCase().includes("exa");
              kind = isAura ? "aura" : "capture";
              label = ent.title || reg.title || label;
              key = reg.source_id;
            }
          } else if (reg.source_type === "document") {
            kind = "capture"; label = reg.title || label;
          }
        }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: f.id, title: label, content: f.content, created_at: f.created_at,
          source_kind: kind,
          source_label: kind === "aura" ? "Extracted" : "Your capture",
        });
      }
      setEvidence(out);
    })();
  }, [signal.id]);

  const confPct = Math.round(signal.confidence * 100);
  const orgs = signal.unique_orgs || 1;
  const fragCount = evidence.length || signal.supporting_evidence_ids?.length || signal.fragment_count || 0;
  const isRising = signal.velocity_status === "accelerating";
  const isFading = signal.velocity_status === "fading";
  const velText = isRising ? "and rising" : isFading ? "and fading" : "and stable";
  const velColor = isRising ? "var(--success, hsl(140 60% 45%))" : isFading ? "hsl(24 95% 53%)" : "var(--ink-5)";

  return (
    <section style={{ marginTop: 32, paddingTop: 24, borderTop: "0.5px solid var(--color-border-tertiary, var(--surface-ink-subtle))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--brand)" }}>
          ✦ YOUR STRONGEST SIGNAL
        </span>
        {isRising && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
            background: "hsl(140 50% 40% / 0.12)", color: "var(--success, hsl(140 60% 45%))",
            border: "0.5px solid var(--success, hsl(140 60% 45%))",
          }}>Rising</span>
        )}
      </div>

      <h2 style={{
        fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
        fontSize: 20, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3, margin: "0 0 12px",
      }}>
        {signal.signal_title}
      </h2>

      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.7, margin: "0 0 20px" }}>
        You've captured <strong style={{ color: "var(--ink-6)", fontWeight: 500 }}>{fragCount} evidence fragments</strong> from{" "}
        <strong style={{ color: "var(--ink-6)", fontWeight: 500 }}>{orgs} organisation{orgs === 1 ? "" : "s"}</strong>.{" "}
        Confidence: <strong style={{ color: "var(--brand)", fontWeight: 500 }}>{confPct}%</strong>{" "}
        <span style={{ color: velColor, fontWeight: 500 }}>{velText}</span>.
        {orgs < 3 && " Two more sources from different organisations would push this above the publishing threshold."}
      </p>

      {signal.what_it_means_for_you && (
        <div style={{
          background: "var(--color-background-secondary, var(--surface-ink-raised))",
          borderRadius: 12, padding: "16px 18px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, letterSpacing: ".04em", fontWeight: 500, color: "var(--brand)", marginBottom: 8 }}>
            WHY THIS MATTERS TO YOU
          </div>
          <p style={{
            fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
            fontSize: 14, color: "var(--ink)", lineHeight: 1.5, margin: 0,
          }}>
            {signal.what_it_means_for_you}
          </p>
        </div>
      )}

      {signal.strategic_implications &&
        signal.strategic_implications.trim() !== (signal.what_it_means_for_you || "").trim() && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6, margin: "0 0 18px" }}>
          {signal.strategic_implications}{" "}
          <span style={{ color: "var(--brand)", fontWeight: 500 }}>The window is open.</span>
        </p>
      )}

      <div style={{ marginBottom: 18 }}>
        <button
          onClick={() => setShowEvidence(s => !s)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--ink-3)",
          }}
        >
          <Layers size={12} />
          See the evidence behind this signal ({fragCount} fragment{fragCount === 1 ? "" : "s"})
          <ChevronDown size={12} style={{ transform: showEvidence ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
        </button>
        {showEvidence && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {evidence.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>No evidence linked yet.</p>
            ) : evidence.map(f => (
              <div key={f.id} style={{
                display: "flex", gap: 10, padding: "8px 12px",
                background: "var(--surface-ink-raised)", borderRadius: 8,
                border: "0.5px solid var(--surface-ink-subtle)",
                alignItems: "center", fontSize: 12,
              }}>
                <span style={{ flex: 1, color: "var(--ink-5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                <span style={{ color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10 }}>{f.source_label}</span>
                <span style={{ color: "var(--ink-3)" }}>{relativeTime(f.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button onClick={() => onDraft(signal)}>Write on this signal →</Button>
        <Button variant="outline" onClick={() => onOpenChat?.("Show competitor intel on: " + signal.signal_title)}>
          Ask Aura to analyze →
        </Button>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════
   EDITORIAL BLIND SPOTS
   ═══════════════════════════════════════════ */
type GapCategory = "covered" | "weak" | "gap" | "opportunity";
interface CoverageItem {
  trend_headline: string;
  category: GapCategory;
  recommendation: string;
  source?: string | null;
  final_score?: number | null;
}
interface CoverageResult { coverage_score: number; items: CoverageItem[]; narrative: string }

const STORAGE_KEY = "market_coverage_cache_v1";

const EditorialBlindSpots = ({
  signals, onOpenCapture,
}: { signals: Signal[]; onOpenCapture?: () => void }) => {
  const [data, setData] = useState<(CoverageResult & { generated_at?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Not authenticated");
      const { data: r, error } = await supabase.functions.invoke("detect-market-gaps", { body: {} });
      if (error) throw error;
      if (!r || r.error) throw new Error(r?.error || "No result");
      const cached = { ...(r as CoverageResult), generated_at: new Date().toISOString() };
      setData(cached);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
    } catch (e) {
      console.error("coverage error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    void load();
  }, [load]);

  const gaps = (data?.items || []).filter(it => it.category === "gap" || it.category === "opportunity");
  const coveragePct = data ? Math.round((data.coverage_score || 0) * 100) : 0;

  return (
    <section style={{ marginTop: 40, paddingTop: 24, borderTop: "0.5px solid var(--color-border-tertiary, var(--surface-ink-subtle))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--danger, hsl(0 70% 55%))" }}>
          <EyeOff size={12} />
          WHAT YOU'RE NOT SEEING
        </span>
        <ExpandablePanel label="How are blind spots detected?" align="right">
          Aura compares your captured themes against active conversations in your sector. Topics your peers discuss that you have zero captures on appear here.
        </ExpandablePanel>
      </div>

      {!data && loading ? (
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}><Loader2 size={12} className="inline animate-spin" /> Analysing coverage…</p>
      ) : !data || gaps.length === 0 ? (
        <div style={{ padding: "20px 16px", background: "var(--surface-ink-raised)", border: "0.5px dashed var(--surface-ink-subtle)", borderRadius: 10, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>Your coverage analysis is building. Refresh after your next capture.</p>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin mr-1" : "mr-1"} /> Refresh coverage
          </Button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 6, background: "var(--surface-ink-subtle)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${coveragePct}%`, background: "var(--brand)" }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--brand)", fontWeight: 500 }}>{coveragePct}%</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 18px", lineHeight: 1.5 }}>
            Your radar covers {coveragePct}% of the active conversations in your sector.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gaps.slice(0, expanded ? 3 : 1).map((it, idx) => {
              const isOpp = it.category === "opportunity";
              const accent = isOpp ? "var(--warning, hsl(35 90% 55%))" : "var(--danger, hsl(0 70% 55%))";
              const urgency = isOpp
                ? "This trend is gaining momentum. Your take is missing."
                : "No one in your network is publishing on this yet.";
              return (
                <div key={idx} style={{
                  display: "flex", gap: 14, padding: "14px 16px",
                  background: "var(--surface-ink-raised)",
                  borderRadius: 12, border: "0.5px solid var(--surface-ink-subtle)",
                }}>
                  <div style={{
                    width: 36, height: 36, flexShrink: 0, borderRadius: "50%",
                    background: `${accent}1A`, color: accent,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <EyeOff size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{
                      fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
                      fontSize: 15, fontWeight: 500, color: "var(--ink)",
                      margin: "0 0 4px", lineHeight: 1.3,
                    }}>{it.trend_headline}</h4>
                    <p style={{ fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5, margin: "0 0 6px" }}>{it.recommendation}</p>
                    <p style={{ fontStyle: "italic", fontSize: 11, color: accent, margin: "0 0 10px" }}>{urgency}</p>
                    <button
                      onClick={() => onOpenCapture?.()}
                      style={{
                        background: `${accent}1A`, color: accent, border: `0.5px solid ${accent}55`,
                        borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 500,
                        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <Plus size={12} /> Start tracking this
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {gaps.length > 1 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, color: "var(--ink-3)",
              }}
            >
              {expanded
                ? "Show less"
                : `${Math.min(gaps.length, 3) - 1} more blind spot${Math.min(gaps.length, 3) - 1 === 1 ? "" : "s"}`}
              <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
            </button>
          )}
        </>
      )}
    </section>
  );
};

/* ═══════════════════════════════════════════
   EDITORIAL READING LIST
   ═══════════════════════════════════════════ */
interface Recommendation {
  title: string;
  author?: string;
  url: string | null;
  intelligence_value?: string;
  skill_gap?: string;
}

const readingCacheKey = () => `aura_reading_list_${new Date().toISOString().slice(0, 10)}`;

const EditorialReadingList = ({
  signals, onOpenCapture,
}: { signals: Signal[]; onOpenCapture?: () => void }) => {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(false);
    try {
      if (!force) {
        const cached = sessionStorage.getItem(readingCacheKey());
        if (cached) { setRecs(JSON.parse(cached)); setLoading(false); return; }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(true); return; }
      const { data, error: err } = await supabase.functions.invoke("sovereign-reading-list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (err || !data || data.error) { setError(true); setRecs([]); return; }
      const list: Recommendation[] = data.recommendations || [];
      setRecs(list);
      try { sessionStorage.setItem(readingCacheKey(), JSON.stringify(list)); } catch {}
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const signalThemes = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => (s.theme_tags || []).forEach(t => set.add(t.toLowerCase())));
    return set;
  }, [signals]);

  const topSignal = signals[0];

  const contextualMatter = (rec: Recommendation) => {
    const haystack = `${rec.title} ${rec.intelligence_value || ""} ${rec.skill_gap || ""}`.toLowerCase();
    const matchedTheme = Array.from(signalThemes).find(t => haystack.includes(t));
    if (matchedTheme && topSignal) {
      return {
        icon: <TrendingUp size={12} style={{ color: "var(--success, hsl(140 60% 45%))" }} />,
        label: "Strengthens top signal:",
        text: rec.intelligence_value || `Adds depth to your "${topSignal.signal_title}" signal.`,
        color: "var(--success, hsl(140 60% 45%))",
      };
    }
    return {
      icon: <Lightbulb size={12} style={{ color: "var(--brand)" }} />,
      label: "Why this matters:",
      text: rec.intelligence_value || rec.skill_gap || "Closes a blind spot in your radar.",
      color: "var(--brand)",
    };
  };

  return (
    <section style={{ marginTop: 40, paddingTop: 24, borderTop: "0.5px solid var(--color-border-tertiary, var(--surface-ink-subtle))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--ink-3)" }}>
          READING INTELLIGENCE
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ExpandablePanel label="How are these chosen?">
            Aura scans publications from McKinsey, BCG, Gartner, Deloitte, and 50+ sector-specific sources. Articles are ranked by how much they would strengthen your existing signals or close your blind spots. This is not a generic feed — every article was selected because of your specific intelligence profile.
          </ExpandablePanel>
          <button
            onClick={() => load(true)} disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "none", border: "0.5px solid var(--surface-ink-subtle)",
              borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "var(--ink-3)",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-4)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Articles selected to strengthen your radar. Each tells you what capturing it does for your intelligence.
      </p>

      {loading && recs.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}><Loader2 size={12} className="inline animate-spin" /> Loading…</p>
      ) : error || recs.length === 0 ? (
        <div style={{
          padding: 24, border: "0.5px dashed var(--surface-ink-subtle)", borderRadius: 10,
          textAlign: "center", color: "var(--ink-3)", fontSize: 12,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <BookOpen size={16} />
          Reading recommendations unavailable
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {recs.map((rec, i) => {
            const ctx = contextualMatter(rec);
            const domain = domainFromUrl(rec.url);
            return (
              <div key={i} style={{
                background: "var(--surface-ink-raised)", border: "0.5px solid var(--surface-ink-subtle)",
                borderRadius: 12, padding: "16px 18px",
              }}>
                <h4 style={{
                  fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
                  fontSize: 16, fontWeight: 500, color: "var(--ink)",
                  margin: "0 0 4px", lineHeight: 1.3,
                }}>
                  {rec.title}
                </h4>
                {domain && <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 10px" }}>{domain}</p>}

                <div style={{
                  background: "var(--color-background-secondary, var(--surface-ink-raised))",
                  border: "0.5px solid var(--surface-ink-subtle)",
                  borderRadius: 8, padding: "10px 12px", marginBottom: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {ctx.icon}
                    <span style={{ fontSize: 11, fontWeight: 500, color: ctx.color }}>{ctx.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5, margin: 0 }}>{ctx.text}</p>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => onOpenCapture?.()}
                    style={{
                      background: "var(--brand)", color: "#fff", border: "none",
                      borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <Plus size={12} /> Capture
                  </button>
                  {rec.url && (
                    <a
                      href={rec.url} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        background: "transparent", color: "var(--ink-4)",
                        border: "0.5px solid var(--surface-ink-subtle)",
                        borderRadius: 6, padding: "6px 10px", fontSize: 12, textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
const IntelligenceTab = ({ entries, onOpenChat, onOpenCapture, onDraftToStudio }: IntelligenceTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser } = useAuthReady();
  const journey = useJourneyState(authUser?.id ?? null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("signals");
  const [detecting, setDetecting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadSignals = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [signalsRes, entriesRes, documentsRes, movesRes] = await Promise.all([
        supabase.from("strategic_signals")
          .select("*, signal_velocity, velocity_status, commercial_validation_score")
          .eq("status", "active").order("confidence", { ascending: false }).limit(50),
        supabase.from("entries").select("id", { count: "exact", head: true }),
        supabase.from("documents").select("id", { count: "exact", head: true }),
        supabase.from("recommended_moves").select("id", { count: "exact", head: true }).eq("status", "active").eq("user_id", user.id),
      ]);
      const loaded = (signalsRes.data || []) as unknown as Signal[];
      setSignals(loaded);
      setEntryCount((entriesRes.count || 0) + (documentsRes.count || 0));
      setMovesCount(movesRes.count || 0);
      if (loaded.length > 0 && !selectedSignalId) setSelectedSignalId(loaded[0].id);
    } catch (e) {
      console.error("[IntelligenceTab]", e);
      setLoadError(true); showQueryErrorToast();
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  useEffect(() => {
    const handler = () => loadSignals();
    window.addEventListener("capture-complete", handler);
    return () => window.removeEventListener("capture-complete", handler);
  }, [loadSignals]);

  useEffect(() => {
    if (!authUser?.id) return;
    const channel = supabase.channel(`intelligence-live-${authUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries", filter: `user_id=eq.${authUser.id}` }, () => loadSignals())
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `user_id=eq.${authUser.id}` }, () => loadSignals())
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_signals", filter: `user_id=eq.${authUser.id}` }, () => loadSignals())
      .on("postgres_changes", { event: "*", schema: "public", table: "recommended_moves", filter: `user_id=eq.${authUser.id}` }, () => loadSignals())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id, loadSignals]);

  // Deep link
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

  const sortedByConfidence = useMemo(() => {
    const order: Record<string, number> = { fading: 0, accelerating: 1, stable: 2, dormant: 3 };
    return [...signals].sort((a, b) => {
      const ao = order[a.velocity_status || "stable"] ?? 2;
      const bo = order[b.velocity_status || "stable"] ?? 2;
      if (ao !== bo) return ao - bo;
      return b.confidence - a.confidence;
    });
  }, [signals]);

  const fadingSignals = useMemo(() => signals.filter(s => s.velocity_status === "fading"), [signals]);
  const dormantSignals = useMemo(() => signals.filter(s => s.velocity_status === "dormant"), [signals]);
  const topFading = useMemo(() => [...fadingSignals].sort((a, b) => b.confidence - a.confidence)[0] || null, [fadingSignals]);

  const archiveDormant = async () => {
    if (dormantSignals.length === 0) return;
    const ids = dormantSignals.map(s => s.id);
    const { error } = await supabase.from("strategic_signals").update({ status: "archived" } as any).in("id", ids);
    if (error) { toast.error("Couldn't archive signals"); return; }
    toast.success(`Archived ${ids.length} dormant signal${ids.length > 1 ? "s" : ""}`);
    await loadSignals();
  };

  const selectedSignal = useMemo(() =>
    sortedByConfidence.find(s => s.id === selectedSignalId) || sortedByConfidence[0] || null,
    [sortedByConfidence, selectedSignalId]);

  const draftFromSignal = async (s: Signal) => {
    await supabase.from("strategic_signals").update({ priority_score: (s.priority_score || 0) + 0.05 }).eq("id", s.id);
    onDraftToStudio?.({
      topic: s.signal_title,
      context: [s.explanation, s.strategic_implications, s.what_it_means_for_you].filter(Boolean).join("\n\n"),
      signalId: s.id, signalTitle: s.signal_title,
    });
  };

  const runPatternDetection = async () => {
    setDetecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-patterns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ user_id: session.user.id }),
      });
      if (!resp.ok) throw new Error("Detection failed");
      const data = await resp.json();
      toast.success(`Detected ${data.signals_created || 0} new signals`);
      await loadSignals();
    } catch (e: any) { toast.error(e.message); }
    finally { setDetecting(false); }
  };

  const uniqueThemeCount = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => (s.theme_tags || []).forEach(t => set.add(t.toLowerCase().trim())));
    return set.size;
  }, [signals]);

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: "var(--surface-ink-subtle)", borderRadius: 12, padding: 20, marginBottom: 12 }} className="animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* Gate when nothing yet */
  if (!journey.loading && signals.length === 0 && !journey.capturesReady) {
    return (
      <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px" }}>
          <Header entryCount={entryCount} signalsCount={0} movesCount={0} />
          <div style={{
            marginTop: 40, padding: "28px 28px",
            background: "var(--surface-ink-raised)", border: "0.5px solid var(--surface-ink-subtle)",
            borderRadius: 12, textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 16px" }}>
              {entryCount === 0
                ? "Your radar activates with your first capture. Paste a link to an article that made you think this week."
                : "Aura is analysing your captures. Signals emerge when 3+ sources share a pattern. Keep capturing from different sources."}
            </p>
            <Button size="sm" onClick={() => onOpenCapture?.()}>
              Capture {entryCount === 0 ? "an" : "another"} article →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
      {loadError && <SectionError onRetry={loadSignals} message="Couldn't load intelligence. " />}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 0" }}>
        {signals.length === 0 && <FirstVisitHint page="intelligence" />}

        {/* HEADER */}
        <Header entryCount={entryCount} signalsCount={signals.length} movesCount={movesCount} />

        {/* TAB SWITCHER */}
        <div style={{
          display: "flex", gap: 0,
          borderBottom: "2px solid var(--color-border-tertiary, var(--surface-ink-subtle))",
          marginTop: 28, marginBottom: 14,
        }}>
          {([
            { value: "signals" as const, label: "Signals" },
            { value: "sources" as const, label: `Sources ${entryCount}` },
          ]).map(t => {
            const active = activeSubTab === t.value;
            return (
              <button key={t.value}
                data-testid={t.value === "signals" ? "intel-tab-signals" : "intel-tab-sources"}
                onClick={() => setActiveSubTab(t.value)}
                style={{
                  padding: "10px 18px",
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? "var(--brand)" : "var(--ink-3)",
                  background: "transparent", border: "none",
                  borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
                  marginBottom: -2, cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {activeSubTab === "signals" && (
          <>
            {/* Alerts */}
            {fadingSignals.length > 0 && topFading && (
              <div role="status" style={{ marginBottom: 16, paddingTop: 14, paddingBottom: 14, borderTop: "0.5px solid hsl(24 95% 53% / 0.3)", borderBottom: "0.5px solid hsl(24 95% 53% / 0.3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "hsl(24 95% 53%)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={12} /> FADING
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                    {fadingSignals.length} signal{fadingSignals.length > 1 ? "s" : ""} losing strength — new evidence in the next {daysUntilDormant(topFading.confidence)} days reverses the trend.
                  </span>
                  <button onClick={() => onOpenCapture?.()} style={{ background: "none", border: "none", color: "hsl(24 95% 53%)", fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 0 }}>
                    Capture for "{topFading.signal_title}" →
                  </button>
                </div>
              </div>
            )}

            {dormantSignals.length > 0 && (
              <div role="status" style={{ marginBottom: 16, padding: "12px 14px", border: "0.5px solid var(--surface-ink-subtle)", borderRadius: 10, background: "var(--surface-ink-raised)" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 8 }}>
                  ◌ {dormantSignals.length} signal{dormantSignals.length > 1 ? "s have" : " has"} gone dormant (60+ days without new evidence).
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "transparent", color: "var(--ink-5)", border: "0.5px solid var(--surface-ink-subtle)", cursor: "pointer" }}>
                      <Archive size={11} className="inline mr-1" /> Archive dormant signals
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive {dormantSignals.length} dormant signal{dormantSignals.length > 1 ? "s" : ""}?</AlertDialogTitle>
                      <AlertDialogDescription>Archived signals are removed from your active radar. You can still find them in your data.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={archiveDormant}>Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* StrategicAdvisorPanel for 3+ signals */}
            {signals.length >= 3 && (
              <div data-testid="intel-next-move" style={{ marginBottom: 16 }}>
                <StrategicAdvisorPanel context="strategy" compact onOpenChat={onOpenChat} onDraftToStudio={onDraftToStudio} />
              </div>
            )}

            {signals.length === 0 ? (
              entryCount === 0 ? (
                <EmptyState icon={Brain} title="Your radar is quiet"
                  description="The market isn't. Capture one article about your sector and watch Aura detect what others miss."
                  ctaLabel="Capture your first source →" ctaAction={() => onOpenCapture?.()} />
              ) : entryCount < 3 ? (
                <EmptyState icon={Brain} title="Your radar is warming up"
                  description={`Aura needs at least 3 captures to detect strategic patterns. You have ${entryCount}/3.`}
                  ctaLabel="Capture another source →" ctaAction={() => onOpenCapture?.()} />
              ) : (
                <EmptyState icon={Brain} title="Your captures are being analysed"
                  description="Signals are forming — check back soon or try detecting patterns manually."
                  ctaLabel={detecting ? "Detecting..." : "Detect patterns →"}
                  ctaAction={detecting ? undefined : runPatternDetection} />
              )
            ) : (
              <>
                {/* RADAR (only when 3+ themes) */}
                {uniqueThemeCount >= 3 && <IntelligenceRadar signals={signals} captureCount={entryCount} />}

                {/* SIGNAL HERO */}
                {selectedSignal && (
                  <SignalHero signal={selectedSignal} onDraft={draftFromSignal} onOpenChat={onOpenChat} />
                )}

                {/* SIGNAL SIDEBAR LIST */}
                {sortedByConfidence.length > 1 && (
                  <section style={{ marginTop: 36, paddingTop: 24, borderTop: "0.5px solid var(--color-border-tertiary, var(--surface-ink-subtle))" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--ink-3)" }}>SIGNALS</span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>({sortedByConfidence.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sortedByConfidence.map(s => {
                        const confPct = Math.round(s.confidence * 100);
                        const isSelected = selectedSignal?.id === s.id;
                        const confColor = confPct > 70 ? "var(--success, hsl(140 60% 45%))" : confPct >= 40 ? "var(--brand)" : "var(--ink-3)";
                        const trend = s.velocity_status;
                        return (
                          <div key={s.id} onClick={() => setSelectedSignalId(s.id)}
                            data-testid="intel-signal-card"
                            style={{
                              padding: "12px 14px",
                              border: "0.5px solid var(--surface-ink-subtle)",
                              borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
                              borderRadius: 8, cursor: "pointer",
                              background: isSelected ? "var(--surface-ink-raised)" : "transparent",
                              transition: "background .15s",
                            }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-6)", margin: 0, lineHeight: 1.3 }}>{s.signal_title}</p>
                                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "3px 0 0" }}>
                                  {s.fragment_count} findings · {s.unique_orgs} org{s.unique_orgs === 1 ? "" : "s"}
                                  {trend && trend !== "stable" ? ` · ${trend}` : ""}
                                </p>
                              </div>
                              <div style={{
                                fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
                                fontSize: 20, fontWeight: 500, color: confColor, lineHeight: 1,
                              }}>{confPct}%</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                              <button onClick={(e) => { e.stopPropagation(); draftFromSignal(s); }}
                                style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: "var(--brand)", color: "#fff", border: "none", cursor: "pointer" }}>
                                Draft post →
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); onOpenChat?.(`Show competitor intel on: ${s.signal_title}`); }}
                                style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: "transparent", color: "var(--ink-4)", border: "0.5px solid var(--surface-ink-subtle)", cursor: "pointer" }}>
                                Competitor intel
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* BLIND SPOTS */}
                <EditorialBlindSpots signals={signals} onOpenCapture={onOpenCapture} />

                {/* READING */}
                <EditorialReadingList signals={signals} onOpenCapture={onOpenCapture} />
              </>
            )}
          </>
        )}

        {activeSubTab === "sources" && (
          <SourcesSubTab
            onOpenCapture={onOpenCapture}
            onSwitchToSignal={(signalId) => {
              setActiveSubTab("signals");
              setSelectedSignalId(signalId);
            }}
          />
        )}
      </div>
    </div>
  );
};

/* Header with editorial title + inline stats */
const Header = ({ entryCount, signalsCount, movesCount }: { entryCount: number; signalsCount: number; movesCount: number }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".12em", color: "var(--ink-4)", textTransform: "uppercase" }}>
      Your strategic radar
    </div>
    <h1 style={{
      fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
      fontSize: 26, fontWeight: 500, color: "var(--ink)",
      margin: "8px 0 6px",
    }}>
      Intelligence
    </h1>
    <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px", lineHeight: 1.5 }}>
      What the market doesn't know you know.
    </p>
    <div data-testid="intel-stats" style={{ display: "inline-flex", alignItems: "center", gap: 0, background: "none", border: "none" }}>
      {[
        { val: entryCount, label: entryCount === 1 ? "source" : "sources", color: "var(--brand)" },
        { val: signalsCount, label: signalsCount === 1 ? "signal" : "signals", color: "var(--info, var(--brand))" },
        { val: movesCount, label: movesCount === 1 ? "move" : "moves", color: "var(--success, hsl(140 60% 45%))" },
      ].map((s, i, arr) => (
        <div key={s.label} style={{ display: "inline-flex", alignItems: "center" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "0 18px", background: "none", border: "none",
          }}>
            <div style={{
              fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
              fontSize: 20, fontWeight: 500, color: s.color, lineHeight: 1,
            }}>{s.val}</div>
            <div style={{ fontSize: 9, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 4 }}>
              {s.label}
            </div>
          </div>
          {i < arr.length - 1 && (
            <span style={{ width: 0.5, height: 20, background: "var(--surface-ink-subtle)" }} />
          )}
        </div>
      ))}
    </div>
  </div>
);

export default IntelligenceTab;
