import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2, Archive, RefreshCw, Layers, Brain, AlertTriangle, ChevronDown, ChevronRight,
  EyeOff, Info, Lightbulb, TrendingUp, ExternalLink, Plus, BookOpen, X,
} from "lucide-react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import SectionError from "@/components/ui/section-error";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import { FirstTimeHint } from "@/components/FirstTimeHint";
import { useJourneyState } from "@/hooks/useJourneyState";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useCapturedSources } from "@/hooks/useCapturedSources";
import { showQueryErrorToast } from "@/lib/safeQuery";
import { formatSkillLabel } from "@/lib/formatSkillLabel";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
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
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
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
   TERRITORY PANEL — radar + sortable list
   ═══════════════════════════════════════════ */
type TerritoryStatus = "ready" | "building" | "new";
interface Territory {
  key: string;
  name: string;
  signalCount: number;
  avgConfidence: number;
  strength: number;
  newestAt: string;
  status: TerritoryStatus;
}

const humanizeTheme = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());

function buildTerritories(signals: Signal[]): Territory[] {
  const map = new Map<string, { confs: number[]; count: number; newest: string; name: string }>();
  signals.forEach(s => {
    (s.theme_tags || []).forEach(t => {
      const key = t.toLowerCase().trim();
      if (!key) return;
      const cur = map.get(key) || { confs: [], count: 0, newest: s.created_at, name: humanizeTheme(key) };
      cur.confs.push(s.confidence);
      cur.count += 1;
      if (new Date(s.created_at) > new Date(cur.newest)) cur.newest = s.created_at;
      map.set(key, cur);
    });
  });
  const list: Territory[] = Array.from(map.entries()).map(([key, v]) => {
    const avg = v.confs.reduce((a, b) => a + b, 0) / v.confs.length;
    const days = (Date.now() - new Date(v.newest).getTime()) / (1000 * 60 * 60 * 24);
    let status: TerritoryStatus;
    if (v.count >= 2 && avg >= 0.6) status = "ready";
    else if (days < 7) status = "new";
    else status = "building";
    return { key, name: v.name, signalCount: v.count, avgConfidence: avg, strength: v.count * avg, newestAt: v.newest, status };
  });
  return list;
}

/** Wrapping tick for PolarAngleAxis so long theme names never truncate. */
const WrappingTick = (props: any) => {
  const { x, y, payload, textAnchor } = props;
  const text: string = payload?.value ?? "";
  const fill = "var(--aura-t2)";
  if (text.length <= 25) {
    return (
      <text x={x} y={y} textAnchor={textAnchor} fill={fill} fontSize={12} dy={4}>
        {text}
      </text>
    );
  }
  const words = text.split(" ");
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.slice(mid).join(" ");
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill={fill} fontSize={12}>
      <tspan x={x} dy={0}>{line1}</tspan>
      <tspan x={x} dy={14}>{line2}</tspan>
    </text>
  );
};

const StatusBadge = ({ status }: { status: TerritoryStatus }) => {
  const styles: Record<TerritoryStatus, React.CSSProperties> = {
    ready: { background: "var(--aura-accent)", color: "var(--aura-bg, #0b0b0c)" },
    building: { background: "transparent", color: "hsl(38 90% 60%)", border: "0.5px solid hsl(38 90% 60% / 0.4)" },
    new: { background: "transparent", color: "var(--info)", border: "0.5px solid var(--info)" },
  };
  const label = status === "ready" ? "Ready to publish" : status === "new" ? "New" : "Building";
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 4,
      whiteSpace: "nowrap", letterSpacing: ".02em", ...styles[status],
    }}>{label}</span>
  );
};

