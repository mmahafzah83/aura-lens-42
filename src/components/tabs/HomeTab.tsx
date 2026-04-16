import { useState, useEffect, useCallback } from "react";
import { ArrowUp, ArrowDown, Send, TrendingUp, Sparkles, Globe, Zap, X, FileText, LayoutGrid, Box } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { Database } from "@/integrations/supabase/types";
import { withTimeout, showQueryErrorToast } from "@/lib/safeQuery";
import SectionError from "@/components/ui/section-error";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

export interface AuraScore {
  aura_score: number;
  capture_score: number;
  signal_score: number;
  content_score: number;
  score_status: string;
  score_description: string;
  score_trend: number | null;
}

interface TimelineItem {
  id: string;
  type: "trend" | "signal" | "aura";
  title: string;
  description: string;
  sourceLabel: string;
  timeAgo: string;
  url?: string;
  signalId?: string;
  status?: string;
}

interface TopSignal {
  id: string;
  signal_title: string;
  what_it_means_for_you: string | null;
}

interface HomeTabProps {
  entries?: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
  onNavigateToSignal?: (signalId: string) => void;
  onDraftToStudio?: (prefill: { topic: string; context: string; signalId?: string; signalTitle?: string; contentFormat?: "post" | "carousel" | "framework_summary" }) => void;
}

const PLACEHOLDERS = [
  "What should I write about this week?",
  "Where are the gaps in my authority?",
  "How do I position for a CDO role?",
];

function getRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getTrendDate(publishedAt: string | null): string {
  if (!publishedAt) return "Recent";
  const now = new Date();
  const pub = new Date(publishedAt);
  const diffMs = now.getTime() - pub.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 6) return `${days} days ago`;
  return "1 week ago";
}

