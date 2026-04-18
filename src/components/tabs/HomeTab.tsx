import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import SectionError from "@/components/ui/section-error";
import { formatSmartDate } from "@/lib/formatDate";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { withTimeout } from "@/lib/safeQuery";

type TabValue = "home" | "identity" | "intelligence" | "authority" | "influence";

interface HomeTabProps {
  entries?: any[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
  onNavigateToSignal?: (signalId: string) => void;
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: TabValue) => void;
  onDraftToStudio?: (prefill: any) => void;
}

interface ScoreSnap {
  score: number;
  components: any;
  created_at: string;
}
interface RecMove {
  id: string;
  title: string;
  rationale: string;
  output_type: string;
}
interface Trend {
  id: string;
  headline: string;
  insight: string;
  url: string | null;
  source: string;
  fetched_at: string;
  status?: string;
  validation_score?: number | null;
  relevance_score?: number | null;
  topic_relevance_score?: number | null;
  final_score?: number | null;
  selection_reason?: string | null;
  category?: string | null;
  impact_level?: string | null;
  confidence_level?: string | null;
  decision_label?: string | null;
  signal_type?: string | null;
  opportunity_type?: string | null;
  action_recommendation?: string | null;
}

const decisionStyle = (label?: string | null): { color: string; bg: string } => {
  if (label === "Act Now") return { color: "#E24B4A", bg: "#E24B4A12" };
  if (label === "Early Opportunity") return { color: "#F97316", bg: "#F9731612" };
  return { color: "hsl(var(--muted-foreground))", bg: "transparent" };
};

const freshnessOf = (iso: string): { label: string; color: string } => {
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH <= 24) return { label: "Fresh", color: "#7ab648" };
  if (ageH <= 24 * 7) return { label: "This week", color: "#F97316" };
  return { label: "Aging", color: "hsl(var(--muted-foreground))" };
};

const impactStyle = (level?: string | null): { color: string } => {
  if (level === "High") return { color: "#E24B4A" };
  if (level === "Emerging") return { color: "#F97316" };
  return { color: "hsl(var(--muted-foreground))" };
};

type TrendFilter = "all" | "high_confidence" | "top_relevance" | "trusted" | "newest";

const TRUSTED_SET = new Set([
  "mckinsey.com","bcg.com","bain.com","deloitte.com","ey.com","pwc.com",
  "kpmg.com","accenture.com","oliverwyman.com","rolandberger.com",
  "hbr.org","sloanreview.mit.edu","brookings.edu","gartner.com",
  "forrester.com","idc.com","ft.com","wsj.com","bloomberg.com",
  "economist.com","reuters.com","weforum.org","imf.org","worldbank.org",
  "nature.com","science.org","nber.org",
]);

const isTrusted = (source: string) => {
  const s = (source || "").toLowerCase();
  return Array.from(TRUSTED_SET).some(d => s === d || s.endsWith("." + d));
};

const qualityTier = (v?: number | null): { label: string; color: string } => {
  const n = v ?? 0;
  if (n >= 75) return { label: "High quality", color: "#7ab648" };
  if (n >= 50) return { label: "Solid", color: "#F97316" };
  return { label: "Low signal", color: "hsl(var(--muted-foreground))" };
};

const trendReason = (t: Trend): string => {
  // Prefer the stored, AI-grounded explanation when available.
  if (t.selection_reason && t.selection_reason.trim().length > 0) {
    return t.selection_reason.trim();
  }
  // Fallback: derive a short reason from scores.
  const reasons: string[] = [];
  if (isTrusted(t.source)) reasons.push("trusted source");
  if ((t.topic_relevance_score ?? 0) >= 50) reasons.push("matches your focus");
  if ((t.relevance_score ?? 0) >= 70) reasons.push("strategically relevant");
  if ((t.validation_score ?? 0) >= 70) reasons.push("strong content");
  if (reasons.length === 0) return "Selected for breadth";
  return `Selected for ${reasons.slice(0, 2).join(" + ")}`;
};
interface TopSignal {
  signal_title: string;
  confidence: number;
}

const ACCENT = "#F97316";
const GREEN = "#7ab648";
const RED = "#E24B4A";

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