const TerritoryPanel = ({
  signals,
  selectedTheme,
  onSelectTheme,
}: {
  signals: Signal[];
  selectedTheme: string | null;
  onSelectTheme: (key: string | null) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const territories = useMemo(() => buildTerritories(signals), [signals]);

  const sorted = useMemo(() => {
    const rank: Record<TerritoryStatus, number> = { ready: 0, new: 1, building: 2 };
    return [...territories].sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return b.strength - a.strength;
    });
  }, [territories]);

  const top5 = useMemo(() => {
    const byStrength = [...territories].sort((a, b) => b.strength - a.strength).slice(0, 5);
    const maxStrength = byStrength[0]?.strength || 1;
    return byStrength.map(t => ({
      theme: t.name,
      value: Math.round((t.strength / maxStrength) * 100),
    }));
  }, [territories]);

  if (territories.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, 8);
  const showRadar = territories.length >= 3;

  return (
    <section style={{ margin: "32px 0" }}>
      {showRadar && (
        <div style={{ width: "100%", marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={top5} cx="50%" cy="50%" outerRadius="65%">
              <PolarGrid stroke="var(--color-border-tertiary, var(--surface-ink-subtle))" />
              <PolarAngleAxis dataKey="theme" tick={WrappingTick as any} />
              <Radar
                dataKey="value"
                stroke="var(--brand)"
                fill="var(--brand)"
                fillOpacity={0.25}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", textAlign: "center" }}>
            Top 5 territories by strength (signals × confidence).
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--ink-3)" }}>
          TERRITORIES
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>({territories.length})</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map(t => {
          const isSelected = selectedTheme === t.key;
          const confPct = Math.round(t.avgConfidence * 100);
          return (
            <button
              key={t.key}
              onClick={() => onSelectTheme(isSelected ? null : t.key)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                border: "0.5px solid var(--surface-ink-subtle)",
                borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
                borderRadius: 8,
                background: isSelected ? "var(--surface-ink-raised)" : "transparent",
                cursor: "pointer",
                transition: "background .15s",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, 
                    fontSize: 14, fontWeight: 500, color: "var(--ink-6, var(--ink))",
                    lineHeight: 1.3, wordBreak: "break-word",
                  }}>{t.name}</p>
                </div>
                <span style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                  {t.signalCount} signal{t.signalCount === 1 ? "" : "s"}
                </span>
                <StatusBadge status={t.status} />
              </div>
              <div style={{
                marginTop: 8, height: 4, borderRadius: 2,
                background: "var(--surface-ink-subtle)", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${confPct}%`,
                  background: "var(--brand)", transition: "width .3s",
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {sorted.length > 8 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 12, background: "none", border: "none", padding: 0,
            color: "var(--brand)", fontSize: 12, cursor: "pointer",
          }}
        >
          {expanded ? "Show fewer territories" : `Show all ${sorted.length} territories →`}
        </button>
      )}
    </section>
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
  const fragCount = (signal as any).evidenceCount ?? signal.supporting_evidence_ids?.length ?? signal.fragment_count ?? 0;
  const sourceCount = (signal as any).sourceCount ?? evidence.length ?? 0;
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
        fontFamily: "var(--font-display)",
        fontSize: 20, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3, margin: "0 0 12px",
      }}>
        {signal.signal_title}
      </h2>

      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.7, margin: "0 0 20px" }}>
        You've captured <strong style={{ color: "var(--ink-6)", fontWeight: 500 }}>{fragCount} piece{fragCount === 1 ? "" : "s"} of evidence</strong> from{" "}
        <strong style={{ color: "var(--ink-6)", fontWeight: 500 }}>{sourceCount} source{sourceCount === 1 ? "" : "s"}</strong>.{" "}
        Confidence: <strong style={{ color: "var(--brand)", fontWeight: 500 }}>{confPct}%</strong>
        <InfoTooltip
          label="Confidence"
          text="Evidence strength for this signal. More captures on this theme = higher confidence. Signals below 20% will fade."
          side="top"
          triggerSize={14}
        />{" "}
        <span style={{ color: velColor, fontWeight: 500 }}>{velText}</span>
        <InfoTooltip
          label="Velocity"
          text="Gaining: fresh evidence arriving. Stable: holding steady. Fading: needs new captures to sustain."
          side="top"
          triggerSize={14}
        />.
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
            fontFamily: "var(--font-display)",
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
          See the evidence behind this signal ({fragCount} piece{fragCount === 1 ? "" : "s"})
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
}: { signals: Signal[]; onOpenCapture?: (prefillUrl?: string, prefillText?: string, sourceKey?: string) => void }) => {
  const { isCaptured } = useCapturedSources();
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
          <InfoTooltip
            label="Blind spots"
            text="Topics active in your sector that you haven't captured yet. Publishing here expands your territory."
            side="bottom"
            triggerSize={13}
          />
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
                      fontFamily: "var(--font-display)",
                      fontSize: 15, fontWeight: 500, color: "var(--ink)",
                      margin: "0 0 4px", lineHeight: 1.3,
                    }}>{it.trend_headline}</h4>
                    <p style={{ fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5, margin: "0 0 6px" }}>{it.recommendation}</p>
                    <p style={{ fontStyle: "italic", fontSize: 11, color: accent, margin: "0 0 10px" }}>{urgency}</p>
                     <button
                      onClick={() => onOpenCapture?.(undefined, it.recommendation, (it.recommendation || "").trim())}
                      disabled={isCaptured((it.recommendation || "").trim())}
                      style={{
                        background: isCaptured((it.recommendation || "").trim()) ? `${accent}0F` : `${accent}1A`,
                        color: accent, border: `0.5px solid ${accent}55`,
                        borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 500,
                        cursor: isCaptured((it.recommendation || "").trim()) ? "default" : "pointer",
                        opacity: isCaptured((it.recommendation || "").trim()) ? 0.75 : 1,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}
                    >
                      {isCaptured((it.recommendation || "").trim())
                        ? <>✓ Captured</>
                        : <><Plus size={12} /> Start tracking this</>}
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
}: { signals: Signal[]; onOpenCapture?: (prefillUrl?: string, prefillText?: string, sourceKey?: string) => void }) => {
  const { isCaptured } = useCapturedSources();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => {
      setCooldownLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  const load = useCallback(async (force = false) => {
    if (force) {
      const since = Date.now() - lastRefreshAt;
      if (since < 60_000) {
        setCooldownLeft(Math.ceil((60_000 - since) / 1000));
        return;
      }
      setLastRefreshAt(Date.now());
      setCooldownLeft(60);
    }
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
  }, [lastRefreshAt]);

  useEffect(() => { void load(false); }, [load]);

  const signalThemes = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => (s.theme_tags || []).forEach(t => set.add(t.toLowerCase())));
    return set;
  }, [signals]);

  const topSignal = signals[0];

  const contextualMatter = (rec: Recommendation, index: number) => {
    const haystack = `${rec.title} ${rec.intelligence_value || ""} ${rec.skill_gap || ""}`.toLowerCase();
    const matchedTheme = Array.from(signalThemes).find(t => haystack.includes(t));
    if (matchedTheme && topSignal) {
      return {
        icon: <TrendingUp size={12} style={{ color: "var(--success, hsl(140 60% 45%))" }} />,
        label: "Strengthens your signal:",
        text: rec.intelligence_value || `Adds depth to your "${topSignal.signal_title}" signal.`,
        color: "var(--success, hsl(140 60% 45%))",
      };
    }
    if (rec.skill_gap && rec.skill_gap.trim()) {
      return {
        icon: <EyeOff size={12} style={{ color: "var(--danger, hsl(0 70% 55%))" }} />,
        label: `Closes a blind spot: ${formatSkillLabel(rec.skill_gap)}`,
        text: rec.intelligence_value || "",
        color: "var(--danger, hsl(0 70% 55%))",
      };
    }
    // Default rotation to avoid monotony
    const palette = [
      { color: "var(--brand)", icon: <Lightbulb size={12} style={{ color: "var(--brand)" }} /> },
      { color: "var(--success, hsl(140 60% 45%))", icon: <Lightbulb size={12} style={{ color: "var(--success, hsl(140 60% 45%))" }} /> },
      { color: "var(--info, var(--brand))", icon: <Lightbulb size={12} style={{ color: "var(--info, var(--brand))" }} /> },
    ];
    const p = palette[index % palette.length];
    return {
      icon: p.icon,
      label: "Why this matters:",
      text: rec.intelligence_value || rec.skill_gap || "Closes a blind spot in your radar.",
      color: p.color,
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
            Aura scans publications from McKinsey, BCG, Gartner, Deloitte, and 50+ sector-specific sources. Articles are ranked by how much they would strengthen your existing signals or close your blind spots. This is not a generic feed — every article was selected because of your specific intelligence profile. Links are AI-curated and checked when suggested; if one has moved, use the "Search the title" fallback on the card.
          </ExpandablePanel>
          <button
            onClick={() => load(true)} disabled={loading || cooldownLeft > 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "none", border: "0.5px solid var(--surface-ink-subtle)",
              borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "var(--ink-3)",
              cursor: (loading || cooldownLeft > 0) ? "default" : "pointer",
              opacity: cooldownLeft > 0 ? 0.6 : 1,
            }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {loading ? "Refreshing…" : cooldownLeft > 0 ? `Refresh (${cooldownLeft}s)` : "Refresh"}
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
          padding: "2rem 1rem", border: "0.5px dashed var(--surface-ink-subtle)", borderRadius: 10,
          textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <BookOpen size={16} style={{ color: "var(--ink-3)" }} />
          <p style={{ color: "var(--aura-t2, var(--ink-3))", fontSize: 14, margin: 0, maxWidth: 420, lineHeight: 1.5 }}>
            No verified articles found for your current intelligence gaps. Aura scans daily — check back tomorrow, or capture an article you've found yourself.
          </p>
          <button
            onClick={() => onOpenCapture?.()}
            style={{
              background: "var(--brand)", color: "#fff", border: "none",
              borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            Capture your own →
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {recs.slice(0, expanded ? recs.length : 1).map((rec, i) => {
            const ctx = contextualMatter(rec, i);
            const domain = domainFromUrl(rec.url);
            const searchHref = `https://www.google.com/search?q=${encodeURIComponent(rec.title + (rec.author ? " " + rec.author : ""))}`;
            const hasUrl = Boolean(rec.url);
            return (
              <div key={i} style={{
                background: "var(--surface-ink-raised)", border: "0.5px solid var(--surface-ink-subtle)",
                borderRadius: 12, padding: "16px 18px",
              }}>
                <h4 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16, fontWeight: 500, color: "var(--ink)",
                  margin: "0 0 4px", lineHeight: 1.3,
                }}>
                  {hasUrl ? (
                    <a
                      href={rec.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {rec.title}
                    </a>
                  ) : (
                    <span style={{ color: "inherit" }}>{rec.title}</span>
                  )}
                </h4>
                {rec.url && domain && <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 10px" }}>{domain}</p>}
                {!hasUrl && (
                  <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 10px" }}>
                    <a
                      href={searchHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--ink-3)", textDecoration: "underline" }}
                    >
                      Search for this →
                    </a>
                  </p>
                )}

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

                {(() => {
                  const sourceKey = (rec.url || rec.title || "").trim();
                  const captured = isCaptured(sourceKey);
                  return (
                <>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => onOpenCapture?.(rec.url || undefined, undefined, sourceKey)}
                    disabled={captured}
                    style={{
                      background: captured ? "hsl(var(--muted) / 0.5)" : "var(--brand)",
                      color: captured ? "hsl(var(--muted-foreground))" : "#fff", border: "none",
                      borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500,
                      cursor: captured ? "default" : "pointer",
                      opacity: captured ? 0.85 : 1,
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  >
                    {captured ? <>✓ Captured</> : <><Plus size={12} /> Capture</>}
                  </button>
                  {rec.url && (
                    <a
                      href={rec.url} target="_blank" rel="noopener noreferrer" title="Open article"
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
                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
                  <a
                    href={searchHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--ink-3)", textDecoration: "underline" }}
                  >
                    Can't open it? Search the title →
                  </a>
                </p>
                </>
                  );
                })()}
              </div>
            );
          })}
          {recs.length > 1 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, color: "var(--ink-3)", alignSelf: "flex-start",
              }}
            >
              {expanded
                ? "Show less"
                : `${recs.length - 1} more article${recs.length - 1 === 1 ? "" : "s"}`}
              <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
            </button>
          )}
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
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showReady, setShowReady] = useState(true);
  const [showBuilding, setShowBuilding] = useState(false);
  const [showEmerging, setShowEmerging] = useState(false);

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
      const loadedRaw = (signalsRes.data || []) as any[];
      // W2-A-2: compute LIVE evidence count per signal in ONE batched query.
      // Stored fragment_count is grow-only; this reflects only fragments that still exist.
      const allIds = Array.from(new Set(
        loadedRaw.flatMap((s) => (s.supporting_evidence_ids || []) as string[]),
      ));
      // Map fragment_id -> source_registry_id (for existing fragments only).
      const fragToReg = new Map<string, string>();
      if (allIds.length) {
        const { data: existRows } = await supabase
          .from("evidence_fragments")
          .select("id, source_registry_id")
          .eq("user_id", user.id)
          .in("id", allIds);
        (existRows || []).forEach((r: any) => fragToReg.set(r.id, r.source_registry_id));
      }
      // Map source_registry.id -> stable source key (source_id when present, else registry id).
      const regIds = Array.from(new Set(Array.from(fragToReg.values()).filter(Boolean))) as string[];
      const regToSource = new Map<string, string>();
      if (regIds.length) {
        const { data: regRows } = await supabase
          .from("source_registry" as any)
          .select("id, source_id")
          .in("id", regIds);
        (regRows || []).forEach((r: any) => regToSource.set(r.id, r.source_id || r.id));
      }
      const loaded = loadedRaw.map((s) => {
        const liveIds = ((s.supporting_evidence_ids || []) as string[])
          .filter((id) => fragToReg.has(id));
        const sourceKeys = new Set<string>();
        liveIds.forEach((id) => {
          const reg = fragToReg.get(id);
          if (!reg) return;
          sourceKeys.add(regToSource.get(reg) || reg);
        });
        return {
          ...s,
          evidenceCount: liveIds.length,
          sourceCount: sourceKeys.size,
        };
      }) as unknown as Signal[];
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
                {/* TERRITORY PANEL — radar (3+ themes) + sortable list */}
                <div data-tour="signal-radar">
                  <FirstTimeHint hintKey="intel-radar">
                    Your expertise map. Each node is a pattern Aura found across your captures — the bigger the node, the stronger the signal.
                  </FirstTimeHint>
                  <TerritoryPanel
                    signals={signals}
                    selectedTheme={selectedTheme}
                    onSelectTheme={setSelectedTheme}
                  />
                </div>

                {/* SIGNAL HERO */}
                {selectedSignal && (
                  <SignalHero signal={selectedSignal} onDraft={draftFromSignal} onOpenChat={onOpenChat} />
                )}

                {/* SIGNAL SIDEBAR LIST */}
                {sortedByConfidence.length > 1 && (() => {
                  const filtered = selectedTheme
                    ? sortedByConfidence.filter(s =>
                        (s.theme_tags || []).some(t => t.toLowerCase().trim() === selectedTheme)
                      )
                    : sortedByConfidence;
                  const selectedLabel = selectedTheme ? humanizeTheme(selectedTheme) : null;
                  const readySignals = filtered.filter(s => s.confidence >= 0.30);
                  const buildingSignals = filtered.filter(s => s.confidence >= 0.15 && s.confidence < 0.30);
                  const emergingSignals = filtered.filter(s => s.confidence < 0.15);
                  return (
                  <section data-tour="signal-list" style={{ marginTop: 36, paddingTop: 24, borderTop: "0.5px solid var(--color-border-tertiary, var(--surface-ink-subtle))" }}>
                    <FirstTimeHint hintKey="intel-signals">
                      Your signals ranked by strength. When one reaches "Publish-ready," hit "Write this" to generate a LinkedIn post.
                    </FirstTimeHint>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", color: "var(--ink-3)" }}>SIGNALS</span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {[
                          readySignals.length > 0 ? `${readySignals.length} publish-ready` : null,
                          buildingSignals.length > 0 ? `${buildingSignals.length} gaining strength` : null,
                          emergingSignals.length > 0 ? `${emergingSignals.length} on your radar` : null,
                        ].filter(Boolean).join(" · ")}
                        {selectedTheme ? ` · of ${sortedByConfidence.length}` : ""}
                      </span>
                      {selectedLabel && (
                        <button
                          onClick={() => setSelectedTheme(null)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 11, padding: "3px 8px", borderRadius: 999,
                            background: "var(--surface-ink-raised)", color: "var(--ink-5, var(--ink))",
                            border: "0.5px solid var(--surface-ink-subtle)", cursor: "pointer",
                          }}
                        >
                          {selectedLabel}
                          <X size={11} />
                        </button>
                      )}
                    </div>

                    {/* TIER 1 — Publish-ready */}
                    {readySignals.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div
                          onClick={() => setShowReady(!showReady)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand, #B08D3A)", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Publish-ready</span>
                            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                              {readySignals.length} signal{readySignals.length === 1 ? "" : "s"} · Strong enough to write from
                            </span>
                          </div>
                          <ChevronDown
                            size={14}
                            style={{
                              transform: showReady ? "rotate(180deg)" : "rotate(0)",
                              transition: "transform .2s",
                              color: "hsl(var(--muted-foreground))",
                            }}
                          />
                        </div>
                        {showReady && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 1, borderRadius: "var(--radius, 8px)", overflow: "hidden", border: "0.5px solid hsl(var(--border))" }}>
                            {readySignals.map((s) => (
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
                                  background: selectedSignalId === s.id ? "hsl(var(--muted) / 0.5)" : "hsl(var(--background))",
                                  cursor: "pointer",
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
                                onMouseLeave={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--background))"; }}
                              >
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>
                                    {s.signal_title}
                                  </div>
                                  <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                                    {(() => {
                                      const ec = (s as any).evidenceCount ?? s.fragment_count ?? 0;
                                      const sc = (s as any).sourceCount ?? 0;
                                      return `${ec} piece${ec === 1 ? "" : "s"} of evidence · ${sc} source${sc === 1 ? "" : "s"}`;
                                    })()}
                                    {s.velocity_status && s.velocity_status !== "stable" && ` · ${s.velocity_status}`}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--brand, #B08D3A)", fontVariantNumeric: "tabular-nums" }}>
                                    {Math.round(s.confidence * 100)}%
                                  </span>
                                </div>
                                <div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); draftFromSignal(s); }}
                                    style={{
                                      fontSize: 12,
                                      padding: "4px 10px",
                                      borderRadius: "var(--radius, 6px)",
                                      background: "none",
                                      border: "0.5px solid hsl(var(--border))",
                                      color: "hsl(var(--muted-foreground))",
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Write this →
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TIER 2 — Gaining strength */}
                    {buildingSignals.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div
                          onClick={() => setShowBuilding(!showBuilding)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--info))", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Gaining strength</span>
                            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                              {buildingSignals.length} signal{buildingSignals.length === 1 ? "" : "s"} · Capture more to sharpen
                            </span>
                          </div>
                          <ChevronDown
                            size={14}
                            style={{
                              transform: showBuilding ? "rotate(180deg)" : "rotate(0)",
                              transition: "transform .2s",
                              color: "hsl(var(--muted-foreground))",
                            }}
                          />
                        </div>
                        {showBuilding && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 1, borderRadius: "var(--radius, 8px)", overflow: "hidden", border: "0.5px solid hsl(var(--border))" }}>
                            {buildingSignals.map((s) => (
                              <div
                                key={s.id}
                                data-testid="intel-signal-card"
                                onClick={() => setSelectedSignalId(s.id)}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto auto",
                                  gap: 12,
                                  alignItems: "center",
                                  padding: "10px 16px",
                                  background: selectedSignalId === s.id ? "hsl(var(--muted) / 0.5)" : "hsl(var(--background))",
                                  cursor: "pointer",
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
                                onMouseLeave={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--background))"; }}
                              >
                                <div style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>{s.signal_title}</div>
                                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" }}>
                                  {Math.round(s.confidence * 100)}%
                                </div>
                                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                                  {(() => {
                                    const ec = (s as any).evidenceCount ?? s.fragment_count ?? 0;
                                    const sc = (s as any).sourceCount ?? 0;
                                    return `${ec} piece${ec === 1 ? "" : "s"} of evidence · ${sc} source${sc === 1 ? "" : "s"}`;
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TIER 3 — On your radar */}
                    {emergingSignals.length > 0 && (
                      <div>
                        <div
                          onClick={() => setShowEmerging(!showEmerging)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--muted-foreground) / 0.4)", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>On your radar</span>
                            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                              {emergingSignals.length} signal{emergingSignals.length === 1 ? "" : "s"} · Early patterns forming
                            </span>
                          </div>
                          <ChevronDown
                            size={14}
                            style={{
                              transform: showEmerging ? "rotate(180deg)" : "rotate(0)",
                              transition: "transform .2s",
                              color: "hsl(var(--muted-foreground))",
                            }}
                          />
                        </div>
                        {showEmerging && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 1, borderRadius: "var(--radius, 8px)", overflow: "hidden", border: "0.5px solid hsl(var(--border))" }}>
                            {emergingSignals.map((s) => (
                              <div
                                key={s.id}
                                data-testid="intel-signal-card"
                                onClick={() => setSelectedSignalId(s.id)}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto",
                                  gap: 12,
                                  alignItems: "center",
                                  padding: "8px 16px",
                                  background: selectedSignalId === s.id ? "hsl(var(--muted) / 0.5)" : "hsl(var(--background))",
                                  cursor: "pointer",
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
                                onMouseLeave={(e) => { if (selectedSignalId !== s.id) e.currentTarget.style.background = "hsl(var(--background))"; }}
                              >
                                <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.signal_title}</div>
                                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground) / 0.6)", fontVariantNumeric: "tabular-nums" }}>
                                  {Math.round(s.confidence * 100)}%
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                  );
                })()}

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
      fontFamily: "var(--font-display)",
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
            <div className="text-metric" style={{ color: s.val === 0 ? "var(--ink-3)" : s.color }}>
              {s.val === 0 ? "—" : s.val}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
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
