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
import ContentStudio from "@/components/ContentStudio";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import SignalExplorer from "@/components/SignalExplorer";
import SignalGraph from "@/components/SignalGraph";

import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import { InsightActions, FrameworkActions } from "@/components/ui/action-buttons";
import { formatSmartDate } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenCapture?: () => void;
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
  created_at: string;
}

/* ── Helpers ── */

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  market_trend: "Market Shift",
  competitor_move: "Competitive Move",
  content_gap: "Content Opportunity",
  capability_gap: "Skill Gap",
  career_opportunity: "Career Signal",
  skill_gap: "Skill Gap",
};

function formatTag(tag: string): string {
  if (SIGNAL_TYPE_LABELS[tag]) return SIGNAL_TYPE_LABELS[tag];
  const s = tag.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

const TYPE_STYLES: Record<string, { bg: string; fg: string; icon: string }> = {
  market_trend:        { bg: "#1a1e15", fg: "#7ab648", icon: "↗" },
  career_opportunity:  { bg: "#1a1e15", fg: "#7ab648", icon: "↗" },
  skill_gap:           { bg: "#1e1a10", fg: "#C5A55A", icon: "◆" },
  content_gap:         { bg: "#1e1a10", fg: "#C5A55A", icon: "◆" },
  competitor_move:     { bg: "#151525", fg: "#7a7acc", icon: "⬡" },
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] || TYPE_STYLES.market_trend;
}

function getConfidenceBarColor(confidence: number): { bar: string; text: string } {
  if (confidence >= 0.80) return { bar: "#C5A55A", text: "#C5A55A" };
  if (confidence >= 0.60) return { bar: "rgba(212, 162, 78, 0.7)", text: "rgba(212, 162, 78, 0.9)" };
  return { bar: "rgba(136, 136, 136, 0.5)", text: "#888888" };
}

function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.70) return { bg: "#1a1e15", fg: "#7ab648", label: `${Math.round(confidence * 100)}%` };
  if (confidence >= 0.50) return { bg: "#1e1a10", fg: "#EF9F27", label: `${Math.round(confidence * 100)}%` };
  return { bg: "#1a1a1a", fg: "#888888", label: "Building confidence" };
}

function isNew(updatedAt: string): boolean {
  return (Date.now() - new Date(updatedAt).getTime()) < 48 * 60 * 60 * 1000;
}

type SortOption = "confidence" | "recent" | "sources";
type SubTab = "signals" | "insights" | "frameworks" | "sources";

/* ═══════════════════════════════════════════
   Source row in expanded card
   ═══════════════════════════════════════════ */

interface SourceEntry {
  id: string;
  title: string | null;
  content: string;
  source_url: string | null;
  created_at: string;
}

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
          <span>·</span>
          <span style={{ color: "#3a3a3a" }}>{isRecent ? "full weight" : "reduced weight"}</span>
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
   Evidence fragment row
   ═══════════════════════════════════════════ */

interface EvidenceFragmentRow {
  id: string;
  title: string;
  content: string;
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
  const [loading, setLoading] = useState(true);
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  useEffect(() => {
    (async () => {
      if (signal.supporting_evidence_ids?.length) {
        const r = await supabase
          .from("entries")
          .select("id, title, content, source_url, created_at")
          .in("id", signal.supporting_evidence_ids)
          .order("created_at", { ascending: false })
          .limit(20);
        setSources((r.data || []) as unknown as SourceEntry[]);

        const ef = await supabase
          .from("evidence_fragments")
          .select("id, title, content, created_at, source_registry_id")
          .in("id", signal.supporting_evidence_ids)
          .order("created_at", { ascending: false })
          .limit(20);
        setEvidenceFragments((ef.data || []) as unknown as EvidenceFragmentRow[]);
      }

      setLoading(false);
    })();
  }, [signal.supporting_evidence_ids]);

