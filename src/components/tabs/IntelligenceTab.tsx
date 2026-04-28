import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  Loader2, ThumbsUp, ThumbsDown, Archive, RefreshCw, Layers,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import SectionError from "@/components/ui/section-error";
import { showQueryErrorToast } from "@/lib/safeQuery";
import { formatSmartDate } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
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
}

interface Insight {
  id: string;
  title: string;
  content: string;
  intelligence_type: string;
  skill_pillars: string[];
  tags: string[];
  created_at: string;
}

interface Framework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  framework_steps: any;
  source_type: string;
  created_at: string;
}

interface EvidenceFragmentRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
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
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

type SubTab = "signals" | "sources";

/* ═══════════════════════════════════════════
   AUTOMATION STRIP
   ═══════════════════════════════════════════ */

const AutomationStrip = () => {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("aura_automation_collapsed") === "true"; } catch { return false; }
  });
  const [moveTimeLeft, setMoveTimeLeft] = useState<string>("Ready");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("recommended_moves")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const created = new Date(data[0].created_at).getTime();
        const nextCycle = created + 24 * 60 * 60 * 1000;
        const remaining = nextCycle - Date.now();
        if (remaining > 0) {
          const hrs = Math.ceil(remaining / (60 * 60 * 1000));
          setMoveTimeLeft(`${hrs}h remaining`);
        } else {
          setMoveTimeLeft("Ready");
        }
      }
    })();
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("aura_automation_collapsed", String(next)); } catch {}
  };

  const cards = [
    { iconBg: "#0a1a0a", iconBorder: "#2a4a2a", iconColor: "var(--brand)", icon: "⚡", title: "Auto-detect on capture", desc: "New signal detected within 60s of every capture", status: "Active", statusColor: "#4a8a4a" },
    { iconBg: "#0a1020", iconBorder: "#1a3060", iconColor: "#111111", icon: "↻", title: "Weekly signal refresh", desc: "Signals recalculated every Sunday at midnight", status: "Scheduled", statusColor: "#4a7aaa" },
    { iconBg: "#1a1200", iconBorder: "#3a2a00", iconColor: "#111111", icon: "✦", title: "Move generation", desc: "3 strategic moves refreshed every 24 hours", status: moveTimeLeft, statusColor: "#8a6a20" },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <style>{`
        [data-theme="light"] .intel-automation-card { background: #ffffff !important; border-color: #e8e8e8 !important; }
        [data-theme="light"] .intel-automation-icon { background: #F3F3F3 !important; border-color: transparent !important; }
        [data-theme="light"] .intel-automation-title { color: #111111 !important; }
        [data-theme="light"] .intel-automation-desc { color: #666666 !important; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button onClick={toggle} style={{ background: "none", border: "none", color: "#444", fontSize: 10, cursor: "pointer", padding: "2px 0" }}>
          {collapsed ? "Show automation ↓" : "Hide automation ↑"}
        </button>
      </div>
      <div style={{ overflow: "hidden", maxHeight: collapsed ? 0 : 400, transition: "max-height 200ms ease-in-out" }}>
        <div className="intel-automation-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {cards.map((c, i) => (
            <div key={i} className="intel-automation-card" style={{ background: "#111", border: "0.5px solid #1e1e1e", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div className="intel-automation-icon" style={{ width: 36, height: 36, borderRadius: 8, background: c.iconBg, border: `1px solid ${c.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, color: c.iconColor, padding: 8, boxSizing: "border-box" }}>
                {c.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="intel-automation-title" style={{ fontSize: 10, fontWeight: 700, color: "#d0d0d0", margin: 0 }}>{c.title}</p>
                <p className="intel-automation-desc" style={{ fontSize: 9, color: "#444", margin: "2px 0 4px", lineHeight: 1.4 }}>{c.desc}</p>
                <span style={{ fontSize: 9, fontWeight: 700, color: c.statusColor }}>● {c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   SIGNAL DETAIL PANEL (left side of command center)
   ═══════════════════════════════════════════ */

const SignalDetailPanel = ({
  signal,
  signalIndex,
  totalSignals,
  onDraft,
  profile,
}: {
  signal: Signal;
  signalIndex: number;
  totalSignals: number;
  onDraft: (s: Signal) => void;
  profile: any;
}) => {
  const [evidenceFragments, setEvidenceFragments] = useState<EvidenceFragmentRow[]>([]);
  const [keyInsight, setKeyInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setShowAllEvidence(false);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (signal.supporting_evidence_ids?.length) {
        const ef = await supabase
          .from("evidence_fragments")
          .select("id, title, content, created_at")
          .in("id", signal.supporting_evidence_ids)
          .order("created_at", { ascending: false })
          .limit(20);
        setEvidenceFragments((ef.data || []) as unknown as EvidenceFragmentRow[]);
      } else {
        setEvidenceFragments([]);
      }

      if (user && signal.theme_tags?.length > 0) {
        const { data: insightsData } = await supabase
          .from("learned_intelligence")
          .select("id, title, content, intelligence_type, skill_pillars, tags, created_at")
          .eq("user_id", user.id)
          .or(`tags.ov.{${signal.theme_tags.join(",")}},skill_pillars.ov.{${signal.theme_tags.join(",")}}`)
          .order("created_at", { ascending: false })
          .limit(1);
        setKeyInsight((insightsData?.[0] as unknown as Insight) || null);
      } else {
        setKeyInsight(null);
      }

      setLoading(false);
      panelRef.current?.scrollTo({ top: 0 });
    })();
  }, [signal.id]);

  const confPct = Math.round(signal.confidence * 100);

  // Deduplicate evidence by title
  const uniqueEvidence = evidenceFragments.reduce<EvidenceFragmentRow[]>((acc, frag) => {
    const key = (frag.title || "").trim() || "Untitled source";
    const existing = acc.find(f => ((f.title || "").trim() || "Untitled source") === key);
    if (!existing) {
      acc.push({ ...frag, title: frag.title || "Untitled source" });
    } else if (frag.created_at > existing.created_at) {
      acc[acc.indexOf(existing)] = { ...frag, title: frag.title || "Untitled source" };
    }
    return acc;
  }, []);
  const visibleEvidence = showAllEvidence ? uniqueEvidence : uniqueEvidence.slice(0, 5);
  const hiddenCount = uniqueEvidence.length - 5;

  // Theme group helper
  const getThemeGroup = () => {
    if (!profile) return "";
    const tags = signal.theme_tags || [];
    if (profile.sector_focus && tags.some((t: string) => t.toLowerCase().includes(profile.sector_focus?.toLowerCase()))) return "My Industry";
    const pillars = [...(profile.brand_pillars || []), profile.core_practice].filter(Boolean);
    if (pillars.some((p: string) => tags.some((t: string) => t.toLowerCase().includes(p.toLowerCase())))) return "My Expertise";
    return "Wider Landscape";
  };

  return (
    <div ref={panelRef} style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      {loading ? (
        <div>
          <div style={{ height: 12, width: 120, background: "var(--surface-ink-subtle)", borderRadius: 4, marginBottom: 12 }} className="animate-pulse" />
          <div style={{ height: 48, width: 100, background: "var(--surface-ink-subtle)", borderRadius: 6, marginBottom: 16 }} className="animate-pulse" />
          <div style={{ height: 16, width: "80%", background: "var(--surface-ink-subtle)", borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
          <div style={{ height: 10, width: "100%", background: "var(--surface-ink-subtle)", borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
          <div style={{ height: 10, width: "70%", background: "var(--surface-ink-subtle)", borderRadius: 4 }} className="animate-pulse" />
        </div>
      ) : (
        <>
          {/* Signal indicator */}
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", marginBottom: 6 }}>
            Signal #{signalIndex + 1} of {totalSignals}
          </p>

          {/* Confidence number */}
          <p style={{ fontSize: 64, fontWeight: 800, color: "var(--brand)", letterSpacing: -3, lineHeight: 1, margin: "0 0 4px" }}>
            {confPct}%
          </p>

          {/* Title */}
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-7)", lineHeight: 1.3, margin: "0 0 16px" }}>
            {signal.signal_title}
          </h3>

          {/* Divider */}
          <div style={{ height: "0.5px", background: "#1e1e1e", margin: "0 0 14px" }} />

          {/* What this means for you */}
          {signal.what_it_means_for_you && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", marginBottom: 6 }}>What this means for you</p>
              <p style={{ fontSize: 13, color: "#777", lineHeight: 1.7, margin: 0 }}>{signal.what_it_means_for_you}</p>
            </div>
          )}

          {/* Key insight */}
          {keyInsight && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", marginBottom: 6 }}>Key insight</p>
              <div style={{ background: "#111", border: "0.5px solid var(--ink-3)", borderLeft: "2px solid var(--brand)", borderRadius: "0 6px 6px 0", padding: "10px 12px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#d0d0d0", margin: "0 0 3px" }}>{keyInsight.title}</p>
                <p style={{ fontSize: 11, color: "#555", lineHeight: 1.5, margin: 0 }}>{keyInsight.content.slice(0, 200)}</p>
              </div>
            </div>
          )}

          {/* Built from these sources */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", marginBottom: 8 }}>Built from these sources</p>
            {uniqueEvidence.length > 0 ? (
              <div>
                {visibleEvidence.map(frag => (
                  <div key={frag.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{frag.title}</span>
                    <span style={{ fontSize: 10, color: "#333", marginLeft: "auto", flexShrink: 0 }}>{relativeTime(frag.created_at)}</span>
                  </div>
                ))}
                {!showAllEvidence && hiddenCount > 0 && (
                  <button onClick={() => setShowAllEvidence(true)} style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 11, cursor: "pointer", padding: 0, marginTop: 4 }}>+ {hiddenCount} more</button>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 11, color: "#333" }}>No sources linked yet.</p>
            )}
          </div>

          {/* Confidence formula */}
          <p style={{ fontSize: 9, color: "#222", fontFamily: "monospace", marginBottom: 16 }}>
            AI confidence ~{confPct}%, {signal.unique_orgs} organisation{signal.unique_orgs !== 1 ? "s" : ""}. Formula: (0.47 AI) + (diversity) + (recency)
          </p>

          {/* Action button */}
          <button
            onClick={() => onDraft(signal)}
            style={{ width: "100%", background: "var(--brand)", color: "#000", border: "none", borderRadius: 6, padding: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Write on this
          </button>
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   KEY INSIGHTS STRIP (below command center)
   ═══════════════════════════════════════════ */

const KeyInsightsStrip = ({ onDraftToStudio }: { onDraftToStudio?: (prefill: SignalDraftPrefill) => void }) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("learned_intelligence")
        .select("id, title, content, intelligence_type, skill_pillars, tags, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      setInsights((data || []) as unknown as Insight[]);
    })();
  }, []);

  if (insights.length === 0) return null;

  const getBadge = (type: string) => {
    switch (type) {
      case "signal": case "pattern": return { label: "Signal", bg: "#0a1628", border: "#1d4ed844", color: "#60a5fa" };
      case "insight": case "principle": return { label: "Insight", bg: "#1a1400", border: "#F9731644", color: "var(--brand)" };
      case "recommendation": case "framework_step": return { label: "Recommendation", bg: "#0a1a0a", border: "#2a4a2a", color: "#4a8a4a" };
      case "blind_spot": case "claim": return { label: "Blind spot", bg: "#1a0a0a", border: "#4a2a2a", color: "#aa6060" };
      default: return { label: "Insight", bg: "#1a1400", border: "#F9731644", color: "var(--brand)" };
    }
  };

  const visible = showAll ? insights : insights.slice(0, 3);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#333", fontWeight: 600, margin: 0 }}>Key insights from your captures</p>
        {insights.length > 3 && (
          <button onClick={() => setShowAll(!showAll)} style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 10, cursor: "pointer" }}>
            {showAll ? "Show less" : `View all ${insights.length} →`}
          </button>
        )}
      </div>
      <div className="intel-key-insights-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {visible.map(insight => {
          const badge = getBadge(insight.intelligence_type);
          return (
            <div key={insight.id} style={{ background: "#111", border: "0.5px solid #1e1e1e", borderRadius: 8, padding: 12 }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, display: "inline-block", marginBottom: 6, background: badge.bg, border: `0.5px solid ${badge.border}`, color: badge.color }}>
                {badge.label}
              </span>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#d0d0d0", lineHeight: 1.4, margin: "0 0 4px" }}>{insight.title}</p>
              <p style={{ fontSize: 10, color: "#444", lineHeight: 1.5, margin: "0 0 8px" }}>
                {insight.content.slice(0, 120)}{insight.content.length > 120 ? "..." : ""}
              </p>
              <button
                onClick={() => onDraftToStudio?.({ topic: insight.title, context: insight.content, sourceType: "insight", sourceTitle: insight.title })}
                style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 10, fontWeight: 500, cursor: "pointer", padding: 0 }}
              >
                Write on this →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   FRAMEWORKS SUB-TAB
   ═══════════════════════════════════════════ */

