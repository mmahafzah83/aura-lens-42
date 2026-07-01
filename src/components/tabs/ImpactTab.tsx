import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Loader2, ExternalLink, Sparkles, Check, BarChart3, ChevronDown, Info, HelpCircle, TrendingUp, Lock, Clock, RefreshCw, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { EMPTY_STATE } from "@/constants/language";
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { safeQuery } from "@/lib/safeQuery";
import { applyPublishedFilter, filterPublishedRows, CATALOG_EXCLUDED_STATUSES } from "@/lib/postProvenance";
import { ScoreRing } from "@/components/ui/ScoreRing";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { FirstTimeHint } from "@/components/FirstTimeHint";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AuraButton } from "@/components/ui/AuraButton";
import { useCountUp } from "@/hooks/useCountUp";
import { runPostImportPipeline, type PipelineState, PIPELINE_LABELS } from "@/lib/runPostImportPipeline";
import AuthorityJourney from "@/components/AuthorityJourney";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import MarketMirror from "@/components/MarketMirror";
import { useTierFromImprint } from "@/hooks/useTierFromImprint";

/* ── Types ── */
interface Snapshot {
  score: number;
  components: {
    capture_score?: number;
    content_score?: number;
    signal_score?: number;
  };
  created_at: string;
}

interface PostMetricRow {
  post_id: string | null;
  impressions: number;
  reactions: number;
  engagement_rate: number;
  snapshot_date: string;
  post?: {
    title: string | null;
    post_text: string | null;
    post_url: string | null;
    published_at: string | null;
  } | null;
}

interface FollowerRow {
  snapshot_date: string;
  followers: number;
  follower_growth: number;
  impressions?: number;
  engagement_rate?: number;
}

type RangeDays = 7 | 30 | 90 | 365;

/* ── Helpers ── */
const fmtDateShort = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysBetween = (a: Date, b: Date) => {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const formatCompact = (n: number): string => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
};

const formatNumber = (n: number) => n.toLocaleString("en-US");

/* Tier-specific engagement benchmark by follower count */
const tierBenchmark = (followers: number | null): { low: number; high: number; label: string } => {
  const f = followers ?? 0;
  if (f < 1000) return { low: 5, high: 10, label: "under 1K" };
  if (f < 10000) return { low: 3, high: 7, label: "1K–10K" };
  if (f < 50000) return { low: 1.5, high: 4, label: "10K–50K" };
  return { low: 0.5, high: 2, label: "50K+" };
};

