import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles, Zap, Lightbulb, RefreshCw, Loader2,
  TrendingUp, BookOpen, User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type ContentType = "post" | "carousel" | "essay" | "framework_summary";

interface RawSignal {
  id: string;
  signal_title: string;
  explanation: string;
  content_opportunity: any;
  confidence: number;
  created_at: string;
  status: string;
}

interface RawFramework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  created_at: string;
}

interface CuratedItem {
  id: string;
  title: string;
  context: string;
  sourceType: "signal" | "framework" | "insight";
  confidence?: number;
  reason: string;
  contentType: ContentType;
  signalTitle?: string;
  signalInsight?: string;
  freshness: number; // days ago
}

interface StartFromPanelProps {
  currentFormat: ContentType;
  hasDraft: boolean;
  onSelect: (
    topic: string,
    context: string,
    format: ContentType,
    signalTitle?: string,
    signalInsight?: string
  ) => void;
}

/** Deduplicate by comparing lowercased title keywords (≥3 overlap = duplicate) */
function isDuplicate(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3));
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap >= 3;
}

function daysAgo(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export default function StartFromPanel({ currentFormat, hasDraft, onSelect }: StartFromPanelProps) {
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [frameworks, setFrameworks] = useState<RawFramework[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [voice, setVoice] = useState<{
    fullName: string | null;
    avatarUrl: string | null;
    tone: string | null;
    sample: string | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, fRes, usedRes] = await Promise.all([
        supabase
          .from("strategic_signals")
          .select("id, signal_title, explanation, content_opportunity, confidence, created_at, status")
          .eq("status", "active")
          .gte("confidence", 0.5)
          .order("confidence", { ascending: false })
          .limit(10),
        supabase
          .from("master_frameworks")
          .select("id, title, summary, tags, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("content_items")
          .select("generation_params")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      setSignals((sRes.data || []) as any);
      setFrameworks((fRes.data || []) as any);
      // Track used signal/framework titles to deprioritize
      const used = new Set<string>();
      (usedRes.data || []).forEach((item: any) => {
        const params = item.generation_params;
        if (params?.signal_id) used.add(params.signal_id);
      });
      setUsedIds(used);
    } catch (e) {
      console.error("StartFromPanel fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Read-only voice profile fetch (does not change voice training logic)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [profileRes, voiceRes] = await Promise.all([
          (supabase.from("diagnostic_profiles" as any) as any)
            .select("first_name, avatar_url")
            .eq("user_id", user.id).maybeSingle(),
          (supabase.from("authority_voice_profiles" as any) as any)
            .select("tone_summary, example_posts")
            .eq("user_id", user.id).maybeSingle(),
        ]);
        const examplePosts = (voiceRes?.data as any)?.example_posts;
        let sample: string | null = null;
        if (Array.isArray(examplePosts) && examplePosts.length > 0) {
          const first = typeof examplePosts[0] === "string" ? examplePosts[0] : (examplePosts[0]?.text || examplePosts[0]?.content || "");
          if (first) sample = String(first).slice(0, 120);
        } else if (typeof examplePosts === "string") {
          sample = examplePosts.slice(0, 120);
        }
        setVoice({
          fullName: (profileRes?.data as any)?.first_name || null,
          avatarUrl: (profileRes?.data as any)?.avatar_url || null,
          tone: (voiceRes?.data as any)?.tone_summary || null,
          sample,
        });
      } catch (e) {
        // silent — voice card is optional
      }
    })();
  }, []);

  // Build curated list
  const curated = useMemo(() => {
    const items: CuratedItem[] = [];
    const titles: string[] = [];

    const addIfNew = (item: CuratedItem) => {
      if (titles.some(t => isDuplicate(t, item.title))) return;
      titles.push(item.title);
      items.push(item);
    };

    // Map signals
    for (const s of signals) {
      const title = s.content_opportunity?.title || s.signal_title;
      const fresh = daysAgo(s.created_at);
      const isUsed = usedIds.has(s.id);

      let reason = "";
      if (s.confidence >= 0.85) reason = "High confidence";
      else if (fresh <= 3) reason = "Fresh signal";
      else if (!isUsed) reason = "Unused opportunity";
      else reason = "Related to your work";

      // Determine best format for this signal
      let bestFormat: ContentType = "post";
      if (currentFormat === "framework_summary" && s.content_opportunity?.framework_angle) {
        bestFormat = "framework_summary";
      } else if (currentFormat === "carousel") {
        bestFormat = "carousel";
      }

      addIfNew({
        id: s.id,
        title,
        context: s.explanation,
        sourceType: "signal",
        confidence: s.confidence,
        reason,
        contentType: bestFormat,
        signalTitle: s.signal_title,
        signalInsight: s.explanation,
        freshness: fresh,
      });
    }

    // Map frameworks
    for (const fw of frameworks) {
      const fresh = daysAgo(fw.created_at);
      addIfNew({
        id: fw.id,
        title: fw.title,
        context: fw.summary || "",
        sourceType: "framework",
        reason: fresh <= 7 ? "Recent framework" : "Your framework",
        contentType: currentFormat === "framework_summary" ? "framework_summary" : "post",
        freshness: fresh,
      });
    }

    // Score and sort
    items.sort((a, b) => {
      // Format match bonus
      const aMatch = a.contentType === currentFormat ? 10 : 0;
      const bMatch = b.contentType === currentFormat ? 10 : 0;
      // Confidence bonus
      const aConf = (a.confidence || 0.5) * 5;
      const bConf = (b.confidence || 0.5) * 5;
      // Freshness bonus (newer = better)
      const aFresh = Math.max(0, 5 - a.freshness * 0.5);
      const bFresh = Math.max(0, 5 - b.freshness * 0.5);
      // Unused bonus
      const aUsed = usedIds.has(a.id) ? 0 : 3;
      const bUsed = usedIds.has(b.id) ? 0 : 3;

      return (bMatch + bConf + bFresh + bUsed) - (aMatch + aConf + aFresh + aUsed);
    });

    return items.slice(0, 7);
  }, [signals, frameworks, currentFormat, usedIds]);

  // Group items
  const groups = useMemo(() => {
    const recommended = curated.filter(i => (i.confidence || 0) >= 0.8 || i.freshness <= 2);
    const fresh = curated.filter(i => !recommended.includes(i) && i.freshness <= 14);
    const rest = curated.filter(i => !recommended.includes(i) && !fresh.includes(i));

    const result: { label: string; icon: any; items: CuratedItem[] }[] = [];
    if (recommended.length) result.push({ label: "Recommended now", icon: Sparkles, items: recommended.slice(0, 3) });
    if (fresh.length) result.push({ label: "Fresh signals", icon: TrendingUp, items: fresh.slice(0, 3) });
    if (rest.length) result.push({ label: "More opportunities", icon: Lightbulb, items: rest.slice(0, 2) });
    return result;
  }, [curated]);

  const handleItemClick = (item: CuratedItem) => {
    if (hasDraft) {
      if (confirmId === item.id) {
        onSelect(item.title, item.context, item.contentType, item.signalTitle, item.signalInsight);
        setConfirmId(null);
      } else {
        setConfirmId(item.id);
      }
    } else {
      onSelect(item.title, item.context, item.contentType, item.signalTitle, item.signalInsight);
    }
  };

  const sourceIcon = (type: CuratedItem["sourceType"]) => {
    switch (type) {
      case "signal": return <Zap className="w-3 h-3 text-primary/70" />;
      case "framework": return <BookOpen className="w-3 h-3 text-blue-400/70" />;
      default: return <Lightbulb className="w-3 h-3 text-primary/50" />;
    }
  };

  const initials = (() => {
    const n = (voice?.fullName || "").trim();
    if (!n) return "";
    const parts = n.split(/\s+/).filter(Boolean);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0][0]?.toUpperCase() || "";
  })();

  return (
    <aside
      className="hidden lg:block w-72 shrink-0"
      style={{ position: "sticky", top: 24, alignSelf: "flex-start" }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "0.5px solid rgba(0,0,0,0.07)",
          boxShadow: "var(--shadow-sm)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "16px 16px 8px" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "#F97316" }} />
            <h4 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "#3D3A36" }}>
              Start from
            </h4>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ color: "#7A7670" }}
            className="hover:opacity-80 transition-opacity"
            title="Refresh suggestions"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "0 14px 16px" }}>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "rgba(249,115,22,0.5)" }} />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Lightbulb className="w-6 h-6 mx-auto mb-2" style={{ color: "rgba(249,115,22,0.25)" }} />
              <p style={{ fontSize: 11, color: "#7A7670" }}>Capture more insights to unlock suggestions</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} style={{ marginBottom: 10 }}>
                <p
                  style={{
                    fontSize: 9,
                    color: "#7A7670",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    fontWeight: 700,
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <group.icon className="w-3 h-3" />
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const isConfirm = confirmId === item.id;
                  const isUnused = !usedIds.has(item.id);
                  const isRecommended = group.label === "Recommended now";
                  const badgeText = isRecommended ? "Recommended" : (isUnused ? "Unused" : null);
                  const badgeStyle = isRecommended
                    ? { background: "#FEF0E6", color: "#C05A10" }
                    : { background: "#EEF2FF", color: "#3730A3" };
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      style={{
                        background: isConfirm ? "#FEF0E6" : "#F3F0EB",
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 7,
                        cursor: "pointer",
                        border: isConfirm ? "1px solid rgba(249,115,22,0.4)" : "0.5px solid transparent",
                        width: "100%",
                        textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      className="hover:brightness-[0.98]"
                    >
                      {isConfirm ? (
                        <p style={{ fontSize: 11, color: "#C05A10", fontWeight: 600 }}>
                          Replace current draft? Click again to confirm.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            {item.confidence && item.confidence >= 0.7 ? (
                              <span
                                style={{
                                  fontFamily: "'DM Serif Display', serif",
                                  fontSize: 16,
                                  color: "#F97316",
                                  lineHeight: 1,
                                }}
                              >
                                {Math.round(item.confidence * 100)}
                              </span>
                            ) : (
                              <span className="shrink-0 mt-0.5">{sourceIcon(item.sourceType)}</span>
                            )}
                            {badgeText && (
                              <span
                                style={{
                                  ...badgeStyle,
                                  fontSize: 9,
                                  fontWeight: 600,
                                  padding: "2px 7px",
                                  borderRadius: 6,
                                  letterSpacing: "0.02em",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {badgeText}
                              </span>
                            )}
                          </div>
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "#1A1815",
                              lineHeight: 1.4,
                              marginTop: 4,
                            }}
                            className="line-clamp-2"
                          >
                            {item.title}
                          </p>
                          <p style={{ fontSize: 9, color: "#7A7670", marginTop: 3 }}>{item.reason}</p>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {/* Voice match card */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 14,
              borderTop: "0.5px solid rgba(0,0,0,0.07)",
            }}
          >
            <p
              style={{
                fontSize: 9,
                color: "#7A7670",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Voice match
            </p>
            <div className="flex items-start gap-2.5">
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "2px solid #F97316",
                  background: "#F3F0EB",
                  overflow: "hidden",
                  color: "#F97316",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {voice?.avatarUrl ? (
                  <img src={voice.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : initials ? (
                  initials
                ) : (
                  <User className="w-4 h-4" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 11, fontWeight: 600, color: "#1A1815", lineHeight: 1.2 }}>
                  {voice?.fullName || "Your voice"}
                </p>
                <p style={{ fontSize: 10, color: "#7A7670", lineHeight: 1.35, marginTop: 2 }}>
                  {voice?.tone || "Train your voice from past posts"}
                </p>
              </div>
            </div>
            {voice?.sample && (
              <div
                style={{
                  background: "#F3F0EB",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginTop: 8,
                }}
              >
                <p style={{ fontSize: 11, fontStyle: "italic", color: "#2A2825", lineHeight: 1.4 }}>
                  “{voice.sample}{voice.sample.length >= 120 ? "…" : ""}”
                </p>
              </div>
            )}
            <a
              href="/dashboard?tab=identity"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 10,
                color: "#F97316",
                fontWeight: 600,
              }}
              className="hover:opacity-80"
            >
              Train voice from posts →
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
