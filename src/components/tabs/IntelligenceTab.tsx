import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ThumbsUp, ThumbsDown, Archive, ChevronDown, ChevronRight,
  Zap, Lightbulb, Layers, RefreshCw,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import SignalExplorer from "@/components/SignalExplorer";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
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

/* ── Helpers ── */

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${pluralForm || singular + "s"}`;
}

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/([^\/\s]+)/);
  if (!m) return null;
  return m[1].replace(/^www\./, "");
}

function highlightKeyPhrases(text: string): JSX.Element {
  const keywords = ["CDO", "practice", "Partner", "transformation", "Transformation"];
  const regex = new RegExp(`(${keywords.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        keywords.some(k => k.toLowerCase() === part.toLowerCase())
          ? <span key={i} style={{ color: "#C5A55A" }}>{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

type SubTab = "signals" | "frameworks" | "sources";

/* ═══════════════════════════════════════════
   Evidence fragment row (expanded detail)
   ═══════════════════════════════════════════ */

interface EvidenceFragmentRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface SourceEntry {
  id: string;
  title: string | null;
  content: string;
  source_url: string | null;
  created_at: string;
}

const EvidenceRow = ({ frag }: { frag: EvidenceFragmentRow }) => {
  const displayTitle = (frag.title || frag.content || "Untitled").slice(0, 60);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid #1f1f1f" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", marginTop: 6, flexShrink: 0, backgroundColor: "#C5A55A" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#f0f0f0", fontSize: 13, lineHeight: 1.4, margin: 0 }}>{displayTitle}{displayTitle.length >= 60 ? "…" : ""}</p>
        <p style={{ color: "#666666", fontSize: 11, margin: "3px 0 0" }}>{relativeTime(frag.created_at)}</p>
      </div>
    </div>
  );
};

const SourceRow = ({
  entry,
  onRemove,
}: {
  entry: SourceEntry;
  signalId: string;
  onRemove: (entryId: string) => void;
}) => {
  const daysSince = Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 86400000);
  const isRecent = daysSince <= 14;
  const domain = extractDomain(entry.source_url) || extractDomain(entry.content);
  const displayTitle = entry.title || entry.content.slice(0, 60);
  const sourceUrl = entry.source_url || (entry.content.match(/^https?:\/\//) ? entry.content.split(/\s/)[0] : null);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #1f1f1f" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0, backgroundColor: isRecent ? "#7ab648" : "#C5A55A" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#f0f0f0", fontSize: 13, lineHeight: 1.4, margin: 0 }}>{displayTitle}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11, color: "#666666" }}>
          <span>{domain || "note"}</span>
          <span>·</span>
          <span>{relativeTime(entry.created_at)}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {sourceUrl && (
          <button onClick={() => window.open(sourceUrl, "_blank", "noopener")} style={{ fontSize: 11, color: "#666666", background: "none", border: "1px solid #252525", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Open</button>
        )}
        <button onClick={() => onRemove(entry.id)} style={{ fontSize: 11, color: "#666666", background: "none", border: "1px solid #252525", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Remove</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   Expanded card detail
   ═══════════════════════════════════════════ */

const ExpandedDetail = ({
  signal, onOpenChat, onArchive, onDraft, onLove, onNotForMe,
}: {
  signal: Signal;
  onOpenChat?: (msg?: string) => void;
  onArchive: (id: string) => void;
  onDraft: (signal: Signal) => void;
  onLove: (signal: Signal) => void;
  onNotForMe: (signal: Signal) => void;
}) => {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [evidenceFragments, setEvidenceFragments] = useState<EvidenceFragmentRow[]>([]);
  const [keyInsights, setKeyInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (signal.supporting_evidence_ids?.length) {
        const ef = await supabase
          .from("evidence_fragments")
          .select("id, title, content, created_at, source_registry_id")
          .in("id", signal.supporting_evidence_ids)
          .order("created_at", { ascending: false })
          .limit(20);
        setEvidenceFragments((ef.data || []) as unknown as EvidenceFragmentRow[]);

        const r = await supabase
          .from("entries")
          .select("id, title, content, source_url, created_at")
          .in("id", signal.supporting_evidence_ids)
          .order("created_at", { ascending: false })
          .limit(20);
        setSources((r.data || []) as unknown as SourceEntry[]);
      }

      if (user && signal.theme_tags?.length > 0) {
        const { data: insightsData } = await supabase
          .from("learned_intelligence")
          .select("id, title, content, intelligence_type, skill_pillars, tags, created_at")
          .eq("user_id", user.id)
          .or(`tags.ov.{${signal.theme_tags.join(",")}},skill_pillars.ov.{${signal.theme_tags.join(",")}}`)
          .order("created_at", { ascending: false })
          .limit(3);
        setKeyInsights((insightsData || []) as unknown as Insight[]);
      }

      setLoading(false);
    })();
  }, [signal.supporting_evidence_ids, signal.theme_tags]);

  const handleRemove = async (entryId: string) => {
    const newIds = signal.supporting_evidence_ids.filter(id => id !== entryId);
    const newCount = Math.max(signal.fragment_count - 1, 0);

    const { error } = await supabase
      .from("strategic_signals")
      .update({ supporting_evidence_ids: newIds, fragment_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", signal.id);

    if (error) { toast.error("Failed to remove source"); return; }
    setSources(prev => prev.filter(s => s.id !== entryId));
    toast("Source removed from this signal");
  };

  const isLoved = signal.user_signal_feedback === "love";
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

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ padding: "16px 20px 20px", borderTop: "1px solid #1f1f1f" }}>
        {signal.confidence_explanation && (
          <p style={{ color: "#3a3a3a", fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            {signal.confidence_explanation}
          </p>
        )}

        {signal.what_it_means_for_you && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>what this means for you</p>
            <p style={{ color: "#888888", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{highlightKeyPhrases(signal.what_it_means_for_you)}</p>
          </div>
        )}

        {keyInsights.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>key insights</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {keyInsights.map(insight => (
                <div key={insight.id} style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 14px", border: "1px solid #252525" }}>
                  <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 6px", lineHeight: 1.35 }}>{insight.title}</p>
                  <p style={{ color: "#888888", fontSize: 13, lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{insight.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>built from these sources</p>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#3a3a3a" }} />
            </div>
          ) : evidenceFragments.length > 0 ? (
            <div>
              {visibleEvidence.map(frag => <EvidenceRow key={frag.id} frag={frag} />)}
              {!showAllEvidence && hiddenCount > 0 && (
                <button onClick={() => setShowAllEvidence(true)} style={{ background: "none", border: "none", color: "#C5A55A", fontSize: 12, cursor: "pointer", marginTop: 8, padding: 0 }}>+ {hiddenCount} more</button>
              )}
            </div>
          ) : sources.length > 0 ? (
            <div>{sources.map(s => <SourceRow key={s.id} entry={s} signalId={signal.id} onRemove={handleRemove} />)}</div>
          ) : (
            <p style={{ color: "#3a3a3a", fontSize: 12 }}>No sources linked yet.</p>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => onDraft(signal)}
            style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: "#C5A55A", color: "#0d0d0d", fontWeight: 500, fontSize: 14, border: "none", cursor: "pointer", opacity: signal.confidence >= 0.60 ? 1 : 0.35, pointerEvents: signal.confidence >= 0.60 ? "auto" : "none" }}
          >
            Draft content
          </button>
          <button
            onClick={() => onOpenChat?.(`Analyse this signal:\n\n${signal.signal_title}\n${signal.explanation}`)}
            style={{ padding: "10px 16px", borderRadius: 10, background: "transparent", color: "#888888", fontSize: 13, border: "1px solid #2a2a2a", cursor: "pointer" }}
          >
            Ask Aura
          </button>
          <TooltipProvider delayDuration={300}>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onLove(signal)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <ThumbsUp size={16} fill={isLoved ? "#7ab648" : "none"} color={isLoved ? "#7ab648" : "#666666"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>{isLoved ? "Remove love" : "Love this signal"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => { if (signal.user_signal_feedback !== "not_relevant") onNotForMe(signal); }} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <ThumbsDown size={16} fill={signal.user_signal_feedback === "not_relevant" ? "#E24B4A" : "none"} color={signal.user_signal_feedback === "not_relevant" ? "#E24B4A" : "#666666"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>Not for me</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onArchive(signal.id)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <Archive size={16} color="#666666" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>Done with this</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════
   AUTOMATION STRIP
   ═══════════════════════════════════════════ */

const AutomationStrip = () => {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("aura_automation_strip_collapsed") === "true"; } catch { return false; }
  });
  const [moveTimeLeft, setMoveTimeLeft] = useState<string>("Ready to generate");

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
          setMoveTimeLeft("Ready to generate");
        }
      }
    })();
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("aura_automation_strip_collapsed", String(next)); } catch {}
  };

  const cards = [
    {
      iconBg: "#0a1a0a", iconBorder: "#2a4a2a", icon: "⚡",
      title: "Auto-detect on capture",
      desc: "New pattern detected within 60s of every capture",
      status: "Active", statusColor: "#4a8a4a",
    },
    {
      iconBg: "#0a1020", iconBorder: "#1a3060", icon: "↻",
      title: "Weekly pattern refresh",
      desc: "Patterns recalculated every Sunday at midnight",
      status: "Scheduled", statusColor: "#4a7aaa",
    },
    {
      iconBg: "#1a1200", iconBorder: "#3a2a00", icon: "✦",
      title: "Move generation",
      desc: "3 strategic moves refreshed every 24 hours",
      status: moveTimeLeft, statusColor: "#8a6a20",
    },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button onClick={toggle} style={{ background: "none", border: "none", color: "#444", fontSize: 10, cursor: "pointer", padding: "2px 0" }}>
          {collapsed ? "Show automation ↓" : "Hide automation ↑"}
        </button>
      </div>
      <div style={{ overflow: "hidden", maxHeight: collapsed ? 0 : 200, transition: "max-height 200ms ease-in-out" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {cards.map((c, i) => (
            <div key={i} style={{ background: "#111", border: "0.5px solid #1e1e1e", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: c.iconBg, border: `1px solid ${c.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {c.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#d0d0d0", margin: 0 }}>{c.title}</p>
                <p style={{ fontSize: 10, color: "#555", margin: "2px 0 4px", lineHeight: 1.4 }}>{c.desc}</p>
                <span style={{ fontSize: 9, color: c.statusColor }}>● {c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   FRAMEWORKS SUB-TAB (redesigned)
   ═══════════════════════════════════════════ */

const FrameworksSubTab = ({ onOpenChat, onDraftToStudio }: { onOpenChat?: (msg?: string) => void; onDraftToStudio?: (prefill: SignalDraftPrefill) => void }) => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "approved" | "draft">("all");
  const [showAll, setShowAll] = useState(false);

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
    toast("Framework deleted");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} /></div>;

  const isApproved = (fw: Framework) => fw.source_type === "approved" || fw.source_type === "signal";
  const filtered = filter === "all" ? frameworks : filter === "approved" ? frameworks.filter(isApproved) : frameworks.filter(f => !isApproved(f));
  const approvedCount = frameworks.filter(isApproved).length;
  const draftCount = frameworks.length - approvedCount;
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 style={{ color: "#f0f0f0", fontSize: 18, fontWeight: 700, margin: 0 }}>Frameworks</h2>
          <p style={{ color: "#555", fontSize: 12, margin: "2px 0 0" }}>{frameworks.length} created · Your structured thinking library</p>
        </div>
        <button
          onClick={() => setBuilderData({ title: "", steps: [], summary: "" })}
          style={{ background: "#C5A55A", color: "#000", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}
        >
          + New framework
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {[
          { key: "all" as const, label: `All (${frameworks.length})` },
          { key: "approved" as const, label: `Approved (${approvedCount})` },
          { key: "draft" as const, label: `Draft (${draftCount})` },
        ].map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer",
              background: filter === chip.key ? "#1a1400" : "#141414",
              color: filter === chip.key ? "#C5A55A" : "#555",
              border: `1px solid ${filter === chip.key ? "rgba(197,165,90,0.27)" : "#252525"}`,
            }}
          >
            {chip.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>Most recent ↓</span>
      </div>

      {/* Framework cards */}
      {frameworks.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Layers className="w-7 h-7 mx-auto mb-3" style={{ color: "rgba(197,165,90,0.3)" }} />
          <p style={{ color: "#666", fontSize: 13 }}>No frameworks created yet. Build one from a pattern.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {visible.map(fw => {
            const steps = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
            const approved = isApproved(fw);
            return (
              <div key={fw.id} style={{ background: "#141414", border: `0.5px solid #222`, borderTop: approved ? "2px solid #C5A55A" : "0.5px solid #222", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                    background: approved ? "#0a1a0a" : "#1e1e1e",
                    border: `1px solid ${approved ? "#2a4a2a" : "#333"}`,
                    color: approved ? "#4a8a4a" : "#555",
                  }}>
                    {approved ? "Approved" : "Draft"}
                  </span>
                </div>
                <p style={{ color: "#e0e0e0", fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: "0 0 6px" }}>{fw.title}</p>
                {fw.summary && <p style={{ color: "#555", fontSize: 11, lineHeight: 1.5, margin: "0 0 10px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{fw.summary}</p>}

                {steps.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {steps.slice(0, 5).map((_: any, i: number) => (
                      <span key={i} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "#1e1e1e", border: "1px solid #333", color: "#555" }}>Step {i + 1}</span>
                    ))}
                  </div>
                )}

                <p style={{ color: "#444", fontSize: 10, margin: "0 0 10px" }}>{formatSmartDate(fw.created_at)}</p>

                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { label: "View", action: () => setBuilderData({ title: fw.title, steps: steps.map((s: any) => typeof s === "string" ? s : s.title || s.name || ""), summary: fw.summary || "" }) },
                    { label: "Refine", action: () => onOpenChat?.(`Refine framework: ${fw.title}`) },
                    { label: "Draft content", action: () => onDraftToStudio?.({ topic: fw.title, context: fw.summary || "", sourceType: "framework", sourceTitle: fw.title }) },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      onClick={btn.action}
                      style={{ border: "0.5px solid #333", color: "#666", borderRadius: 5, padding: "5px 10px", fontSize: 10, background: "none", cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(197,165,90,0.27)"; e.currentTarget.style.color = "#C5A55A"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#666"; }}
                    >
                      {btn.label}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDelete(fw.id)}
                    style={{ border: "0.5px solid #333", color: "#666", borderRadius: 5, padding: "5px 10px", fontSize: 10, background: "none", cursor: "pointer", marginLeft: "auto" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,68,68,0.27)"; e.currentTarget.style.color = "#ff6666"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#666"; }}
                  >
                    ✕
                  </button>
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

      {builderData && (
        <FrameworkBuilder
          initialTitle={builderData.title}
          initialSteps={builderData.steps}
          initialDescription={builderData.summary || ""}
          open={!!builderData}
          onClose={() => setBuilderData(null)}
          onFrameworkCreated={() => { setBuilderData(null); }}
        />
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("signals");
  const [detecting, setDetecting] = useState(false);
  const [showAllSignals, setShowAllSignals] = useState(false);
  const [showMoreFeature, setShowMoreFeature] = useState(false);

  useEffect(() => {
    const signalParam = searchParams.get("signal");
    if (signalParam && signals.length > 0) {
      const found = signals.find(s => s.id === signalParam);
      if (found) {
        setExpandedId(signalParam);
        setActiveSubTab("signals");
        searchParams.delete("signal");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [signals, searchParams]);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    const [signalsRes, entriesRes, movesRes, publishedRes] = await Promise.all([
      supabase.from("strategic_signals").select("*").eq("status", "active").order("priority_score", { ascending: false }).limit(20),
      supabase.from("entries").select("id", { count: "exact", head: true }),
      supabase.from("content_items").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("linkedin_posts").select("id", { count: "exact", head: true }).not("published_at", "is", null),
    ]);
    setSignals((signalsRes.data || []) as unknown as Signal[]);
    setEntryCount(entriesRes.count || 0);
    setMovesCount(movesRes.count || 0);
    setPublishedCount(publishedRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  const handleArchive = async (id: string) => {
    await supabase.from("strategic_signals").update({ status: "archived" }).eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    toast("Signal archived.");
  };

  const handleLove = async (signal: Signal) => {
    const isAlreadyLoved = signal.user_signal_feedback === "love";
    if (isAlreadyLoved) {
      const newPriority = Math.max(signal.priority_score - 0.10, 0);
      await supabase.from("strategic_signals").update({ user_signal_feedback: null, priority_score: newPriority }).eq("id", signal.id);
      for (const tag of signal.theme_tags || []) {
        const { data: existing } = await supabase.from("signal_topic_preferences" as any).select("id, preference_score").eq("theme_tag", tag).maybeSingle();
        if (existing) await supabase.from("signal_topic_preferences" as any).update({ preference_score: Math.max((existing as any).preference_score - 0.15, -1.0), updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
      }
      setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: null, priority_score: newPriority } : s));
      toast("Love removed");
    } else {
      const newPriority = Math.min(signal.priority_score + 0.10, 1.0);
      await supabase.from("strategic_signals").update({ user_signal_feedback: "love", priority_score: newPriority }).eq("id", signal.id);
      for (const tag of signal.theme_tags || []) {
        const { data: existing } = await supabase.from("signal_topic_preferences" as any).select("id, preference_score").eq("theme_tag", tag).maybeSingle();
        if (existing) {
          await supabase.from("signal_topic_preferences" as any).update({ preference_score: Math.min((existing as any).preference_score + 0.15, 1.0), updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) await supabase.from("signal_topic_preferences" as any).insert({ user_id: session.user.id, theme_tag: tag, preference_score: 0.15 });
        }
      }
      setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: "love", priority_score: newPriority } : s).sort((a, b) => b.priority_score - a.priority_score));
      toast("Signal boosted — Aura will surface more like this");
    }
  };

  const handleNotForMe = async (signal: Signal) => {
    await supabase.from("strategic_signals").update({ user_signal_feedback: "not_relevant", priority_score: 0.05 }).eq("id", signal.id);
    for (const tag of signal.theme_tags || []) {
      const { data: existing } = await supabase.from("signal_topic_preferences" as any).select("id, preference_score").eq("theme_tag", tag).maybeSingle();
      if (existing) {
        await supabase.from("signal_topic_preferences" as any).update({ preference_score: Math.max((existing as any).preference_score - 0.20, -1.0), updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await supabase.from("signal_topic_preferences" as any).insert({ user_id: session.user.id, theme_tag: tag, preference_score: -0.20 });
      }
    }
    setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: "not_relevant", priority_score: 0.05 } : s).sort((a, b) => b.priority_score - a.priority_score));
    toast("Got it — Aura will show fewer signals like this");
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

  /* ── Sorted signals by confidence for editorial layout ── */
  const sortedByConfidence = useMemo(() => {
    return [...signals].sort((a, b) => b.confidence - a.confidence);
  }, [signals]);

  const featureSignal = sortedByConfidence[0] || null;
  const miniSignals = sortedByConfidence.slice(1, 3);
  const rankedSignals = sortedByConfidence.slice(3, 8);
  const remainingSignals = sortedByConfidence.slice(8);

  /* ── Helper to draft from signal ── */
  const draftFromSignal = (s: Signal) => {
    onDraftToStudio?.({
      topic: s.signal_title,
      context: [s.explanation, s.strategic_implications, s.what_it_means_for_you].filter(Boolean).join("\n\n"),
      signalId: s.id,
      signalTitle: s.signal_title,
    });
  };

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", padding: "16px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: "#141414", borderRadius: 12, padding: 20, marginBottom: 12, border: "1px solid #252525" }}>
              <div style={{ height: 14, width: "60%", background: "#1f1f1f", borderRadius: 6, marginBottom: 10 }} className="animate-pulse" />
              <div style={{ height: 10, width: "100%", background: "#1a1a1a", borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
              <div style={{ height: 10, width: "70%", background: "#1a1a1a", borderRadius: 4 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const SUB_TABS: { value: SubTab; label: string }[] = [
    { value: "signals", label: "Intelligence" },
    { value: "frameworks", label: "Frameworks" },
    { value: "sources", label: "Sources" },
  ];

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 16px" }}>

        {/* ── SECTION 1: Counter Bar ── */}
        <div style={{
          background: "#141414", borderRadius: 10, display: "flex", alignItems: "center",
          marginBottom: 14, border: "1px solid #252525", overflow: "hidden",
        }}>
          {[
            { label: "Sources", count: entryCount, gold: false },
            { label: "Patterns found", count: signals.length, gold: true },
            { label: "Moves", count: movesCount, gold: false },
            { label: "Published", count: publishedCount, gold: false },
          ].map((step, i) => (
            <div key={step.label} style={{
              flex: 1, textAlign: "center", padding: "12px 8px",
              borderRight: i < 3 ? "0.5px solid #252525" : "none",
            }}>
              <p style={{ color: step.gold ? "#C5A55A" : "#f0f0f0", fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{step.count}</p>
              <p style={{ color: "#444", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", margin: "4px 0 0" }}>{step.label}</p>
            </div>
          ))}
        </div>

        {/* ── SECTION 2: Automation Strip ── */}
        <AutomationStrip />

        {/* ── SECTION 3: Your Next Move ── */}
        <div style={{ marginBottom: 14 }}>
          <StrategicAdvisorPanel context="strategy" compact onOpenChat={onOpenChat} onDraftToStudio={onDraftToStudio} />
        </div>

        {/* ── SECTION 4: Tab Bar ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #252525", marginBottom: 14, overflowX: "auto" }} className="scrollbar-hide">
          {SUB_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveSubTab(tab.value)}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 500,
                color: activeSubTab === tab.value ? "#C5A55A" : "#444",
                background: "transparent", border: "none",
                borderBottom: activeSubTab === tab.value ? "2px solid #C5A55A" : "2px solid transparent",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "color 0.2s, border-color 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════
            SECTION 5: Intelligence Tab Content
           ═══════════════════════════════════════════ */}
        {activeSubTab === "signals" && (
          <>
            <p style={{ color: "#555", fontSize: 12, margin: "-4px 0 14px" }}>Patterns Aura detected across everything you've captured — ranked by strength.</p>

            {signals.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#f0f0f0", fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No signals yet</p>
                <p style={{ color: "#666666", fontSize: 13, marginBottom: 20 }}>Capture knowledge to start building signals.</p>
                <Button variant="outline" size="sm" onClick={runPatternDetection} disabled={detecting} className="gap-2 text-xs">
                  {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Detect Patterns
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* LEFT COLUMN (~55%) */}
                <div style={{ flex: "0 0 55%", minWidth: 0 }}>
                  {featureSignal && (
                    <div style={{
                      background: "#141414", border: "0.5px solid rgba(197,165,90,0.2)",
                      borderTop: "2px solid #C5A55A", borderRadius: "0 0 12px 12px", padding: 20,
                    }}>
                      {/* Top row */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                        <span style={{ fontSize: 52, fontWeight: 800, color: "#C5A55A", letterSpacing: -2, lineHeight: 1 }}>
                          {Math.round(featureSignal.confidence * 100)}%
                        </span>
                        <span style={{ background: "#C5A55A", color: "#000", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, flexShrink: 0, marginTop: 4 }}>
                          TOP SIGNAL
                        </span>
                      </div>

                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f0", lineHeight: 1.35, margin: "0 0 8px" }}>
                        {featureSignal.signal_title}
                      </h3>

                      <p style={{
                        fontSize: 12, color: "#666", lineHeight: 1.7, margin: "0 0 10px",
                        display: "-webkit-box", WebkitLineClamp: showMoreFeature ? 999 : 4,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>
                        {featureSignal.explanation}
                      </p>
                      {featureSignal.explanation.length > 200 && (
                        <button onClick={() => setShowMoreFeature(!showMoreFeature)} style={{ background: "none", border: "none", color: "#C5A55A", fontSize: 11, cursor: "pointer", padding: 0, marginBottom: 10 }}>
                          {showMoreFeature ? "Show less" : "Show more"}
                        </button>
                      )}

                      <p style={{ fontSize: 11, color: "#555", margin: "0 0 10px" }}>
                        {featureSignal.fragment_count} evidence · {featureSignal.unique_orgs} organisations · {featureSignal.theme_tags[0] || "general"}
                      </p>

                      {/* Pills */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                        {featureSignal.theme_tags.slice(0, 5).map(tag => (
                          <span key={tag} style={{ background: "#1e1e1e", border: "1px solid #333", color: "#666", fontSize: 9, padding: "2px 8px", borderRadius: 20 }}>{tag}</span>
                        ))}
                        {featureSignal.theme_tags.length > 5 && (
                          <span style={{ fontSize: 9, color: "#444" }}>+{featureSignal.theme_tags.length - 5} more</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => draftFromSignal(featureSignal)}
                          style={{ background: "#C5A55A", color: "#000", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}
                        >
                          Write on this
                        </button>
                        <button
                          onClick={() => setExpandedId(expandedId === featureSignal.id ? null : featureSignal.id)}
                          style={{ border: "1px solid #333", color: "#777", borderRadius: 6, padding: "8px 16px", fontSize: 12, background: "none", cursor: "pointer" }}
                        >
                          Expand
                        </button>
                        <button
                          onClick={() => setExpandedId(featureSignal.id)}
                          style={{ border: "1px solid #333", color: "#777", borderRadius: 6, padding: "8px 16px", fontSize: 12, background: "none", cursor: "pointer" }}
                        >
                          Build framework
                        </button>
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {expandedId === featureSignal.id && (
                          <ExpandedDetail
                            signal={featureSignal}
                            onOpenChat={onOpenChat}
                            onArchive={handleArchive}
                            onDraft={draftFromSignal}
                            onLove={handleLove}
                            onNotForMe={handleNotForMe}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (~45%) */}
                <div style={{ flex: "0 0 45%", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Mini cards (signals #2 and #3) */}
                  {miniSignals.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {miniSignals.map(s => (
                        <div key={s.id} style={{ background: "#141414", border: "0.5px solid #222", borderRadius: 8, padding: 12 }}>
                          <p style={{ fontSize: 20, fontWeight: 700, color: "#aaa", margin: "0 0 6px" }}>{Math.round(s.confidence * 100)}%</p>
                          <p style={{ fontSize: 11, fontWeight: 500, color: "#d0d0d0", lineHeight: 1.4, margin: "0 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {s.signal_title}
                          </p>
                          <p style={{ fontSize: 9, color: "#444", margin: "0 0 8px" }}>
                            {s.fragment_count} evidence · {s.unique_orgs} orgs
                          </p>
                          <button
                            onClick={() => draftFromSignal(s)}
                            style={{ background: "none", border: "none", color: "#C5A55A", fontSize: 10, cursor: "pointer", padding: 0 }}
                          >
                            Write on this →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ranked list (signals #4–#8) */}
                  {rankedSignals.length > 0 && (
                    <div style={{ background: "#141414", border: "0.5px solid #222", borderRadius: 8, overflow: "hidden" }}>
                      {(showAllSignals ? [...rankedSignals, ...remainingSignals] : rankedSignals).map((s, idx) => {
                        const confPct = Math.round(s.confidence * 100);
                        const opacity = [1, 0.8, 0.7, 0.6, 0.5][Math.min(idx, 4)];
                        return (
                          <div
                            key={s.id}
                            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                              borderBottom: "0.5px solid #1a1a1a", cursor: "pointer",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#1a1a1a"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#333", minWidth: 16, textAlign: "center" }}>{idx + 4}</span>
                            {/* Micro bar */}
                            <div style={{ width: 3, height: 28, background: "#1e1e1e", borderRadius: 2, position: "relative", overflow: "hidden", flexShrink: 0 }}>
                              <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${confPct}%`, background: "#C5A55A", opacity, borderRadius: 2 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 11, fontWeight: 500, color: "#ccc", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.signal_title}</p>
                              <p style={{ fontSize: 9, color: "#444", margin: "2px 0 0" }}>
                                {s.fragment_count} evidence · {s.unique_orgs} orgs · {s.theme_tags[0] || ""}
                              </p>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#777", margin: 0 }}>{confPct}%</p>
                              <button
                                onClick={(e) => { e.stopPropagation(); draftFromSignal(s); }}
                                style={{ fontSize: 9, color: "#C5A55A", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                Write →
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {remainingSignals.length > 0 && (
                        <button
                          onClick={() => setShowAllSignals(!showAllSignals)}
                          style={{ display: "block", width: "100%", textAlign: "center", padding: 8, fontSize: 10, color: "#444", background: "none", border: "none", cursor: "pointer" }}
                        >
                          {showAllSignals ? "Show less ↑" : `Show all ${sortedByConfidence.length} patterns ↓`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded detail for ranked signals */}
                  {[...miniSignals, ...rankedSignals, ...(showAllSignals ? remainingSignals : [])].map(s => (
                    expandedId === s.id ? (
                      <div key={s.id} style={{ background: "#141414", border: "0.5px solid #222", borderRadius: 8, overflow: "hidden" }}>
                        <ExpandedDetail
                          signal={s}
                          onOpenChat={onOpenChat}
                          onArchive={handleArchive}
                          onDraft={draftFromSignal}
                          onLove={handleLove}
                          onNotForMe={handleNotForMe}
                        />
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeSubTab === "frameworks" && <FrameworksSubTab onOpenChat={onOpenChat} onDraftToStudio={onDraftToStudio} />}
        {activeSubTab === "sources" && (
          <SourcesSubTab
            onOpenCapture={onOpenCapture}
            onSwitchToSignal={(signalId) => {
              setActiveSubTab("signals");
              setExpandedId(signalId);
            }}
          />
        )}
      </div>

      <LinkedInDraftPanel open={!!draftData} onClose={() => setDraftData(null)} title={draftData?.title || ""} hook={draftData?.hook} angle={draftData?.angle} context={draftData?.context} />
    </div>
  );
};

export default IntelligenceTab;