/* ── Component ── */
interface ImpactTabProps {
  onOpenCapture?: () => void;
}
const ImpactTab = ({ onOpenCapture }: ImpactTabProps = {}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState<RangeDays>(90);

  const [userId, setUserId] = useState<string | null>(null);
  const [auraData, setAuraData] = useState<any>(null);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [captureRows, setCaptureRows] = useState<{ created_at: string }[]>([]);
  const [capturesThisMonth, setCapturesThisMonth] = useState(0);
  const [lastCaptureAll, setLastCaptureAll] = useState<Date | null>(null);
  const [totalCaptureCount, setTotalCaptureCount] = useState<number | null>(null);

  const [topSignal, setTopSignal] = useState<string | null>(null);

  const [postMetricsCount, setPostMetricsCount] = useState(0);
  const [windowedPostCount, setWindowedPostCount] = useState(0);
  const [topPosts, setTopPosts] = useState<PostMetricRow[]>([]);

  const [followerRows, setFollowerRows] = useState<FollowerRow[]>([]);
  const [latestFollowers, setLatestFollowers] = useState<number | null>(null);
  const [latestSnapshotDate, setLatestSnapshotDate] = useState<string | null>(null);
  const [showUpdateUpload, setShowUpdateUpload] = useState(false);
  const [sectorFocus, setSectorFocus] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    narrative: true, forces: true, content: true, posts: true, linkedin: true, followers: true, audience: true,
  });
  const toggleSection = (k: string) => setOpenSections(s => ({ ...s, [k]: !s[k] }));
  // Progressive disclosure: hide everything past "three forces" behind a master toggle.
  const [showDetailed, setShowDetailed] = useState(false);
  const [publishedPosts, setPublishedPosts] = useState<{ published_at: string; post_text: string | null }[]>([]);
  const [periodImpressions, setPeriodImpressions] = useState<number | null>(null);
  const [periodEngagementRate, setPeriodEngagementRate] = useState<number | null>(null);
  const [postLevelImpressions, setPostLevelImpressions] = useState<number | null>(null);

  // Prior-period comparison (vs. previous window of equal length)
  const [priorImpressions, setPriorImpressions] = useState<number | null>(null);
  const [priorEngagementRate, setPriorEngagementRate] = useState<number | null>(null);
  const [priorNewFollowers, setPriorNewFollowers] = useState<number | null>(null);
  // Cumulative impressions series for the "Impressions over time" chart
  const [impressionsSeries, setImpressionsSeries] = useState<Array<{
    date: string; label: string; daily: number; cumulative: number;
  }>>([]);

  // 4 Pillars supplementary data
  const [pillarSignalCount, setPillarSignalCount] = useState(0);
  const [pillarAvgSignalConf, setPillarAvgSignalConf] = useState(0);
  const [pillarWeeksActive, setPillarWeeksActive] = useState(0);

  // Peak score in last 30 days (always — regardless of filter — for narrative)
  const [peakScore30, setPeakScore30] = useState<number | null>(null);
  const [peakDate30, setPeakDate30] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [importedCount, setImportedCount] = useState<{ posts: number; days: number } | null>(null);
  const [showSuccessCard, setShowSuccessCard] = useState(false);
  const [successData, setSuccessData] = useState<{ posts: number; demographics: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Sync ribbon + Refresh-now
  const [syncMeta, setSyncMeta] = useState<{ connected: boolean; lastSyncedAt: string | null }>({
    connected: false,
    lastSyncedAt: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Computed 365-day impressions sum (replaces removed total_impressions_annual column)
  const [annualImpressions, setAnnualImpressions] = useState<number | null>(null);
  // Most recent imported_at across audience_demographics
  const [importedAt, setImportedAt] = useState<string | null>(null);

  // Content performance
  const [contentPerf, setContentPerf] = useState<{
    postCount: number;
    topTheme: string;
    topFormat: string;
    avgEngagement: number;
    tones: Array<{ tone: string; count: number }>;
  } | null>(null);

  // Audience
  type DemoRow = {
    category: string;
    value: string;
    percentage: string;
    percentage_numeric: number | null;
    period_start: string | null;
    period_end: string | null;
  };
  type AudienceInsight = {
    insight_headline: string;
    insight_body: string;
    audience_strengths: string[] | null;
    audience_gaps: string[] | null;
    next_action: string | null;
  };
  const [allDemographics, setAllDemographics] = useState<DemoRow[] | null>(null);
  const [audienceInsight, setAudienceInsight] = useState<AudienceInsight | null>(null);
  const [audienceInsightLoading, setAudienceInsightLoading] = useState(false);
  const [reachSnap, setReachSnap] = useState<{ members_reached: number | null; total_impressions_annual: number | null } | null>(null);

  // AI-generated section interpretations (from generate-impact-narrative EF)
  type ImpactNarrative = {
    hero_narrative: string;
    footprint_insight: string;
    content_insight: string;
    post_insight: string;
    one_action: string;
  };
  const [impactNarrative, setImpactNarrative] = useState<ImpactNarrative | null>(null);

  const loadAll = async (rangeDays: RangeDays) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - rangeDays);
    const sinceIso = sinceDate.toISOString();
    const sinceDateOnly = sinceIso.slice(0, 10);

    // Snapshots within selected range (for chart)
    const snapRes = await safeQuery(
      () => supabase
        .from("score_snapshots")
        .select("score, components, created_at")
        .eq("user_id", user.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }),
      { context: "Impact: snapshots", silent: true }
    );
    setSnapshots((snapRes.data as Snapshot[]) || []);

    // Peak score in last 30 days for narrative
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    const peakRes = await supabase
      .from("score_snapshots")
      .select("score, created_at")
      .eq("user_id", user.id)
      .gte("created_at", thirty.toISOString())
      .order("score", { ascending: false })
      .limit(1);
    const peak = (peakRes.data as any)?.[0];
    setPeakScore30(peak?.score ?? null);
    setPeakDate30(peak?.created_at ?? null);

    // Captures within range (entries + documents)
    const [capRes, docRangeRes] = await Promise.all([
      safeQuery(
        () => supabase.from("entries").select("created_at")
          .eq("user_id", user.id).gte("created_at", sinceIso)
          .order("created_at", { ascending: true }),
        { context: "Impact: captures", silent: true }
      ),
      safeQuery(
        () => supabase.from("documents").select("created_at")
          .eq("user_id", user.id).gte("created_at", sinceIso)
          .order("created_at", { ascending: true }),
        { context: "Impact: documents", silent: true }
      ),
    ]);
    const combinedRange: { created_at: string }[] = [
      ...((capRes.data as { created_at: string }[]) || []),
      ...((docRangeRes.data as { created_at: string }[]) || []),
    ];
    setCaptureRows(combinedRange);

    // Captures this calendar month (entries + documents)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [{ count: entryMonth }, { count: docMonth }] = await Promise.all([
      supabase.from("entries").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", monthStart.toISOString()),
      supabase.from("documents").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", monthStart.toISOString()),
    ]);
    setCapturesThisMonth((entryMonth ?? 0) + (docMonth ?? 0));

    // Last capture all-time (entries + documents) for "days since last capture" narrative
    const [lastEntryRes, lastDocRes] = await Promise.all([
      supabase.from("entries").select("created_at").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1),
      supabase.from("documents").select("created_at").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1),
    ]);
    const lastTimes = [
      (lastEntryRes.data as any)?.[0]?.created_at,
      (lastDocRes.data as any)?.[0]?.created_at,
    ].filter(Boolean).map((t: string) => new Date(t).getTime());
    setLastCaptureAll(lastTimes.length ? new Date(Math.max(...lastTimes)) : null);

    // J12 — total all-time capture count for empty state detection
    const [{ count: totalEntries }, { count: totalDocs }] = await Promise.all([
      supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    setTotalCaptureCount((totalEntries ?? 0) + (totalDocs ?? 0));

    // LinkedIn metrics count (overall, for empty state decisions)
    const { count: trueCount } = await supabase
      .from("linkedin_post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setPostMetricsCount(trueCount ?? 0);

    if ((trueCount ?? 0) > 0) {
      const topRes = await supabase
        .from("linkedin_post_metrics")
        .select("post_id, impressions, reactions, engagement_rate, snapshot_date, post:linkedin_posts(title, post_text, post_url, published_at, tracking_status)")
        .eq("user_id", user.id)
        .gte("snapshot_date", sinceDateOnly)
        .order("engagement_rate", { ascending: false })
        .limit(20);
      setTopPosts(
        ((topRes.data as any[]) || []).filter((r: any) => {
          const ts = r?.post?.tracking_status;
          return !ts || !CATALOG_EXCLUDED_STATUSES.includes(ts);
        }) as any,
      );
      // Distinct posts that have metrics within the selected window
      const winRes = await supabase
        .from("linkedin_post_metrics")
        .select("post_id")
        .eq("user_id", user.id)
        .gte("snapshot_date", sinceDateOnly);
      const uniq = new Set(((winRes.data as any[]) || []).map(r => r.post_id).filter(Boolean));
      setWindowedPostCount(uniq.size);
      // Post-level impressions sum (numerator for visibility calculation)
      const postImpRes = await supabase
        .from("linkedin_post_metrics")
        .select("impressions")
        .eq("user_id", user.id)
        .gte("snapshot_date", sinceDateOnly);
      const postImpSum = ((postImpRes.data as any[]) || []).reduce(
        (sum, r) => sum + Number(r.impressions || 0), 0
      );
      setPostLevelImpressions(postImpSum);
    } else {
      setTopPosts([]);
      setWindowedPostCount(0);
      setPostLevelImpressions(null);
    }

    // Follower / influence snapshots from LinkedIn export (within range, followers > 0)
    const folRes = await safeQuery(
      () => supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, engagement_rate")
        .eq("user_id", user.id)
        .eq("source_type", "linkedin_export")
        .gte("snapshot_date", sinceDateOnly)
        .order("snapshot_date", { ascending: true }),
      { context: "Impact: influence snapshots", silent: true }
    );
    const folRowsAll = (folRes.data as any[]) || [];
    setFollowerRows(folRowsAll
      .filter(r => Number(r.followers || 0) > 0 || r.follower_growth != null)
      .map(r => ({
        snapshot_date: r.snapshot_date,
        followers: Number(r.followers || 0),
        follower_growth: Number(r.follower_growth || 0),
      })));

    // Latest follower count (most recent snapshot, any date)
    const latestFolRes = await supabase
      .from("influence_snapshots")
      .select("followers, snapshot_date")
      .eq("user_id", user.id)
      .eq("source_type", "linkedin_export")
      .gt("followers", 0)
      .order("snapshot_date", { ascending: false })
      .limit(1);
    setLatestFollowers((latestFolRes.data?.[0] as any)?.followers ?? null);
    setLatestSnapshotDate((latestFolRes.data?.[0] as any)?.snapshot_date ?? null);

    // Published LinkedIn posts (for follower-growth chart annotations)
    const pubRes = await safeQuery(
      () => supabase
        .from("linkedin_posts")
        .select("published_at, post_text, tracking_status")
        .eq("user_id", user.id)
        .not("published_at", "is", null)
        .gte("published_at", `${sinceDateOnly}T00:00:00Z`)
        .order("published_at", { ascending: true }),
      { context: "Impact: published linkedin posts", silent: true }
    );
    setPublishedPosts(((pubRes.data as any[]) || [])
      .filter(p => p.published_at)
      .map(p => ({ published_at: p.published_at, post_text: p.post_text })));

    // Period impressions + reach-weighted engagement rate.
    // engagement_rate in DB is stored as a percentage (e.g. 4.09 = 4.09%).
    // ER is computed ONLY over days that carry engagement data (engagement_rate > 0).
    // Auto-pulled impression-only days (LinkedIn's `me` finder returns impressions
    // but not daily engagement) store engagement_rate = 0; including them would
    // understate the true rate. Denominator = impressions on engagement-bearing days.
    const totalImp = folRowsAll.reduce((s, r) => s + Number(r.impressions || 0), 0);
    setPeriodImpressions(folRowsAll.length ? totalImp : null);

    const erRows = folRowsAll.filter(r => Number(r.engagement_rate || 0) > 0);
    const erImp = erRows.reduce((s, r) => s + Number(r.impressions || 0), 0);
    const totalEng = erRows.reduce(
      (s, r) => s + (Number(r.impressions || 0) * Number(r.engagement_rate || 0)) / 100,
      0,
    );
    if (erImp > 0) {
      setPeriodEngagementRate((totalEng / erImp) * 100);
    } else {
      setPeriodEngagementRate(null);
    }

    // ── Prior-period comparison (window of equal length immediately before current) ──
    const priorStart = new Date(sinceDate);
    priorStart.setDate(priorStart.getDate() - rangeDays);
    const priorStartOnly = priorStart.toISOString().slice(0, 10);
    const priorRes = await safeQuery(
      () => supabase
        .from("influence_snapshots")
        .select("impressions, engagement_rate, follower_growth")
        .eq("user_id", user.id)
        .eq("source_type", "linkedin_export")
        .gte("snapshot_date", priorStartOnly)
        .lt("snapshot_date", sinceDateOnly)
        .order("snapshot_date", { ascending: true }),
      { context: "Impact: prior-period snapshots", silent: true }
    );
    const priorRows = (priorRes.data as any[]) || [];
    if (priorRows.length > 0) {
      const pImp = priorRows.reduce((s, r) => s + Number(r.impressions || 0), 0);
      // ER weighted only over engagement-bearing days (see note above) so the
      // prior-period comparison stays apples-to-apples with the current period.
      const pErRows = priorRows.filter(r => Number(r.engagement_rate || 0) > 0);
      const pErImp = pErRows.reduce((s, r) => s + Number(r.impressions || 0), 0);
      const pEng = pErRows.reduce(
        (s, r) => s + (Number(r.impressions || 0) * Number(r.engagement_rate || 0)) / 100, 0
      );
      const pFol = priorRows.reduce((s, r) => s + Number(r.follower_growth || 0), 0);
      setPriorImpressions(pImp);
      setPriorEngagementRate(pErImp > 0 ? (pEng / pErImp) * 100 : 0);
      setPriorNewFollowers(pFol);
    } else {
      setPriorImpressions(null);
      setPriorEngagementRate(null);
      setPriorNewFollowers(null);
    }

    // ── Cumulative impressions series (asc-ordered folRowsAll) ──
    const cum: Array<{ date: string; label: string; daily: number; cumulative: number }> = [];
    let running = 0;
    for (const row of folRowsAll) {
      const daily = Number(row.impressions || 0);
      running += daily;
      cum.push({
        date: row.snapshot_date,
        label: new Date(row.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        daily,
        cumulative: running,
      });
    }
    setImpressionsSeries(cum);

    setLoading(false);
  };

  useEffect(() => { loadAll(selectedDays); /* eslint-disable-next-line */ }, [selectedDays]);

  // Load aura score data once for AuthorityJourney + WeeklyRhythm
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!cancelled) setUserId(user.id);
        await supabase.auth.getSession();
        const { data: res, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (!cancelled && !error && res) setAuraData(res);
        const { data: prof } = await supabase
          .from("diagnostic_profiles")
          .select("sector_focus")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setSectorFocus((prof as any)?.sector_focus || null);
      } catch (e) {
        console.error("ImpactTab: aura score load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load audience demographics + cached insight (and trigger generation if missing)
  const loadAudience = async () => {
    let cancelled = false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [demoRes, insightRes, reachRes] = await Promise.all([
        supabase
          .from("audience_demographics")
          .select("category, value, percentage, percentage_numeric, period_start, period_end")
          .eq("user_id", user.id)
          .order("percentage_numeric", { ascending: false }),
        supabase
          .from("audience_insights")
          .select("insight_headline, insight_body, audience_strengths, audience_gaps, next_action")
          .eq("user_id", user.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("influence_snapshots")
          .select("members_reached, total_impressions_annual")
          .eq("user_id", user.id)
          .gt("members_reached", 0)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      const demos = (demoRes.data as DemoRow[] | null) || [];
      setAllDemographics(demos);
      setAudienceInsight((insightRes.data as AudienceInsight | null) ?? null);
      setReachSnap((reachRes.data as any) ?? null);

      if (demos.length > 0 && !insightRes.data) {
        setAudienceInsightLoading(true);
        await supabase.auth.getSession();
        supabase.functions
          .invoke("generate-audience-insight", { body: {} })
          .then(({ data }) => {
            if (cancelled) return;
            if (data) setAudienceInsight(data as AudienceInsight);
          })
          .catch((e) => console.error("generate-audience-insight failed", e))
          .finally(() => { if (!cancelled) setAudienceInsightLoading(false); });
      }
    } catch (e) {
      console.error("ImpactTab: audience load failed", e);
    }
  };

  useEffect(() => {
    loadAudience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load content performance (respects selected date range)
  useEffect(() => {
    (async () => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - selectedDays);
      const sinceDateOnly = sinceDate.toISOString().slice(0, 10);

      const { data: allPosts } = await applyPublishedFilter(
        (supabase
          .from("linkedin_posts")
          .select("theme, tone, format_type, engagement_score, like_count, comment_count, source_type, tracking_status, post_text, published_at")
          .gte("published_at", sinceDateOnly)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false })
          .limit(500) as any),
      );

      const analyzablePosts = filterPublishedRows((allPosts as any[]) || []);

      if (analyzablePosts.length === 0) {
        setContentPerf({
          postCount: 0,
          avgEngagement: 0,
          topTheme: "—",
          topFormat: "—",
          tones: [],
        });
        return;
      }

      const themeCounts: Record<string, number> = {};
      const toneCounts: Record<string, number> = {};
      analyzablePosts.forEach((p: any) => {
        if (p.theme) themeCounts[p.theme] = (themeCounts[p.theme] || 0) + 1;
        if (p.tone) toneCounts[p.tone] = (toneCounts[p.tone] || 0) + 1;
      });
      const topTheme = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
      const tones = Object.entries(toneCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([tone, count]) => ({ tone, count }));

      const windowedPostsWithRate = (topPosts || []).filter((p: any) => Number(p.engagement_rate) > 0);
      const avgEngagement = windowedPostsWithRate.length > 0
        ? Math.round((windowedPostsWithRate.reduce((sum: number, p: any) => sum + Number(p.engagement_rate), 0) / windowedPostsWithRate.length) * 10) / 10
        : 0;

      const sorted = [...analyzablePosts].sort((a: any, b: any) =>
        (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0)
      );
      const top25 = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.25)));
      const fmtCounts: Record<string, number> = {};
      top25.forEach((p: any) => {
        if (p.format_type) fmtCounts[p.format_type] = (fmtCounts[p.format_type] || 0) + 1;
      });
      const topFormat = Object.entries(fmtCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      setContentPerf({
        postCount: analyzablePosts.length,
        topTheme,
        topFormat,
        avgEngagement,
        tones,
      });
    })();
  }, [selectedDays, topPosts]);

  // Load top strategic signal (highest priority/confidence among active signals)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await (supabase as any)
          .from("strategic_signals")
          .select("signal_title, priority_score, confidence")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("priority_score", { ascending: false, nullsFirst: false })
          .order("confidence", { ascending: false })
          .limit(1);
        const top = (data as any[])?.[0];
        if (top?.signal_title) setTopSignal(top.signal_title);
      } catch { /* silent */ }
    })();
  }, []);

  // 4 Pillars — signal depth + momentum
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: sigs } = await (supabase as any)
          .from("strategic_signals")
          .select("confidence")
          .eq("user_id", user.id)
          .eq("status", "active");
        const rows = (sigs as any[]) || [];
        setPillarSignalCount(rows.length);
        if (rows.length) {
          const avg = rows.reduce((s, r) => s + Number(r.confidence || 0), 0) / rows.length;
          setPillarAvgSignalConf(Math.round(avg * 100));
        }
        // Momentum: weeks active in last 4 (entries + documents)
        const fourWeeks = new Date();
        fourWeeks.setDate(fourWeeks.getDate() - 28);
        const [eRes, dRes] = await Promise.all([
          supabase.from("entries").select("created_at").eq("user_id", user.id).gte("created_at", fourWeeks.toISOString()),
          supabase.from("documents").select("created_at").eq("user_id", user.id).gte("created_at", fourWeeks.toISOString()),
        ]);
        const all = [...((eRes.data as any[]) || []), ...((dRes.data as any[]) || [])];
        const weeks = new Set<number>();
        all.forEach(r => {
          const t = new Date(r.created_at).getTime();
          const weekIdx = Math.floor((Date.now() - t) / (7 * 86400000));
          if (weekIdx < 4) weeks.add(weekIdx);
        });
        setPillarWeeksActive(weeks.size);
      } catch { /* silent */ }
    })();
  }, []);

  /* ── Score derivations ──
     Use live EF data (auraData) as PRIMARY source for current display,
     fall back to most recent snapshot only if EF hasn't returned yet. */
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  // CANONICAL SCORE — repointed to imprint_snapshots so Impact matches
  // Home / Observatory / My Story. Legacy aura_score / score_snapshots used
  // ONLY as null-fallback while imprint hasn't loaded.
  const { score: imprintScore, currentTier: imprintTier, delta: imprintDelta, scoreComponents } =
    useTierFromImprint(userId);
  const legacyAuraScore = (auraData as any)?.aura_score ?? latest?.score ?? 0;
  const latestScore = imprintScore != null ? imprintScore : legacyAuraScore;
  const tierName: string = imprintTier?.name ?? (auraData as any)?.tier_name ?? "Observer";
  // Three forces — LEGACY DECOMPOSITION. imprint_snapshots does not yet
  // expose signal/content/consistency components, so these still read from
  // calculate-aura-score / score_snapshots. They are NOT presented as
  // summing to the imprint dial; pending an imprint-native breakdown they
  // remain a directional, legacy view. TODO: replace once imprint components ship.
  const signalScore  = scoreComponents?.signal  ?? (auraData as any)?.signal_score  ?? latest?.components?.signal_score  ?? 0;
  const contentScore = scoreComponents?.content ?? (auraData as any)?.content_score ?? latest?.components?.content_score ?? 0;
  const captureScore = scoreComponents?.capture ?? (auraData as any)?.capture_score ?? latest?.components?.capture_score ?? 0;

  // Score 7 days ago (closest snapshot to that date)
  const score7 = useMemo(() => {
    if (snapshots.length === 0) return null;
    const target = new Date();
    target.setDate(target.getDate() - 7);
    let best: Snapshot | null = null;
    let bestDiff = Infinity;
    for (const s of snapshots) {
      const diff = Math.abs(new Date(s.created_at).getTime() - target.getTime());
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    return best?.score ?? null;
  }, [snapshots]);

  // Week delta: prefer imprint snapshot-to-snapshot delta; fall back to
  // legacy score_snapshots window when imprint history is unavailable.
  const legacyWeekDelta = score7 !== null ? legacyAuraScore - score7 : null;
  const weekDelta = imprintDelta != null ? imprintDelta : legacyWeekDelta;

  let trendLabel = "→ Stable";
  let trendColor = "var(--color-text-secondary)";
  if (weekDelta !== null) {
    if (weekDelta > 0) { trendLabel = `↑ +${weekDelta} this week`; trendColor = "var(--success)"; }
    else if (weekDelta < 0) { trendLabel = `↓ −${Math.abs(weekDelta)} this week`; trendColor = "var(--error)"; }
  }

  const daysSinceLastAll = lastCaptureAll ? daysBetween(new Date(), lastCaptureAll) : null;

  /* ── Score count-up animation (runs once when value first becomes available) ── */
  const [animatedScore, setAnimatedScore] = useState(0);
  const didAnimateRef = useRef(false);
  useEffect(() => {
    if (didAnimateRef.current) return;
    if (!latestScore || latestScore <= 0) return;
    didAnimateRef.current = true;
    const target = latestScore;
    const duration = 900;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setAnimatedScore(Math.round(easeOutCubic(t) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [latestScore]);

  const newFollowersPeriod = useMemo(
    () => followerRows.reduce((s, r) => s + (r.follower_growth || 0), 0),
    [followerRows]
  );

  // Prior-period % changes (null = can't compute, e.g. no prior data)
  const pctChange = (current: number, prior: number | null): number | null => {
    if (prior === null) return null;
    if (prior === 0 && current === 0) return 0;
    if (prior === 0) return null;
    return ((current - prior) / prior) * 100;
  };
  const impChange = pctChange(periodImpressions ?? 0, priorImpressions);
  const engChange = pctChange(periodEngagementRate ?? 0, priorEngagementRate);
  const followerChange = pctChange(newFollowersPeriod, priorNewFollowers);

  /* ── AI narrative ── */
  const narrative = useMemo(() => {
    type Part = { text: string; type: "neutral" | "primary" | "negative" | "positive" | "action" };
    const parts: Part[] = [];

    // Opening
    if (weekDelta !== null && weekDelta < -5) {
      parts.push({ text: "Your digital presence is declining — ", type: "neutral" });
      parts.push({ text: `down ${Math.abs(weekDelta)} points this week. `, type: "negative" });
    } else if (weekDelta !== null && weekDelta > 5) {
      parts.push({ text: "Your digital presence is growing — ", type: "neutral" });
      parts.push({ text: `up ${weekDelta} points this week. `, type: "positive" });
    } else {
      parts.push({ text: "Your digital presence is holding steady this week. ", type: "neutral" });
    }

    // Middle
    if (captureScore < 80 && daysSinceLastAll !== null && daysSinceLastAll >= 4 && peakScore30 !== null && peakDate30) {
      parts.push({ text: `It peaked at `, type: "neutral" });
      parts.push({ text: `${peakScore30}`, type: "primary" });
      parts.push({ text: ` on `, type: "neutral" });
      parts.push({ text: `${fmtDateShort(peakDate30)}`, type: "primary" });
      parts.push({ text: ` when you were capturing daily — then `, type: "neutral" });
      parts.push({ text: `dropped as activity stalled`, type: "negative" });
      parts.push({ text: ". ", type: "neutral" });
    } else if (contentScore === 100) {
      parts.push({ text: "Your content output is at full strength. ", type: "positive" });
    } else if (signalScore >= 85) {
      parts.push({ text: "Your signal intelligence is strong. ", type: "positive" });
    }

    // Closing
    if (captureScore < 80) {
      parts.push({ text: "One action fixes this: ", type: "neutral" });
      parts.push({ text: "capture something today.", type: "action" });
    } else if (contentScore < 80) {
      parts.push({ text: "Publishing more consistently will push your score higher.", type: "neutral" });
    } else {
      parts.push({ text: "Keep your current pace to continue compounding.", type: "neutral" });
    }

    if (newFollowersPeriod > 0) {
      parts.push({ text: " You gained ", type: "neutral" });
      parts.push({ text: `${newFollowersPeriod} followers`, type: "positive" });
      parts.push({ text: " this period.", type: "neutral" });
    }

    return parts;
  }, [weekDelta, captureScore, contentScore, signalScore, daysSinceLastAll, peakScore30, peakDate30, newFollowersPeriod]);

  const partColor = (t: string) => {
    switch (t) {
      case "primary": return "var(--color-text-primary)";
      case "negative": return "var(--error)";
      case "positive": return "var(--success)";
      case "action": return "var(--brand)";
      default: return "var(--color-text-secondary)";
    }
  };
  const partWeight = (t: string) => (t === "primary" ? 500 : t === "action" ? 600 : t === "negative" || t === "positive" ? 500 : 400);

  /* ── Capture activity (selectedDays) ── */
  const captureSeries = useMemo(() => {
    const buckets: Record<string, number> = {};
    const today = startOfDay(new Date());
    for (let i = selectedDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const r of captureRows) {
      const key = startOfDay(new Date(r.created_at)).toISOString().slice(0, 10);
      if (key in buckets) buckets[key]++;
    }
    const everyN = selectedDays <= 7 ? 1 : selectedDays <= 30 ? 3 : 7;
    return Object.entries(buckets).map(([date, captures], i, arr) => ({
      date,
      label: fmtDateShort(date),
      captures,
      showLabel: i % everyN === 0 || i === arr.length - 1,
    }));
  }, [captureRows, selectedDays]);

  const mostActive = captureSeries.reduce(
    (acc, x) => (x.captures > acc.captures ? x : acc),
    { label: "—", captures: 0 } as { label: string; captures: number }
  );

  const daysColor = daysSinceLastAll === null
    ? "var(--color-text-muted)"
    : daysSinceLastAll === 0 ? "var(--success)"
      : daysSinceLastAll <= 3 ? "var(--warning)"
        : "var(--error)";

  /* (score chart removed — only sub-score cards remain) */

  /* ── Sub-score card colour rules ── */
  const subScoreCard = (kind: "capture" | "content" | "signal", value: number) => {
    if (kind === "capture") {
      if (value >= 90) return { color: "var(--success)", border: "rgba(46,125,56,0.27)", tag: "Healthy" };
      if (value >= 70) return { color: "var(--brand)", border: "var(--bronze-line)", tag: "Good" };
      return { color: "var(--error)", border: "rgba(184,48,37,0.27)", tag: "Needs action" };
    }
    if (kind === "content") {
      if (value === 100) return { color: "var(--success)", border: "rgba(46,125,56,0.27)", tag: "Perfect" };
      if (value >= 70) return { color: "var(--brand)", border: "var(--bronze-line)", tag: "Good" };
      return { color: "var(--error)", border: "rgba(184,48,37,0.27)", tag: "Needs action" };
    }
    // signal
    if (value >= 85) return { color: "var(--success)", border: "rgba(46,125,56,0.27)", tag: "Strong" };
    if (value >= 70) return { color: "var(--brand)", border: "var(--bronze-line)", tag: "Good" };
    return { color: "var(--error)", border: "rgba(184,48,37,0.27)", tag: "Build signals" };
  };

  /* ── Follower chart series ── */
  const followerSeries = useMemo(() => {
    const everyN = selectedDays <= 7 ? 1 : selectedDays <= 30 ? 3 : 7;
    return followerRows.map((r, i, arr) => ({
      date: r.snapshot_date,
      label: fmtDateShort(r.snapshot_date),
      followers: r.followers || 0,
      growth: r.follower_growth || 0,
      showLabel: i % everyN === 0 || i === arr.length - 1,
    }));
  }, [followerRows, selectedDays]);


  const bestDay = useMemo(() => {
    if (followerRows.length === 0) return null;
    return followerRows.reduce((acc, r) => (r.follower_growth > (acc?.follower_growth ?? -1) ? r : acc), followerRows[0]);
  }, [followerRows]);

  // Load AI narrative interpretations (cached in impact_narratives table)
  useEffect(() => {
    if (!userId || !latestScore || periodImpressions === null) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("generate-impact-narrative", {
          body: {
            score: latestScore,
            tierName: tierName || "Observer",
            weekDelta: weekDelta || 0,
            selectedDays,
            followers: latestFollowers,
            impressions: periodImpressions,
            engagementRate: periodEngagementRate,
            impChange, engChange, followerChange,
            newFollowers: newFollowersPeriod,
            bestDay: bestDay ? `+${bestDay.follower_growth} on ${fmtDateShort(bestDay.snapshot_date)}` : null,
            signalScore: auraData?.signal_score || 0,
            contentScore: auraData?.content_score || 0,
            consistencyScore: auraData?.capture_score || 0,
            visibility: windowedPostCount > 0 && postLevelImpressions ? Math.round(postLevelImpressions / windowedPostCount) : 0,
            resonance: periodEngagementRate,
            signalDepth: pillarSignalCount,
            momentum: pillarWeeksActive,
            topSignal: topSignal || null,
            postCount: contentPerf?.postCount || 0,
            avgPostEngagement: contentPerf?.avgEngagement || 0,
            topPosts: (topPosts || []).slice(0, 5).map(p => ({
              date: p.post?.published_at,
              impressions: p.impressions,
              reactions: p.reactions,
              rate: p.engagement_rate,
            })),
          }
        });
        if (data && !cancelled) setImpactNarrative(data as any);
      } catch (e) {
        console.error("loadNarrative failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, latestScore, periodImpressions, selectedDays]);

  /* ── Published-post markers snapped to follower chart x-axis ── */
  const publishMarkers = useMemo(() => {
    if (followerSeries.length === 0 || publishedPosts.length === 0) return [];
    const seriesDates = followerSeries.map(s => ({ ts: new Date(s.date).getTime(), label: s.label }));
    const grouped = new Map<string, { label: string; posts: { published_at: string; post_text: string | null }[] }>();
    for (const p of publishedPosts) {
      const ts = new Date(p.published_at).getTime();
      if (!isFinite(ts)) continue;
      // snap to nearest series date
      let nearest = seriesDates[0];
      let nearestDiff = Math.abs(ts - nearest.ts);
      for (const sd of seriesDates) {
        const d = Math.abs(ts - sd.ts);
        if (d < nearestDiff) { nearest = sd; nearestDiff = d; }
      }
      // skip if more than ~7 days from any bucket
      if (nearestDiff > 7 * 86400000) continue;
      const entry = grouped.get(nearest.label) || { label: nearest.label, posts: [] };
      entry.posts.push(p);
      grouped.set(nearest.label, entry);
    }
    return Array.from(grouped.values());
  }, [followerSeries, publishedPosts]);

  /* ── XLSX Upload ── */
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload a .xlsx file");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async (fileOverride?: File) => {
    const fileToUpload = fileOverride || selectedFile;
    if (!fileToUpload) return;
    setUploadError(null);
    setImportedCount(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", fileToUpload);
      const { data, error } = await supabase.functions.invoke("import-linkedin-analytics", {
        body: form,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const imp = (data as any)?.imported || {};
      const posts = imp.post_rows || imp.imported || 0;
      const days = (imp.engagement_rows || 0) + (imp.follower_rows || 0);
      const totalImported = (imp.engagement_rows || 0) + (imp.follower_rows || 0) + (imp.post_rows || 0);
      if (totalImported === 0) {
        toast.error("No post data found in this file. Make sure you're exporting from LinkedIn Analytics → Post impressions.");
        setUploadError("No post data found in this file. Make sure you're exporting from LinkedIn Analytics → Post impressions.");
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setImportedCount({ posts, days });
      toast.success(`Analytics imported successfully — ${days} days of data loaded`);
      setSelectedFile(null);
      setPipeline({ voice: "pending", positioning: "pending", score: "pending" });
      await runPostImportPipeline(setPipeline);
      await loadAll(selectedDays);
      await loadAudience();
      setSuccessData({ posts, days });
      setShowSuccessCard(true);
      setTimeout(() => setShowSuccessCard(false), 2500);
    } catch (err: any) {
      console.error("XLSX upload failed:", err);
      toast.error(err?.message || "Upload failed. Please try again.");
      setUploadError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Staggered progress steps (cosmetic — reduces perceived wait time)
  useEffect(() => {
    if (uploading) {
      setProgressStep(0);
      const t1 = setTimeout(() => setProgressStep(1), 800);
      const t2 = setTimeout(() => setProgressStep(2), 2000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [uploading]);

  /* ── Render ── */
  if (loading) {
    return (
      <div
        className="space-y-6 py-6"
        aria-busy="true"
        aria-label="Loading impact dashboard"
      >
        {/* Score card */}
        <div className="h-28 rounded-lg bg-muted animate-pulse" />
        {/* Trajectory chart */}
        <div className="h-48 rounded-lg bg-muted animate-pulse" />
        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const ranges: RangeDays[] = [7, 30, 90, 365];
  // Empty when no impact data exists at all — no LinkedIn metrics and no influence snapshots
  const isEmpty = postMetricsCount === 0 && latestFollowers === null;

  // Shared hidden file input + drag-drop handlers for the empty state
  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload a .xlsx file");
      return;
    }
    setSelectedFile(file);
    handleUpload(file);
  };

  // ─── Success card (briefly shown between processing and analytics) ───
  if (showSuccessCard && successData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="statement-page space-y-7 max-w-5xl"
      >
        <div style={{ marginBottom: 8 }}>
          <div className="font-serif text-base font-medium tracking-wide text-ink-4" style={{ marginBottom: 6 }}>
            Your digital presence growth
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
            Statement
          </h1>
        </div>
        <section
          className="mx-auto flex flex-col items-center text-center"
          style={{
            maxWidth: 580,
            background: "var(--color-background-primary, var(--surface-ink-raised))",
            border: "0.5px solid var(--color-border-tertiary, var(--brand-line))",
            borderRadius: 12,
            padding: "40px 24px",
          }}
        >
          <div
            className="flex items-center justify-center mb-4"
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--success-pale)",
              border: "1px solid var(--success)",
            }}
          >
            <CheckCircle2 className="w-6 h-6" style={{ color: "var(--success)" }} />
          </div>
          <h2 className="text-base font-medium" style={{ color: "var(--ink)", margin: "0 0 6px" }}>
            Your presence data is live.
          </h2>
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            {successData.posts} posts imported across {successData.days} days.
          </p>
        </section>
      </motion.div>
    );
  }

  // ─── New-user empty state ───
  // With no LinkedIn analytics there is nothing meaningful to show in the trajectory,
  // breakdown, follower-growth, or LinkedIn sections.
  if (isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="statement-page space-y-7 max-w-5xl"
      >
        <div style={{ marginBottom: 8 }}>
          <div className="font-serif text-base font-medium tracking-wide text-ink-4" style={{ marginBottom: 6 }}>
            Your digital presence growth
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
            Statement
          </h1>
        </div>

        {uploading ? (
          /* ─── Processing card ─── */
          <section
            className="mx-auto flex flex-col items-center text-center"
            style={{
              maxWidth: 580,
              background: "var(--color-background-primary, var(--surface-ink-raised))",
              border: "0.5px solid var(--color-border-tertiary, var(--brand-line))",
              borderRadius: 12,
              padding: "32px 24px",
            }}
          >
            <div className="relative flex items-center justify-center mb-4" style={{ width: 56, height: 56 }}>
              <div
                className="absolute inset-0 rounded-full animate-spin"
                style={{
                  border: "2px solid transparent",
                  borderTopColor: "var(--brand)",
                  borderRightColor: "var(--brand)",
                }}
              />
              <BarChart3 className="w-6 h-6" style={{ color: "var(--brand)" }} />
            </div>
            <h2 className="text-base font-medium" style={{ color: "var(--ink)", margin: "0 0 6px" }}>
              Reading your LinkedIn data...
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--ink-3)" }}>
              This usually takes a few seconds.
            </p>

            <ul className="w-full max-w-xs space-y-2.5 text-left" style={{ margin: "0 auto" }}>
              {/* Step 0: File received */}
              <li
                className="flex items-center gap-2 text-sm transition-opacity duration-300"
                style={{ opacity: progressStep >= 0 ? 1 : 0, color: "var(--ink-2)" }}
              >
                <Check className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
                <span>File received</span>
              </li>
              {/* Step 1: Parsing / imported count */}
              <li
                className="flex items-center gap-2 text-sm transition-opacity duration-500"
                style={{ opacity: progressStep >= 1 ? 1 : 0, color: "var(--ink-2)" }}
              >
                <Check className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
                <span>
                  {importedCount ? `${importedCount.posts} posts imported` : "Parsing post data"}
                </span>
              </li>
              {/* Step 2: Pipeline-driven label */}
              <li
                className="flex items-center gap-2 text-sm font-medium transition-opacity duration-500"
                style={{ opacity: progressStep >= 2 ? 1 : 0, color: "var(--ink)" }}
              >
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: "var(--brand)" }} />
                <span>
                  {pipeline?.voice === "running" || pipeline?.voice === "pending"
                    ? PIPELINE_LABELS.voice
                    : pipeline?.positioning === "running" || pipeline?.positioning === "pending"
                    ? PIPELINE_LABELS.positioning
                    : pipeline?.score === "running" || pipeline?.score === "pending"
                    ? PIPELINE_LABELS.score
                    : "Building your presence profile..."}
                </span>
              </li>
            </ul>
          </section>
        ) : (
          /* ─── Empty state ─── */
          <div className="mx-auto" style={{ maxWidth: 580 }}>
            <section
              className="flex flex-col items-center text-center"
              style={{
                background: "var(--color-background-primary, var(--surface-ink-raised))",
                border: "0.5px solid var(--color-border-tertiary, var(--brand-line))",
                borderRadius: 12,
                padding: "28px 24px",
              }}
            >
              {/* Emotional hook */}
              <div
                className="flex items-center justify-center mb-4"
                style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--gold-pale)",
                  border: "1px solid var(--gold-light)",
                }}
              >
                <TrendingUp className="w-[22px] h-[22px]" style={{ color: "var(--brand)" }} />
              </div>
              <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--ink)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                You have presence you can't see yet.
              </h2>
              <p className="text-sm max-w-md mx-auto" style={{ color: "var(--ink-3)", lineHeight: 1.55 }}>
                Every LinkedIn post has data behind it — who saw it, who engaged, which topics resonated. Upload your analytics and Aura turns it into a growth map.
              </p>

              {/* Step-by-step guide */}
              <div
                className="w-full mt-6 text-left"
                style={{
                  background: "var(--surface-ink-recessed, hsl(var(--muted) / 0.4))",
                  border: "0.5px solid var(--color-border-tertiary, var(--brand-line))",
                  borderRadius: 10,
                  padding: "16px 16px",
                }}
              >
                <div
                  className="text-xs uppercase font-medium mb-3"
                  style={{ letterSpacing: "0.08em", color: "var(--brand)" }}
                >
                  3 steps — takes 30 seconds
                </div>
                <ol className="space-y-2.5">
                  {[
                    'LinkedIn → your profile → tap "Analytics" below your headline',
                    'Open "Post impressions" and click Export',
                    'Upload that file below — Aura reads it instantly',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "var(--ink-2)" }}>
                      <span
                        className="shrink-0 flex items-center justify-center text-xs font-medium"
                        style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: "var(--gold-pale)",
                          border: "0.5px solid var(--gold-light)",
                          color: "var(--brand)",
                          marginTop: 1,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ lineHeight: 1.5 }}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Upload drop zone */}
              <div
                role="button"
                tabIndex={0}
                onClick={handleUploadClick}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleUploadClick(); }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDropFile}
                className="w-full mt-4 flex flex-col items-center justify-center cursor-pointer transition-colors"
                style={{
                  border: `1.5px dashed ${isDragOver ? "var(--brand)" : "var(--color-border-tertiary, var(--brand-line))"}`,
                  borderRadius: 8,
                  padding: 20,
                  background: isDragOver ? "var(--gold-pale)" : "transparent",
                }}
              >
                <Upload className="w-5 h-5 mb-2" style={{ color: "var(--ink-3)" }} />
                <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Drop your LinkedIn export here
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                  Accepts .xlsx
                </div>
              </div>

              {/* Trust signals */}
              <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                {[
                  { Icon: Lock, label: "Private" },
                  { Icon: Clock, label: "30 sec" },
                  { Icon: RefreshCw, label: "Re-upload anytime" },
                ].map(({ Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {/* Inline error state */}
              {uploadError && (
                <div
                  className="w-full mt-4 text-left flex items-start gap-2.5"
                  style={{
                    background: "hsl(var(--destructive) / 0.08)",
                    border: "0.5px solid hsl(var(--destructive) / 0.4)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(var(--destructive))" }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: "hsl(var(--destructive))" }}>
                      {uploadError}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                      Make sure you're exporting from LinkedIn Analytics → Post impressions. The file should be .xlsx format.
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadError(null); handleUploadClick(); }}
                      className="text-xs font-medium mt-2 underline"
                      style={{ color: "var(--brand)" }}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Create first post alternative */}
            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="flex-1 h-px" style={{ background: "var(--color-border-tertiary, var(--brand-line))" }} />
              <span className="text-xs" style={{ color: "var(--ink-3)" }}>or start creating first</span>
              <div className="flex-1 h-px" style={{ background: "var(--color-border-tertiary, var(--brand-line))" }} />
            </div>
            <div className="flex justify-center">
              <AuraButton
                variant="ghost"
                size="sm"
                onClick={() => window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab: "authority" } }))}
                style={{ borderRadius: 6, padding: "10px 22px" }}
              >
                Create your first post →
              </AuraButton>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.name.toLowerCase().endsWith(".xlsx")) {
                  toast.error("Please upload a .xlsx file");
                  return;
                }
                setSelectedFile(file);
                handleUpload(file);
              }}
              className="hidden"
            />
          </div>
        )}
      </motion.div>
    );
  }

  // Max engagement rate in topPosts (for inline bars)
  const maxErPct = topPosts.reduce((m, p) => {
    const er = Number(p.engagement_rate || 0);
    return er > m ? er : m;
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="statement-page observatory-page space-y-7 max-w-5xl"
    >
      {/* ─────────── 1. PAGE HEADER ─────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div className="font-serif text-base font-medium tracking-wide text-ink-4" style={{ marginBottom: 6 }}>
            Your digital presence growth
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, color: "var(--glass)", letterSpacing: "-0.02em", margin: 0 }}>
            Statement
          </h1>
          <p style={{ fontSize: 14, color: "var(--glass-2)", marginTop: 8, lineHeight: 1.5, maxWidth: 640 }}>
            Every week you show up, your name reaches rooms you've never been in. That's how advisory calls, board invitations, and speaking slots find you.
          </p>
        </div>
        {/* Analytics period picker — drives selectedDays for chart / deltas / footprint only */}
        <div
          role="group"
          aria-label="Analytics period"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            padding: 3,
            borderRadius: 8,
            border: "1px solid var(--line-1)",
            background: "var(--color-card)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {ranges.map((d) => {
            const label = d === 7 ? "7d" : d === 30 ? "30d" : d === 90 ? "90d" : "1y";
            const active = selectedDays === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDays(d)}
                aria-pressed={active}
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.02em",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "var(--bronze-soft, rgba(197,165,90,0.14))" : "transparent",
                  color: active ? "var(--bronze, #C5A55A)" : "var(--ink-3)",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {/* FirstVisitHint and Market Mirror removed — Impact is now a focused dashboard. */}

      {/* ─────────── SCORE HERO (compact: ring + tier card + KPIs) ─────────── */}
      <div data-tour="impact-hero">
      <FirstTimeHint hintKey="impact-score">
        Your growth dashboard. Upload LinkedIn analytics to see who follows you and how your presence is compounding.
      </FirstTimeHint>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
          marginBottom: 6,
        }}
      >
        Overall · all-time
      </div>
      <ScoreHero
        score={latestScore}
        tierName={tierName as any}
        nextTierName={auraData?.next_tier_name}
        pointsToNext={auraData?.points_to_next}
        sector={sectorFocus}
        followers={latestFollowers}
        impressions={periodImpressions}
        engagementRate={periodEngagementRate}
        trendLabel={trendLabel}
        selectedDays={selectedDays}
        impChange={impChange}
        engChange={engChange}
        followerChange={followerChange}
      />
      </div>

      {/* ─────────── 3. AI NARRATIVE BRIEFING ─────────── */}
      <section
        className="p-6"
        style={{
          background: "var(--color-card)",
          border: "0.5px solid var(--color-border)",
          borderLeft: "4px solid var(--brand)",
          borderRadius: "0 8px 8px 0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 18,
              fontWeight: 500,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            What your numbers say
          </h2>
          <InfoTooltip slug="impact-briefing" />
        </div>
        <div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
              {impactNarrative?.hero_narrative ? (
                <span>{impactNarrative.hero_narrative}</span>
              ) : (
                narrative.map((p, i) => (
                  <span
                    key={i}
                    style={{ color: partColor(p.type), fontWeight: partWeight(p.type) }}
                  >
                    {p.text}
                  </span>
                ))
              )}
            </p>

            {impactNarrative?.one_action && (
              <div style={{ marginTop: 12, fontWeight: 500, color: "#B08D3A", fontSize: 15 }}>
                → {impactNarrative.one_action}
              </div>
            )}

            {captureScore < 80 && (
              <div className="mt-4">
                <AuraButton variant="signal" size="sm" onClick={() => onOpenCapture?.()}>
                  Capture now →
                </AuraButton>
              </div>
            )}
          </div>
      </section>

      {/* ─────────── THREE FORCES (color-coded cards) ─────────── */}
      <section>
        <SectionToggle
          title="The three forces"
          open={openSections.forces}
          onToggle={() => toggleSection("forces")}
          right={null}
        />
        {openSections.forces && (
          <div data-testid="impact-breakdown" className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            {([
              { key: "signal", label: "Signal", slug: "signal-strength", rawValue: signalScore, weight: 0.40, maxPoints: 40,
                color: "var(--aura-accent)",
                hint: topSignal ? `Top: ${topSignal}` : "Build signals from diverse sources",
                tooltip: "How deep your market intelligence runs. Based on how many signals you have, their strength, and how broadly they cover your territory. Having at least one strong signal gives a bonus.",
                status: signalScore >= 70 ? "Growing" : signalScore >= 40 ? "Build more" : "Needs action",
                weightedOverride: (auraData as any)?.signal_weighted ?? null },
              { key: "content", label: "Content", slug: "content-published", rawValue: contentScore, weight: 0.40, maxPoints: 40,
                color: "var(--aura-blue)",
                hint: (() => {
                  const pub = Number((auraData as any)?.published_count ?? (auraData as any)?.aura_published_count ?? 0);
                  return `${pub} on LinkedIn last 30d`;
                })(),
                tooltip: "Your publishing activity. Imported LinkedIn history is your foundation (up to 15 points). Publishing new content from your signals is what grows this score (up to 85 points). Resets monthly.",
                status: contentScore >= 70 ? "Growing" : contentScore >= 40 ? "Build more" : "Needs action",
                weightedOverride: (auraData as any)?.content_weighted ?? null },
              { key: "consistency", label: "Consistency", slug: "weekly-rhythm", rawValue: captureScore, weight: 0.20, maxPoints: 20,
                color: "var(--aura-positive)",
                hint: daysSinceLastAll === null ? "No captures yet"
                  : daysSinceLastAll === 0 ? "Captured today"
                  : `${daysSinceLastAll}d since last capture`,
                tooltip: "Your capture rhythm. Recent weeks count more (60%), but your long-term consistency also matters (40%). Capture at least once per week to keep your intelligence fresh.",
                status: captureScore >= 70 ? "Growing" : captureScore >= 40 ? "Build more" : "Needs action",
                weightedOverride: (auraData as any)?.capture_weighted ?? null },
            ]).map(c => (
              <ForceCard key={c.key} {...c} />
            ))}
          </div>
        )}
      </section>

      {/* ─────────── YOUR AUDIENCE ─────────── */}
      {(() => {
        const SENIOR_LEVELS = new Set(["Senior", "Director", "CXO", "VP", "Partner", "Owner"]);
        const demos = allDemographics || [];
        const isLoadingAudience = allDemographics === null;
        const demoByCategory = demos.reduce((acc, row) => {
          (acc[row.category] = acc[row.category] || []).push(row);
          return acc;
        }, {} as Record<string, DemoRow[]>);
        const seniorityRows = (demoByCategory["Seniority"] || []).slice().sort(
          (a, b) => Number(b.percentage_numeric || 0) - Number(a.percentage_numeric || 0)
        );
        const industryRows = (demoByCategory["Industry"] || []).slice(0, 5);
        const companyRows = (demoByCategory["Company"] || []).slice(0, 5);
        const locationRows = demoByCategory["Location"] || [];

        const seniorPct = seniorityRows
          .filter(r => SENIOR_LEVELS.has(r.value))
          .reduce((sum, r) => sum + Number(r.percentage_numeric || 0), 0);
        const seniorityTotal = seniorityRows.reduce(
          (sum, r) => sum + Number(r.percentage_numeric || 0), 0
        );
        const maxPct = Math.max(...(seniorityRows || []).map(r => Number(r.percentage_numeric || 0)));

        const periodStart = demos[0]?.period_start;
        const periodEnd = demos[0]?.period_end;
        const periodLabel = periodStart && periodEnd
          ? `${new Date(periodStart).toLocaleDateString("en-US", { month: "short", year: "numeric" })} – ${new Date(periodEnd).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
          : "Full export period";

        const hasData = demos.length > 0;
        const cardStyle = {
          background: "var(--aura-card)",
          border: "1px solid var(--aura-border)",
          borderRadius: 12,
          padding: "16px 18px",
        } as React.CSSProperties;
        const uppercaseLabel = {
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: "var(--aura-t3)",
          fontWeight: 600,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        };
        const cormorant = {
          fontFamily: "var(--font-serif), Georgia, serif",
          color: "var(--aura-t1)",
        };

        return (
          <section data-tour="audience-section">
            <SectionToggle
              title="Your audience"
              open={openSections.audience}
              onToggle={() => toggleSection("audience")}
              right={
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 12, color: "var(--aura-t3)" }}>{periodLabel}</span>
                  <InfoTooltip
                    label="Your audience"
                    text="Based on your LinkedIn audience demographics. Updated each time you upload your analytics export."
                  />
                </div>
              }
            />

            {openSections.audience && (
              <div style={{ marginTop: 12 }}>
                {isLoadingAudience ? (
                  <div style={{ ...cardStyle, textAlign: "center", padding: "32px 18px" }}>
                    <div
                      style={{
                        height: 14,
                        width: "60%",
                        margin: "0 auto 10px",
                        background: "var(--aura-border)",
                        borderRadius: 6,
                        opacity: 0.6,
                      }}
                    />
                    <div
                      style={{
                        height: 12,
                        width: "40%",
                        margin: "0 auto",
                        background: "var(--aura-border)",
                        borderRadius: 6,
                        opacity: 0.4,
                      }}
                    />
                  </div>
                ) : !hasData ? (
                  <div style={{ ...cardStyle, textAlign: "center", padding: "32px 18px" }}>
                    <p style={{ fontSize: 14, color: "var(--aura-t2)", margin: 0 }}>
                      Upload your LinkedIn analytics to see who follows you
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* AI Insight Card */}
                    {(audienceInsight || audienceInsightLoading) && (
                      <div style={{ ...cardStyle, borderLeft: "4px solid var(--aura-accent, #B08D3A)" }}>
                        {audienceInsightLoading && !audienceInsight ? (
                          <div>
                            <div style={{ ...uppercaseLabel, marginBottom: 10 }}>
                              Analyzing your audience...
                            </div>
                            {[0, 1, 2].map(i => (
                              <div key={i}
                                style={{
                                  height: 10,
                                  borderRadius: 4,
                                  background: "var(--aura-border)",
                                  marginBottom: 8,
                                  width: i === 2 ? "60%" : "100%",
                                  opacity: 0.6,
                                  animation: "pulse 1.6s ease-in-out infinite",
                                }}
                              />
                            ))}
                          </div>
                        ) : audienceInsight ? (
                          <div>
                            <h3 style={{ ...cormorant, fontSize: 18, fontWeight: 500, margin: "0 0 8px" }}>
                              {audienceInsight.insight_headline}
                            </h3>
                            <p style={{
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontSize: 14,
                              lineHeight: 1.625,
                              color: "var(--aura-t2)",
                              margin: "0 0 14px",
                            }}>
                              {audienceInsight.insight_body}
                            </p>
                            {((audienceInsight.audience_strengths?.length || 0) > 0 ||
                              (audienceInsight.audience_gaps?.length || 0) > 0) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: 12 }}>
                                {(audienceInsight.audience_strengths?.length || 0) > 0 && (
                                  <div>
                                    <div style={{ ...uppercaseLabel, marginBottom: 6 }}>Strengths</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {audienceInsight.audience_strengths!.map((s, i) => (
                                        <span key={i} style={{
                                          fontSize: 12,
                                          padding: "3px 8px",
                                          borderRadius: 999,
                                          background: "var(--color-background-success, rgba(34,197,94,0.12))",
                                          color: "var(--color-text-primary, var(--aura-t1))",
                                          fontFamily: "'DM Sans', system-ui, sans-serif",
                                        }}>{s}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(audienceInsight.audience_gaps?.length || 0) > 0 && (
                                  <div>
                                    <div style={{ ...uppercaseLabel, marginBottom: 6 }}>Gaps</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {audienceInsight.audience_gaps!.map((g, i) => (
                                        <span key={i} style={{
                                          fontSize: 12,
                                          padding: "3px 8px",
                                          borderRadius: 999,
                                          background: "var(--color-background-warning, rgba(245,158,11,0.14))",
                                          color: "var(--color-text-primary, var(--aura-t1))",
                                          fontFamily: "'DM Sans', system-ui, sans-serif",
                                        }}>{g}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {audienceInsight.next_action && (
                              <div style={{
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontSize: 13,
                                color: "var(--aura-accent, #B08D3A)",
                                marginTop: 4,
                              }}>
                                → {audienceInsight.next_action}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Block 1: Seniority */}
                    {seniorityRows.length > 0 && (
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                          <span style={{ ...cormorant, fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
                            {Math.round(seniorPct)}%
                          </span>
                          <span style={{
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            fontSize: 13,
                            color: "var(--aura-t2)",
                          }}>
                            of your followers are senior decision-makers
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(seniorityRows || []).map((row, i) => {
                            const pct = Number(row.percentage_numeric || 0);
                            const isStrategic = SENIOR_LEVELS.has(row.value);
                            const barWidth = maxPct > 0 ? Math.max((pct / maxPct) * 100, 2) : 2;
                            return (
                              <div
                                key={row.value || i}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "72px 1fr 36px",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                {/* Label */}
                                <span style={{
                                  fontSize: 13,
                                  textAlign: "right",
                                  color: isStrategic ? "var(--aura-t1)" : "var(--aura-t3)",
                                  fontWeight: isStrategic ? 500 : 400,
                                  fontFamily: "'DM Sans', system-ui, sans-serif",
                                }}>
                                  {row.value}
                                </span>
                                {/* Bar track + fill */}
                                <div style={{
                                  height: 20,
                                  borderRadius: 3,
                                  backgroundColor: "var(--aura-border)",
                                  overflow: "hidden",
                                }}>
                                  <div style={{
                                    height: "100%",
                                    width: `${barWidth}%`,
                                    borderRadius: 3,
                                    backgroundColor: isStrategic
                                      ? "var(--aura-accent, #B08D3A)"
                                      : "var(--aura-t3)",
                                    opacity: isStrategic ? 1 : 0.35,
                                    transition: "width 0.6s ease",
                                  }} />
                                </div>
                                {/* Percentage */}
                                <span style={{
                                  fontSize: 12,
                                  color: "var(--aura-t3)",
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "'DM Sans', system-ui, sans-serif",
                                }}>
                                  {row.percentage}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Block 2: Industries + Companies */}
                    {(industryRows.length > 0 || companyRows.length > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { label: "TOP INDUSTRIES", rows: industryRows, empty: "No industry data" },
                          { label: "TOP COMPANIES", rows: companyRows, empty: "No company data" },
                        ].map((col) => (
                          <div key={col.label} style={cardStyle}>
                            <div style={{ ...uppercaseLabel, marginBottom: 10 }}>{col.label}</div>
                            {col.rows.length === 0 ? (
                              <p style={{ fontSize: 13, color: "var(--aura-t3)", margin: 0 }}>{col.empty}</p>
                            ) : (
                              <div>
                                {col.rows.map((row, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "8px 0",
                                      borderBottom: i < col.rows.length - 1
                                        ? "0.5px solid var(--aura-border)"
                                        : "none",
                                      fontFamily: "'DM Sans', system-ui, sans-serif",
                                    }}
                                  >
                                    <span style={{ fontSize: 13, color: "var(--aura-t1)" }}>{row.value}</span>
                                    <span style={{ fontSize: 13, color: "var(--aura-t3)" }}>{row.percentage}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Block 3: Top location + Return viewers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div style={cardStyle}>
                        <div style={{ ...uppercaseLabel, marginBottom: 8 }}>TOP LOCATION</div>
                        {locationRows.length > 0 ? (
                          <>
                            <div style={{ ...cormorant, fontSize: 28, fontWeight: 500, lineHeight: 1.1 }}>
                              {locationRows[0].value}
                            </div>
                            <div style={{
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontSize: 13, color: "var(--aura-t2)", marginTop: 4,
                            }}>
                              {locationRows[0].percentage} of followers
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ ...cormorant, fontSize: 28, fontWeight: 500 }}>—</div>
                            <div style={{ fontSize: 13, color: "var(--aura-t3)", marginTop: 4 }}>Upload to see</div>
                          </>
                        )}
                      </div>
                      <div style={cardStyle}>
                        <div style={{ ...uppercaseLabel, marginBottom: 8 }}>RETURN VIEWERS</div>
                        {reachSnap && (reachSnap.members_reached || 0) > 0 && (reachSnap.total_impressions_annual || 0) > 0 ? (
                          <>
                            <div style={{ ...cormorant, fontSize: 28, fontWeight: 500, lineHeight: 1.1 }}>
                              {(Number(reachSnap.total_impressions_annual) / Number(reachSnap.members_reached)).toFixed(1)}×
                            </div>
                            <div style={{
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontSize: 13, color: "var(--aura-t2)", marginTop: 4,
                            }}>
                              Avg views per reached member
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ ...cormorant, fontSize: 28, fontWeight: 500 }}>—</div>
                            <div style={{ fontSize: 13, color: "var(--aura-t3)", marginTop: 4 }}>Upload to see</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* ─────────── PROGRESSIVE DISCLOSURE — master toggle for detailed breakdown ─────────── */}
      <button
        type="button"
        onClick={() => setShowDetailed(v => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "0.5px solid var(--brand-line)",
          borderRadius: 10,
          padding: "14px 18px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
            {showDetailed ? "Hide detailed breakdown" : "See detailed breakdown"}
          </div>
          {!showDetailed && (
            <div style={{ fontSize: 12, color: "var(--ink-5)", marginTop: 4 }}>
              5 more sections · Pillars · Content · Posts · Followers · Analytics
            </div>
          )}
        </div>
        <span style={{ color: "var(--gold-dark)", fontSize: 18 }}>{showDetailed ? "▾" : "▸"}</span>
      </button>

      {showDetailed && (
      <>
      {/* ─────────── 4 PILLARS ─────────── */}
      <section>
        <div
          className="text-xs uppercase font-medium mb-2"
          style={{ letterSpacing: "0.08em", color: "var(--brand)" }}
        >
          YOUR LINKEDIN FOOTPRINT
        </div>
        <h2 style={{
          fontFamily: "var(--font-serif), Georgia, serif",
          fontSize: 18, fontWeight: 500, color: "var(--aura-t1)",
          margin: "0 0 4px",
        }}>
          Your LinkedIn footprint
        </h2>
        <p style={{
          fontSize: 13,
          color: "var(--aura-t3)",
          margin: "0 0 16px",
        }}>
          How your content performs in the market
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PillarCard
            label="Visibility"
            slug="footprint-visibility"
            value={(() => {
              if (!postLevelImpressions || windowedPostCount === 0) return "—";
              const avg = Math.round(postLevelImpressions / windowedPostCount);
              return formatCompact(avg);
            })()}
            unit="avg/post"
            color="var(--aura-blue)"
            tooltip={{
              what: "Average impressions per tracked post in your selected period.",
              how: "Calculated from individual post metrics.",
              improve: "Publish more often and use hooks tied to live signals.",
            }}
          />
          <PillarCard
            label="Resonance"
            slug="footprint-resonance"
            value={periodEngagementRate != null ? `${periodEngagementRate.toFixed(1)}%` : "—"}
            unit={(() => {
              const b = tierBenchmark(latestFollowers);
              return `tier ${b.low}–${b.high}%`;
            })()}
            color={(() => {
              if (periodEngagementRate == null) return "var(--aura-t3)";
              const b = tierBenchmark(latestFollowers);
              if (periodEngagementRate >= b.high) return "var(--aura-positive)";
              if (periodEngagementRate >= b.low) return "var(--aura-accent)";
              return "var(--aura-negative)";
            })()}
            tooltip={{
              what: "Engagement rate (engagements ÷ impressions, includes reactions, comments, reposts).",
              how: "Impression-weighted across days, benchmarked against your follower tier.",
              improve: "Open with a sharp POV; reply in the first hour.",
            }}
          />
          <PillarCard
            label="Signal Depth"
            slug="footprint-signal-depth"
            value={String(pillarSignalCount)}
            unit={pillarAvgSignalConf > 0 ? `${pillarAvgSignalConf}% avg conf` : "no signals"}
            color="var(--aura-accent3)"
            tooltip={{
              what: "Active strategic signals you're tracking.",
              how: "Active signals you're tracking. The count and average confidence are shown separately.",
              improve: "Capture from diverse sources to surface new signals.",
            }}
          />
          <PillarCard
            label="Momentum"
            slug="footprint-momentum"
            value={`${pillarWeeksActive}/4`}
            unit="weeks active"
            color="var(--aura-accent)"
            dots={pillarWeeksActive}
            tooltip={{
              what: "How many of the last 4 weeks you captured at least once.",
              how: "1 capture per week keeps the streak alive.",
              improve: "Commit to a weekly capture rhythm — even 1 entry counts.",
            }}
          />
        </div>
      </section>

      {/* ─────────── INSIGHTS + NEXT TIER ─────────── */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div style={{
            background: "var(--aura-card)", border: "1px solid var(--aura-border)",
            borderRadius: 12, padding: "16px 18px",
          }}>
            <div style={{
              fontSize: 12, letterSpacing: "0.1em",
              color: "var(--aura-accent)", fontWeight: 600, marginBottom: 8,
            }}>
              Insight
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.625, color: "var(--aura-t1)", margin: 0 }}>
              {(() => {
                if (pillarWeeksActive >= 4 && periodEngagementRate != null) {
                  return "Consistent capture is paying off — your engagement is tracking above baseline. Double down on the formats that worked.";
                }
                if (pillarSignalCount > 0 && contentScore < 40) {
                  return "You're sitting on strong signals but under-publishing. The fastest path to score growth is one post from your top signal this week.";
                }
                if (daysSinceLastAll !== null && daysSinceLastAll > 7) {
                  return `It's been ${daysSinceLastAll} days since your last capture. A single source today restarts your weekly rhythm.`;
                }
                return "Your presence compounds when capture, signal, and publish cycle together. Keep the loop closed.";
              })()}
            </p>
          </div>
          <div style={{
            background: "var(--aura-card)", border: "1px solid var(--aura-border)",
            borderRadius: 12, padding: "16px 18px",
          }}>
            <div style={{
              fontSize: 12, letterSpacing: "0.1em",
              color: "var(--aura-accent2)", fontWeight: 600, marginBottom: 8,
            }}>
              Next tier
              <InfoTooltip slug="next-tier" label="Next tier" side="bottom" triggerSize={13} className="ml-1.5 align-middle" />
            </div>
            {auraData?.next_tier_name && auraData?.points_to_next ? (
              <>
                <div className="text-metric" style={{ color: "var(--aura-t1)" }}>
                  {auraData.points_to_next} pts
                </div>
                <p style={{ fontSize: 14, color: "var(--aura-t2)", margin: "6px 0 0", lineHeight: 1.625 }}>
                  to reach <span style={{ color: "var(--aura-accent)", fontWeight: 600 }}>{auraData.next_tier_name}</span>.
                  Publishing from your top signal is the fastest mover.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: "var(--aura-t2)", margin: 0, lineHeight: 1.625 }}>
                You've reached the top tier — focus on maintaining cadence.
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SectionInsight
            text={impactNarrative?.footprint_insight}
            askAuraPrompt="Why is my engagement below the tier benchmark?"
          />
          <InfoTooltip slug="impact-footprint-insight" label="Footprint insight" side="top" triggerSize={13} />
        </div>
      </section>

      {/* ─────────── 9. CONTENT PERFORMANCE ─────────── */}
      <section>
        <SectionToggle
          title="Content performance"
          open={openSections.content}
          onToggle={() => toggleSection("content")}
        />
        {openSections.content && (!contentPerf || contentPerf.postCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posts in this period.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card rounded-xl p-5 border border-border/8">
                <div className="text-foreground font-bold text-lg">{contentPerf.postCount}</div>
                <div className="text-xs text-muted-foreground mt-1" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Posts analyzed · last {selectedDays}d
                  <InfoTooltip
                    label="Posts analyzed"
                    text={`LinkedIn posts Aura analyzed in the selected window (last ${selectedDays} days). Observatory's "Posts shipped" is the all-time count.`}
                    side="top"
                    triggerSize={13}
                  />
                </div>
              </div>
              <div className="glass-card rounded-xl p-5 border border-border/8">
                {topSignal ? (
                  <>
                    <div className="text-foreground font-bold text-lg leading-snug line-clamp-3">{topSignal}</div>
                    <div className="text-xs text-muted-foreground mt-1">Strongest territory</div>
                  </>
                ) : contentPerf.topTheme && contentPerf.topTheme !== "—" ? (
                  <>
                    <div className="text-foreground font-bold text-lg capitalize">{contentPerf.topTheme}</div>
                    <div className="text-xs text-muted-foreground mt-1">Strongest territory</div>
                  </>
                ) : (
                  <>
                    <div className="text-foreground font-normal text-sm leading-relaxed">Build active signals to surface your strongest territory</div>
                    <div className="text-xs text-muted-foreground mt-1">Strongest territory</div>
                  </>
                )}
              </div>
              <div className="glass-card rounded-xl p-5 border border-border/8">
                <div className="text-foreground font-bold text-lg">{periodEngagementRate != null ? periodEngagementRate.toFixed(1) : "—"}%</div>
                <div className="text-xs text-muted-foreground mt-1" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Avg Engagement
                  <InfoTooltip
                    label="Engagement rate"
                    text="Total engagements ÷ impressions across this period, weighted by reach — includes reactions, comments, and reposts. Matches the rate in your score header."
                    side="top"
                    triggerSize={13}
                  />
                </div>
              </div>
            </div>
            {/* Tone distribution and Content insight removed (V1P-2 reorder) — low decision value.
                Restore from git history if quality data improves. */}
          </div>
        ))}
        {openSections.content && contentPerf && contentPerf.postCount > 0 && (
          <SectionInsight
            text={impactNarrative?.content_insight}
            askAuraPrompt="What content format works best for my audience?"
          />
        )}
      </section>

      {/* ─────────── 7. POST PERFORMANCE ─────────── */}
      <section>
        <SectionToggle
          title="Post performance"
          right={(() => {
            const b = tierBenchmark(latestFollowers);
            const er = periodEngagementRate != null ? periodEngagementRate.toFixed(1) : "—";
            return (
              <span className="text-xs" style={{ color: "var(--aura-t2)" }}>
                {er}% vs {b.low}–{b.high}% for your tier ({b.label})
              </span>
            );
          })()}
          open={openSections.posts}
          onToggle={() => toggleSection("posts")}
        />
        {openSections.posts && (postMetricsCount === 0 ? (
          <div
            className="rounded-lg p-6 text-sm text-center"
            style={{ border: "1.5px dashed var(--color-border)", color: "var(--color-text-secondary)", background: "transparent" }}
          >
            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>No post data yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Import your LinkedIn analytics below to see post performance.
            </p>
          </div>
        ) : topPosts.length === 0 ? (
          <div
            className="rounded-lg p-6 text-sm text-center"
            style={{
              border: "1.5px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
              background: "transparent",
            }}
          >
            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>No post data for this period</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Try a wider time range or import more LinkedIn analytics.
            </p>
          </div>
        ) : (
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
          >
            {topPosts.map((p, i) => {
              // Title fallback chain
              let title: string = (p.post?.title || "").trim();
              if (!title) {
                if (p.post?.published_at) {
                  title = `Post · ${fmtDateShort(p.post.published_at)}`;
                } else {
                  title = `Post · ${fmtDateShort(p.snapshot_date)}`;
                }
              }

              // Engagement rate from DB is already in percent units
              const erPct = Number(p.engagement_rate || 0);
              const isTop = i === 0;
              const fillPct = maxErPct > 0 ? (erPct / maxErPct) * 100 : 0;
              const rankColor = isTop ? "var(--brand)" : "var(--color-text-muted)";

              let badge: { label: string; bg: string; color: string; border: string } | null = null;
              if (i < 3) {
                badge = { label: "Top post", bg: "var(--brand-muted)", color: "var(--brand)", border: "var(--bronze-line)" };
              } else if (erPct > 5) {
                badge = { label: "Exceptional", bg: "rgba(46,125,56,0.09)", color: "var(--success)", border: "rgba(46,125,56,0.27)" };
              } else if (erPct >= 3) {
                badge = { label: "Above avg", bg: "var(--brand-muted)", color: "var(--brand)", border: "var(--bronze-line)" };
              }

              // Bar opacity decreases by rank for non-top
              const barOpacity = isTop ? 1 : Math.max(0.35, 1 - i * 0.08);

              return (
                <div
                  key={`${p.post_id ?? "x"}-${i}`}
                  className="px-5"
                  style={{
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderBottom: i === topPosts.length - 1 ? "none" : "0.5px solid var(--color-border)",
                    borderLeft: isTop ? "3px solid var(--brand)" : undefined,
                    paddingLeft: isTop ? 12 : undefined,
                    background: isTop ? "hsl(43 50% 55% / 0.04)" : undefined,
                    borderRadius: isTop ? "0 4px 4px 0" : undefined,
                  }}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div
                      className="shrink-0 w-6 text-center tabular-nums"
                      style={{ fontSize: 16, fontWeight: 600, color: rankColor }}
                    >
                      {i + 1}
                    </div>

                    {/* Center */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="truncate"
                          style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}
                        >
                          {title}
                        </div>
                        {p.post?.post_url && (
                          <a
                            href={p.post.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                        {formatNumber(p.impressions ?? 0)} impressions
                        <span className="mx-1.5" style={{ color: "var(--color-text-muted)" }}>·</span>
                        {formatNumber(p.reactions ?? 0)} engagements
                      </div>
                    </div>

                    {/* Right */}
                    <div className="text-right shrink-0">
                      <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: "var(--brand)" }}>
                        {erPct.toFixed(1)}%
                      </div>
                      {badge && (
                        <div
                          className="text-xs tracking-wider px-1.5 py-0.5 rounded mt-0.5 inline-block"
                          style={{ background: badge.bg, color: badge.color, fontWeight: 600, border: `0.5px solid ${badge.border}` }}
                        >
                          {badge.label}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline bar */}
                  <div
                    className="mt-2"
                    style={{
                      height: 3,
                      background: "var(--color-border)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${fillPct}%`,
                        height: "100%",
                        background: "var(--brand)",
                        opacity: barOpacity,
                        borderRadius: 2,
                        transition: "width 600ms ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {openSections.posts && topPosts.length > 0 && (
          <SectionInsight
            text={impactNarrative?.post_insight}
            askAuraPrompt="What should my next post be about?"
          />
        )}
      </section>

      {/* ─────────── 5b. LINKEDIN ANALYTICS (always visible) ─────────── */}
      <section data-section="linkedin-analytics">
        {(() => {
          const hasData = postMetricsCount > 0 || latestFollowers != null || followerRows.length > 0;
          const lastUpdatedLabel = latestSnapshotDate ? fmtDateShort(latestSnapshotDate) : null;

          const UploadZone = (
            <div className="mt-4">
              <div className="text-xs font-semibold tracking-[0.14em] mb-2" style={{ color: "var(--color-text-muted)" }}>
                How to export your LinkedIn data
              </div>
              <ol className="text-[12px] leading-relaxed space-y-1 pl-4 list-decimal" style={{ color: "var(--color-text-secondary)" }}>
                <li>Go to <span style={{ color: "var(--color-text-primary)" }}>linkedin.com/analytics/creator</span></li>
                <li>Click <span style={{ color: "var(--color-text-primary)" }}>Export</span> (top right)</li>
                <li>Select your date range (last 365 days recommended)</li>
                <li>Download the .xlsx file and upload it below</li>
              </ol>
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!selectedFile ? (
                  <button
                    onClick={handleUploadClick}
                    disabled={uploading}
                    data-testid="impact-linkedin-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                    style={{ background: "var(--brand)", color: "var(--paper)" }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload LinkedIn .xlsx file
                  </button>
                ) : (
                  <>
                    <span className="text-xs px-3 py-1.5 rounded-md" style={{ background: "var(--color-border)", color: "var(--color-text-primary)" }}>
                      {selectedFile.name}
                    </span>
                    <button
                      onClick={() => handleUpload()}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                      style={{ background: "var(--brand)", color: "var(--paper)" }}
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploading ? "Importing..." : "Import"}
                    </button>
                    {!uploading && (
                      <button
                        onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                Takes ~30 seconds. Includes your posts, follower growth, and audience demographics.
              </p>
            </div>
          );

          return (
            <div
              className="rounded-lg p-5"
              style={{ border: "0.5px solid var(--color-border)", background: "var(--color-card)" }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" style={{ color: "var(--brand)" }} />
                  <h2 className="text-xs font-semibold tracking-[0.14em]" style={{ color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    LinkedIn analytics
                    <InfoTooltip
                      label="LinkedIn data"
                      text="Upload your LinkedIn analytics export to connect real engagement data. Go to linkedin.com/analytics/creator → Export."
                      side="bottom"
                      triggerSize={13}
                    />
                  </h2>
                </div>
                {hasData && lastUpdatedLabel && (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Last updated: {lastUpdatedLabel}
                  </span>
                )}
              </div>

              {hasData ? (
                <div className="mt-3">
                  <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                    <Check className="inline w-3.5 h-3.5 mr-1" style={{ color: "var(--brand)" }} />
                    {latestFollowers != null
                      ? `${latestFollowers.toLocaleString()} followers tracked`
                      : "Upload your LinkedIn data"}
                  </p>
                  <div className="mt-3">
                    <button
                      onClick={() => setShowUpdateUpload(v => !v)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ border: "0.5px solid var(--color-border)", color: "var(--color-text-primary)", background: "transparent" }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {showUpdateUpload ? "Hide upload" : "Update LinkedIn data"}
                    </button>
                  </div>
                  {showUpdateUpload && UploadZone}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    Connect your LinkedIn data to close the intelligence loop — see which signals drive real engagement.
                  </p>
                  {UploadZone}
                </div>
              )}

              {pipeline && (
                <ul className="mt-4 space-y-2">
                  {(["voice", "positioning", "score"] as const).map((k) => {
                    const status = pipeline[k];
                    return (
                      <li key={k} className="flex items-center gap-3 text-[12px]">
                        {status === "done" ? (
                          <Check className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
                        ) : status === "running" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--brand)" }} />
                        ) : status === "error" ? (
                          <span className="w-3.5 h-3.5 inline-block text-center text-destructive">!</span>
                        ) : (
                          <span className="w-3.5 h-3.5 inline-block rounded-full border" style={{ borderColor: "var(--color-border)" }} />
                        )}
                        <span style={{ color: status === "done" ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
                          {PIPELINE_LABELS[k]}
                          {status === "error" && (
                            <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
                              — Will retry automatically
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })()}
      </section>

      {/* ─────────── 6. FOLLOWER GROWTH ─────────── */}
      <section>
        {impressionsSeries.length > 1 && (periodImpressions ?? 0) > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div
              className="text-xs uppercase font-medium mb-2"
              style={{ letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}
            >
              Impressions over time
            </div>
            <div
              className="rounded-lg p-5"
              style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
            >
              <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 32, fontWeight: 500, color: "var(--ink)", lineHeight: 1 }}>
                {formatNumber(periodImpressions ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Cumulative impressions · last {selectedDays}d
              </div>
              <PeriodComparison change={impChange} selectedDays={selectedDays} />
              <div style={{ height: 180, width: "100%", marginTop: 14 }}>
                <ResponsiveContainer>
                  <AreaChart data={impressionsSeries} margin={{ top: 6, right: 8, bottom: 4, left: -8 }}>
                    <defs>
                      <linearGradient id="impArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#B08D3A" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#B08D3A" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.max(0, Math.floor(impressionsSeries.length / 6) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tickFormatter={(v: number) => formatCompact(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "0.5px solid var(--color-border)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "var(--color-text-primary)",
                      }}
                      formatter={(value: any, name: string) => {
                        if (name === "cumulative") return [formatNumber(Number(value)), "Cumulative"];
                        if (name === "daily") return [formatNumber(Number(value)), "Daily"];
                        return [value, name];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#B08D3A"
                      strokeWidth={1.5}
                      fill="url(#impArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        <h2
          className="text-xs font-semibold tracking-[0.14em] mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Follower growth — daily new followers
        </h2>
        <p className="text-[12px] mb-3" style={{ color: "var(--color-text-muted)", marginTop: -8 }}>
          Your audience trajectory — upload your LinkedIn analytics to see the connection between signals and followers
        </p>
        {followerRows.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Only one day of data so far. More data will appear after additional snapshots.
          </p>
        ) : followerSeries.length <= 1 ? (
          (() => {
            const only = followerSeries[0];
            const delta = only?.growth ?? 0;
            return (
              <div
                className="rounded-lg p-5"
                style={{
                  background: "var(--color-card)",
                  border: "0.5px solid rgba(0,0,0,0.07)",
                  borderRadius: 14,
                  boxShadow: "var(--aura-shadow-sm, 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05))",
                }}
              >
                <div className="text-section-header" style={{ color: "var(--ink-4)" }}>
                  Best day
                </div>
                <div
                  className="text-metric mt-1"
                  style={{ color: "var(--success)" }}
                >
                  {only ? only.label : "—"} {delta > 0 ? `(+${delta})` : delta < 0 ? `(${delta})` : "(0)"}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--ink-5)" }}>
                  Only one day of follower data so far. More data will appear after additional snapshots.
                </div>
              </div>
            );
          })()
        ) : (
          <div
            className="rounded-lg p-5"
            style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
          >
            <div style={{ height: 160, width: "100%" }}>
              <ResponsiveContainer>
                <BarChart data={followerSeries} margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={(p: any) => {
                      const d = followerSeries[p.index];
                      if (!d?.showLabel) return <g />;
                      return (
                        <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
                          {d.label}
                        </text>
                      );
                    }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, "auto"]}
                    tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-border)", opacity: 0.3 }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "0.5px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--color-text-primary)",
                    }}
                    formatter={(value: any) => [`+${value} new followers`, ""]}
                  />
                  <Bar dataKey="growth" fill="#B08D3A" radius={[2, 2, 0, 0]} />
                  {publishMarkers.map((m, idx) => {
                    const first = m.posts[0];
                    const preview = (first.post_text || "").replace(/\s+/g, " ").trim().slice(0, 40);
                    const dateLabel = fmtDateShort(first.published_at);
                    const tip = `Post published · ${dateLabel}${m.posts.length > 1 ? ` (+${m.posts.length - 1} more)` : ""}${preview ? ` — ${preview}${(first.post_text || "").length > 40 ? "…" : ""}` : ""}`;
                    return (
                      <ReferenceLine
                        key={`pub-${idx}`}
                        x={m.label}
                        stroke="var(--brand)"
                        strokeWidth={0.5}
                        strokeDasharray="2 2"
                        ifOverflow="extendDomain"
                        label={(props: any) => {
                          const { viewBox } = props;
                          if (!viewBox) return null as any;
                          const cx = viewBox.x;
                          const cy = viewBox.y + 2;
                          return (
                            <g>
                              <title>{tip}</title>
                              <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="transparent" />
                              <polygon
                                points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                                fill="var(--brand)"
                                stroke="var(--brand)"
                                strokeWidth={0.5}
                              />
                            </g>
                          );
                        }}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
              <div>
                <Stat
                  label={`New followers · last ${selectedDays}d`}
                  value={newFollowersPeriod > 0 ? `+${formatNumber(newFollowersPeriod)}` : "0"}
                  valueColor="var(--success)"
                />
                <PeriodComparison change={followerChange} selectedDays={selectedDays} growthContext />
              </div>
              <Stat
                label="Best single day"
                value={bestDay && bestDay.follower_growth > 0
                  ? `+${bestDay.follower_growth} · ${fmtDateShort(bestDay.snapshot_date)}`
                  : "—"}
                valueColor="var(--success)"
              />
            </div>
          </div>
        )}
      </section>
      </>
      )}

      {/* ─────────── 8. CAPTURE ACTIVITY ─────────── */}
      {/* "Your rhythm — last X days" chart removed — duplicated from Home/Intelligence. */}

    </motion.div>
  );
};

const HeroStat = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <div
    style={{
      background: "var(--color-card)",
      border: "0.5px solid var(--color-border)",
      borderRadius: 8,
      padding: "14px 16px",
    }}
  >
    <div
      className="text-kpi"
      style={{ color }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 12,
        letterSpacing: "0.06em",
        color: "var(--color-text-secondary)",
        marginTop: 4,
      }}
    >
      {label}
    </div>
  </div>
);

const Stat = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <div>
    <div
      className="text-kpi"
      style={{ color: valueColor || "var(--color-text-primary)", fontSize: 20 }}
    >
      {value}
    </div>
    <div className="text-section-header mt-1" style={{ color: "var(--color-text-muted)" }}>
      {label}
    </div>
  </div>
);

/* Sprint F3 — animated number for score breakdown cards (200ms stagger) */
const BreakdownNumber = ({ value, index }: { value: number; index: number }) => {
  const enabled =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-fx-score-ring") === "true";
  const display = useCountUp(value, { duration: 1200, delay: index * 200, gate: enabled });
  return <>{display}</>;
};

/* ─── SectionToggle ─────────────────────────────────────────── */
const SectionToggle = ({
  title, open, onToggle, right,
}: { title: string; open: boolean; onToggle: () => void; right?: React.ReactNode }) => (
  <div
    onClick={onToggle}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
    className="flex items-center justify-between cursor-pointer select-none"
    style={{ padding: "4px 0" }}
  >
    <h2
      style={{
        fontFamily: "var(--font-serif), Georgia, serif",
        fontSize: 18,
        fontWeight: 500,
        color: "var(--color-text-primary)",
        letterSpacing: "-0.01em",
        margin: 0,
      }}
    >
      {title}
    </h2>
    <div className="flex items-center gap-3">
      {right}
      <ChevronDown
        className="w-4 h-4 transition-transform"
        style={{
          color: "var(--color-text-muted)",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
        }}
      />
    </div>
  </div>
);

/* ─── ForceCard ─────────────────────────────────────────────── */
const ForceCard = ({
  label, rawValue, weight, maxPoints, color, hint, status, tooltip, slug, weightedOverride,
}: {
  label: string; rawValue: number; weight: number; maxPoints: number;
  color: string; hint: string; status: string; tooltip: string; slug?: string;
  weightedOverride?: number | null;
}) => {
  const raw = Math.max(0, Math.min(100, Math.round(rawValue)));
  // Prefer the EF-provided weighted value; fall back to local math only when
  // the EF predates the weighted fields.
  const weighted = (weightedOverride != null && Number.isFinite(weightedOverride))
    ? Math.round(weightedOverride)
    : Math.round(raw * weight);
  const pct = (weighted / maxPoints) * 100;
  return (
    <div
      style={{
        background: "var(--aura-card)",
        borderRadius: 12,
        border: "1px solid var(--aura-border)",
        borderTop: `3px solid var(--brand)`,
        padding: "14px 16px",
        position: "relative",
      }}
    >
      <div className="flex items-baseline justify-between">
        <div className="inline-flex items-center gap-1.5">
          <div className="text-section-header" style={{ color: "var(--ink-3)" }}>
            {label}
          </div>
          {slug ? (
            <InfoTooltip slug={slug} label={label} side="bottom" triggerSize={12} />
          ) : (
          <TooltipProvider delayDuration={150}>
            <UiTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} info`}
                  style={{ background: "transparent", border: 0, cursor: "help", color: "var(--aura-t3)", padding: 0, display: "inline-flex" }}
                >
                  <Info size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                {tooltip}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
          )}
        </div>
        <div
          className="text-xs tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: `${color}1F`, color, fontWeight: 600 }}
        >
          {status}
        </div>
      </div>
      <div
        className="text-metric mt-1 inline-flex items-baseline gap-1.5"
        style={{
          color,
        }}
      >
        {weighted}
        <span className="text-denominator">
          /{maxPoints}
        </span>
      </div>
      <div
        className="mt-2"
        style={{ height: 6, background: "var(--aura-border)", borderRadius: 3, overflow: "hidden" }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 700ms ease",
          }}
        />
      </div>
      <div className="text-xs mt-2" style={{ color: "var(--aura-t2)" }}>
        {hint}
      </div>
    </div>
  );
};

/* ─── ScoreHero ─────────────────────────────────────────────── */
const ScoreHero = ({
  score, tierName, nextTierName, pointsToNext, sector,
  followers, impressions, engagementRate, trendLabel,
  selectedDays, impChange, engChange, followerChange,
}: {
  score: number;
  tierName?: "Observer" | "Explorer" | "Strategist" | "Voice" | "Presence" | null;
  nextTierName?: string | null;
  pointsToNext?: number | null;
  sector?: string | null;
  followers: number | null;
  impressions: number | null;
  engagementRate: number | null;
  trendLabel: string;
  selectedDays: RangeDays;
  impChange: number | null;
  engChange: number | null;
  followerChange: number | null;
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const r = 64;
  const c = 2 * Math.PI * r;
  const targetDash = (pct / 100) * c;
  const tierProgressPct = pointsToNext != null && nextTierName
    ? Math.max(0, Math.min(100, 100 - (pointsToNext / 100) * 100))
    : 100;
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
      : String(Math.round(n));

  // Count-up score + ring draw-in + breathing pulse (once per session).
  const animatedScore = useCountUp(pct, { duration: 800, once: true, key: "impact-score-ring" });
  const [dash, setDash] = useState(0);
  const [breathing, setBreathing] = useState(false);
  useEffect(() => {
    const reduced = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setDash(targetDash); setBreathing(true); return; }
    setDash(0);
    const id = requestAnimationFrame(() => setDash(targetDash));
    const t = window.setTimeout(() => setBreathing(true), 850);
    return () => { cancelAnimationFrame(id); window.clearTimeout(t); };
  }, [targetDash]);

  // Stagger 100ms between the 3 mini KPI cards.
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "var(--aura-card)",
        border: "1px solid var(--aura-border)",
        borderRadius: 14,
        padding: "22px 22px",
      }}
    >
      <div className="flex items-start gap-5 flex-wrap">
        {/* Score ring */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div data-testid="impact-score" style={{ width: 140, height: 140, position: "relative" }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={r} fill="none" stroke="var(--aura-border)" strokeWidth="11" />
              <circle
                cx="70" cy="70" r={r} fill="none"
                stroke="var(--aura-accent)" strokeWidth="11" strokeLinecap="round"
                strokeDasharray={`${dash} ${c}`}
                transform="rotate(-90 70 70)"
                className={breathing ? "aura-ring-breathing" : undefined}
                style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.16, 1, 0.3, 1)" }}
              />
            </svg>
            <div
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <div
                className="text-metric"
                style={{
                  color: "var(--aura-accent)",
                }}
              >
                {animatedScore}
              </div>
              <div
                style={{
                  fontSize: 14, color: "var(--aura-t2)", marginTop: 4,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                of 100
                <InfoTooltip slug="score-overview" label="Imprint" side="bottom" triggerSize={11} className="ml-1" />
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 12, color: "var(--aura-t2)", textAlign: "center", letterSpacing: "0.01em",
            lineHeight: 1.35, maxWidth: 150,
          }}>
            the mark your expertise is leaving
          </div>
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-[220px] flex flex-col gap-3">
          {/* Tier card */}
          <div
            data-testid="impact-tier"
            style={{
              background: "var(--aura-card-glass)",
              border: "1px solid var(--aura-border)",
              borderRadius: 12,
              padding: "14px 16px",
              color: "var(--aura-t1)",
            }}
          >
            <div className="text-section-header" style={{ color: "var(--aura-accent)", opacity: 0.8 }}>
              Current tier
            </div>
            <div style={{ marginTop: 4, display: "inline-flex" }}>
              <span style={{
                background: "var(--aura-accent)", color: "var(--aura-bg)",
                padding: "3px 10px", borderRadius: 999,
                fontFamily: "var(--aura-font-heading)", fontSize: 14, fontWeight: 600, letterSpacing: "0.02em",
              }}>
                {tierName || "Observer"}
              </span>
            </div>
            {sector && (
              <div style={{ fontSize: 12, color: "var(--aura-t2)", marginTop: 6 }}>
                {sector}
              </div>
            )}
            {nextTierName && pointsToNext != null && pointsToNext > 0 && (
              <>
                <div className="mt-2.5" style={{ height: 4, background: "var(--aura-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${tierProgressPct}%`, height: "100%", background: "var(--aura-accent)" }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--aura-t2)", marginTop: 4 }}>
                  {pointsToNext} to {nextTierName}
                </div>
              </>
            )}
            {trendLabel && (
              <div style={{ fontSize: 12, color: "var(--aura-positive)", marginTop: 6, fontWeight: 600 }}>
                {trendLabel}
              </div>
            )}
          </div>

          {/* Mini KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <MiniKPI index={0} label="Followers" rawValue={followers} formatter={(n) => fmt(n)}
              selectedDays={selectedDays} change={followerChange} growthContext />
            <MiniKPI index={1} label="Impressions" rawValue={impressions} formatter={(n) => fmt(n)}
              selectedDays={selectedDays} change={impChange} />
            <MiniKPI index={2} label="Avg Engagement" rawValue={engagementRate} formatter={(n) => `${n.toFixed(1)}%`}
              selectedDays={selectedDays} change={engChange} />
          </div>
        </div>
      </div>
    </section>
  );
};

const PeriodComparison = ({ change, selectedDays, growthContext = false }: { change: number | null; selectedDays: number; growthContext?: boolean }) => {
  if (change === null) return null;
  const isFlat = Math.abs(change) < 0.5;
  const isUp = change > 0;
  const slowerPace = growthContext && !isUp && !isFlat;
  return (
    <div style={{ fontSize: 11, marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {isFlat ? (
        <span style={{ color: "var(--color-text-secondary)" }}>● 0%</span>
      ) : (
        <span style={{ color: isUp ? "var(--success)" : (slowerPace ? "var(--warning)" : "var(--error)"), fontWeight: 600 }}>
          {(() => {
            const abs = Math.abs(change);
            if (abs > 200) {
              const multiplier = (change > 0 ? change : -change) / 100;
              return (
                <>
                  {isUp ? "▲" : "▼"} {multiplier.toFixed(0)}× {isUp ? "growth" : (slowerPace ? "slower" : "decline")}
                </>
              );
            }
            return (
              <>
                {isUp ? "▲" : "▼"} {change > 0 ? "+" : ""}{change.toFixed(1)}%{slowerPace ? " slower" : ""}
              </>
            );
          })()}
        </span>
      )}
      <span style={{ color: "var(--color-text-muted)" }}>vs. prior {selectedDays}d</span>
    </div>
  );
};

const MiniKPI = ({ label, rawValue, formatter, index = 0, selectedDays, change, growthContext }: {
  label: string;
  rawValue: number | null;
  formatter: (n: number) => string;
  index?: number;
  selectedDays?: RangeDays;
  change?: number | null;
  growthContext?: boolean;
}) => {
  // For decimals (engagement rate), scale by 10 so the count-up stays integer-safe.
  const isDecimal = formatter(0.1).includes(".");
  const scale = isDecimal ? 10 : 1;
  const target = rawValue != null ? Math.round(rawValue * scale) : 0;
  const anim = useCountUp(target, { duration: 800, delay: index * 100, once: true, key: `mini-kpi-${label}` });
  const display = rawValue == null ? "—" : formatter(anim / scale);
  return (
  <div
    className="animate-fade-up-in"
    style={{
      background: "var(--aura-card-glass)",
      border: "1px solid var(--aura-border)",
      borderRadius: 8,
      padding: "10px 12px",
      animationDelay: `${index * 100}ms`,
      animationFillMode: "backwards",
    }}
  >
    <div
      className="text-kpi"
      style={{
        color: "var(--aura-t1)",
      }}
    >
      {display}
    </div>
    <div className="text-label mt-1" style={{ color: "var(--aura-t2)" }}>
      {label}
    </div>
    {selectedDays && (
      <div style={{ fontSize: 10, marginTop: 2, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Last {selectedDays}d
      </div>
    )}
    {change !== undefined && selectedDays && (
      <PeriodComparison change={change ?? null} selectedDays={selectedDays} growthContext={growthContext} />
    )}
  </div>
);
};

export default ImpactTab;

/* ─── SectionInsight ─────────────────────────────────────────── */
const SectionInsight = ({ text, askAuraPrompt }: { text?: string | null; askAuraPrompt?: string }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) {
    return (
      <div style={{ padding: "8px 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            border: "1.5px solid var(--color-border)",
            display: "inline-block",
            animation: "pulse 1.5s infinite",
          }} />
          Reading your data…
        </span>
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 0" }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 13, color: "#B08D3A", display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "inherit", fontWeight: 500,
        }}
      >
        <span style={{
          transition: "transform 0.2s",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>→</span>
        What this means
      </button>
      {expanded && (
        <div style={{
          marginTop: 8, padding: "12px 16px",
          fontSize: 14, lineHeight: 1.7,
          color: "var(--color-text-secondary)",
          borderLeft: "3px solid #B08D3A",
          background: "var(--color-background-secondary, var(--color-card))",
        }}>
          {text}
          {askAuraPrompt && (
            <button
              onClick={() => { window.location.hash = "#ask-aura"; }}
              style={{
                display: "block", marginTop: 10,
                fontSize: 12, color: "#B08D3A", background: "none",
                border: "none", cursor: "pointer", padding: 0,
                fontFamily: "inherit",
              }}
            >
              Ask Aura to go deeper →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── PillarCard ─────────────────────────────────────────────── */
const PillarCard = ({
  label, value, unit, color, tooltip, dots, slug,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  tooltip: { what: string; how: string; improve: string };
  dots?: number;
  slug?: string;
}) => {
  return (
    <div
      style={{
        background: "var(--aura-card)",
        border: "1px solid var(--aura-border)",
        borderTop: `3px solid var(--brand)`,
        borderRadius: 12,
        padding: "14px 16px",
        position: "relative",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-section-header" style={{ color: "var(--ink-3)" }}>
          {label}
        </div>
        {slug ? (
          <InfoTooltip slug={slug} label={label} side="bottom" triggerSize={12} />
        ) : (
        <TooltipProvider delayDuration={150}>
          <UiTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${label} info`}
                style={{ background: "transparent", border: 0, cursor: "help", color: "var(--aura-t3)", padding: 0, display: "inline-flex" }}
              >
                <Info size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs text-xs">
              {tooltip.what && <p><b style={{ color }}>What:</b> {tooltip.what}</p>}
              {tooltip.how && <p className="mt-1"><b style={{ color }}>How:</b> {tooltip.how}</p>}
              {tooltip.improve && <p className="mt-1"><b style={{ color }}>Improve:</b> {tooltip.improve}</p>}
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
        )}
      </div>
      <div
        className="text-metric mt-1"
        style={{
          color,
        }}
      >
        {value}
      </div>
      {typeof dots === "number" ? (
        <div className="flex" style={{ gap: 4, marginTop: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < dots ? color : "var(--aura-border)",
            }} />
          ))}
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: "var(--aura-t2)", marginTop: 8 }}>
        {unit}
      </div>
    </div>
  );
};