  const handleRemove = async (entryId: string) => {
    const newIds = signal.supporting_evidence_ids.filter(id => id !== entryId);
    const newCount = Math.max(signal.fragment_count - 1, 0);
    const oldConf = signal.confidence;
    const sourceWeight = Math.min(newCount / 5, 1.4);
    const diversityBonus = signal.unique_orgs >= 3 ? 1.15 : signal.unique_orgs === 2 ? 1.05 : 1.0;
    const estNewConf = Math.min(0.7 * sourceWeight * diversityBonus, 1.0);
    const drop = oldConf - estNewConf;

    if (drop > 0.20) {
      toast.warning("Removing this source would significantly reduce signal confidence. Proceed with caution.");
    }

    const { error } = await supabase
      .from("strategic_signals")
      .update({ supporting_evidence_ids: newIds, fragment_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", signal.id);

    if (error) { toast.error("Failed to remove source"); return; }
    setSources(prev => prev.filter(s => s.id !== entryId));
    toast("Source removed from this signal");
  };

  const isLoved = signal.user_signal_feedback === "love";
  const visibleEvidence = showAllEvidence ? evidenceFragments : evidenceFragments.slice(0, 5);
  const hiddenCount = evidenceFragments.length - 5;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ padding: "0 16px 16px", paddingBottom: 84, borderTop: "1px solid #1f1f1f" }}>
        {signal.confidence_explanation && (
          <p style={{ color: "#3a3a3a", fontSize: 12, margin: "14px 0 0", lineHeight: 1.5 }}>
            {signal.confidence_explanation.replace(/(\d+)\s+sources/g, (_, n) => `${n} ${Number(n) === 1 ? 'source' : 'sources'}`).replace(/(\d+)\s+organisations/g, (_, n) => `${n} ${Number(n) === 1 ? 'organisation' : 'organisations'}`)}
          </p>
        )}

