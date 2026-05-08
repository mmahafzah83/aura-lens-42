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
import AurasRead from "@/components/AurasRead";
import MilestoneNotification from "@/components/MilestoneNotification";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { addTrendToSignals as wireTrendToSignals } from "@/lib/addTrendToSignals";
import { toast } from "sonner";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";
import AuthorityProgressModal from "@/components/AuthorityProgressModal";
import { HelpCircle, ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import ShareLink from "@/components/ShareLink";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";
import WeeklyIntelligenceLoopCard from "@/components/WeeklyIntelligenceLoopCard";
import SilenceAlarm from "@/components/SilenceAlarm";
import TierCeremonyModal from "@/components/TierCeremonyModal";
import IdentityDriftBanner from "@/components/IdentityDriftBanner";

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
  last_checked_at?: string | null;
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
  if (label === "Act Now") return { color: "var(--danger)", bg: "hsl(var(--danger) / 0.07)" };
  if (label === "Early Opportunity") return { color: "var(--brand)", bg: "hsl(var(--bronze) / 0.07)" };
  return { color: "hsl(var(--muted-foreground))", bg: "transparent" };
};

const freshnessOf = (iso: string): { label: string; color: string } => {
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH <= 24) return { label: "Fresh", color: "var(--success)" };
  if (ageH <= 24 * 7) return { label: "This week", color: "var(--brand)" };
  return { label: "Aging", color: "hsl(var(--muted-foreground))" };
};