const getGreeting = (h: number) => {
  if (h >= 5 && h < 12) return "GOOD MORNING";
  if (h >= 12 && h < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
};

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

const timeAgo = (iso: string) => formatSmartDate(iso);

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────

const HomeTab = ({ onOpenCapture, onSwitchTab }: HomeTabProps) => {
  const { user: authUser, isReady: authReady } = useAuthReady();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [userName, setUserName] = useState<string>("");

  // section-level loading + error
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(false);
  const [movesLoading, setMovesLoading] = useState(true);
  const [movesError, setMovesError] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState(false);
  const [trendsCountLoading, setTrendsCountLoading] = useState(true);

  // data
  const [latestScore, setLatestScore] = useState<ScoreSnap | null>(null);
  const [score7dAgo, setScore7dAgo] = useState<number | null>(null);
  const [daysSinceCapture, setDaysSinceCapture] = useState<number | null>(null);
  const [topSignal, setTopSignal] = useState<TopSignal | null>(null);
  const [topMove, setTopMove] = useState<RecMove | null>(null);
  const [newFollowers30d, setNewFollowers30d] = useState<number>(0);
  const [moves, setMoves] = useState<RecMove[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [trendsBadgeCount, setTrendsBadgeCount] = useState<number>(0);

  // Delayed loading flags — only show skeleton if loading exceeds 200ms.
  // Prevents flicker on fast refreshes while preserving real long-load states.
  const showBriefSkeleton = useDelayedFlag(briefLoading, 200);
  const showMovesSkeleton = useDelayedFlag(movesLoading && moves.length === 0, 200);
  const showTrendsSkeleton = useDelayedFlag(trendsLoading && trends.length === 0, 200);

  // per-trend UI state
  const [addedSignalIds, setAddedSignalIds] = useState<Set<string>>(new Set());
  const [dismissedTrendIds, setDismissedTrendIds] = useState<Set<string>>(new Set());
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [refreshingTrends, setRefreshingTrends] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load name (gated on auth ready, uses cached user)
  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      setUserName("");
      return;
    }
    (async () => {
      const meta: any = authUser.user_metadata || {};
      const fallback = (authUser.email || "").split("@")[0];
      let name = meta.first_name || meta.full_name || meta.name || "";
      try {
        const { data } = await withTimeout(
          supabase
            .from("diagnostic_profiles")
            .select("first_name")
            .eq("user_id", authUser.id)
            .maybeSingle(),
          8000,
        );
        if (data?.first_name) name = data.first_name;
      } catch (e) {
        console.warn("[HomeTab] profile name fetch failed", e);
      }
      setUserName((name || fallback || "there").toString().split(" ")[0].toUpperCase());
    })();
  }, [authReady, authUser]);

  // ─── Loaders (each takes the user from auth-ready, no getUser() roundtrip) ───
  const loadBriefing = useCallback(async (uid: string) => {
    console.log("[HomeTab] briefing started");
    setBriefLoading(true);
    setBriefError(false);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

      const [latestRes, prevRes, lastEntryRes, lastDocRes, sigRes, moveRes, follRes] = await withTimeout(Promise.all([
        supabase.from("score_snapshots").select("score, components, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("score_snapshots").select("score").eq("user_id", uid).lte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("entries").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("documents").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("strategic_signals").select("signal_title, confidence").eq("user_id", uid).eq("status", "active").order("confidence", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("recommended_moves").select("id, title, rationale, output_type").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("influence_snapshots").select("follower_growth").eq("user_id", uid).eq("source_type", "linkedin_export").gte("snapshot_date", thirtyDaysAgo),
      ]), 12000);

      setLatestScore(latestRes.data ?? null);
      setScore7dAgo(prevRes.data?.score ?? null);
      const lastTimes = [lastEntryRes.data?.created_at, lastDocRes.data?.created_at]
        .filter(Boolean)
        .map((t: any) => new Date(t).getTime());
      if (lastTimes.length) {
        const diffMs = Date.now() - Math.max(...lastTimes);
        setDaysSinceCapture(Math.floor(diffMs / 86400_000));
      } else {
        setDaysSinceCapture(null);
      }
      setTopSignal(sigRes.data ?? null);
      setTopMove(moveRes.data ?? null);
      setNewFollowers30d((follRes.data || []).reduce((s: number, r: any) => s + (r.follower_growth || 0), 0));
      console.log("[HomeTab] briefing finished");
    } catch (e) {
      console.error("[HomeTab] briefing load failed", e);
      setBriefError(true);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  const loadMoves = useCallback(async (uid: string) => {
    console.log("[HomeTab] moves started");
    setMovesLoading(true);
    setMovesError(false);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("recommended_moves")
          .select("id, title, rationale, output_type")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(3),
        8000,
      );
      if (error) throw error;
      setMoves(data || []);
      console.log("[HomeTab] moves finished");
    } catch (e) {
      console.error("[HomeTab] moves load failed", e);
      setMovesError(true);
    } finally {
      setMovesLoading(false);
    }
  }, []);

  const loadTrends = useCallback(async (uid: string) => {
    console.log("[HomeTab] trends started");
    setTrendsLoading(true);
    setTrendsError(false);
    try {
      // Only show real signals: must have a final_score AND a stored snapshot.
      // Legacy backfilled rows (final_score=0, no content_markdown) are excluded.
      const { data, error } = await withTimeout(
        supabase
          .from("industry_trends")
          .select("id, headline, insight, url, source, fetched_at, status, validation_score, relevance_score, topic_relevance_score, final_score, selection_reason, category, impact_level, confidence_level, decision_label, signal_type, opportunity_type, action_recommendation, content_markdown")
          .eq("is_valid", true)
          .eq("user_id", uid)
          .eq("status", "new")
          .gt("final_score", 0)
          .not("content_markdown", "is", null)
          .order("final_score", { ascending: false })
          .order("fetched_at", { ascending: false })
          .limit(8),
        8000,
      );
      if (error) throw error;
      setTrends((data || []) as Trend[]);
      console.log("[HomeTab] trends finished");
    } catch (e) {
      console.error("[HomeTab] trends load failed", e);
      setTrendsError(true);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  const loadTrendsBadge = useCallback(async (uid: string) => {
    setTrendsCountLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { count } = await withTimeout(
        supabase
          .from("industry_trends")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .gte("fetched_at", sevenDaysAgo),
        8000,
      );
      setTrendsBadgeCount(count || 0);
    } catch (e) {
      console.error("[HomeTab] trends badge failed", e);
    } finally {
      setTrendsCountLoading(false);
    }
  }, []);

  // Gate all loaders on auth-ready. If no user after ready → unblock skeletons
  // and fall through to empty/error states (do not stay loading forever).
  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      console.log("[HomeTab] blocked: auth ready but no user");
      setBriefLoading(false);
      setMovesLoading(false);
      setTrendsLoading(false);
      setTrendsCountLoading(false);
      return;
    }
    const uid = authUser.id;
    loadBriefing(uid);
    loadMoves(uid);
    loadTrends(uid);
    loadTrendsBadge(uid);
  }, [authReady, authUser, loadBriefing, loadMoves, loadTrends, loadTrendsBadge]);

  // ─── Derived ───
  const scoreDiff = useMemo(() => {
    if (latestScore == null || score7dAgo == null) return null;
    return latestScore.score - score7dAgo;
  }, [latestScore, score7dAgo]);

  const captureScore = useMemo(() => {
    const c = latestScore?.components?.capture_score;
    return typeof c === "number" ? c : parseInt(c, 10) || 0;
  }, [latestScore]);

  // Build narrative parts (with styling colors)
  type Part = { text: string; bold?: boolean; color?: string };
  const narrative: Part[] = useMemo(() => {
    const parts: Part[] = [];
    // Sentence 1
    if (scoreDiff != null && scoreDiff < -5) {
      parts.push({ text: "Your authority score is " });
      parts.push({ text: "declining", color: RED });
      parts.push({ text: " — down " });
      parts.push({ text: `${Math.abs(scoreDiff)} points`, bold: true });
      parts.push({ text: " this week. " });
    } else if (scoreDiff != null && scoreDiff > 5) {
      parts.push({ text: "Your authority score is " });
      parts.push({ text: "growing", color: GREEN });
      parts.push({ text: " — up " });
      parts.push({ text: `${scoreDiff} points`, bold: true });
      parts.push({ text: " this week. " });
    } else {
      parts.push({ text: "Your authority score is holding steady this week. " });
    }

    // Sentence 2
    if (topSignal) {
      parts.push({ text: "Your top signal (" });
      parts.push({ text: topSignal.signal_title, bold: true });
      parts.push({ text: " at " });
      parts.push({ text: `${Math.round((topSignal.confidence || 0) * 100)}%`, bold: true });
      parts.push({ text: ") has a " });
      parts.push({ text: "publishing window open right now", color: ACCENT });
      parts.push({ text: ". " });
    } else {
      parts.push({ text: "Capture more sources to build your signal intelligence. " });
    }

    // Sentence 3
    if (daysSinceCapture != null && daysSinceCapture >= 4 && captureScore < 80) {
      parts.push({ text: "You haven't captured anything in " });
      parts.push({ text: `${daysSinceCapture} days`, bold: true, color: RED });
      parts.push({ text: " — this is " });
      parts.push({ text: "directly reducing your score", color: RED });
      parts.push({ text: "." });
    } else if (daysSinceCapture != null && daysSinceCapture >= 4 && captureScore >= 80) {
      parts.push({ text: "Your signal base is strong — now is the time to " });
      parts.push({ text: "publish", color: ACCENT });
      parts.push({ text: "." });
    } else if (daysSinceCapture != null && daysSinceCapture < 4 && (scoreDiff ?? 0) < 0) {
      parts.push({ text: "Keep capturing and publishing to reverse the decline." });
    } else {
      parts.push({ text: "Keep your current pace — your authority is " });
      parts.push({ text: "compounding", color: GREEN });
      parts.push({ text: "." });
    }

    if (newFollowers30d > 0) {
      parts.push({ text: " You gained " });
      parts.push({ text: `${newFollowers30d.toLocaleString()} followers`, bold: true });
      parts.push({ text: " this month." });
    }
    return parts;
  }, [scoreDiff, topSignal, daysSinceCapture, captureScore, newFollowers30d]);

  // ─── Actions ───
  const handlePrimaryCTA = () => {
    if (daysSinceCapture != null && daysSinceCapture >= 4) {
      onOpenCapture?.();
    } else if (topMove) {
      onSwitchTab?.("authority");
    } else {
      onOpenCapture?.();
    }
  };

  const primaryLabel = daysSinceCapture != null && daysSinceCapture >= 4
    ? "Capture now →"
    : topMove ? "Draft your move →" : "Capture now →";

  const dismissMove = async (id: string) => {
    setMoves(prev => prev.filter(m => m.id !== id));
    try {
      await supabase.from("recommended_moves").update({ status: "dismissed" }).eq("id", id);
    } catch (e) {
      console.error("[HomeTab] dismiss move failed", e);
    }
  };

  const addTrendToSignals = async (trend: Trend) => {
    setAddedSignalIds(prev => new Set(prev).add(trend.id));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.functions.invoke("detect-signals", {
        body: { user_id: user.id, entry_id: null, trend_title: trend.headline },
      });
    } catch (e) {
      console.error("[HomeTab] add trend to signals failed", e);
    }
  };

  const dismissTrend = (id: string) => {
    setDismissedTrendIds(prev => new Set(prev).add(id));
  };

  const handleRefreshTrends = async () => {
    if (refreshingTrends || !authUser) return;
    setRefreshingTrends(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-industry-trends", {
        body: { mode: "full" },
      });
      if (error) {
        console.error("[HomeTab] refresh trends failed", error);
        setTrendsError(true);
      } else {
        if ((data as any)?.firecrawl_quota_exhausted) {
          // Honest, surfaced failure: snapshot scraping unavailable
          console.warn("[HomeTab] firecrawl quota exhausted", (data as any)?.warning);
          setTrendsError(true);
        }
        setDismissedTrendIds(new Set());
        await loadTrends(authUser.id);
        await loadTrendsBadge(authUser.id);
      }
    } catch (e) {
      console.error("[HomeTab] refresh trends exception", e);
      setTrendsError(true);
    } finally {
      setRefreshingTrends(false);
    }
  };

  const visibleTrends = useMemo(() => {
    let arr = trends.filter(t => !dismissedTrendIds.has(t.id));
    switch (trendFilter) {
      case "high_confidence":
        arr = arr.filter(t => (t.validation_score ?? 0) >= 60);
        break;
      case "top_relevance":
        arr = [...arr].sort((a, b) =>
          ((b.topic_relevance_score ?? 0) + (b.relevance_score ?? 0)) -
          ((a.topic_relevance_score ?? 0) + (a.relevance_score ?? 0))
        );
        break;
      case "trusted":
        arr = arr.filter(t => isTrusted(t.source));
        break;
      case "newest":
        arr = [...arr].sort((a, b) => +new Date(b.fetched_at) - +new Date(a.fetched_at));
        break;
      case "all":
      default:
        // Already ordered by final_score from query
        break;
    }
    return arr.slice(0, 5);
  }, [trends, dismissedTrendIds, trendFilter]);

  // ─── Render ───
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-3xl"
    >
      {/* SECTION 1 — Header bar */}
      <header className="flex items-end justify-between gap-3 pt-1">
        <div>
          <div className="text-foreground" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {fmtTime(now)}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
            {getGreeting(now.getHours())}{userName ? `, ${userName}` : ""}
          </div>
        </div>
{/* Removed "X this week" badge — refresh control lives in the Live Intelligence section */}
      </header>

      {/* SECTION 2 — AI daily briefing */}
      {briefError ? (
        <div className="rounded-r-lg border border-l-4" style={{ borderColor: "hsl(var(--border) / 0.5)", borderLeftColor: ACCENT, background: "hsl(var(--card))" }}>
          <SectionError onRetry={() => authUser && loadBriefing(authUser.id)} message="Couldn't load briefing. " />
        </div>
      ) : showBriefSkeleton ? (
        <div className="border border-l-4 rounded-r-lg p-5 space-y-3" style={{ borderColor: "hsl(var(--border) / 0.5)", borderLeftColor: ACCENT, background: "hsl(var(--card))" }}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      ) : briefLoading ? (
        <div className="min-h-[120px]" aria-busy="true" />
      ) : (
        <div
          className="rounded-r-lg border"
          style={{
            background: "hsl(var(--card))",
            borderColor: "hsl(var(--border) / 0.5)",
            borderLeftWidth: 4,
            borderLeftColor: ACCENT,
            padding: "16px 20px",
          }}
        >
          <p style={{ fontSize: 14, lineHeight: 1.75, color: "hsl(var(--muted-foreground))", margin: 0 }}>
            {narrative.map((p, i) => (
              <span
                key={i}
                style={{
                  fontWeight: p.bold ? 600 : 400,
                  color: p.color || (p.bold ? "hsl(var(--foreground))" : undefined),
                }}
              >
                {p.text}
              </span>
            ))}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrimaryCTA}
              style={{
                background: ACCENT, color: "#fff",
                fontSize: 12, fontWeight: 600,
                padding: "7px 18px", borderRadius: 4, border: "none", cursor: "pointer",
              }}
            >
              {primaryLabel}
            </button>
            <button
              onClick={() => onSwitchTab?.("intelligence")}
              style={{
                border: "0.5px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
                background: "transparent",
                fontSize: 12, padding: "7px 18px", borderRadius: 4,
                marginLeft: 4, cursor: "pointer",
              }}
            >
              See your signals →
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3 — Today's focus */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground) / 0.7)", marginBottom: 10 }}>
          Today's Focus
        </div>
        {movesError ? (
          <SectionError onRetry={() => authUser && loadMoves(authUser.id)} message="Couldn't load moves. " />
        ) : showMovesSkeleton ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : movesLoading && moves.length === 0 ? (
          <div className="min-h-[80px]" aria-busy="true" />
        ) : moves.length === 0 ? (
          <div className="rounded-lg border border-dashed text-center" style={{ borderColor: "hsl(var(--border))", padding: "24px 16px", color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
            No moves yet — Aura will generate your first strategic move after you capture more sources
          </div>
        ) : (
          <div className="space-y-2">
            {moves.map((m, i) => {
              const badge =
                m.output_type === "carousel" ? { label: "⊞ CAROUSEL", bg: "#5b8def18", color: "#5b8def", border: "#5b8def44" }
                : m.output_type === "framework" ? { label: "◈ FRAMEWORK", bg: "#7ab64818", color: GREEN, border: "#7ab64840" }
                : { label: "✦ POST", bg: "#F9731618", color: ACCENT, border: "#F9731644" };
              const isHero = i === 0;
              return (
                <div
                  key={m.id}
                  style={{
                    background: isHero ? "hsl(var(--card))" : "hsl(var(--card))",
                    border: "0.5px solid hsl(var(--border))",
                    borderLeftWidth: isHero ? 3 : 0.5,
                    borderLeftColor: isHero ? ACCENT : "hsl(var(--border))",
                    borderRadius: isHero ? "0 8px 8px 0" : 8,
                    padding: "14px 16px",
                    backgroundImage: isHero ? "linear-gradient(90deg, rgba(249,115,22,0.04), transparent 60%)" : "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "hsl(var(--foreground))" }}>
                      {m.title}
                    </div>
                    <span style={{ background: badge.bg, color: badge.color, border: `0.5px solid ${badge.border}`, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>
                      {badge.label}
                    </span>
                  </div>
                  {m.rationale && (
                    <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {m.rationale}
                    </div>
                  )}
                  <div className="flex items-center" style={{ marginTop: 10 }}>
                    <button
                      onClick={() => onSwitchTab?.("authority")}
                      style={{ color: ACCENT, fontSize: 11, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Draft It
                    </button>
                    <button
                      onClick={() => onSwitchTab?.("intelligence")}
                      style={{ color: "hsl(var(--muted-foreground) / 0.7)", fontSize: 11, marginLeft: 14, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Explore
                    </button>
                    <button
                      onClick={() => dismissMove(m.id)}
                      style={{ color: "hsl(var(--muted-foreground) / 0.7)", fontSize: 11, marginLeft: 14, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 4 — Live intelligence */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 10 }}>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground) / 0.7)" }}>
              Live Intelligence
            </div>
            <button
              onClick={handleRefreshTrends}
              disabled={refreshingTrends}
              title="Refresh trends now"
              style={{
                background: "transparent",
                border: "0.5px solid hsl(var(--border))",
                color: refreshingTrends ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--muted-foreground))",
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 3,
                cursor: refreshingTrends ? "wait" : "pointer",
                letterSpacing: "0.04em",
              }}
            >
              {refreshingTrends ? "Refreshing…" : "↻ Refresh trends"}
            </button>
          </div>
          {!trendsError && !showTrendsSkeleton && trends.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 10 }}>
              {([
                { key: "all", label: "Top picks" },
                { key: "high_confidence", label: "High confidence" },
                { key: "top_relevance", label: "Most relevant" },
                { key: "trusted", label: "Trusted only" },
                { key: "newest", label: "Newest" },
              ] as { key: TrendFilter; label: string }[]).map(f => {
                const active = trendFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setTrendFilter(f.key)}
                    style={{
                      background: active ? "#F9731618" : "transparent",
                      border: `0.5px solid ${active ? "#F9731644" : "hsl(var(--border))"}`,
                      color: active ? ACCENT : "hsl(var(--muted-foreground))",
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {trendsError ? (
          <SectionError onRetry={() => authUser && loadTrends(authUser.id)} message="Couldn't load intelligence. " />
        ) : showTrendsSkeleton ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : trendsLoading && trends.length === 0 ? (
          <div className="min-h-[80px]" aria-busy="true" />
        ) : visibleTrends.length === 0 ? (
          <div className="rounded-lg border border-dashed text-center" style={{ borderColor: "hsl(var(--border))", padding: "24px 16px" }}>
            <div style={{ fontSize: 12, color: "hsl(var(--foreground))" }}>
              {trends.length === 0 ? "No live intelligence yet" : "No trends match this filter"}
            </div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              {trends.length === 0
                ? "Aura curates industry trends from trusted sources, validated for quality"
                : "Try a different filter or reset to top picks"}
            </div>
          </div>
        ) : (
          <div>
            {visibleTrends.map((t, idx) => {
              const isAdded = addedSignalIds.has(t.id);
              const isLast = idx === visibleTrends.length - 1;
              const tier = qualityTier(t.validation_score);
              const trusted = isTrusted(t.source);
              const reason = trendReason(t);
              const fresh = freshnessOf(t.fetched_at);
              const impact = impactStyle(t.impact_level);
              return (
                <div
                  key={t.id}
                  className="flex gap-3"
                  style={{
                    padding: "12px 0",
                    borderBottom: isLast ? "none" : "0.5px solid hsl(var(--border))",
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, marginTop: 7, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground) / 0.8)", fontWeight: 500 }}>
                        {t.source ? t.source.toUpperCase() : "WEB"}
                      </span>
                      {trusted && (
                        <span title="Trusted publisher" style={{ fontSize: 9, color: GREEN, border: `0.5px solid ${GREEN}55`, padding: "1px 5px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
                          ✓ TRUSTED
                        </span>
                      )}
                      <span title={`Quality score ${t.validation_score ?? 0}/100`} style={{ fontSize: 9, color: tier.color, border: `0.5px solid ${tier.color}55`, padding: "1px 5px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
                        {tier.label.toUpperCase()} · {t.validation_score ?? 0}
                      </span>
                      <span title="Freshness" style={{ fontSize: 9, color: fresh.color, border: `0.5px solid ${fresh.color}55`, padding: "1px 5px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
                        {fresh.label.toUpperCase()}
                      </span>
                      {t.category && (
                        <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", border: "0.5px solid hsl(var(--border))", padding: "1px 5px", borderRadius: 3, fontWeight: 500, letterSpacing: "0.04em" }}>
                          {t.category.toUpperCase()}
                        </span>
                      )}
                      {t.impact_level && (
                        <span title={`Impact: ${t.impact_level}`} style={{ fontSize: 9, color: impact.color, border: `0.5px solid ${impact.color}55`, padding: "1px 5px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
                          ◆ {t.impact_level.toUpperCase()}
                        </span>
                      )}
                      {t.confidence_level && (
                        <span title={`Confidence: ${t.confidence_level}`} style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", border: "0.5px solid hsl(var(--border))", padding: "1px 5px", borderRadius: 3, fontWeight: 500, letterSpacing: "0.04em" }}>
                          {t.confidence_level.toUpperCase()} CONF
                        </span>
                      )}
                      {t.decision_label && (() => { const ds = decisionStyle(t.decision_label); return (
                        <span title="Decision priority" style={{ fontSize: 9, color: ds.color, background: ds.bg, border: `0.5px solid ${ds.color}55`, padding: "1px 6px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.05em" }}>
                          {t.decision_label.toUpperCase()}
                        </span>
                      ); })()}
                      <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground) / 0.6)" }}>
                        · {timeAgo(t.fetched_at)}
                      </span>
                    </div>
                    <button
                      onClick={() => navigate(`/trends/${t.id}`)}
                      className="text-left w-full"
                      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 500, color: "hsl(var(--foreground))", marginBottom: 4, lineHeight: 1.4 }}
                    >
                      {t.headline}
                    </button>
                    {t.insight && (
                      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, marginBottom: 6 }}>
                        {t.insight}
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground) / 0.65)", fontStyle: "italic", marginBottom: 6 }}>
                      ◆ {reason}
                    </div>
                    <div className="flex items-center">
                      {isAdded ? (
                        <span style={{ color: GREEN, fontSize: 10, padding: "3px 10px" }}>✓ Added</span>
                      ) : (
                        <button
                          onClick={() => addTrendToSignals(t)}
                          style={{ border: "0.5px solid #F9731644", color: ACCENT, background: "transparent", fontSize: 10, padding: "3px 10px", borderRadius: 3, cursor: "pointer" }}
                        >
                          Add to signals
                        </button>
                      )}
                      <button
                        onClick={() => dismissTrend(t.id)}
                        style={{ color: "hsl(var(--muted-foreground) / 0.7)", fontSize: 10, background: "transparent", border: "none", marginLeft: 10, cursor: "pointer", padding: 0 }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
};

export default HomeTab;
