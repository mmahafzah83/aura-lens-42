import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ThumbsUp, ThumbsDown, Archive } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
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

/* ── Helpers ── */

function formatTag(tag: string): string {
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

function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.70) return { bg: "#1a1e15", fg: "#7ab648", label: `${Math.round(confidence * 100)}%` };
  if (confidence >= 0.50) return { bg: "#1e1a10", fg: "#EF9F27", label: `${Math.round(confidence * 100)}%` };
  return { bg: "#1a1a1a", fg: "#555555", label: "still building" };
}

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
      <div
        style={{
          width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0,
          backgroundColor: isRecent ? "#7ab648" : "#C5A55A",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#f0f0f0", fontSize: 13, lineHeight: 1.4, margin: 0 }}>
          {displayTitle}
        </p>
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
          <button
            onClick={() => window.open(sourceUrl, "_blank", "noopener")}
            style={{ fontSize: 11, color: "#666666", background: "none", border: "1px solid #252525", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
          >
            Open
          </button>
        )}
        <button
          onClick={() => onRemove(entry.id)}
          style={{ fontSize: 11, color: "#666666", background: "none", border: "1px solid #252525", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   Expanded card detail
   ═══════════════════════════════════════════ */

const ExpandedDetail = ({
  signal,
  onOpenChat,
  onArchive,
  onDraft,
  onLove,
  onNotForMe,
}: {
  signal: Signal;
  onOpenChat?: (msg?: string) => void;
  onArchive: (id: string) => void;
  onDraft: (signal: Signal) => void;
  onLove: (signal: Signal) => void;
  onNotForMe: (signal: Signal) => void;
}) => {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!signal.supporting_evidence_ids?.length) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("entries")
        .select("id, title, content, source_url, created_at")
        .in("id", signal.supporting_evidence_ids)
        .order("created_at", { ascending: false })
        .limit(20);
      setSources((data || []) as unknown as SourceEntry[]);
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
      .update({
        supporting_evidence_ids: newIds,
        fragment_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signal.id);

    if (error) { toast.error("Failed to remove source"); return; }
    setSources(prev => prev.filter(s => s.id !== entryId));
    toast("Source removed from this signal");
  };

  const isLoved = signal.user_signal_feedback === "love";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ padding: "0 16px 16px", paddingBottom: 84, borderTop: "1px solid #1f1f1f" }}>
        {/* Confidence explanation */}
        {signal.confidence_explanation && (
          <p style={{ color: "#3a3a3a", fontSize: 12, margin: "14px 0 0", lineHeight: 1.5 }}>
            {signal.confidence_explanation.replace(/(\d+)\s+sources/g, (_, n) => `${n} ${Number(n) === 1 ? 'source' : 'sources'}`).replace(/(\d+)\s+organisations/g, (_, n) => `${n} ${Number(n) === 1 ? 'organisation' : 'organisations'}`)}
          </p>
        )}

        {/* What this means for you */}
        {signal.what_it_means_for_you && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 6 }}>
              what this means for you
            </p>
            <p style={{ color: "#888888", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              {highlightKeyPhrases(signal.what_it_means_for_you)}
            </p>
          </div>
        )}

        {/* Sources */}
        <div style={{ marginTop: 20 }}>
          <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>
            built from these sources
          </p>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#3a3a3a" }} />
            </div>
          ) : sources.length === 0 ? (
            <p style={{ color: "#3a3a3a", fontSize: 12 }}>No sources linked yet — add captures to build this signal.</p>
          ) : (
            <div>
              {sources.map(s => (
                <SourceRow key={s.id} entry={s} signalId={signal.id} onRemove={handleRemove} />
              ))}
            </div>
          )}
        </div>

        {/* ── Action buttons ── */}
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
            style={{
              padding: "10px 16px", borderRadius: 10,
              background: "transparent", color: "#888888",
              fontSize: 13, border: "1px solid #2a2a2a", cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Ask Aura
          </button>

          {/* Icon feedback group */}
          <TooltipProvider delayDuration={300}>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              {/* Thumbs up */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onLove(signal)}
                    style={{
                      width: 32, height: 32, borderRadius: "50%", border: "none",
                      background: "transparent", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <ThumbsUp
                      size={16}
                      fill={isLoved ? "#7ab648" : "none"}
                      color={isLoved ? "#7ab648" : "#666666"}
                      style={{ transition: "color 0.15s" }}
                      onMouseEnter={e => { if (!isLoved) (e.currentTarget as unknown as SVGElement).style.color = "#7ab648"; }}
                      onMouseLeave={e => { if (!isLoved) (e.currentTarget as unknown as SVGElement).style.color = "#666666"; }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>
                  {isLoved ? "Remove love" : "Love this signal"}
                </TooltipContent>
              </Tooltip>

              {/* Thumbs down */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { if (signal.user_signal_feedback !== "not_relevant") onNotForMe(signal); }}
                    style={{
                      width: 32, height: 32, borderRadius: "50%", border: "none",
                      background: "transparent", cursor: signal.user_signal_feedback === "not_relevant" ? "default" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <ThumbsDown
                      size={16}
                      fill={signal.user_signal_feedback === "not_relevant" ? "#E24B4A" : "none"}
                      color={signal.user_signal_feedback === "not_relevant" ? "#E24B4A" : "#666666"}
                      style={{ transition: "color 0.15s" }}
                      onMouseEnter={e => { if (signal.user_signal_feedback !== "not_relevant") (e.currentTarget as unknown as SVGElement).style.color = "#E24B4A"; }}
                      onMouseLeave={e => { if (signal.user_signal_feedback !== "not_relevant") (e.currentTarget as unknown as SVGElement).style.color = "#666666"; }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>
                  Not for me
                </TooltipContent>
              </Tooltip>

              {/* Archive */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onArchive(signal.id)}
                    style={{
                      width: 32, height: 32, borderRadius: "50%", border: "none",
                      background: "transparent", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <Archive
                      size={16}
                      color="#666666"
                      style={{ transition: "color 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as unknown as SVGElement).style.color = "#C5A55A"; }}
                      onMouseLeave={e => { (e.currentTarget as unknown as SVGElement).style.color = "#666666"; }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" style={{ background: "#1a1a1a", color: "#f0f0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none" }}>
                  Done with this
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </motion.div>
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
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string } | null>(null);

  // Auto-expand signal from URL param
  useEffect(() => {
    const signalParam = searchParams.get("signal");
    if (signalParam && signals.length > 0) {
      const found = signals.find(s => s.id === signalParam);
      if (found) {
        setExpandedId(signalParam);
        searchParams.delete("signal");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [signals, searchParams]);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    const [signalsRes, entriesRes] = await Promise.all([
      supabase
        .from("strategic_signals")
        .select("*")
        .eq("status", "active")
        .order("priority_score", { ascending: false })
        .limit(20),
      supabase.from("entries").select("id", { count: "exact", head: true }),
    ]);
    setSignals((signalsRes.data || []) as unknown as Signal[]);
    setEntryCount(entriesRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  /* ── Archive ── */
  const handleArchive = async (id: string) => {
    await supabase.from("strategic_signals").update({ status: "archived" }).eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    toast("Signal archived. It will return if you capture more on this topic.");
  };

  /* ── Love / Unlove ── */
  const handleLove = async (signal: Signal) => {
    const isAlreadyLoved = signal.user_signal_feedback === "love";

    if (isAlreadyLoved) {
      // Unlove
      const newPriority = Math.max(signal.priority_score - 0.10, 0);
      await supabase.from("strategic_signals").update({
        user_signal_feedback: null,
        priority_score: newPriority,
      }).eq("id", signal.id);

      // Decrement tag preferences
      for (const tag of signal.theme_tags || []) {
        const { data: existing } = await supabase
          .from("signal_topic_preferences" as any)
          .select("id, preference_score")
          .eq("theme_tag", tag)
          .maybeSingle();
        if (existing) {
          await supabase.from("signal_topic_preferences" as any)
            .update({ preference_score: Math.max((existing as any).preference_score - 0.15, -1.0), updated_at: new Date().toISOString() })
            .eq("id", (existing as any).id);
        }
      }

      setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: null, priority_score: newPriority } : s));
      toast("Love removed");
    } else {
      // Love
      const newPriority = Math.min(signal.priority_score + 0.10, 1.0);
      await supabase.from("strategic_signals").update({
        user_signal_feedback: "love",
        priority_score: newPriority,
      }).eq("id", signal.id);

      // Upsert tag preferences
      for (const tag of signal.theme_tags || []) {
        const { data: existing } = await supabase
          .from("signal_topic_preferences" as any)
          .select("id, preference_score")
          .eq("theme_tag", tag)
          .maybeSingle();
        if (existing) {
          await supabase.from("signal_topic_preferences" as any)
            .update({ preference_score: Math.min((existing as any).preference_score + 0.15, 1.0), updated_at: new Date().toISOString() })
            .eq("id", (existing as any).id);
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from("signal_topic_preferences" as any)
              .insert({ user_id: session.user.id, theme_tag: tag, preference_score: 0.15 });
          }
        }
      }

      setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: "love", priority_score: newPriority } : s)
        .sort((a, b) => b.priority_score - a.priority_score));
      toast("Signal boosted — Aura will surface more like this");
    }
  };

  /* ── Not for me ── */
  const handleNotForMe = async (signal: Signal) => {
    await supabase.from("strategic_signals").update({
      user_signal_feedback: "not_relevant",
      priority_score: 0.05,
    }).eq("id", signal.id);

    // Decrement tag preferences
    for (const tag of signal.theme_tags || []) {
      const { data: existing } = await supabase
        .from("signal_topic_preferences" as any)
        .select("id, preference_score")
        .eq("theme_tag", tag)
        .maybeSingle();
      if (existing) {
        await supabase.from("signal_topic_preferences" as any)
          .update({ preference_score: Math.max((existing as any).preference_score - 0.20, -1.0), updated_at: new Date().toISOString() })
          .eq("id", (existing as any).id);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from("signal_topic_preferences" as any)
            .insert({ user_id: session.user.id, theme_tag: tag, preference_score: -0.20 });
        }
      }
    }

    setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, user_signal_feedback: "not_relevant", priority_score: 0.05 } : s)
      .sort((a, b) => b.priority_score - a.priority_score));
    toast("Got it — Aura will show fewer signals like this");
  };

  /* ── Derived data ── */
  const clusters = useMemo(() => {
    const tagCount: Record<string, number> = {};
    signals.forEach(s => (s.theme_tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    return Object.entries(tagCount)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [signals]);

  const filtered = useMemo(() => {
    if (!activeTag) return signals;
    return signals.filter(s => (s.theme_tags || []).includes(activeTag));
  }, [signals, activeTag]);

  const visible = filtered.slice(0, 8);
  const topSignal = signals[0];
  const totalOrgs = signals.reduce((sum, s) => sum + (s.unique_orgs || 0), 0);
  const topConfPct = topSignal ? Math.round(topSignal.confidence * 100) : 0;

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

  /* ── Empty state ── */
  if (signals.length === 0) {
    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", padding: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <p style={{ color: "#f0f0f0", fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No signals yet</p>
          <p style={{ color: "#666666", fontSize: 13, marginBottom: 20 }}>Capture knowledge to start building signals.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px" }}>

        {/* ── 1. Pipeline bar ── */}
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
              <span style={{ color: step.gold ? "#C5A55A" : "#3a3a3a", fontSize: 12, fontWeight: 500 }}>
                {step.label}
              </span>
              <span style={{ color: step.gold ? "#C5A55A" : "#3a3a3a", fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                {step.count}
              </span>
            </div>
          ))}
        </div>

        {/* ── 2. Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { value: `${topConfPct}%`, label: "top signal", gold: true },
            { value: `${signals.length}`, label: "active", gold: false },
            { value: `${totalOrgs}`, label: totalOrgs === 1 ? "organisation tracked" : "organisations tracked", gold: false },
          ].map(card => (
            <div
              key={card.label}
              style={{
                background: "#141414", borderRadius: 12, padding: "14px 12px",
                border: "1px solid #252525", textAlign: "center",
              }}
            >
              <p style={{ color: card.gold ? "#C5A55A" : "#f0f0f0", fontSize: 22, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
                {card.value}
              </p>
              <p style={{ color: "#666666", fontSize: 11, margin: "4px 0 0", lineHeight: 1.3 }}>
                {card.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── 3. Cluster filter pills ── */}
        <div style={{ overflowX: "auto", display: "flex", gap: 8, marginBottom: 16, paddingBottom: 4 }} className="scrollbar-hide">
          <button
            onClick={() => setActiveTag(null)}
            style={{
              flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: "pointer", whiteSpace: "nowrap",
              background: !activeTag ? "#1e1a10" : "#141414",
              color: !activeTag ? "#C5A55A" : "#555555",
              border: `1px solid ${!activeTag ? "#C5A55A" : "#252525"}`,
            }}
          >
            All signals
          </button>
          {clusters.map(c => {
            const isActive = activeTag === c.name;
            return (
              <button
                key={c.name}
                onClick={() => setActiveTag(isActive ? null : c.name)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap",
                  background: isActive ? "#1e1a10" : "#141414",
                  color: isActive ? "#C5A55A" : "#555555",
                  border: `1px solid ${isActive ? "#C5A55A" : "#252525"}`,
                }}
              >
                {formatTag(c.name)} ({c.count})
              </button>
            );
          })}
        </div>

        {/* Filter count */}
        {activeTag && (
          <p style={{ color: "#666666", fontSize: 12, marginBottom: 12 }}>
            Showing {filtered.length} of {signals.length} signals
          </p>
        )}

        {/* ── 4. Signal cards ── */}
        {visible.map((signal, i) => {
          const isExpanded = expandedId === signal.id;
          const isTop = i === 0 && !activeTag;
          const typeStyle = getTypeStyle(signal.theme_tags?.find(t => t in TYPE_STYLES) || "market_trend");
          const confStyle = getConfidenceStyle(signal.confidence);
          const sourcesLabel = `${plural(signal.fragment_count, "source")} · ${plural(signal.unique_orgs, "organisation")}`;
          const needsMore = signal.confidence < 0.60;
          const moreSources = Math.ceil((0.60 - signal.confidence) / 0.184);

          return (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              style={{
                background: "#141414",
                borderRadius: 14,
                border: isTop ? "1.5px solid #C5A55A" : "1px solid #252525",
                marginBottom: 12,
                overflow: "hidden",
              }}
            >
              {/* Collapsed card */}
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {/* Type icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: typeStyle.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: typeStyle.fg, flexShrink: 0,
                  }}>
                    {typeStyle.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title */}
                    <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 6px", lineHeight: 1.35 }}>
                      {signal.signal_title}
                    </p>

                    {/* Summary */}
                    <p style={{
                      color: "#666666", fontSize: 13, lineHeight: 1.5, margin: "0 0 10px",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {signal.explanation}
                    </p>

                    {/* Meta row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Confidence pill */}
                      <span style={{
                        background: confStyle.bg, color: confStyle.fg,
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12,
                      }}>
                        {confStyle.label}
                      </span>

                      {/* Source count */}
                      <span style={{ color: "#666666", fontSize: 11 }}>{sourcesLabel}</span>

                      {/* Draft button */}
                      {signal.confidence >= 0.60 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDraftData({ title: signal.signal_title, hook: signal.explanation, angle: "Strategic thought leadership", context: signal.strategic_implications }); }}
                          style={{
                            marginLeft: "auto", background: "none", border: "none",
                            color: "#C5A55A", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          Draft
                        </button>
                      )}
                    </div>

                    {/* Tag pills — max 3 collapsed, all when expanded */}
                    {signal.theme_tags && signal.theme_tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                        {signal.theme_tags.slice(0, isExpanded ? signal.theme_tags.length : 3).map(tag => (
                          <span key={tag} style={{ fontSize: 10, color: "#555555", background: "#1a1a1a", padding: "2px 8px", borderRadius: 10 }}>
                            {formatTag(tag)}
                          </span>
                        ))}
                        {!isExpanded && signal.theme_tags.length > 3 && (
                          <span style={{ fontSize: 10, color: "#3a3a3a", background: "#1a1a1a", padding: "2px 8px", borderRadius: 10 }}>
                            +{signal.theme_tags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Building nudge */}
                    {needsMore && (
                      <p style={{ color: "#C5A55A", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
                        Add {moreSources > 0 ? moreSources : 1} more {moreSources === 1 ? "source" : "sources"} on this topic to unlock drafting.{" "}
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenCapture?.(); }}
                          style={{ color: "#C5A55A", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11 }}
                        >
                          Capture now →
                        </button>
                      </p>
                    )}
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "center",
                    color: "#3a3a3a", fontSize: 11, background: "none",
                    border: "none", cursor: "pointer", marginTop: 12, padding: "4px 0",
                  }}
                >
                  {isExpanded ? "▴ collapse signal" : "▾ expand signal"}
                </button>
              </div>

              {/* ── 5. Expanded detail ── */}
              <AnimatePresence>
                {isExpanded && (
                  <ExpandedDetail
                    signal={signal}
                    onOpenChat={onOpenChat}
                    onArchive={handleArchive}
                    onDraft={(s) => setDraftData({ title: s.signal_title, hook: s.explanation, angle: "Strategic thought leadership", context: s.strategic_implications })}
                    onLove={handleLove}
                    onNotForMe={handleNotForMe}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Draft panel */}
      <LinkedInDraftPanel
        open={!!draftData}
        onClose={() => setDraftData(null)}
        title={draftData?.title || ""}
        hook={draftData?.hook}
        angle={draftData?.angle}
        context={draftData?.context}
      />
    </div>
  );
};

export default IntelligenceTab;