const impactStyle = (level?: string | null): { color: string } => {
  if (level === "High") return { color: "var(--danger)" };
  if (level === "Emerging") return { color: "var(--brand)" };
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
  if (n >= 75) return { label: "High quality", color: "var(--success)" };
  if (n >= 50) return { label: "Solid", color: "var(--brand)" };
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

interface CompetitorAlert {
  competitorName: string;
  topic: string;
  url: string | null;
  fetchedAt: string;
  signalTitle: string;
  fragmentCount: number;
  daysSinceLastPost: number;
}

interface AuraScoreData {
  aura_score: number;
  capture_score: number;
  signal_score: number;
  content_score: number;
  score_trend: number | null;
  tier_name: string;
  personalized_nudge: string;
  weekly_rhythm: { active_weeks: number; total_weeks: number; weekly_data: boolean[] };
}

const COMPETITOR_KEYWORDS = [
  "mckinsey", "pwc", "deloitte", "bcg", "bain",
  "kpmg", "accenture", "strategy&", "oliver wyman",
];

const competitorTimeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const ACCENT = "var(--brand)";
const GREEN = "var(--success)";
const RED = "var(--danger)";
const SIGNAL = "var(--signal)";

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

const HomeTab = ({ entries, onOpenCapture, onSwitchTab }: HomeTabProps) => {
  const { user: authUser, session: authSession, isReady: authReady } = useAuthReady();
  // Session is "confirmed" only when auth restore is done AND we have an access
  // token. This is the gate for ALL data fetches — without it, RLS-protected
  // queries fire without an Authorization header and fail (the original bug).
  const sessionConfirmed = authReady && !!authSession?.access_token && !!authUser?.id;
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [userName, setUserName] = useState<string>("");
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("aura_welcome_dismissed") === "true";
  });
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);
  const dismissWelcome = () => {
    setWelcomeLeaving(true);
    setTimeout(() => {
      localStorage.setItem("aura_welcome_dismissed", "true");
      setWelcomeDismissed(true);
    }, 300);
  };
  const [profileLoaded, setProfileLoaded] = useState(false);
  const entriesLoaded = Array.isArray(entries);
  const showWelcome =
    !welcomeDismissed && entriesLoaded && entries!.length < 3 && profileLoaded;
  // The welcome card MAY appear once profile + entries are both loaded. Until
  // we know that for sure, we must NOT render the first-visit hint, otherwise
  // a slow profile load would let the hint render first and then both would
  // appear together when the welcome card pops in. This is the regression
  // guard for the "both visible at the same time" bug.
  const welcomeMayAppear = !welcomeDismissed && (!entriesLoaded || !profileLoaded);
  const suppressHint = showWelcome || welcomeLeaving || welcomeMayAppear;

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

  // Competitor alert (read-only, additive)
  const [competitorAlert, setCompetitorAlert] = useState<CompetitorAlert | null>(null);

  // J4 — "You're caught up" signal
  const [caughtUpReady, setCaughtUpReady] = useState(false);
  const [watchingSignalsCount, setWatchingSignalsCount] = useState<number>(0);

  // J13 — New signal notification banner
  const [newSignal, setNewSignal] = useState<{ id: string; signal_title: string; isFirst?: boolean } | null>(null);
  const [returnGreeting, setReturnGreeting] = useState<{ days: number; fadingCount: number } | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  // H2b — Status strip + dynamic primary card
  const [auraData, setAuraData] = useState<AuraScoreData | null>(null);
  const [auraLoading, setAuraLoading] = useState<boolean>(true);
  const [sectorFocus, setSectorFocus] = useState<string>("");
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  const [showSecondaryMoves, setShowSecondaryMoves] = useState(false);
  const [scoreTooltipOpen, setScoreTooltipOpen] = useState(false);

  // Score-jump celebratory banner state
  const [scoreJumpShareData, setScoreJumpShareData] = useState<MilestoneShareData | null>(null);
  const weekKey = (() => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const w = Math.floor((d.getTime() - new Date(Date.UTC(y, 0, 1)).getTime()) / 604800000);
    return `${y}-w${w}`;
  })();
  const [scoreJumpDismissed, setScoreJumpDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(`aura_score_jump_dismissed_${weekKey}`) === "true";
  });

  // J12 — empty state for new users with zero captures
  const isEmpty = Array.isArray(entries) && entries.length === 0;
  const [rhythmTooltipOpen, setRhythmTooltipOpen] = useState(false);
  const [alarmEducationSeen, setAlarmEducationSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("aura_alarm_seen") === "true";
  });

  // First-login onboarding wizard (3 steps)
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fire-and-forget signal decay engine on Home load (rate-limited server-side to 6h)
  useEffect(() => {
    if (!sessionConfirmed || !authUser?.id) return;
    supabase.functions
      .invoke("signal-decay-engine", { body: { user_id: authUser.id } })
      .catch((err) => console.warn("Decay engine error (non-blocking):", err));
  }, [sessionConfirmed, authUser?.id]);

  // First-login onboarding gate — only after the session is confirmed,
  // and only if there is no diagnostic_profiles row for this user yet.
  useEffect(() => {
    if (!sessionConfirmed || !authUser?.id) return;
    let cancelled = false;
    const checkOnboarding = async () => {
      try {
        const alreadyDone = localStorage.getItem("aura_onboarding_complete");
        if (alreadyDone === "true") return;
        const { data } = await supabase
          .from("diagnostic_profiles")
          .select("id")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (!cancelled && !data) setShowOnboarding(true);
      } catch (e) {
        // Non-fatal: never block Home if this check fails.
        console.warn("[HomeTab] onboarding check failed", e);
      }
    };
    checkOnboarding();
    return () => { cancelled = true; };
  }, [sessionConfirmed, authUser?.id]);


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
    let didAttempt = false;
    try {
      // Guard against auth race: ensure a real session is attached to the
      // supabase client before issuing the RLS-gated query. On hard refresh,
      // the client may briefly fire requests without an Authorization header,
      // which causes the query to fail with no rows / 401 and surfaces a
      // misleading "Couldn't load intelligence" error.
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Wait briefly and re-check once — session restore may still be in flight.
        await new Promise((r) => setTimeout(r, 500));
        ({ data: { session } } = await supabase.auth.getSession());
      }
      if (!session) {
        console.log("[HomeTab] trends: no session yet, skipping (will retry when auth ready)");
        // Leave loading=true so the skeleton stays; the auth effect will re-fire.
        return;
      }
      didAttempt = true;
      // Only show real signals: must have a final_score AND a stored snapshot.
      // Legacy backfilled rows (final_score=0, no content_markdown) are excluded.
      const { data, error } = await withTimeout(
        supabase
          .from("industry_trends")
          .select("id, headline, insight, url, source, fetched_at, last_checked_at, status, validation_score, relevance_score, topic_relevance_score, final_score, selection_reason, category, impact_level, confidence_level, decision_label, signal_type, opportunity_type, action_recommendation, content_markdown")
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

      // ── Background staleness check (silent, fire-and-forget) ──
      // If newest trend is >20h old, or there are no trends, kick off a
      // light refresh. The realtime subscription will surface new rows.
      try {
        const rows = (data || []) as Array<{ fetched_at?: string | null }>;
        const STALE_MS = 20 * 60 * 60 * 1000;
        let shouldRefresh = false;
        if (rows.length === 0) {
          shouldRefresh = true;
        } else {
          const newestTs = rows.reduce((max, r) => {
            const t = r.fetched_at ? new Date(r.fetched_at).getTime() : 0;
            return t > max ? t : max;
          }, 0);
          if (newestTs === 0 || Date.now() - newestTs > STALE_MS) {
            shouldRefresh = true;
          }
        }
        if (shouldRefresh) {
          supabase.functions
            .invoke("fetch-industry-trends", { body: { mode: "light" } })
            .catch((e) => console.warn("[HomeTab] background trends refresh failed", e));
        }
      } catch (e) {
        console.warn("[HomeTab] staleness check error", e);
      }
    } catch (e) {
      console.error("[HomeTab] trends load failed", e);
      if (didAttempt) setTrendsError(true);
    } finally {
      if (didAttempt) setTrendsLoading(false);
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

  const loadCompetitorAlert = useCallback(async (uid: string) => {
    try {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
      const [trendsRes, signalRes, postRes] = await Promise.all([
        supabase
          .from("industry_trends")
          .select("headline, source, url, fetched_at")
          .eq("user_id", uid)
          .gte("fetched_at", seventyTwoHoursAgo)
          .order("fetched_at", { ascending: false })
          .limit(20),
        supabase
          .from("strategic_signals")
          .select("signal_title, fragment_count")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("linkedin_posts")
          .select("published_at")
          .eq("user_id", uid)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const topSig = signalRes.data;
      if (!topSig?.signal_title) return;

      const competitorTrend = (trendsRes.data || []).find((t: any) => {
        const src = (t.source || "").toLowerCase();
        return COMPETITOR_KEYWORDS.some(k => src.includes(k));
      });
      if (!competitorTrend) return;

      // Keyword overlap (>4 chars) between headline and signal title
      const headlineWords = new Set(
        (competitorTrend.headline || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w: string) => w.length > 4),
      );
      const sigWords = (topSig.signal_title || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w: string) => w.length > 4);
      const hasOverlap = sigWords.some(w => headlineWords.has(w));
      if (!hasOverlap) return;

      // Days since last post
      const lastPost = postRes.data?.published_at;
      const daysSinceLastPost = lastPost
        ? Math.floor((Date.now() - new Date(lastPost).getTime()) / 86400_000)
        : 30;

      // Identify competitor display name from source
      const srcLower = (competitorTrend.source || "").toLowerCase();
      const matchedKey = COMPETITOR_KEYWORDS.find(k => srcLower.includes(k)) || competitorTrend.source;
      const competitorName = matchedKey
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      const topicRaw = (competitorTrend.headline || "").trim();
      const topic = topicRaw.length > 60 ? topicRaw.slice(0, 60).trimEnd() + "…" : topicRaw;

      setCompetitorAlert({
        competitorName,
        topic,
        url: competitorTrend.url,
        fetchedAt: competitorTrend.fetched_at,
        signalTitle: topSig.signal_title,
        fragmentCount: topSig.fragment_count ?? 0,
        daysSinceLastPost,
      });
    } catch (e) {
      console.warn("[HomeTab] competitor alert load failed", e);
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
      setProfileLoaded(true);
      return;
    }
    // SESSION GUARD: do not fetch until we have a confirmed access token.
    // Without this, the supabase client may fire requests before the
    // session is restored, causing RLS queries to fail on first login.
    if (!authSession?.access_token) {
      console.log("[HomeTab] waiting for access_token before fetching");
      return;
    }
    const uid = authUser.id;

    // Resolve display name (profile fetch sits inside the session guard so
    // the RLS query has a valid Authorization header on first login).
    (async () => {
      const meta: any = authUser.user_metadata || {};
      let name = meta.first_name || meta.full_name || meta.name || "";
      try {
        const { data } = await withTimeout(
          supabase
            .from("diagnostic_profiles")
            .select("first_name, sector_focus")
            .eq("user_id", uid)
            .maybeSingle(),
          8000,
        );
        if (data?.first_name) name = data.first_name;
        if ((data as any)?.sector_focus) setSectorFocus((data as any).sector_focus);
      } catch (e) {
        console.warn("[HomeTab] profile name fetch failed", e);
      }
      const raw = (name || "").toString().trim();
      let chosen = raw ? raw.split(/\s+/)[0] : "";
      if (!chosen && authUser.email) {
        chosen = authUser.email.split("@")[0];
      }
      const pretty = chosen
        ? chosen.charAt(0).toUpperCase() + chosen.slice(1).toLowerCase()
        : "";
      setUserName(pretty);
      setProfileLoaded(true);
    })();

    // Fire all section loaders in parallel via allSettled so a single
    // failure doesn't block the others.
    Promise.allSettled([
      loadBriefing(uid),
      loadMoves(uid),
      loadTrends(uid),
      loadTrendsBadge(uid),
        loadCompetitorAlert(uid),
    ]);

    // J4 — Compute "You're caught up" eligibility (resets per calendar day).
    (async () => {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

        const [movesTodayRes, sigCountRes, recentEntryRes] = await Promise.all([
          supabase
            .from("recommended_moves")
            .select("id, status")
            .eq("user_id", uid)
            .gte("created_at", startOfDay.toISOString()),
          supabase
            .from("strategic_signals")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .eq("status", "active"),
          supabase
            .from("entries")
            .select("id")
            .eq("user_id", uid)
            .gte("created_at", sevenDaysAgo)
            .limit(1),
        ]);

        const movesToday = movesTodayRes.data || [];
        const allActed =
          movesToday.length > 0 &&
          movesToday.every(
            (m: any) => m.status === "completed" || m.status === "dismissed",
          );
        const hasRecentCapture = (recentEntryRes.data || []).length > 0;
        setWatchingSignalsCount(sigCountRes.count || 0);
        setCaughtUpReady(allActed && hasRecentCapture);
      } catch (e) {
        console.warn("[HomeTab] caught-up check failed", e);
      }
    })();

    // J13 — New signal banner: most recent active signal in last 24h, not seen.
    (async () => {
      try {
        const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
        const { data } = await supabase
          .from("strategic_signals")
          .select("id, signal_title")
          .eq("user_id", uid)
          .eq("status", "active")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        let seen: string[] = [];
        try { seen = JSON.parse(localStorage.getItem("aura_seen_signals") || "[]"); } catch {}
        const fresh = (data || []).find((s: any) => !seen.includes(s.id));
        if (fresh) {
          // First signal revelation — only ever once
          let isFirst = false;
          try {
            const firstSeen = localStorage.getItem("aura_first_signal_seen");
            if (!firstSeen) {
              const { count: totalSig } = await supabase
                .from("strategic_signals")
                .select("id", { count: "exact", head: true })
                .eq("user_id", uid);
              if ((totalSig ?? 0) === 1) isFirst = true;
            }
          } catch {}
          setNewSignal({ id: fresh.id, signal_title: fresh.signal_title, isFirst });
          setTimeout(() => setBannerVisible(true), 50);
        }
      } catch (e) {
        console.warn("[HomeTab] new signal banner check failed", e);
      }
    })();

    // Return-state greeting: if last visit > 3 days ago, show welcome-back line.
    (async () => {
      try {
        const key = "aura_last_visit";
        const prev = localStorage.getItem(key);
        const nowMs = Date.now();
        if (prev) {
          const days = Math.floor((nowMs - parseInt(prev, 10)) / 86_400_000);
          if (days >= 3) {
            const { count: fadingCount } = await supabase
              .from("strategic_signals")
              .select("id", { count: "exact", head: true })
              .eq("user_id", uid)
              .in("velocity_status", ["fading", "dormant"]);
            setReturnGreeting({ days, fadingCount: fadingCount ?? 0 });
          }
        }
        localStorage.setItem(key, String(nowMs));
      } catch {}
    })();

    // Load aura score for the status strip + primary card
    (async () => {
      try {
        await supabase.auth.getSession();
        const { data: res, error } = await supabase.functions.invoke("calculate-aura-score", { body: {} });
        if (!error && res) setAuraData(res as AuraScoreData);
      } catch (e) {
        console.warn("[HomeTab] aura score load failed", e);
      } finally {
        setAuraLoading(false);
      }
    })();

    // Realtime: reload trends list whenever Phase B updates a row to status='new'
    const channel = supabase
      .channel(`industry_trends_${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "industry_trends", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row: any = payload.new;
          if (row?.status === "new" && row?.content_markdown) {
            loadTrends(uid);
            loadTrendsBadge(uid);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authReady, authUser, authSession?.access_token, loadBriefing, loadMoves, loadTrends, loadTrendsBadge]);

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
      parts.push({ text: "publishing window open right now", color: SIGNAL });
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
    const result = await wireTrendToSignals(trend);
    if (result.ok) {
      toast.success(`Added to ${result.signalTitle} — fragment count now ${result.newCount}`);
    } else {
      toast.error("Couldn't add to signals — try again");
    }
  };

  const dismissTrend = (id: string) => {
    setDismissedTrendIds(prev => new Set(prev).add(id));
  };

  const handleRefreshTrends = async () => {
    if (refreshingTrends || !authUser) return;
    setRefreshingTrends(true);
    try {
      // 1. Record the newest fetched_at before refresh.
      // (Counting rows is unreliable because fetch-industry-trends caps
      // active trends at 5 — count stays flat even when rows are replaced.)
      const { data: newestBefore } = await supabase
        .from("industry_trends")
        .select("fetched_at")
        .eq("user_id", authUser.id)
        .eq("status", "new")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const newestBeforeTimestamp = newestBefore?.fetched_at ?? null;

      // 2. Call edge function (Phase A — returns quickly)
      toast.loading("Finding new trends...", { id: "refresh-trends" });
      const { error } = await supabase.functions.invoke("fetch-industry-trends", {
        body: { mode: "full" },
      });
      if (error) {
        console.error("[HomeTab] refresh trends failed", error);
        toast.error("Refresh failed — try again in a moment", { id: "refresh-trends" });
        return;
      }

      // 3. Wait for Phase B to complete (~30s async enrichment)
      toast.loading("Enriching trends — just a moment...", { id: "refresh-trends" });
      await new Promise(resolve => setTimeout(resolve, 32000));

      // 4. Re-query and compare
      const { data: freshTrends } = await supabase
        .from("industry_trends")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("status", "new")
        .order("final_score", { ascending: false })
        .limit(10);

      // 5. Update feed with fresh data
      setDismissedTrendIds(new Set());
      setTrends((freshTrends as any) || []);
      loadTrendsBadge(authUser.id);

      // 6. Toast based on whether any returned row is newer than the
      // pre-refresh newest timestamp.
      const hasNewTrends = (freshTrends || []).some(
        (t: any) => newestBeforeTimestamp === null || t.fetched_at > newestBeforeTimestamp
      );
      if (hasNewTrends) {
        toast.success("Trends refreshed", { id: "refresh-trends" });
      } else {
        toast("Feed is up to date", { id: "refresh-trends", icon: "✓" });
      }
    } catch (e) {
      console.error("[HomeTab] refresh trends exception", e);
      toast.error("Refresh failed — try again in a moment", { id: "refresh-trends" });
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
  // ─── New-user empty states ───
  // When the user has 0 captures AND 0 signals → show pure welcome.
  // When they have captures but no signals yet → show "intelligence is building".
  // Both replace the entire dashboard so we never show fake metrics.
  const noEntries = entriesLoaded && entries!.length === 0;
  const hasSignals = !!topSignal;
  const dataReady = profileLoaded && !briefLoading && entriesLoaded;
  const showWelcomeState = dataReady && noEntries && !hasSignals;
  const showBuildingState = dataReady && entriesLoaded && entries!.length > 0 && !hasSignals;

  if (showWelcomeState || showBuildingState) {
    const captureCount = entries?.length ?? 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-6 max-w-3xl"
      >
        <header className="pt-1">
          <div
            className="text-muted-foreground"
            style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}
          >
            {getGreeting(now.getHours())}{userName ? `, ${userName}` : ""}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
              fontSize: 34,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {showWelcomeState ? "Welcome to Aura" : "Your intelligence is building"}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--ink-3)",
              marginTop: 10,
              lineHeight: 1.6,
              maxWidth: 560,
            }}
          >
            {showWelcomeState
              ? "Your strategic intelligence OS is ready. Here's how to activate it."
              : `You've captured ${captureCount} ${captureCount === 1 ? "article" : "articles"}. Aura is analyzing them for strategic patterns. Signals typically emerge after 3–5 captures from different sources.`}
          </p>
        </header>

        {showWelcomeState ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              {
                n: 1,
                title: "Capture your first article",
                body: "Paste a URL of something you read this week — an industry report, a LinkedIn post, a news article about your sector. Aura will extract the intelligence from it.",
                cta: true,
              },
              {
                n: 2,
                title: "Watch your signals emerge",
                body: "After 3–5 captures, Aura detects strategic patterns and builds your signal map.",
              },
              {
                n: 3,
                title: "Generate your first post",
                body: "Once signals exist, Aura creates authority content in your voice, grounded in your real intelligence.",
              },
            ].map((step) => (
              <div
                key={step.n}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "16px 18px",
                  border: "1px solid hsl(var(--border) / 0.6)",
                  background: "hsl(var(--card))",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "1px solid var(--brand-line)",
                    color: "var(--brand)",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {step.n}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                    {step.title}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, lineHeight: 1.55 }}>
                    {step.body}
                  </p>
                  {step.cta && (
                    <div style={{ marginTop: 12 }}>
                      <AuraButton
                        variant="primary"
                        size="sm"
                        onClick={() => onOpenCapture?.()}
                        style={{ borderRadius: 4, padding: "8px 18px" }}
                      >
                        Capture your first article →
                      </AuraButton>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <AuraButton
                variant="primary"
                size="sm"
                onClick={() => onOpenCapture?.()}
                style={{ borderRadius: 4, padding: "8px 18px" }}
              >
                Capture another article →
              </AuraButton>
            </div>
            <div
              style={{
                border: "1px solid hsl(var(--border) / 0.6)",
                background: "hsl(var(--card))",
                borderRadius: 10,
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                Your captures
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {(entries || []).slice(0, 8).map((e: any) => (
                  <li
                    key={e.id}
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2, var(--ink))",
                      lineHeight: 1.45,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    • {e.title || e.url || e.content?.slice(0, 80) || "Untitled capture"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-3xl"
    >
      {/* Onboarding checklist (auto-hides once all 5 steps complete) */}
      <OnboardingChecklist onOpenCapture={onOpenCapture} onSwitchTab={onSwitchTab} />

      {/* Hide first-visit hint while the persistent welcome card is the
          primary onboarding — or while we don't yet know whether welcome
          will appear (slow profile/entries load). Once the user dismisses
          welcome, the hint will appear on the next page load. Never both
          at once. See FirstVisitHint regression guard. */}
      <FirstVisitHint page="home" suppress={suppressHint} />

      {/* Milestone notification (G7) — shows newly_earned from calculate-aura-score */}
      <MilestoneNotification userId={authUser?.id ?? null} />

      {/* O-2b — Tier transition ceremony (modal renders when unacknowledged tier_* exists) */}
      <TierCeremonyModal userId={authUser?.id ?? null} />

      {/* M3-4 — identity drift suggestion (frontend-only, session-scoped) */}
      <IdentityDriftBanner />

      {/* Score-jump celebratory banner — appears when score grew 10+ pts vs last week */}
      {!scoreJumpDismissed && auraData && (auraData.score_trend ?? 0) >= 10 && (
        <div
          role="status"
          style={{
            background: "var(--brand-ghost, hsl(43 50% 55% / 0.08))",
            borderLeft: "3px solid var(--brand)",
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
            <span style={{ marginRight: 6 }}>✨</span>
            Your score jumped <strong style={{ color: "var(--brand)" }}>{auraData.score_trend} points</strong> this week!{" "}
            <ShareLink
              label="Share your progress →"
              ariaLabel="Share your score progress on LinkedIn"
              onClick={() => {
                const dateLabel = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
                setScoreJumpShareData({
                  name: `+${auraData.score_trend} points this week`,
                  context: `Aura score ${auraData.aura_score}/100 · ${auraData.tier_name}${sectorFocus ? ` · ${sectorFocus}` : ""}`,
                  earnedAt: new Date().toISOString(),
                  icon: "✦",
                  firstName: userName,
                  level: auraData.tier_name,
                  sectorFocus,
                });
                console.log(`[HomeTab] score-jump share for week of ${dateLabel}`);
              }}
            />
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              localStorage.setItem(`aura_score_jump_dismissed_${weekKey}`, "true");
              setScoreJumpDismissed(true);
            }}
            style={{
              background: "transparent", border: 0, cursor: "pointer",
              color: "var(--ink-4)", fontSize: 16, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* SECTION 1 — Header bar */}
      <header className="flex items-end justify-between gap-3 pt-1">
        <div>
          <div className="text-foreground" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {fmtTime(now)}
          </div>
          <div data-testid="home-greeting" className="text-muted-foreground" style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
            {getGreeting(now.getHours())}{profileLoaded && userName ? `, ${userName}` : ""}
          </div>
          {returnGreeting && (
            <div
              data-testid="home-return-greeting"
              style={{
                fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
                fontSize: 16,
                color: "var(--ink-2, var(--ink))",
                marginTop: 8,
                lineHeight: 1.4,
                maxWidth: 540,
              }}
            >
              Welcome back{userName ? `, ${userName}` : ""}.
              {returnGreeting.fadingCount > 0 ? (
                <> While you were away, {returnGreeting.fadingCount} signal{returnGreeting.fadingCount === 1 ? "" : "s"} shifted. Here's what needs your attention.</>
              ) : (
                <> It's been {returnGreeting.days} days. Aura kept watching.</>
              )}
            </div>
          )}
        </div>
{/* Removed "X this week" badge — refresh control lives in the Live Intelligence section */}
      </header>

      {/* H2b — STATUS STRIP */}
      {/* Full-strip skeleton: cover score, tier, sector, AND the right-side
          weekly rhythm grid so users never see partial flashes (e.g. tier
          label appearing before the rhythm cells). */}
      {auraLoading && !auraData && (
        <div
          className="flex items-start justify-between gap-4 flex-wrap"
          aria-busy="true"
          aria-label="Loading authority status"
          style={{
            borderBottom: "1px solid hsl(var(--border) / 0.5)",
            paddingBottom: 16,
            marginBottom: 8,
          }}
        >
          {/* Left: score + tier + sector skeletons */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            {/* Score number skeleton */}
            <div
              style={{
                width: 56,
                height: 32,
                borderRadius: 4,
                background: "hsl(var(--muted) / 0.4)",
                animation: "pulse 1.6s ease-in-out infinite",
              }}
            />
            {/* Tier name skeleton */}
            <div
              style={{
                width: 110,
                height: 14,
                borderRadius: 3,
                background: "hsl(var(--muted) / 0.35)",
                animation: "pulse 1.6s ease-in-out infinite",
                animationDelay: "120ms",
              }}
            />
            {/* Sector subtext skeleton (always reserved to keep layout stable) */}
            <div
              style={{
                width: 140,
                height: 11,
                borderRadius: 3,
                background: "hsl(var(--muted) / 0.3)",
                animation: "pulse 1.6s ease-in-out infinite",
                animationDelay: "240ms",
              }}
            />
          </div>

          {/* Right: weekly rhythm grid skeleton (12 cells + counter) */}
          <div className="flex flex-col items-end" style={{ gap: 6 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: "hsl(var(--muted) / 0.3)",
                    animation: "pulse 1.6s ease-in-out infinite",
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                width: 48,
                height: 11,
                borderRadius: 3,
                background: "hsl(var(--muted) / 0.3)",
                animation: "pulse 1.6s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      )}
      {!auraLoading && isEmpty && (
        <div
          className="flex items-start justify-between gap-4 flex-wrap"
          style={{
            borderBottom: "1px solid hsl(var(--border) / 0.5)",
            paddingBottom: 16,
            marginBottom: 8,
          }}
        >
          <div className="flex flex-col" style={{ gap: 2 }}>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "var(--ink-3)",
                  lineHeight: 1,
                }}
              >
                —
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--brand)" }}>
              Starting
            </div>
            {sectorFocus && (
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                {sectorFocus}
              </div>
            )}
          </div>
        </div>
      )}
      {!auraLoading && !isEmpty && auraData && (() => {
        const trend = auraData.score_trend;
        const cells = (auraData.weekly_rhythm?.weekly_data || []).slice(-12);
        while (cells.length < 12) cells.unshift(false);
        const activeWeeks = auraData.weekly_rhythm?.active_weeks ?? cells.filter(Boolean).length;
        return (
          <div
            className="flex items-start justify-between gap-4 flex-wrap"
            style={{
              borderBottom: "1px solid hsl(var(--border) / 0.5)",
              paddingBottom: 16,
              marginBottom: 8,
            }}
          >
            <div className="flex flex-col" style={{ gap: 2 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                <span
                  data-testid="home-score"
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 36,
                    fontWeight: 700,
                    color: "hsl(var(--foreground))",
                    lineHeight: 1,
                  }}
                >
                  {auraData.aura_score}
                </span>
                <InfoTooltip side="bottom" align="left" label="Authority Score" width={280}>
                  <div data-testid="home-score-breakdown" style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Authority Score</div>
                  <p style={{ margin: "0 0 4px" }}>Signal intelligence — 40%</p>
                  <p style={{ margin: "0 0 4px" }}>Content authority — 40%</p>
                  <p style={{ margin: "0 0 8px" }}>Capture consistency — 20%</p>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>
                    Observer → Strategist → Authority
                  </div>
                </InfoTooltip>
                {trend !== null && trend !== undefined && trend !== 0 && (
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, marginLeft: 4,
                      color: trend > 0 ? "var(--success)" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {trend > 0 ? "↑" : "↓"} {Math.abs(trend)} pts
                  </span>
                )}
              </div>
              <div data-testid="home-tier" style={{ fontSize: 13, fontWeight: 500, color: "var(--brand)" }}>
                {auraData.tier_name}
              </div>
              {sectorFocus && (
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  {sectorFocus}
                </div>
              )}
            </div>

            <div data-testid="home-capture-rhythm" className="flex flex-col items-end" style={{ gap: 6 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {cells.map((filled, i) => (
                  <div
                    key={i}
                    aria-label={`Week ${i + 1}: ${filled ? "active" : "inactive"}`}
                    style={{
                      width: 14, height: 14, borderRadius: 3,
                      background: filled ? "var(--brand)" : "transparent",
                      border: filled ? "1px solid var(--brand)" : "1px solid var(--brand-line)",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center" style={{ gap: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                <span>{activeWeeks}/12w</span>
                <button
                  type="button"
                  aria-label="About capture rhythm"
                  onClick={(e) => { e.stopPropagation(); setRhythmTooltipOpen(o => !o); }}
                  style={{
                    background: "transparent", border: 0, padding: 0,
                    cursor: "pointer", color: "hsl(var(--muted-foreground))",
                    display: "inline-flex", alignItems: "center", position: "relative",
                  }}
                >
                  <HelpCircle size={12} strokeWidth={1.75} />
                  {rhythmTooltipOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", bottom: "calc(100% + 8px)", right: 0,
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6, padding: 10,
                        fontSize: 11, lineHeight: 1.5, fontWeight: 400,
                        width: 280, maxWidth: 280, textAlign: "left",
                        zIndex: 50,
                        boxShadow: "0 4px 14px hsl(var(--background) / 0.4)",
                      }}
                    >
                      <strong>Capture Rhythm:</strong> Each square = one week. Filled = at least one meaningful capture. {activeWeeks} of 12 weeks active.
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Weekly LinkedIn data reminder — appears when LinkedIn data is 7+ days stale */}
      <WeeklyIntelligenceLoopCard onSwitchTab={onSwitchTab} />

      {/* Silence Alarm — substance-backed urgency when capture has paused 3+ days */}
      <div data-testid="home-silence-alarm">
        <SilenceAlarm
          daysSinceCapture={daysSinceCapture}
          onOpenCapture={onOpenCapture}
          onSwitchTab={onSwitchTab}
        />
      </div>

      {/* Persistent welcome card — shows for users with < 3 entries, dismissible */}
      {showWelcome && (
        <div
          role="status"
          data-onboarding="welcome-card"
          style={{
            background: "var(--brand-ghost)",
            borderLeft: "3px solid var(--brand)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            opacity: welcomeLeaving ? 0 : 1,
            transform: welcomeLeaving ? "translateY(-8px)" : "translateY(0)",
            transition: "opacity 300ms ease, transform 300ms ease",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
              Welcome to Aura{userName ? `, ${userName}` : ""}
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, lineHeight: 1.5 }}>
              Capture your first article to see your intelligence engine at work. Need help? Click the ? icon in the top-right corner.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissWelcome}
            aria-label="Dismiss welcome message"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* H2b — DYNAMIC PRIMARY CARD */}
      {!isEmpty && (<>
      {newSignal && (
        newSignal.isFirst ? (
          <div
            style={{
              background: "var(--brand-ghost)",
              border: "1px solid var(--brand)",
              borderRadius: 14,
              padding: "20px 22px",
              marginBottom: 14,
              opacity: bannerVisible ? 1 : 0,
              transform: bannerVisible ? "translateY(0)" : "translateY(-8px)",
              transition: "all 400ms ease",
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--brand)", fontWeight: 600, marginBottom: 8 }}>
              ✦ Revelation
            </div>
            <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond', serif)", fontSize: 22, color: "var(--ink)", lineHeight: 1.2, marginBottom: 6 }}>
              Your first signal has emerged.
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>
              {newSignal.signal_title}
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
              Aura found this pattern in what you captured. This is the market theme where your intelligence runs deepest. Capture more on this topic to strengthen it.
            </p>
            <button
              onClick={() => {
                try {
                  localStorage.setItem("aura_first_signal_seen", "true");
                  const seen = JSON.parse(localStorage.getItem("aura_seen_signals") || "[]");
                  if (!seen.includes(newSignal.id)) seen.push(newSignal.id);
                  localStorage.setItem("aura_seen_signals", JSON.stringify(seen));
                } catch {}
                onSwitchTab?.("intelligence");
                setNewSignal(null);
              }}
              style={{
                background: "var(--brand)", color: "var(--ink-on-brand, #1a160f)",
                border: "none", borderRadius: 8, padding: "9px 16px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              See this signal →
            </button>
          </div>
        ) : (
        <div
          style={{
            background: "var(--brand-ghost)",
            border: "1px solid var(--brand-line)",
            borderRadius: 10,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            opacity: bannerVisible ? 1 : 0,
            transform: bannerVisible ? "translateY(0)" : "translateY(-8px)",
            transition: "all 400ms ease",
          }}
        >
          <span aria-hidden style={{ color: "var(--brand)", fontSize: 16, lineHeight: 1 }}>✦</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            New signal detected: {newSignal.signal_title}
          </span>
          <button
            onClick={() => {
              try {
                const seen = JSON.parse(localStorage.getItem("aura_seen_signals") || "[]");
                if (!seen.includes(newSignal.id)) seen.push(newSignal.id);
                localStorage.setItem("aura_seen_signals", JSON.stringify(seen));
              } catch {}
              onSwitchTab?.("intelligence");
              setNewSignal(null);
            }}
            style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0 }}
          >
            View →
          </button>
          <button
            aria-label="Dismiss"
            onClick={() => {
              try {
                const seen = JSON.parse(localStorage.getItem("aura_seen_signals") || "[]");
                if (!seen.includes(newSignal.id)) seen.push(newSignal.id);
                localStorage.setItem("aura_seen_signals", JSON.stringify(seen));
              } catch {}
              setBannerVisible(false);
              setTimeout(() => setNewSignal(null), 250);
            }}
            style={{ background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        )
      )}
      <div data-testid="home-moves">
      <SectionHeader
        label="RECOMMENDED MOVES"
        subtitle="Actions Aura suggests based on your latest signals"
      />
      {(() => {
        const alarmFresh = competitorAlert && !alarmDismissed &&
          (Date.now() - new Date(competitorAlert.fetchedAt).getTime()) < 48 * 3_600_000;

        // Priority 1 — alarm card
        if (alarmFresh) {
          if (!alarmEducationSeen) {
            try { localStorage.setItem("aura_alarm_seen", "true"); } catch {}
            // defer state update
            setTimeout(() => setAlarmEducationSeen(true), 0);
          }
          return (
            <div
              style={{
                background: "#1A1916",
                border: "1px solid hsl(var(--border) / 0.4)",
                borderRadius: 8,
                padding: "16px 18px",
                color: "#fff",
              }}
            >
              {/* Zone 1 */}
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--danger)", fontWeight: 600 }}>
                    Competitor alert
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {competitorTimeAgo(competitorAlert!.fetchedAt)}
                </span>
              </div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                They published
              </div>
              <div style={{ fontSize: 15, color: "#fff", lineHeight: 1.4, fontWeight: 500 }}>
                {competitorAlert!.topic}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                {competitorAlert!.competitorName}
              </div>

              {/* Zone 2 */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "14px 0 10px" }} />
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                Your signal on this topic
              </div>
              <div style={{ fontSize: 13, color: "var(--brand)", fontWeight: 500 }}>
                {competitorAlert!.signalTitle}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                {competitorAlert!.fragmentCount} fragments · {topSignal ? Math.round((topSignal.confidence || 0) * 100) : 0}% confidence · {competitorAlert!.daysSinceLastPost} days since you published
              </div>

              {/* Zone 3 */}
              <div className="flex items-center" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
                <AuraButton variant="signal" size="sm" onClick={() => navigate("/publish")}>
                  Publish now →
                </AuraButton>
                {competitorAlert!.url && (
                  <button
                    onClick={() => window.open(competitorAlert!.url!, "_blank", "noopener,noreferrer")}
                    style={{
                      background: "transparent", color: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      fontSize: 12, padding: "8px 16px", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    Read their piece →
                  </button>
                )}
                <button
                  onClick={() => setAlarmDismissed(true)}
                  style={{
                    background: "transparent", color: "rgba(255,255,255,0.4)",
                    border: 0, fontSize: 11, cursor: "pointer", marginLeft: "auto",
                  }}
                >
                  Dismiss
                </button>
              </div>

              {!alarmEducationSeen && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 12, lineHeight: 1.5 }}>
                  Aura monitors industry publications and alerts you when competitors publish on your signal topics.
                </div>
              )}
            </div>
          );
        }

        // Priority 1.5 — J4 "You're caught up" signal
        if (caughtUpReady) {
          return (
            <div style={{ animation: "fade-in 400ms ease" }}>
            <AuraCard hover="none" className="text-center">
            <div style={{ padding: "12px 6px" }}>
              <div
                style={{
                  fontSize: 24,
                  color: "var(--brand)",
                  lineHeight: 1,
                  marginBottom: 10,
                }}
                aria-hidden
              >
                ✓
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                You're caught up
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-3)",
                  lineHeight: 1.5,
                  maxWidth: 460,
                  margin: "0 auto 14px",
                }}
              >
                Aura is watching {watchingSignalsCount} signal{watchingSignalsCount === 1 ? "" : "s"}. You'll see new moves when something changes.
              </div>
              <button
                onClick={() => onSwitchTab?.("intelligence")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--brand)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Explore your signals →
              </button>
            </div>
            </AuraCard>
            </div>
          );
        }

        // Priority 2 — nudge card
        if (auraData?.personalized_nudge) {
          const subs = [
            { key: "capture", value: auraData.capture_score },
            { key: "signal", value: auraData.signal_score },
            { key: "content", value: auraData.content_score },
          ].sort((a, b) => a.value - b.value);
          const weakest = subs[0].key;
          const ctaLabel = weakest === "content" ? "Draft post →" : weakest === "capture" ? "Capture now →" : "See your signals →";
          const ctaAction = weakest === "content"
            ? () => navigate("/publish")
            : weakest === "capture"
            ? () => onOpenCapture?.()
            : () => onSwitchTab?.("intelligence");
          return (
            <div
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border) / 0.6)",
                borderRadius: 8,
                padding: "16px 18px",
              }}
            >
              <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brand)", fontWeight: 600 }}>
                  Your briefing
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "hsl(var(--foreground))", margin: 0 }}>
                {auraData.personalized_nudge}
              </p>
              <div className="flex items-center" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
                <AuraButton variant="primary" size="sm" onClick={ctaAction} style={{ borderRadius: 4, padding: "7px 18px" }}>
                  {ctaLabel}
                </AuraButton>
                {weakest !== "signal" && (
                  <AuraButton variant="ghost" size="sm" onClick={() => onSwitchTab?.("intelligence")} style={{ borderRadius: 4, padding: "7px 18px" }}>
                    See your signals →
                  </AuraButton>
                )}
              </div>
            </div>
          );
        }

        // Priority 3 — promote top recommended move
        if (topMove) {
          return (
            <div
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border) / 0.6)",
                borderRadius: 8,
                padding: "16px 18px",
              }}
            >
              <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brand)", fontWeight: 600 }}>
                  Recommended move
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 4 }}>{topMove.title}</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "hsl(var(--muted-foreground))", margin: 0 }}>{topMove.rationale}</p>
              <div className="flex items-center" style={{ marginTop: 14 }}>
                <AuraButton variant="primary" size="sm" onClick={() => onSwitchTab?.("authority")} style={{ borderRadius: 4, padding: "7px 18px" }}>
                  Open this move →
                </AuraButton>
              </div>
            </div>
          );
        }
        return null;
      })()}
      </div>


      {/* Secondary moves (collapsed) */}
      {moves.length > 1 && (
        <div>
          <button
            onClick={() => setShowSecondaryMoves(s => !s)}
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 0",
            }}
          >
            {moves.length - 1} more move{moves.length - 1 === 1 ? "" : "s"}
            <ChevronDown size={14} style={{ transform: showSecondaryMoves ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
          </button>
          {showSecondaryMoves && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {moves.slice(1).map(m => (
                <div key={m.id} style={{
                  border: "1px solid hsl(var(--border) / 0.5)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  background: "hsl(var(--card))",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{m.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2 — AI daily briefing */}
      {/* Aura's Read */}
      <div data-testid="home-live-intel">
        <AurasRead
          userId={sessionConfirmed ? authUser?.id ?? null : null}
          onOpenCapture={onOpenCapture}
          onSwitchTab={onSwitchTab}
        />
      </div>
      </>)}

      <AuthorityProgressModal
        tierName={auraData?.tier_name}
        score={auraData?.aura_score ?? null}
        sectorFocus={sectorFocus}
        userId={sessionConfirmed ? authUser?.id ?? null : null}
      />
      {scoreJumpShareData && (
        <MilestoneShareModal
          open={!!scoreJumpShareData}
          onClose={() => setScoreJumpShareData(null)}
          data={scoreJumpShareData}
        />
      )}

    </motion.div>
  );
};

export default HomeTab;