const FrameworksSubTab = ({ onOpenChat, onDraftToStudio }: { onOpenChat?: (msg?: string) => void; onDraftToStudio?: (prefill: SignalDraftPrefill) => void }) => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "approved" | "draft">("all");
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps, source_type, created_at").order("created_at", { ascending: false }).limit(50);
      setFrameworks((r.data || []) as any);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    await supabase.from("master_frameworks").delete().eq("id", id);
    setFrameworks(prev => prev.filter(f => f.id !== id));
    setDeleteTarget(null);
    toast("Framework deleted");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} /></div>;

  const isApproved = (fw: Framework) => fw.source_type === "approved" || fw.source_type === "signal";
  const filtered = filter === "all" ? frameworks : filter === "approved" ? frameworks.filter(isApproved) : frameworks.filter(f => !isApproved(f));
  const approvedCount = frameworks.filter(isApproved).length;
  const draftCount = frameworks.length - approvedCount;
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 style={{ color: "var(--ink-7)", fontSize: 17, fontWeight: 700, margin: 0 }}>Frameworks</h2>
          <p style={{ color: "#444", fontSize: 11, margin: "2px 0 0" }}>{frameworks.length} created · Your structured thinking library</p>
        </div>
        <button onClick={() => setBuilderData({ title: "", steps: [], summary: "" })} style={{ background: "var(--brand)", color: "#000", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}>+ New framework</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        {[
          { key: "all" as const, label: `All (${frameworks.length})` },
          { key: "approved" as const, label: `Approved (${approvedCount})` },
          { key: "draft" as const, label: `Draft (${draftCount})` },
        ].map(chip => (
          <button key={chip.key} onClick={() => setFilter(chip.key)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer",
            background: filter === chip.key ? "#1a1400" : "var(--surface-ink-raised)",
            color: filter === chip.key ? "var(--brand)" : "#555",
            border: `1px solid ${filter === chip.key ? "rgba(197,165,90,0.27)" : "var(--ink-3)"}`,
          }}>{chip.label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>Most recent ↓</span>
      </div>

      {frameworks.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Layers className="w-7 h-7 mx-auto mb-3" style={{ color: "rgba(197,165,90,0.3)" }} />
          <p style={{ color: "#666", fontSize: 13 }}>No frameworks created yet.</p>
        </div>
      ) : (
        <div className="intel-frameworks-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {visible.map(fw => {
            const steps = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
            const approved = isApproved(fw);
            return (
              <div key={fw.id} style={{ background: "var(--surface-ink-raised)", border: "0.5px solid #222", borderTop: approved ? "2px solid var(--brand)" : "0.5px solid #222", borderRadius: 10, padding: 16 }}>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4, display: "inline-block", marginBottom: 6, background: approved ? "#0a1a0a" : "#1e1e1e", border: `0.5px solid ${approved ? "#2a4a2a" : "#333"}`, color: approved ? "#4a8a4a" : "#555" }}>
                  {approved ? "Approved" : "Draft"}
                </span>
                <p style={{ color: "var(--ink-7)", fontSize: 12, fontWeight: 600, lineHeight: 1.4, margin: "0 0 6px" }}>{fw.title}</p>
                {fw.summary && <p style={{ color: "#555", fontSize: 10, lineHeight: 1.5, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{fw.summary}</p>}
                {steps.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {steps.slice(0, 5).map((_: any, i: number) => (
                      <span key={i} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "#1e1e1e", border: "1px solid #333", color: "#555" }}>Step {i + 1}</span>
                    ))}
                  </div>
                )}
                <p style={{ color: "#333", fontSize: 10, margin: "0 0 8px" }}>{formatSmartDate(fw.created_at)}</p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {[
                    { label: "View", action: () => setBuilderData({ title: fw.title, steps: steps.map((s: any) => typeof s === "string" ? s : s.title || s.name || ""), summary: fw.summary || "" }) },
                    { label: "Refine", action: () => onOpenChat?.(`Refine framework: ${fw.title}`) },
                    { label: "Draft content", action: () => onDraftToStudio?.({ topic: fw.title, context: fw.summary || "", sourceType: "framework", sourceTitle: fw.title }) },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} style={{ background: "transparent", border: "0.5px solid #2a2a2a", borderRadius: 5, padding: "4px 9px", fontSize: 10, color: "#555", cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(197,165,90,0.27)"; e.currentTarget.style.color = "var(--brand)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
                    >{btn.label}</button>
                  ))}
                  <button onClick={() => setDeleteTarget(fw.id)} style={{ background: "transparent", border: "0.5px solid #2a2a2a", borderRadius: 5, padding: "4px 9px", fontSize: 10, color: "#555", cursor: "pointer", marginLeft: "auto" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,68,68,0.2)"; e.currentTarget.style.color = "#ff6666"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 6 && (
        <button onClick={() => setShowAll(!showAll)} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#444", fontSize: 10, cursor: "pointer" }}>
          {showAll ? "Show less ↑" : `Show all ${filtered.length} frameworks ↓`}
        </button>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", background: "var(--surface-ink-subtle)", borderRadius: 16, padding: 24, width: 360, maxWidth: "90vw", border: "1px solid var(--ink-3)" }}>
            <p style={{ color: "var(--ink-7)", fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>Delete this framework?</p>
            <p style={{ color: "var(--ink-5)", fontSize: 13, margin: "0 0 20px" }}>This cannot be undone.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "var(--ink-5)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#E24B4A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {builderData && (
        <FrameworkBuilder initialTitle={builderData.title} initialSteps={builderData.steps} initialDescription={builderData.summary || ""} open={!!builderData} onClose={() => setBuilderData(null)} onFrameworkCreated={() => setBuilderData(null)} />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   Main Intelligence Tab
   ═══════════════════════════════════════════ */

const IntelligenceTab = ({ entries, onOpenChat, onRefresh, onOpenCapture, onDraftToStudio }: IntelligenceTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("signals");
  const [detecting, setDetecting] = useState(false);
  const [showAllSignals, setShowAllSignals] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any).select("sector_focus, core_practice, brand_pillars").maybeSingle();
      setProfile(data);
    })();
  }, []);

  useEffect(() => {
    const signalParam = searchParams.get("signal");
    if (signalParam && signals.length > 0) {
      const found = signals.find(s => s.id === signalParam);
      if (found) {
        setSelectedSignalId(signalParam);
        setActiveSubTab("signals");
        searchParams.delete("signal");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [signals, searchParams]);

  const [loadError, setLoadError] = useState(false);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const [signalsRes, entriesRes, documentsRes, movesRes] = await Promise.all([
        supabase.from("strategic_signals").select("*").eq("status", "active").order("confidence", { ascending: false }).limit(50),
        supabase.from("entries").select("id", { count: "exact", head: true }),
        supabase.from("documents").select("id", { count: "exact", head: true }),
        supabase.from("recommended_moves").select("id", { count: "exact", head: true }).eq("status", "active").eq("user_id", user.id),
      ]);
      const loadedSignals = (signalsRes.data || []) as unknown as Signal[];
      setSignals(loadedSignals);
      setEntryCount((entriesRes.count || 0) + (documentsRes.count || 0));
      setMovesCount(movesRes.count || 0);
      // Auto-select first signal
      if (loadedSignals.length > 0 && !selectedSignalId) {
        setSelectedSignalId(loadedSignals[0].id);
      }
    } catch (err) {
      console.error("[IntelligenceTab] loadSignals failed", err);
      setLoadError(true);
      showQueryErrorToast();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  const sortedByConfidence = useMemo(() => {
    return [...signals].sort((a, b) => b.confidence - a.confidence);
  }, [signals]);

  const selectedSignal = useMemo(() => {
    return sortedByConfidence.find(s => s.id === selectedSignalId) || sortedByConfidence[0] || null;
  }, [sortedByConfidence, selectedSignalId]);

  const selectedIndex = useMemo(() => {
    if (!selectedSignal) return 0;
    return sortedByConfidence.findIndex(s => s.id === selectedSignal.id);
  }, [sortedByConfidence, selectedSignal]);

  const draftFromSignal = (s: Signal) => {
    onDraftToStudio?.({
      topic: s.signal_title,
      context: [s.explanation, s.strategic_implications, s.what_it_means_for_you].filter(Boolean).join("\n\n"),
      signalId: s.id,
      signalTitle: s.signal_title,
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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetecting(false);
    }
  };

  // Theme group helper for right panel
  const getThemeGroup = (s: Signal) => {
    if (!profile) return "";
    const tags = s.theme_tags || [];
    if (profile.sector_focus && tags.some((t: string) => t.toLowerCase().includes(profile.sector_focus?.toLowerCase()))) return "My Industry";
    const pillars = [...(profile.brand_pillars || []), profile.core_practice].filter(Boolean);
    if (pillars.some((p: string) => tags.some((t: string) => t.toLowerCase().includes(p.toLowerCase())))) return "My Expertise";
    return "Wider Landscape";
  };

  const visibleSignals = showAllSignals ? sortedByConfidence : sortedByConfidence.slice(0, 8);

  if (loading) {
    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", padding: "16px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: "var(--surface-ink-raised)", borderRadius: 12, padding: 20, marginBottom: 12, border: "1px solid var(--ink-3)" }}>
              <div style={{ height: 14, width: "60%", background: "#1f1f1f", borderRadius: 6, marginBottom: 10 }} className="animate-pulse" />
              <div style={{ height: 10, width: "100%", background: "var(--surface-ink-subtle)", borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
              <div style={{ height: 10, width: "70%", background: "var(--surface-ink-subtle)", borderRadius: 4 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const SUB_TABS: { value: SubTab; label: string }[] = [
    { value: "signals", label: "Signals" },
    { value: "sources", label: "Sources" },
  ];

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", paddingBottom: 80 }}>
      {loadError && (
        <SectionError onRetry={loadSignals} message="Couldn't load intelligence. " />
      )}
      <style>{`
          @media (max-width: 768px) {
          .intel-counter-bar > div:last-child { border-right: none !important; }
          .intel-automation-grid { grid-template-columns: 1fr !important; }
          .intel-command-center { flex-direction: column-reverse !important; min-height: 0 !important; }
          .intel-command-left { flex: 1 1 auto !important; border-right: none !important; border-top: 0.5px solid #1e1e1e; }
          .intel-command-right { flex: 1 1 auto !important; max-height: none !important; }
          .intel-signal-row { min-height: 48px; }
          .intel-key-insights-grid { grid-template-columns: 1fr !important; }
          .intel-frameworks-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>

        {/* ── Counter Bar ── */}
        <div className="intel-counter-bar" style={{ background: "var(--surface-ink-raised)", borderRadius: 10, display: "flex", alignItems: "center", marginBottom: 14, border: "0.5px solid #222", overflow: "hidden" }}>
          {[
            { label: "Sources", count: entryCount, gold: false },
            { label: "Signals", count: signals.length, gold: true },
            { label: "Moves", count: movesCount, gold: false },
          ].map((step, i, arr) => (
            <div key={step.label} style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRight: i < arr.length - 1 ? "0.5px solid #222" : "none" }}>
              <p style={{ color: step.gold ? "var(--brand)" : "var(--ink-7)", fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{step.count}</p>
              <p style={{ color: "#444", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", margin: "4px 0 0" }}>{step.label}</p>
            </div>
          ))}
        </div>

        {/* ── Automation Strip ── */}
        <AutomationStrip />

        {/* ── Your Next Move ── */}
        <div className="aura-hero-card" style={{ marginBottom: 14 }}>
          <StrategicAdvisorPanel context="strategy" compact onOpenChat={onOpenChat} onDraftToStudio={onDraftToStudio} />
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--ink-3)", marginBottom: 14, overflowX: "auto", flexWrap: "nowrap" }} className="scrollbar-hide">
          {SUB_TABS.map(tab => (
            <button key={tab.value} onClick={() => setActiveSubTab(tab.value)} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 500,
              color: activeSubTab === tab.value ? "var(--brand)" : "#7A7670",
              background: "transparent", border: "none",
              borderBottom: activeSubTab === tab.value ? "2px solid var(--brand)" : "2px solid transparent",
              cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.2s, border-color 0.2s", flexShrink: 0,
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════
            INTELLIGENCE TAB — COMMAND CENTER
           ═══════════════════════════════════════════ */}
        {activeSubTab === "signals" && (
          <>
            <p style={{ color: "#444", fontSize: 12, margin: "-4px 0 14px" }}>Signals Aura detected across everything you've captured — ranked by strength.</p>

            {signals.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "var(--ink-7)", fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No signals yet</p>
                <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Capture knowledge to start building signals.</p>
                <Button variant="outline" size="sm" onClick={runPatternDetection} disabled={detecting} className="gap-2 text-xs">
                  {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Detect signals
                </Button>
              </div>
            ) : (
              <>
                {/* Command Center container */}
                <div className="intel-command-center" style={{ background: "#0f0f0f", border: "0.5px solid #1e1e1e", borderRadius: 10, overflow: "hidden", display: "flex", minHeight: 500 }}>
                  {/* LEFT PANEL — detail view (~58%) */}
                  <div className="intel-command-left" style={{ flex: "0 0 58%", minWidth: 0, borderRight: "0.5px solid #1e1e1e" }}>
                    {selectedSignal && (
                      <SignalDetailPanel
                        signal={selectedSignal}
                        signalIndex={selectedIndex}
                        totalSignals={sortedByConfidence.length}
                        onDraft={draftFromSignal}
                        profile={profile}
                      />
                    )}
                  </div>

                  {/* RIGHT PANEL — signal list (~42%) */}
                  <div className="intel-command-right" style={{ flex: "0 0 42%", minWidth: 0, background: "#0d0d0d", overflowY: "auto", maxHeight: 600 }}>
                    {/* Header */}
                    <div style={{ padding: "14px 16px", borderBottom: "0.5px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#333", fontWeight: 600 }}>All signals</span>
                      <span style={{ fontSize: 10, color: "#333" }}>{sortedByConfidence.length} total</span>
                    </div>

                    {/* Signal rows */}
                    {visibleSignals.map((s, idx) => {
                      const confPct = Math.round(s.confidence * 100);
                      const isSelected = selectedSignal?.id === s.id;
                      const themeGroup = getThemeGroup(s);
                      return (
                        <div
                          key={s.id}
                          className="intel-signal-row"
                          onClick={() => setSelectedSignalId(s.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 0, padding: "12px 16px",
                            borderBottom: idx < visibleSignals.length - 1 ? "0.5px solid var(--surface-ink-subtle)" : "none",
                            cursor: "pointer", transition: "background 0.1s",
                            background: isSelected ? "var(--surface-ink-raised)" : "transparent",
                            borderLeft: isSelected ? "2px solid var(--brand)" : "2px solid transparent",
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#111"; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#222", minWidth: 22, textAlign: "center" }}>{idx + 1}</span>
                          {/* Vertical strength bar */}
                          <div style={{ width: 3, height: 32, borderRadius: 2, position: "relative", overflow: "hidden", flexShrink: 0, marginRight: 10, background: "#1e1e1e" }}>
                            <div style={{ position: "absolute", top: 0, width: "100%", height: `${confPct}%`, background: "var(--brand)", opacity: confPct / 100, borderRadius: 2 }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                            <p style={{ fontSize: 11, fontWeight: 500, color: isSelected ? "var(--ink-7)" : "var(--ink-6)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.signal_title}
                            </p>
                            <p style={{ fontSize: 9, color: "#333", margin: "2px 0 0" }}>
                              {s.fragment_count} findings · {s.unique_orgs} orgs{themeGroup ? ` · ${themeGroup}` : ""}
                            </p>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "var(--brand)" : "#555", flexShrink: 0 }}>
                            {confPct}%
                          </span>
                        </div>
                      );
                    })}

                    {/* Show all */}
                    {sortedByConfidence.length > 8 && (
                      <button
                        onClick={() => setShowAllSignals(!showAllSignals)}
                        style={{ display: "block", width: "100%", textAlign: "center", padding: "10px 16px", fontSize: 10, color: "#333", background: "none", border: "none", borderTop: "0.5px solid var(--surface-ink-subtle)", cursor: "pointer" }}
                      >
                        {showAllSignals ? "Show less ↑" : `Show all ${sortedByConfidence.length} signals ↓`}
                      </button>
                    )}
                  </div>
                </div>
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

      <LinkedInDraftPanel open={!!draftData} onClose={() => setDraftData(null)} title={draftData?.title || ""} hook={draftData?.hook} angle={draftData?.angle} context={draftData?.context} />
    </div>
  );
};

export default IntelligenceTab;
