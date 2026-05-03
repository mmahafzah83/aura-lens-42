import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles, Zap, Lightbulb, RefreshCw, Loader2,
  TrendingUp, BookOpen, User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ContentType = "post" | "carousel" | "essay" | "framework_summary";

interface RawSignal {
  id: string;
  signal_title: string;
  explanation: string;
  content_opportunity: any;
  confidence: number;
  created_at: string;
  status: string;
  strategic_implications?: string | null;
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
  angle?: string; // post angle (≤15 words)
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
          .select("id, signal_title, explanation, content_opportunity, confidence, created_at, status, strategic_implications")
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

      // Derive a provocative 1-line angle from strategic_implications (≤15 words)
      const rawImpl = (s.strategic_implications || s.explanation || "").trim();
      const firstSentence = rawImpl.split(/(?<=[.!?])\s+/)[0] || rawImpl;
      const words = firstSentence.split(/\s+/).filter(Boolean);
      const angle = words.slice(0, 15).join(" ") + (words.length > 15 ? "…" : "");

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
        angle: angle || s.signal_title,
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
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
            <h4 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "var(--ink-4)" }}>
              Post angles
            </h4>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ color: "var(--ink-5)" }}
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
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--bronze-deep)" }} />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Lightbulb className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
              <p style={{ fontSize: 11, color: "var(--ink-5)" }}>Capture more insights to unlock suggestions</p>
            </div>
          ) : (
            curated.filter(i => i.sourceType === "signal").slice(0, 4).map((item, idx) => {
              const isConfirm = confirmId === item.id;
              const isRecommended = idx === 0;
              return (
                <div
                  key={item.id}
                  className="group post-angle-card"
                  style={{
                    background: isConfirm ? "var(--brand-pale)" : "var(--surface-subtle)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: 7,
                    borderLeft: "3px solid transparent",
                    transition: "border-color 0.15s, background 0.15s",
                    cursor: "pointer",
                  }}
                  onClick={() => handleItemClick(item)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = "var(--brand)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent"; }}
                >
                  {isConfirm ? (
                    <p style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>
                      Replace current draft? Click again to confirm.
                    </p>
                  ) : (
                    <>
                      {isRecommended && (
                        <span
                          style={{
                            background: "var(--brand-pale)",
                            color: "var(--warning)",
                            fontSize: 9,
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: 6,
                            letterSpacing: "0.02em",
                            display: "inline-block",
                            marginBottom: 6,
                          }}
                        >
                          Recommended
                        </span>
                      )}
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--surface-ink-subtle)",
                          lineHeight: 1.35,
                        }}
                      >
                        {item.angle || item.title}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 4, lineHeight: 1.3 }} className="line-clamp-1">
                        {item.signalTitle || item.title}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--brand)",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        Generate this →
                      </button>
                    </>
                  )}
                </div>
              );
            })
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
                color: "var(--ink-5)",
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
                  border: "2px solid var(--brand)",
                  background: "var(--surface-subtle)",
                  overflow: "hidden",
                  color: "var(--brand)",
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
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--surface-ink-subtle)", lineHeight: 1.2 }}>
                  {voice?.fullName || "Your voice"}
                </p>
                <p style={{ fontSize: 10, color: "var(--ink-5)", lineHeight: 1.35, marginTop: 2 }}>
                  {voice?.tone || "Train your voice from past posts"}
                </p>
              </div>
            </div>
            {voice?.sample && (
              <div
                style={{
                  background: "var(--surface-subtle)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginTop: 8,
                }}
              >
                <p style={{ fontSize: 11, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
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
                color: "var(--brand)",
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