const HomeTab = ({ entries = [], onOpenChat, onRefresh, onNavigateToSignal, onDraftToStudio }: HomeTabProps) => {
  const [auraScore, setAuraScore] = useState<AuraScore | null>(null);
  const [userName, setUserName] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [topSignal, setTopSignal] = useState<TopSignal | null>(null);
  const [trendCount, setTrendCount] = useState(0);
  const [auraInput, setAuraInput] = useState("");
  const [placeholder] = useState(() => PLACEHOLDERS[new Date().getDate() % PLACEHOLDERS.length]);
  const [moves, setMoves] = useState<any[]>([]);
  const [movesLoading, setMovesLoading] = useState(true);
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [moveSignalTitles, setMoveSignalTitles] = useState<Record<string, string[]>>({});

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;

    // Update last_visit_at
    await supabase
      .from("diagnostic_profiles")
      .update({ last_visit_at: new Date().toISOString() } as any)
      .eq("user_id", user.id);

    // Fetch profile name
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("firm, level, last_visit_at, first_name")
      .eq("user_id", user.id)
      .single();

    const profileFirstName = (profile as any)?.first_name;
    if (profileFirstName) {
      setUserName(profileFirstName);
    } else {
      const email = user.email || "";
      const fallback = email.split("@")[0].split(".")[0];
      setUserName(fallback.charAt(0).toUpperCase() + fallback.slice(1));
    }

    // Fetch Aura Score — get fresh token to avoid expired JWT
    supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
      const token = freshSession?.access_token || session.access_token;
      return supabase.functions.invoke("calculate-aura-score", {
        headers: { Authorization: `Bearer ${token}` },
      });
    }).then(({ data }) => {
      if (data && typeof data.aura_score === "number") {
        setAuraScore(data as AuraScore);
      }
    }).catch(console.error);

    // Fetch top signal
    const { data: signals } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, what_it_means_for_you")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(1);

    if (signals && signals.length > 0) {
      setTopSignal(signals[0] as TopSignal);
    }

    // Fetch industry trends (new)
    const { data: trends } = await supabase
      .from("industry_trends" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "new")
      .order("fetched_at", { ascending: false })
      .limit(5);

    const trendItems: TimelineItem[] = ((trends as any[]) || []).map((t: any) => ({
      id: t.id,
      type: "trend" as const,
      title: t.headline,
      description: t.insight,
      sourceLabel: `From the web · ${getTrendDate(t.published_at)}`,
      timeAgo: getTrendDate(t.published_at),
      url: t.url,
      status: t.status,
    }));

    setTrendCount(trendItems.length);

    // Fetch recent signal updates
    const lastVisit = profile?.last_visit_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, explanation, updated_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("updated_at", lastVisit)
      .order("updated_at", { ascending: false })
      .limit(3);

    const signalItems: TimelineItem[] = ((recentSignals as any[]) || []).map((s: any) => ({
      id: `sig-${s.id}`,
      type: "signal" as const,
      title: s.signal_title,
      description: s.explanation?.slice(0, 80) || "",
      sourceLabel: `Your signal · ${getRelativeTime(s.updated_at)}`,
      timeAgo: getRelativeTime(s.updated_at),
      signalId: s.id,
    }));

    // Merge and sort by recency, max 6
    const merged = [...trendItems, ...signalItems]
      .sort((a, b) => {
        // Rough sort by timeAgo — prefer items with "just now" or "Xm ago"
        return 0; // already sorted from DB
      })
      .slice(0, 8);

    setTimeline(merged);

    // Check staleness of industry_trends
    const latestTrend = (trends as any[])?.[0];
    const eighteenHoursAgo = Date.now() - 18 * 60 * 60 * 1000;
    const isStale = !latestTrend || new Date(latestTrend.fetched_at).getTime() < eighteenHoursAgo;

    if (isStale) {
      supabase.functions.invoke("fetch-industry-trends", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(console.error);
    }
    // Fetch recommended moves
    setMovesLoading(true);
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existingMoves } = await supabase
        .from("recommended_moves" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(3);

      if (existingMoves && (existingMoves as any[]).length > 0) {
        setMoves(existingMoves as any[]);
      } else {
        const freshSession2 = (await supabase.auth.getSession()).data.session;
        const { data: genData } = await supabase.functions.invoke("generate-moves", {
          body: { user_id: user.id },
          headers: { Authorization: `Bearer ${freshSession2?.access_token || session.access_token}` },
        });
        if (genData?.moves && genData.moves.length > 0) {
          setMoves(genData.moves);
        } else {
          setMoves([]);
        }
      }
    } catch (e) {
      console.error("Failed to load moves:", e);
      setMoves([]);
    } finally {
      setMovesLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddToSignals = async (item: TimelineItem) => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session || !item.url) return;

    // Call ingest-capture
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ type: "url", source_url: item.url, content: item.title }),
    }).catch(console.error);

    // Update trend status
    await supabase
      .from("industry_trends" as any)
      .update({ status: "added" } as any)
      .eq("id", item.id);

    setTimeline(prev => prev.filter(t => t.id !== item.id));
    toast("Added to your intelligence — signal detection running.");
  };

  const handleDismiss = async (item: TimelineItem) => {
    await supabase
      .from("industry_trends" as any)
      .update({ status: "dismissed" } as any)
      .eq("id", item.id);

    setTimeline(prev => prev.filter(t => t.id !== item.id));
  };

  const handleAuraSend = () => {
    if (!auraInput.trim()) return;
    onOpenChat?.(auraInput.trim());
    setAuraInput("");
  };

  const scoreColor = (score: number) => {
    if (score >= 65) return "#C5A55A";
    if (score >= 40) return "#EF9F27";
    return "#E24B4A";
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const lowestComponent = auraScore
    ? (() => {
        const { capture_score, signal_score, content_score } = auraScore;
        const min = Math.min(capture_score, signal_score, content_score);
        if (capture_score === min) return "capture";
        if (signal_score === min) return "signal";
        return "content";
      })()
    : null;

  return (
    <div className="space-y-5 pb-32 relative">
      {/* 1. Status bar */}
      <div className="flex items-center justify-between">
        <span style={{ color: "#3a3a3a", fontSize: 11, fontWeight: 500, letterSpacing: 1 }}>
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {trendCount > 0 && (
          <span
            style={{
              background: "#C5A55A",
              color: "#0d0d0d",
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              letterSpacing: 0.5,
            }}
          >
            {trendCount} new trend{trendCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* 2. Header */}
      <div>
        <span style={{ color: "#3a3a3a", fontSize: 11, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" as const }}>
          {greeting}, {userName}
        </span>
      </div>

      {/* 3. Score Card */}
      {auraScore && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            background: "#141414",
            border: "1px solid #252525",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Top progress bar */}
          <div style={{ height: 2, background: "#1a1a1a", width: "100%" }}>
            <div
              style={{
                height: 2,
                width: `${auraScore.aura_score}%`,
                background: scoreColor(auraScore.aura_score),
                transition: "width 0.6s ease",
              }}
            />
          </div>

          <div style={{ padding: "16px 16px 14px" }}>
            {/* Score + status + trend */}
            <div className="flex items-start justify-between">
              <div className="flex items-baseline gap-2">
                <span style={{ fontSize: 42, fontWeight: 700, color: scoreColor(auraScore.aura_score), lineHeight: 1 }}>
                  {auraScore.aura_score}
                </span>
                <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>
                  {auraScore.score_status}
                </span>
              </div>
              {auraScore.score_trend !== null && (
                <div className="flex items-center gap-1" style={{ marginTop: 6 }}>
                  {auraScore.score_trend >= 0 ? (
                    <ArrowUp style={{ width: 12, height: 12, color: "#7ab648" }} />
                  ) : (
                    <ArrowDown style={{ width: 12, height: 12, color: "#E24B4A" }} />
                  )}
                  <span style={{ fontSize: 11, color: auraScore.score_trend >= 0 ? "#7ab648" : "#E24B4A", fontWeight: 500 }}>
                    {auraScore.score_trend >= 0 ? "+" : ""}{auraScore.score_trend} last week
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            <p style={{ fontSize: 12, color: "#666", marginTop: 8, lineHeight: 1.4 }}>
              {auraScore.score_description}
            </p>

            {/* Score bar */}
            <div style={{ height: 3, background: "#1f1f1f", borderRadius: 2, marginTop: 12 }}>
              <div
                style={{
                  height: 3,
                  width: `${auraScore.aura_score}%`,
                  background: scoreColor(auraScore.aura_score),
                  borderRadius: 2,
                  transition: "width 0.6s ease",
                }}
              />
            </div>

            {/* Sub-component pills */}
            <div className="flex gap-2 mt-3">
              {[
                { label: "Capture", value: auraScore.capture_score, key: "capture" },
                { label: "Signals", value: auraScore.signal_score, key: "signal" },
                { label: "Content", value: auraScore.content_score, key: "content" },
              ].map((comp) => (
                <div
                  key={comp.key}
                  style={{
                    flex: 1,
                    background: "#1a1a1a",
                    borderRadius: 8,
                    padding: "8px 10px",
                    textAlign: "center" as const,
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: lowestComponent === comp.key ? "#E24B4A" : "#f0f0f0",
                      lineHeight: 1.2,
                    }}
                  >
                    {comp.value}
                  </div>
                  <div style={{ fontSize: 9, color: "#555", fontWeight: 500, letterSpacing: 0.5, marginTop: 2, textTransform: "uppercase" as const }}>
                    {comp.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* 4. Today's Focus — Recommended Moves */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <span style={{ color: "#3a3a3a", fontSize: 10, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" as const }}>
          Today's Focus
        </span>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {movesLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: 16, height: 100 }}>
                <div style={{ width: "60%", height: 12, background: "#1f1f1f", borderRadius: 4 }} />
                <div style={{ width: "90%", height: 10, background: "#1a1a1a", borderRadius: 4, marginTop: 10 }} />
                <div style={{ width: "40%", height: 10, background: "#1a1a1a", borderRadius: 4, marginTop: 6 }} />
              </div>
            ))
          ) : moves.length > 0 ? (
            moves.slice(0, 3).map((move: any) => {
              const badgeColor = move.output_type === "carousel" ? "#4A90D9" : move.output_type === "framework" ? "#5AA469" : "#C5A55A";
              const BadgeIcon = move.output_type === "carousel" ? LayoutGrid : move.output_type === "framework" ? Box : FileText;
              const isExpanded = expandedMoveId === move.id;
              return (
                <div key={move.id} style={{ background: "#141414", border: "1px solid #252525", borderRadius: 10, padding: "14px 16px" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0", lineHeight: 1.3, flex: 1 }}>
                      {move.title}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: badgeColor, background: `${badgeColor}15`,
                      border: `1px solid ${badgeColor}30`, padding: "2px 8px", borderRadius: 12,
                      whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 3,
                      textTransform: "uppercase" as const, letterSpacing: 0.5, flexShrink: 0,
                    }}>
                      <BadgeIcon style={{ width: 9, height: 9 }} />
                      {move.output_type}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11, color: "#666", marginTop: 6, lineHeight: 1.4,
                      ...(isExpanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }),
                    }}
                    title={move.rationale}
                  >
                    {move.rationale}
                  </div>
                  {/* Expanded: show source signal titles */}
                  {isExpanded && moveSignalTitles[move.id] && moveSignalTitles[move.id].length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {moveSignalTitles[move.id].map((st: string, idx: number) => (
                        <span key={idx} style={{
                          fontSize: 9, color: "#888", background: "#1a1a1a", border: "1px solid #252525",
                          padding: "2px 8px", borderRadius: 8,
                        }}>
                          {st}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const fmt = move.output_type === "carousel" ? "carousel" : move.output_type === "framework" ? "framework_summary" : "post";
                        onDraftToStudio?.({
                          topic: move.title,
                          context: move.rationale,
                          signalId: Array.isArray(move.source_signal_ids) && move.source_signal_ids.length > 0 ? move.source_signal_ids[0] : undefined,
                          signalTitle: moveSignalTitles[move.id]?.[0] || undefined,
                          contentFormat: fmt as any,
                        });
                      }}
                      style={{ fontSize: 10, fontWeight: 600, color: "#C5A55A", background: "transparent", border: "none", padding: "4px 0", cursor: "pointer" }}
                    >
                      Draft It
                    </button>
                    <button
                      onClick={async () => {
                        if (isExpanded) {
                          setExpandedMoveId(null);
                          return;
                        }
                        setExpandedMoveId(move.id);
                        // Fetch signal titles if not cached
                        if (!moveSignalTitles[move.id] && Array.isArray(move.source_signal_ids) && move.source_signal_ids.length > 0) {
                          const { data: sigs } = await supabase
                            .from("strategic_signals")
                            .select("signal_title")
                            .in("id", move.source_signal_ids);
                          setMoveSignalTitles(prev => ({ ...prev, [move.id]: (sigs || []).map((s: any) => s.signal_title) }));
                        } else if (!moveSignalTitles[move.id]) {
                          setMoveSignalTitles(prev => ({ ...prev, [move.id]: [] }));
                        }
                      }}
                      style={{ fontSize: 10, fontWeight: 500, color: "#555", background: "transparent", border: "none", padding: "4px 0", cursor: "pointer", marginLeft: 8 }}
                    >
                      {isExpanded ? "Collapse" : "Explore"}
                    </button>
                    <button
                      onClick={async () => {
                        setMoves(prev => prev.filter(m => m.id !== move.id));
                        await supabase
                          .from("recommended_moves" as any)
                          .update({ status: "dismissed" } as any)
                          .eq("id", move.id);
                      }}
                      style={{ fontSize: 10, fontWeight: 400, color: "#333", background: "transparent", border: "none", padding: "4px 0", cursor: "pointer", marginLeft: 8 }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "20px 16px", textAlign: "center" as const }}>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>
                Capture more content to unlock strategic recommendations.
              </div>
              <button
                onClick={() => onOpenChat?.("I want to capture my first insight")}
                style={{ marginTop: 12, background: "#C5A55A", color: "#0d0d0d", fontSize: 12, fontWeight: 500, padding: "9px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}
              >
                Capture now
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* 5. Live Intelligence Timeline */}
      <div>
        <span style={{ color: "#3a3a3a", fontSize: 10, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase" as const }}>
          Live intelligence
        </span>

        <div style={{ marginTop: 12 }}>
          <AnimatePresence>
            {timeline.length > 0 ? (
              timeline.map((item, i) => {
                const dotColor =
                  item.type === "trend" ? "#C5A55A" :
                  item.type === "signal" ? "#7ab648" :
                  "#534AB7";

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.05 }}
                    className="flex gap-3"
                    style={{ marginBottom: 2 }}
                  >
                    {/* Dot + line */}
                    <div className="flex flex-col items-center" style={{ width: 16, flexShrink: 0 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", background: dotColor,
                        marginTop: 6, flexShrink: 0,
                      }} />
                      {i < timeline.length - 1 && (
                        <div style={{ width: 1, flex: 1, background: "#1f1f1f", minHeight: 32 }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: 16 }}>
                      <div style={{ fontSize: 9, color: "#444", fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                        {item.sourceLabel}
                      </div>
                      <div style={{ fontSize: 12, color: "#c0c0c0", fontWeight: 500, marginTop: 3, lineHeight: 1.3 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {item.description}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-2">
                        {item.type === "trend" && (
                          <>
                            <button
                              onClick={() => handleAddToSignals(item)}
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#C5A55A",
                                border: "1px solid #C5A55A",
                                background: "transparent",
                                padding: "4px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              Add to signals
                            </button>
                            <button
                              onClick={() => handleDismiss(item)}
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#444",
                                border: "1px solid #252525",
                                background: "transparent",
                                padding: "4px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {item.type === "signal" && (
                          <>
                            <button
                              onClick={() => onOpenChat?.(`Draft a LinkedIn post about: ${item.title}`)}
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#C5A55A",
                                border: "1px solid #C5A55A",
                                background: "transparent",
                                padding: "4px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              Draft content
                            </button>
                            <button
                              onClick={() => item.signalId && onNavigateToSignal?.(item.signalId)}
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#444",
                                border: "1px solid #252525",
                                background: "transparent",
                                padding: "4px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              View signal
                            </button>
                          </>
                        )}
                        {item.type === "aura" && (
                          <button
                            onClick={() => onOpenChat?.(item.title)}
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              color: "#C5A55A",
                              border: "1px solid #C5A55A",
                              background: "transparent",
                              padding: "4px 10px",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            Ask now
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ fontSize: 12, color: "#444", padding: "20px 0", textAlign: "center" as const }}
              >
                You're up to date. Check back tomorrow for new trends.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 6. Ask Aura Input — pinned above bottom nav */}
      <div
        style={{
          position: "fixed",
          bottom: 56,
          left: 0,
          right: 0,
          padding: "8px 16px",
          background: "#0d0d0d",
          borderTop: "1px solid #1f1f1f",
          zIndex: 35,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#141414",
            borderRadius: 24,
            padding: "6px 6px 6px 16px",
          }}
        >
          <input
            type="text"
            value={auraInput}
            onChange={(e) => setAuraInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuraSend()}
            placeholder={placeholder}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f0f0f0",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleAuraSend}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: auraInput.trim() ? "#C5A55A" : "#252525",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: auraInput.trim() ? "pointer" : "default",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <Send style={{ width: 14, height: 14, color: auraInput.trim() ? "#0d0d0d" : "#555" }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeTab;