        {signal.what_it_means_for_you && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 6 }}>what this means for you</p>
            <p style={{ color: "#888888", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{highlightKeyPhrases(signal.what_it_means_for_you)}</p>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>built from these sources</p>
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
            <p style={{ color: "#3a3a3a", fontSize: 12 }}>No sources linked yet — add captures to build this signal.</p>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => onDraft(signal)}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10,
              background: "#C5A55A", color: "#0d0d0d", fontWeight: 500,
              fontSize: 14, border: "none", cursor: "pointer",
              opacity: signal.confidence >= 0.60 ? 1 : 0.35,
              pointerEvents: signal.confidence >= 0.60 ? "auto" : "none",
            }}
          >
            Draft content
          </button>
          <button
            onClick={() => onOpenChat?.(`Analyse this signal for me:\n\nSignal: ${signal.signal_title}\nSummary: ${signal.explanation}\n${signal.what_it_means_for_you ? `Relevance: ${signal.what_it_means_for_you}` : ""}`)}
            style={{ padding: "10px 16px", borderRadius: 10, background: "transparent", color: "#888888", fontSize: 13, border: "1px solid #2a2a2a", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Ask Aura
          </button>

          <TooltipProvider delayDuration={300}>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onLove(signal)}
                    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
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
                  <button
                    onClick={() => { if (signal.user_signal_feedback !== "not_relevant") onNotForMe(signal); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: signal.user_signal_feedback === "not_relevant" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
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
                  <button
                    onClick={() => onArchive(signal.id)}
                    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
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
   INSIGHTS SUB-TAB
   ═══════════════════════════════════════════ */

const InsightsSubTab = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; context?: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await supabase.from("learned_intelligence").select("id, title, content, intelligence_type, skill_pillars, tags, created_at").order("created_at", { ascending: false }).limit(30);
      setInsights(r.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(59,130,246,0.15)" }}>
          <Lightbulb className="w-4 h-4" style={{ color: "#60a5fa" }} />
        </div>
        <h2 style={{ color: "#888", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Insights</h2>
        <span style={{ color: "#666", fontSize: 12, marginLeft: "auto" }}>{insights.length} extracted</span>
      </div>

      {insights.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Lightbulb className="w-7 h-7 mx-auto mb-3" style={{ color: "rgba(197,165,90,0.3)" }} />
          <p style={{ color: "#666", fontSize: 13 }}>No insights extracted yet. Run pattern detection to generate insights.</p>
        </div>
      )}

      {insights.map((insight) => (
        <div key={insight.id} style={{ background: "#141414", borderRadius: 14, padding: "16px 20px", border: "1px solid #252525" }}>
          <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.35 }}>{insight.title}</p>
          <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: expandedId === insight.id ? 999 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{insight.content}</p>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(59,130,246,0.1)", color: "#60a5fa", textTransform: "capitalize" }}>{insight.intelligence_type}</span>
            {insight.skill_pillars.slice(0, 2).map(p => (
              <span key={p} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, background: "#1a1a1a", color: "#555", border: "1px solid #252525" }}>{p}</span>
            ))}
            <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>{formatSmartDate(insight.created_at)}</span>
          </div>

          <InsightActions
            onExpand={() => { setExpandedId(expandedId === insight.id ? null : insight.id); onOpenChat?.(`Expand insight: ${insight.title}\n\n${insight.content}`); }}
            onBuildFramework={() => setBuilderData({ title: insight.title, steps: [], summary: insight.content })}
            onDraftContent={() => setDraftData({ title: insight.title, context: insight.content })}
          />
        </div>
      ))}

      {builderData && (
        <FrameworkBuilder
          initialTitle={builderData.title}
          initialSteps={builderData.steps}
          initialDescription={builderData.summary || ""}
          open={!!builderData}
          onClose={() => setBuilderData(null)}
          onFrameworkCreated={() => setBuilderData(null)}
        />
      )}
      {draftData && (
        <ContentStudio title={draftData.title} hook={draftData.hook} context={draftData.context} open={!!draftData} onClose={() => setDraftData(null)} />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   FRAMEWORKS SUB-TAB
   ═══════════════════════════════════════════ */

const FrameworksSubTab = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderData, setBuilderData] = useState<{ title: string; steps: string[]; summary?: string } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; context?: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps, created_at").order("created_at", { ascending: false }).limit(20);
      setFrameworks((r.data || []) as any);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} /></div>;

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(34,197,94,0.15)" }}>
          <Layers className="w-4 h-4" style={{ color: "#4ade80" }} />
        </div>
        <h2 style={{ color: "#888", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Frameworks</h2>
        <span style={{ color: "#666", fontSize: 12, marginLeft: "auto" }}>{frameworks.length} created</span>
      </div>

      {frameworks.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Layers className="w-7 h-7 mx-auto mb-3" style={{ color: "rgba(197,165,90,0.3)" }} />
          <p style={{ color: "#666", fontSize: 13 }}>No frameworks created yet. Build one from an insight.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {frameworks.map(fw => {
          const steps = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
          return (
            <div key={fw.id} style={{ background: "#141414", borderRadius: 14, padding: "16px 20px", border: "1px solid #252525" }}>
              <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.35 }}>{fw.title}</p>
              {fw.summary && <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{fw.summary}</p>}

              {steps.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ color: "#888", fontSize: 11, fontWeight: 500, marginBottom: 6 }}>Core Pillars</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {steps.slice(0, 4).map((step: any, i: number) => (
                      <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(34,197,94,0.08)", color: "rgba(74,222,128,0.8)", border: "1px solid rgba(34,197,94,0.1)" }}>
                        {typeof step === "string" ? step : step.title || step.name || `Step ${i + 1}`}
                      </span>
                    ))}
                    {steps.length > 4 && <span style={{ fontSize: 11, padding: "3px 8px", color: "#666" }}>+{steps.length - 4} more</span>}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {fw.tags.slice(0, 2).map(tag => (
                  <span key={tag} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, background: "#1a1a1a", color: "#555", border: "1px solid #252525" }}>{tag}</span>
                ))}
                <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>{formatSmartDate(fw.created_at)}</span>
              </div>

              <FrameworkActions
                onOpenFramework={() => setBuilderData({ title: fw.title, steps: steps.map((s: any) => typeof s === "string" ? s : s.title || s.name || ""), summary: fw.summary || "" })}
                onRefineFramework={() => onOpenChat?.(`Refine and improve framework: ${fw.title}`)}
                onDraftContent={() => setDraftData({ title: fw.title, context: fw.summary || "" })}
              />
            </div>
          );
        })}
      </div>

      {builderData && (
        <FrameworkBuilder
          initialTitle={builderData.title}
          initialSteps={builderData.steps}
          initialDescription={builderData.summary || ""}
          open={!!builderData}
          onClose={() => setBuilderData(null)}
          onFrameworkCreated={() => setBuilderData(null)}
        />
      )}
      {draftData && (
        <ContentStudio title={draftData.title} hook={draftData.hook} context={draftData.context} open={!!draftData} onClose={() => setDraftData(null)} />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   Main Intelligence Tab
   ═══════════════════════════════════════════ */

const IntelligenceTab = ({ entries, onOpenChat, onRefresh, onOpenCapture }: IntelligenceTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string; signalId?: string } | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("confidence");
  const [groupByTheme, setGroupByTheme] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("signals");
  
  const [detecting, setDetecting] = useState(false);
  const [_graphOpen, _setGraphOpen] = useState(false);

  const handleGenerateContent = (signal: Signal) => {
    setDraftData({
      title: signal.signal_title,
      hook: signal.what_it_means_for_you || undefined,
      context: signal.explanation + "\n\n" + signal.strategic_implications,
      signalId: signal.id,
    });
  };

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

  const [profileAnchors, setProfileAnchors] = useState<{
    sectorFocus: string | null;
    corePractice: string | null;
    northStarGoal: string | null;
    brandPillars: string[];
  }>({ sectorFocus: null, corePractice: null, northStarGoal: null, brandPillars: [] });

  const loadSignals = useCallback(async () => {
    setLoading(true);
    const [signalsRes, entriesRes, profileRes] = await Promise.all([
      supabase.from("strategic_signals").select("*").eq("status", "active").order("priority_score", { ascending: false }).limit(20),
      supabase.from("entries").select("id", { count: "exact", head: true }),
      supabase.from("diagnostic_profiles").select("sector_focus, core_practice, north_star_goal, brand_pillars").limit(1).maybeSingle(),
    ]);
    setSignals((signalsRes.data || []) as unknown as Signal[]);
    setEntryCount(entriesRes.count || 0);
    if (profileRes.data) {
      setProfileAnchors({
        sectorFocus: profileRes.data.sector_focus,
        corePractice: profileRes.data.core_practice,
        northStarGoal: profileRes.data.north_star_goal,
        brandPillars: (profileRes.data.brand_pillars as string[]) || [],
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  const handleArchive = async (id: string) => {
    await supabase.from("strategic_signals").update({ status: "archived" }).eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    toast("Signal archived. It will return if you capture more on this topic.");
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

  /* ── Derived data ── */
  const clusters = useMemo(() => {
    const tagCount: Record<string, number> = {};
    signals.forEach(s => (s.theme_tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    return Object.entries(tagCount).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  }, [signals]);

  const filtered = useMemo(() => {
    if (!activeTag) return signals;
    return signals.filter(s => (s.theme_tags || []).includes(activeTag));
  }, [signals, activeTag]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case "confidence": arr.sort((a, b) => b.confidence - a.confidence); break;
      case "recent": arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); break;
      case "sources": arr.sort((a, b) => b.fragment_count - a.fragment_count); break;
    }
    return arr;
  }, [filtered, sortBy]);

  /* ── Smart grouping helpers ── */
  const buildKeywords = (text: string | null | undefined): string[] => {
    if (!text) return [];
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
  };

  const industryKeywords = useMemo(() => buildKeywords(profileAnchors.sectorFocus), [profileAnchors.sectorFocus]);
  const edgeKeywords = useMemo(() => {
    const words = [
      ...buildKeywords(profileAnchors.corePractice),
      ...profileAnchors.brandPillars.flatMap(p => buildKeywords(p)),
    ];
    return [...new Set(words)];
  }, [profileAnchors.corePractice, profileAnchors.brandPillars]);
  const _trajectoryKeywords: string[] = [];

  const classifySignal = useCallback((signal: Signal): string => {
    const haystack = [
      ...(signal.theme_tags || []),
      signal.signal_title,
      signal.explanation,
    ].join(" ").toLowerCase();

    const matches = (keywords: string[]) => keywords.length > 0 && keywords.some(kw => haystack.includes(kw));

    if (matches(industryKeywords)) return "industry";
    if (matches(edgeKeywords)) return "edge";
    return "horizon";
  }, [industryKeywords, edgeKeywords]);

  const GROUP_ORDER = ["industry", "edge", "horizon"] as const;

  const groupLabels: Record<string, string> = {
    industry: "My industry",
    edge: "My expertise",
    horizon: "Wider landscape",
  };

  const groupedSignals = useMemo(() => {
    if (!groupByTheme) return null;
    const buckets: Record<string, Signal[]> = { industry: [], edge: [], horizon: [] };
    sorted.forEach(s => {
      const group = classifySignal(s);
      buckets[group].push(s);
    });
    return GROUP_ORDER.filter(k => buckets[k].length > 0).map(k => [groupLabels[k], buckets[k]] as [string, Signal[]]);
  }, [sorted, groupByTheme, classifySignal]);

  const toggleGroupCollapse = (theme: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme); else next.add(theme);
      return next;
    });
  };

  const visible = sorted.slice(0, 8);
  const totalOrgs = signals.reduce((sum, s) => sum + (s.unique_orgs || 0), 0);
  const maxConfidence = signals.length > 0 ? Math.max(...signals.map(s => s.confidence)) : 0;
  const topConfPct = Math.round(maxConfidence * 100);

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", padding: "16px" }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ background: "#141414", borderRadius: 12, padding: 20, marginBottom: 12, border: "1px solid #252525" }}>
            <div style={{ height: 14, width: "60%", background: "#1f1f1f", borderRadius: 6, marginBottom: 10 }} className="animate-pulse" />
            <div style={{ height: 10, width: "100%", background: "#1a1a1a", borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
            <div style={{ height: 10, width: "70%", background: "#1a1a1a", borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  /* ── Render a single signal card ── */
  const renderSignalCard = (signal: Signal, i: number) => {
    const isExpanded = expandedId === signal.id;
    const isTop = i === 0 && !activeTag && !groupByTheme;
    const typeStyle = getTypeStyle(signal.theme_tags?.find(t => t in TYPE_STYLES) || "market_trend");
    const confStyle = getConfidenceStyle(signal.confidence);
    const confBarColor = getConfidenceBarColor(signal.confidence);
    const confidencePct = Math.round(signal.confidence * 100);
    const sourcesLabel = `${plural(signal.fragment_count, "source")} · ${plural(signal.unique_orgs, "organisation")}`;
    const needsMore = signal.confidence < 0.60;
    const moreSources = Math.ceil((0.60 - signal.confidence) / 0.184);
    const signalIsNew = isNew(signal.updated_at);

    return (
      <motion.div
        key={signal.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: i * 0.03 }}
        style={{
          background: "#141414", borderRadius: 14,
          border: isTop ? "1.5px solid #C5A55A" : "1px solid #252525",
          marginBottom: 12, overflow: "hidden", position: "relative",
        }}
      >
        {signalIsNew && (
          <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2, background: "rgba(197, 165, 90, 0.2)", color: "#C5A55A", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "2px 8px", letterSpacing: "0.05em" }}>NEW</div>
        )}

        <div style={{ height: 3, background: "#1f1f1f" }}>
          <div style={{ height: "100%", background: confBarColor.bar, width: `${confidencePct}%`, transition: "width 0.5s, background 0.3s" }} />
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: typeStyle.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: typeStyle.fg, flexShrink: 0 }}>{typeStyle.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 6px", lineHeight: 1.35, paddingRight: signalIsNew ? 50 : 0 }}>{signal.signal_title}</p>
              <p style={{ color: "#666666", fontSize: 13, lineHeight: 1.5, margin: "0 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{signal.explanation}</p>

              {!isExpanded && signal.what_it_means_for_you && (
                <p style={{ color: "#555555", fontSize: 12, fontStyle: "italic", lineHeight: 1.4, margin: "0 0 10px" }}>
                  {signal.what_it_means_for_you.length > 120 ? signal.what_it_means_for_you.slice(0, 120) + "…" : signal.what_it_means_for_you}
                </p>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ background: confStyle.bg, color: confBarColor.text, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12 }}>{confStyle.label}</span>
                <span style={{ color: "#666666", fontSize: 11 }}>{sourcesLabel}</span>
                {signal.confidence >= 0.60 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerateContent(signal); }}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#C5A55A", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >Draft</button>
                )}
              </div>

              {signal.theme_tags && signal.theme_tags.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                  {signal.theme_tags.slice(0, isExpanded ? signal.theme_tags.length : 3).map(tag => (
                    <span key={tag} style={{ fontSize: 10, color: "#555555", background: "#1a1a1a", padding: "2px 8px", borderRadius: 10 }}>{formatTag(tag)}</span>
                  ))}
                  {!isExpanded && signal.theme_tags.length > 3 && (
                    <span style={{ fontSize: 10, color: "#3a3a3a", background: "#1a1a1a", padding: "2px 8px", borderRadius: 10 }}>+{signal.theme_tags.length - 3} more</span>
                  )}
                </div>
              )}

              {needsMore && (
                <p style={{ color: "#C5A55A", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
                  Add {moreSources > 0 ? moreSources : 1} more {moreSources === 1 ? "source" : "sources"} on this topic to unlock drafting.{" "}
                  <button onClick={(e) => { e.stopPropagation(); onOpenCapture?.(); }} style={{ color: "#C5A55A", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>Capture now →</button>
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => setExpandedId(isExpanded ? null : signal.id)}
            style={{ display: "block", width: "100%", textAlign: "center", color: "#3a3a3a", fontSize: 11, background: "none", border: "none", cursor: "pointer", marginTop: 12, padding: "4px 0" }}
          >
            {isExpanded ? "▴ collapse signal" : "▾ expand signal"}
          </button>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <ExpandedDetail
              signal={signal}
              onOpenChat={onOpenChat}
              onArchive={handleArchive}
              onDraft={(s) => handleGenerateContent(s)}
              onLove={handleLove}
              onNotForMe={handleNotForMe}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  /* ── Sub-tab definitions ── */

  const SUB_TABS: { value: SubTab; label: string }[] = [
    { value: "signals", label: "Signals" },
    { value: "insights", label: "Insights" },
    { value: "frameworks", label: "Frameworks" },
    { value: "sources", label: "Sources" },
  ];

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px" }}>

        {/* ── Pipeline bar ── */}
        <div style={{
          background: "#141414", borderRadius: 50, padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 0, marginBottom: 16, border: "1px solid #1f1f1f",
        }}>
          {[
            { label: "Sources", count: entryCount, gold: false },
            { label: "Signals", count: signals.length, gold: true },
            { label: "Moves", count: 0, gold: false },
            { label: "Published", count: 0, gold: false },
          ].map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <span style={{ color: "#2a2a2a", margin: "0 8px", fontSize: 12 }}>›</span>}
              <span style={{ color: step.gold ? "#C5A55A" : "#3a3a3a", fontSize: 12, fontWeight: 500 }}>{step.label}</span>
              <span style={{ color: step.gold ? "#C5A55A" : "#3a3a3a", fontSize: 12, fontWeight: 600, marginLeft: 4 }}>{step.count}</span>
            </div>
          ))}
        </div>

        {/* ── Header + Detect Patterns ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>INTELLIGENCE</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="outline" size="sm" onClick={runPatternDetection} disabled={detecting} className="gap-2 text-xs" style={{ height: 30 }}>
              {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Detect Patterns</span>
            </Button>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              style={{ background: "#1a1a1a", color: "#ccc", fontSize: 11, fontWeight: 500, border: "1px solid #2a2a2a", borderRadius: 8, padding: "5px 10px", cursor: "pointer", outline: "none" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#C5A55A"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              <option value="confidence">Highest confidence</option>
              <option value="recent">Most recent</option>
              <option value="sources">Most sources</option>
            </select>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { value: `${topConfPct}%`, label: "top signal", gold: true },
            { value: `${signals.length}`, label: "active", gold: false },
            { value: `${totalOrgs}`, label: totalOrgs === 1 ? "organisation tracked" : "organisations tracked", gold: false },
          ].map(card => (
            <div key={card.label} style={{ background: "#141414", borderRadius: 12, padding: "14px 12px", border: "1px solid #252525", textAlign: "center" }}>
              <p style={{ color: card.gold ? "#C5A55A" : "#f0f0f0", fontSize: 22, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>{card.value}</p>
              <p style={{ color: "#666666", fontSize: 11, margin: "4px 0 0", lineHeight: 1.3 }}>{card.label}</p>
            </div>
          ))}
        </div>

        {/* ── Recommended Move (from Strategy page) ── */}
        <div style={{ marginBottom: 16 }}>
          <StrategicAdvisorPanel context="strategy" compact onOpenChat={onOpenChat} />
        </div>

        {/* ── Sub-tab navigation ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #252525", marginBottom: 16, overflowX: "auto" }} className="scrollbar-hide">
          {SUB_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveSubTab(tab.value)}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 500,
                color: activeSubTab === tab.value ? "#C5A55A" : "#888",
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

        {/* ── Sub-tab content ── */}
        {activeSubTab === "signals" && (
          <>
            {/* Filter chips + group toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ overflowX: "auto", display: "flex", gap: 8, flex: 1, paddingBottom: 4 }} className="scrollbar-hide">
                <button
                  onClick={() => setActiveTag(null)}
                  style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                    background: !activeTag ? "#1e1a10" : "#141414",
                    color: !activeTag ? "#C5A55A" : "#555555",
                    border: `1px solid ${!activeTag ? "#C5A55A" : "#252525"}`,
                  }}
                >All signals</button>
                {clusters.map(c => {
                  const isActive = activeTag === c.name;
                  return (
                    <button key={c.name} onClick={() => setActiveTag(isActive ? null : c.name)} style={{
                      flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", whiteSpace: "nowrap",
                      background: isActive ? "#1e1a10" : "#141414",
                      color: isActive ? "#C5A55A" : "#555555",
                      border: `1px solid ${isActive ? "#C5A55A" : "#252525"}`,
                    }}>{formatTag(c.name)} ({c.count})</button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#555555", whiteSpace: "nowrap" }}>Group by theme</span>
                <button
                  onClick={() => { setGroupByTheme(!groupByTheme); setCollapsedGroups(new Set()); }}
                  style={{ width: 34, height: 18, borderRadius: 9, padding: 2, background: groupByTheme ? "#C5A55A" : "#2a2a2a", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#f0f0f0", transform: groupByTheme ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
                </button>
              </div>
            </div>

            {activeTag && <p style={{ color: "#666666", fontSize: 12, marginBottom: 12 }}>Showing {filtered.length} of {signals.length} signals</p>}

            {/* Empty state */}
            {signals.length === 0 && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#f0f0f0", fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No signals yet</p>
                <p style={{ color: "#666666", fontSize: 13, marginBottom: 20 }}>Capture knowledge to start building signals.</p>
              </div>
            )}

            {/* Signal cards — flat or grouped */}
            {groupByTheme && groupedSignals ? (
              groupedSignals.map(([theme, themeSignals]) => {
                const isCollapsed = collapsedGroups.has(theme);
                return (
                  <div key={theme} style={{ marginBottom: 16 }}>
                    <button
                      onClick={() => toggleGroupCollapse(theme)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "8px 0", marginBottom: 4 }}
                    >
                      {isCollapsed ? <ChevronRight size={14} style={{ color: "#C5A55A" }} /> : <ChevronDown size={14} style={{ color: "#C5A55A" }} />}
                      <span style={{ color: "#C5A55A", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{theme}</span>
                      <span style={{ background: "rgba(197, 165, 90, 0.15)", color: "#C5A55A", fontSize: 10, fontWeight: 600, borderRadius: 10, padding: "1px 7px", marginLeft: 2 }}>{themeSignals.length}</span>
                      <div style={{ flex: 1, height: 1, background: "#252525", marginLeft: 8 }} />
                    </button>
                    {!isCollapsed && themeSignals.map((signal, i) => renderSignalCard(signal, i))}
                  </div>
                );
              })
            ) : (
              visible.map((signal, i) => renderSignalCard(signal, i))
            )}
          </>
        )}

        {activeSubTab === "insights" && <InsightsSubTab onOpenChat={onOpenChat} />}
        {activeSubTab === "frameworks" && <FrameworksSubTab onOpenChat={onOpenChat} />}
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

      {/* Draft panel */}
      <LinkedInDraftPanel open={!!draftData} onClose={() => setDraftData(null)} title={draftData?.title || ""} hook={draftData?.hook} angle={draftData?.angle} context={draftData?.context} />

      {/* Content preview modal */}
      <ContentPreviewModal open={!!previewItem} onClose={() => setPreviewItem(null)} contentItem={previewItem} />

      {/* Generating overlay */}
      {generatingContent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#111", borderRadius: 16, padding: "32px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, border: "1px solid #2a2a2a" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#C5A55A" }} />
            <span style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 500 }}>Generating content…</span>
            <span style={{ color: "#888", fontSize: 12 }}>This may take a few seconds</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default IntelligenceTab;
