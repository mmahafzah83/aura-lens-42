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
import AuthorityJourney from "@/components/AuthorityJourney";
import WeeklyRhythm from "@/components/WeeklyRhythm";
import MilestoneNotification from "@/components/MilestoneNotification";
import InfoTooltip from "@/components/ui/InfoTooltip";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import OnboardingWizardModal from "@/components/OnboardingWizardModal";
import { addTrendToSignals as wireTrendToSignals } from "@/lib/addTrendToSignals";
import { toast } from "sonner";
import { AuraButton } from "@/components/ui/AuraButton";
import EmptyState from "@/components/ui/EmptyState";
import { Zap } from "lucide-react";

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

const HomeTab = ({ onOpenCapture, onSwitchTab }: HomeTabProps) => {
  const { user: authUser, session: authSession, isReady: authReady } = useAuthReady();
  // Session is "confirmed" only when auth restore is done AND we have an access
  // token. This is the gate for ALL data fetches — without it, RLS-protected
  // queries fire without an Authorization header and fail (the original bug).
  const sessionConfirmed = authReady && !!authSession?.access_token && !!authUser?.id;
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [userName, setUserName] = useState<string>("");
  const [profileLoaded, setProfileLoaded] = useState(false);

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

  // First-login onboarding wizard (3 steps)
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
            .select("first_name")
            .eq("user_id", uid)
            .maybeSingle(),
          8000,
        );
        if (data?.first_name) name = data.first_name;
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-3xl"
    >
      {showOnboarding && authUser?.id && (
        <OnboardingWizardModal
          open={showOnboarding}
          userId={authUser.id}
          onClose={() => setShowOnboarding(false)}
          onOpenFullCapture={onOpenCapture}
        />
      )}

      {/* Onboarding checklist (auto-hides once all 5 steps complete) */}
      <OnboardingChecklist onOpenCapture={onOpenCapture} onSwitchTab={onSwitchTab} />

      {/* Milestone notification (G7) — shows newly_earned from calculate-aura-score */}
      <MilestoneNotification userId={authUser?.id ?? null} />

      {/* SECTION 1 — Header bar */}
      <header className="flex items-end justify-between gap-3 pt-1">
        <div>
          <div className="text-foreground" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {fmtTime(now)}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
            {getGreeting(now.getHours())}{profileLoaded && userName ? `, ${userName}` : ""}
          </div>
        </div>
{/* Removed "X this week" badge — refresh control lives in the Live Intelligence section */}
      </header>

      {/* SECTION 2 — AI daily briefing */}
      {briefError && sessionConfirmed ? (
        <div className="rounded-r-lg border border-l-4" style={{ borderColor: "hsl(var(--border) / 0.5)", borderLeftColor: ACCENT, background: "hsl(var(--card))" }}>
          <SectionError onRetry={() => authUser && loadBriefing(authUser.id)} message="Couldn't load briefing. " />
        </div>
      ) : showBriefSkeleton || !sessionConfirmed ? (
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
            <AuraButton
              variant="primary"
              size="sm"
              onClick={handlePrimaryCTA}
              style={{ borderRadius: 4, padding: "7px 18px" }}
            >
              {primaryLabel}
            </AuraButton>
            <AuraButton
              variant="ghost"
              size="sm"
              onClick={() => onSwitchTab?.("intelligence")}
              style={{ borderRadius: 4, padding: "7px 18px", marginLeft: 4 }}
            >
              See your signals →
            </AuraButton>
          </div>
        </div>
      )}

      {/* Authority Journey (G5) — reads from calculate-aura-score */}
      <AuthorityJourney userId={sessionConfirmed ? authUser?.id ?? null : null} />

      {/* Weekly Rhythm (G6) — reads weekly_rhythm from calculate-aura-score */}
      <WeeklyRhythm userId={sessionConfirmed ? authUser?.id ?? null : null} />

      {/* SECTION 3 — Aura's Read */}
      {competitorAlert && (
        <div
          className="aura-alert-pulse aura-left-accent-card"
          style={{
            background: "hsl(var(--card))",
            border: "0.5px solid hsl(var(--border))",
            borderLeft: `3px solid ${RED}`,
            padding: "14px 16px",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED, display: "inline-block" }} />
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: RED, fontWeight: 500 }}>
                Competitor alert
              </span>
            </div>
            <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
              {competitorTimeAgo(competitorAlert.fetchedAt)}
            </span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "hsl(var(--foreground))", margin: 0 }}>
            {competitorAlert.competitorName} published on {competitorAlert.topic}. Your{" "}
            <span style={{ fontWeight: 600 }}>{competitorAlert.signalTitle}</span> signal is at{" "}
            <span style={{ fontWeight: 600 }}>{competitorAlert.fragmentCount} fragments</span> — your strongest position on this topic.
            {competitorAlert.daysSinceLastPost >= 3 && (
              <> You haven't published in <span style={{ fontWeight: 600 }}>{competitorAlert.daysSinceLastPost} days</span>. This is the window.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AuraButton
              variant="signal"
              size="sm"
              onClick={() => navigate("/publish")}
              style={{ borderRadius: 4, padding: "7px 18px" }}
            >
              Publish now →
            </AuraButton>
            {competitorAlert.url && (
              <button
                onClick={() => window.open(competitorAlert.url!, "_blank", "noopener,noreferrer")}
                style={{
                  border: "0.5px solid hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                  background: "transparent",
                  fontSize: 12, padding: "7px 18px", borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Read their piece →
              </button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3 — Aura's Read */}
      <AurasRead
        userId={sessionConfirmed ? authUser?.id ?? null : null}
        onOpenCapture={onOpenCapture}
        onSwitchTab={onSwitchTab}
      />

      {/* SECTION 4 — Live intelligence */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 10 }}>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground) / 0.7)", display: "inline-flex", alignItems: "center" }}>
              Live Intelligence
              <InfoTooltip
                label="Live Intelligence"
                text="Industry trends from trusted sources. Add relevant ones to your signals."
              />
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
                      background: active ? "hsl(var(--bronze) / 0.09)" : "transparent",
                      border: `0.5px solid ${active ? "var(--bronze-line)" : "hsl(var(--border))"}`,
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
        {trendsError && sessionConfirmed ? (
          <SectionError onRetry={() => authUser && loadTrends(authUser.id)} message="Couldn't load intelligence. " />
        ) : showTrendsSkeleton || !sessionConfirmed ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : trendsLoading && trends.length === 0 ? (
          <div className="min-h-[80px]" aria-busy="true" />
        ) : visibleTrends.length === 0 ? (
          trends.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="Your intelligence dashboard comes alive as you feed it."
              description="Start by capturing something about {sector} you read today."
              personalize
              ctaLabel="Capture your first source"
              ctaAction={() => onOpenCapture?.()}
            />
          ) : (
            <div className="rounded-lg border border-dashed text-center" style={{ borderColor: "hsl(var(--border))", padding: "24px 16px" }}>
              <div style={{ fontSize: 12, color: "hsl(var(--foreground))" }}>No trends match this filter</div>
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>Try a different filter or reset to top picks</div>
            </div>
          )
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
                        · {timeAgo(t.last_checked_at || t.fetched_at)}
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
                          style={{ border: "0.5px solid var(--bronze-line)", color: ACCENT, background: "transparent", fontSize: 10, padding: "3px 10px", borderRadius: 3, cursor: "pointer" }}
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
