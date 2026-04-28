import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { safeQuery } from "@/lib/safeQuery";

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

/* ── Component ── */
interface ImpactTabProps {
  onOpenCapture?: () => void;
}
const ImpactTab = ({ onOpenCapture }: ImpactTabProps = {}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState<RangeDays>(30);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [captureRows, setCaptureRows] = useState<{ created_at: string }[]>([]);
  const [capturesThisMonth, setCapturesThisMonth] = useState(0);
  const [lastCaptureAll, setLastCaptureAll] = useState<Date | null>(null);

  // All snapshots (no range filter) for Authority Trajectory forecasting
  const [allSnapshots, setAllSnapshots] = useState<{ score: number; created_at: string }[]>([]);
  const [scenario, setScenario] = useState<"current" | "publish2x" | "stop">("current");

  const [postMetricsCount, setPostMetricsCount] = useState(0);
  const [topPosts, setTopPosts] = useState<PostMetricRow[]>([]);

  const [followerRows, setFollowerRows] = useState<FollowerRow[]>([]);
  const [latestFollowers, setLatestFollowers] = useState<number | null>(null);
  const [periodImpressions, setPeriodImpressions] = useState<number | null>(null);
  const [periodEngagementRate, setPeriodEngagementRate] = useState<number | null>(null);

  // Peak score in last 30 days (always — regardless of filter — for narrative)
  const [peakScore30, setPeakScore30] = useState<number | null>(null);
  const [peakDate30, setPeakDate30] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Content performance
  const [contentPerf, setContentPerf] = useState<{
    postCount: number;
    topTheme: string;
    topFormat: string;
    avgEngagement: number;
    tones: Array<{ tone: string; count: number }>;
  } | null>(null);

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

    // All-time snapshots for trajectory forecasting (no range filter)
    const allSnapRes = await safeQuery(
      () => supabase
        .from("score_snapshots")
        .select("score, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      { context: "Impact: all snapshots", silent: true }
    );
    setAllSnapshots((allSnapRes.data as { score: number; created_at: string }[]) || []);

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

    // LinkedIn metrics count (overall, for empty state decisions)
    const { count: trueCount } = await supabase
      .from("linkedin_post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setPostMetricsCount(trueCount ?? 0);

    if ((trueCount ?? 0) > 0) {
      const topRes = await supabase
        .from("linkedin_post_metrics")
        .select("post_id, impressions, reactions, engagement_rate, snapshot_date, post:linkedin_posts(title, post_text, post_url, published_at)")
        .eq("user_id", user.id)
        .gte("snapshot_date", sinceDateOnly)
        .order("engagement_rate", { ascending: false })
        .limit(20);
      setTopPosts((topRes.data as any) || []);
    } else {
      setTopPosts([]);
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
      .filter(r => Number(r.followers || 0) > 0)
      .map(r => ({
        snapshot_date: r.snapshot_date,
        followers: Number(r.followers || 0),
        follower_growth: Number(r.follower_growth || 0),
      })));

    // Latest follower count (most recent snapshot, any date)
    const latestFolRes = await supabase
      .from("influence_snapshots")
      .select("followers")
      .eq("user_id", user.id)
      .eq("source_type", "linkedin_export")
      .gt("followers", 0)
      .order("snapshot_date", { ascending: false })
      .limit(1);
    setLatestFollowers((latestFolRes.data?.[0] as any)?.followers ?? null);

    // Period impressions + avg engagement rate
    const totalImp = folRowsAll.reduce((s, r) => s + Number(r.impressions || 0), 0);
    setPeriodImpressions(folRowsAll.length ? totalImp : null);

    const erRows = folRowsAll.filter(r => Number(r.engagement_rate || 0) > 0);
    if (erRows.length > 0) {
      const avg = erRows.reduce((s, r) => s + Number(r.engagement_rate || 0), 0) / erRows.length;
      setPeriodEngagementRate(avg);
    } else {
      setPeriodEngagementRate(null);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(selectedDays); /* eslint-disable-next-line */ }, [selectedDays]);

  // Load content performance (independent of time range)
  useEffect(() => {
    (async () => {
      const { data: allPosts } = await supabase
        .from("linkedin_posts")
        .select("theme, tone, format_type, engagement_score, like_count, comment_count, source_type, tracking_status, post_text, published_at")
        .neq("tracking_status", "rejected")
        .order("published_at", { ascending: false })
        .limit(200);

      const analyzablePosts = (allPosts || []).filter((p: any) =>
        p.source_type === "linkedin_export" ||
        p.source_type === "external_reference" ||
        (p.source_type === "aura_generated" && p.tracking_status === "published")
      );

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

      const avgEngagement = analyzablePosts.length > 0
        ? Math.round((analyzablePosts.reduce((sum: number, p: any) => sum + (Number(p.engagement_score) || 0), 0) / analyzablePosts.length) * 10) / 10
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
  }, []);

  /* ── Score derivations ── */
  const latest = snapshots[snapshots.length - 1];
  const latestScore = latest?.score ?? 0;
  const captureScore = latest?.components?.capture_score ?? 0;
  const contentScore = latest?.components?.content_score ?? 0;
  const signalScore = latest?.components?.signal_score ?? 0;

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

  const weekDelta = score7 !== null ? latestScore - score7 : null;

  let trendLabel = "→ Stable";
  let trendColor = "var(--color-text-secondary)";
  if (weekDelta !== null) {
    if (weekDelta > 0) { trendLabel = `↑ +${weekDelta} this week`; trendColor = "#7ab648"; }
    else if (weekDelta < 0) { trendLabel = `↓ −${Math.abs(weekDelta)} this week`; trendColor = "#E24B4A"; }
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

  /* ── AI narrative ── */
  const narrative = useMemo(() => {
    type Part = { text: string; type: "neutral" | "primary" | "negative" | "positive" | "action" };
    const parts: Part[] = [];

    // Opening
    if (weekDelta !== null && weekDelta < -5) {
      parts.push({ text: "Your authority score is declining — ", type: "neutral" });
      parts.push({ text: `down ${Math.abs(weekDelta)} points this week. `, type: "negative" });
    } else if (weekDelta !== null && weekDelta > 5) {
      parts.push({ text: "Your authority score is growing — ", type: "neutral" });
      parts.push({ text: `up ${weekDelta} points this week. `, type: "positive" });
    } else {
      parts.push({ text: "Your authority score is holding steady this week. ", type: "neutral" });
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
      case "negative": return "#E24B4A";
      case "positive": return "#7ab648";
      case "action": return "#F97316";
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
    : daysSinceLastAll === 0 ? "#7ab648"
      : daysSinceLastAll <= 3 ? "#EF9F27"
        : "#E24B4A";

  /* (score chart removed — only sub-score cards remain) */

  /* ── Sub-score card colour rules ── */
  const subScoreCard = (kind: "capture" | "content" | "signal", value: number) => {
    if (kind === "capture") {
      if (value >= 90) return { color: "#7ab648", border: "#7ab64844", tag: "Healthy" };
      if (value >= 70) return { color: "#F97316", border: "#F9731644", tag: "Good" };
      return { color: "#E24B4A", border: "#E24B4A44", tag: "Needs action" };
    }
    if (kind === "content") {
      if (value === 100) return { color: "#7ab648", border: "#7ab64844", tag: "Perfect" };
      if (value >= 70) return { color: "#F97316", border: "#F9731644", tag: "Good" };
      return { color: "#E24B4A", border: "#E24B4A44", tag: "Needs action" };
    }
    // signal
    if (value >= 85) return { color: "#7ab648", border: "#7ab64844", tag: "Strong" };
    if (value >= 70) return { color: "#F97316", border: "#F9731644", tag: "Good" };
    return { color: "#E24B4A", border: "#E24B4A44", tag: "Build signals" };
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

  /* ── Authority Trajectory forecast ── */
  const trajectory = useMemo(() => {
    if (allSnapshots.length < 2) return null;
    const first = allSnapshots[0];
    const last = allSnapshots[allSnapshots.length - 1];
    const firstDate = new Date(first.created_at).getTime();
    const lastDate = new Date(last.created_at).getTime();
    const daysBetween = Math.max(1, (lastDate - firstDate) / 86400000);
    const avgDailyChange = (last.score - first.score) / daysBetween;
    const currentScore = last.score;
    const mult = scenario === "current" ? 1 : scenario === "publish2x" ? 1.4 : -0.3;
    const dailyChange = avgDailyChange * mult;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
    const forecast30 = clamp(currentScore + dailyChange * 30);
    const forecast60 = clamp(currentScore + dailyChange * 60);
    const forecast90 = clamp(currentScore + dailyChange * 90);
    const delta90 = forecast90 - currentScore;
    let trendText: string;
    if (delta90 > 0) trendText = `At current pace, your authority score will increase by ${delta90} pts in 90 days.`;
    else if (delta90 < 0) trendText = `At current pace, your authority score will decrease by ${Math.abs(delta90)} pts in 90 days.`;
    else trendText = `At current pace, your authority score will hold steady in 90 days.`;
    if (scenario === "publish2x") trendText = trendText.replace("At current pace", "With 2× publishing");
    if (scenario === "stop") trendText = trendText.replace("At current pace", "If you stop capturing");
    let to95Text: string | null = null;
    if (currentScore < 92) {
      const needed = 95 - currentScore;
      if (dailyChange > 0) {
        const days = Math.ceil(needed / dailyChange);
        to95Text = `To reach 95: you need approximately ${needed} more points. At ${scenario === "current" ? "current pace" : scenario === "publish2x" ? "2× pace" : "this rate"}: ${days} days.`;
      } else {
        to95Text = `To reach 95: you need approximately ${needed} more points. At ${scenario === "stop" ? "this declining rate" : "current pace"}: not reachable.`;
      }
    }
    return { currentScore, forecast30, forecast60, forecast90, trendText, to95Text };
  }, [allSnapshots, scenario]);

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

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const { data, error } = await supabase.functions.invoke("import-linkedin-analytics", {
        body: form,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const imp = (data as any)?.imported || {};
      const days = (imp.engagement_rows || 0) + (imp.follower_rows || 0);
      toast.success(`LinkedIn data imported — ${days} days of data loaded`);
      setSelectedFile(null);
      await loadAll(selectedDays);
    } catch (err: any) {
      console.error("XLSX upload failed:", err);
      toast.error(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  const ranges: RangeDays[] = [7, 30, 90, 365];

  // Max engagement rate in topPosts (for inline bars)
  const maxErPct = topPosts.reduce((m, p) => {
    const raw = Number(p.engagement_rate || 0);
    const er = raw > 1 ? raw : raw * 100;
    return er > m ? er : m;
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-7 max-w-5xl"
    >
      {/* ─────────── 1. PAGE HEADER ─────────── */}
      <div className="space-y-1.5">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Measure your influence
        </div>
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}
        >
          Impact
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          How your authority is compounding
        </p>
      </div>

      {/* ─────────── 2. TIME FILTER ─────────── */}
      <div className="flex items-center gap-2">
        {ranges.map((r) => {
          const active = selectedDays === r;
          return (
            <button
              key={r}
              onClick={() => setSelectedDays(r)}
              className="px-3.5 py-1.5 text-xs rounded-full transition-colors"
              style={{
                background: active ? "#F97316" : "transparent",
                color: active ? "#ffffff" : "var(--color-text-secondary)",
                border: active ? "0.5px solid #F97316" : "0.5px solid var(--color-border)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {r}D
            </button>
          );
        })}
      </div>

      {/* ─────────── 3. AI NARRATIVE BRIEFING ─────────── */}
      <section
        className="p-6"
        style={{
          background: "var(--color-card)",
          border: "0.5px solid var(--color-border)",
          borderLeft: "4px solid #F97316",
          borderRadius: "0 8px 8px 0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
          {/* LEFT: narrative */}
          <div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
              {narrative.map((p, i) => (
                <span
                  key={i}
                  style={{ color: partColor(p.type), fontWeight: partWeight(p.type) }}
                >
                  {p.text}
                </span>
              ))}
            </p>

            {captureScore < 80 && (
              <button
                onClick={() => onOpenCapture?.()}
                className="mt-4 inline-flex items-center gap-1.5"
                style={{
                  background: "#F97316",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 16px",
                  borderRadius: 4,
                }}
              >
                Capture now →
              </button>
            )}
          </div>

          {/* RIGHT: authority score */}
          <div className="md:text-right md:min-w-[180px]">
            <div
              className="leading-none tabular-nums"
              style={{ fontSize: 48, fontWeight: 700, color: "#F97316", fontFamily: "Inter, sans-serif" }}
            >
              {latestScore}
            </div>
            <div
              className="mt-1.5"
              style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-text-muted)" }}
            >
              Authority score
            </div>
            <div className="mt-2 text-xs font-medium" style={{ color: trendColor }}>
              {trendLabel}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 4. SCORE BREAKDOWN (cards only) ─────────── */}
      <section>
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Score breakdown
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { kind: "capture" as const, label: "Capture", value: captureScore, desc: "Capture daily to maintain score" },
            { kind: "content" as const, label: "Content", value: contentScore, desc: "Publish via Aura to improve" },
            { kind: "signal" as const, label: "Signal", value: signalScore, desc: "Capture more to strengthen signals" },
          ]).map((c) => {
            const cfg = subScoreCard(c.kind, c.value);
            return (
              <div
                key={c.label}
                style={{
                  background: "var(--color-card)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  border: `0.5px solid ${cfg.border}`,
                }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    {c.label}
                  </div>
                  <div
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: `${cfg.color}18`, color: cfg.color, fontWeight: 600 }}
                  >
                    {cfg.tag}
                  </div>
                </div>
                <div
                  className="tabular-nums mt-1"
                  style={{ fontSize: 24, fontWeight: 700, color: cfg.color, lineHeight: 1.1 }}
                >
                  {Math.round(c.value)}
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                  {c.desc}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────── 4b. AUTHORITY TRAJECTORY ─────────── */}
      <section>
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Authority trajectory
        </h2>
        {!trajectory ? (
          <div
            className="rounded-lg p-4 text-[12px]"
            style={{
              border: "1px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Not enough data yet — check back after a few more days.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Row 1 — metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { label: "Today", value: trajectory.currentScore, color: "#F97316" },
                {
                  label: "30d forecast",
                  value: trajectory.forecast30,
                  color:
                    trajectory.forecast30 > trajectory.currentScore
                      ? "#7ab648"
                      : trajectory.forecast30 < trajectory.currentScore
                      ? "#E24B4A"
                      : "var(--color-text-secondary)",
                },
                {
                  label: "90d forecast",
                  value: trajectory.forecast90,
                  color:
                    trajectory.forecast90 > trajectory.currentScore
                      ? "#7ab648"
                      : trajectory.forecast90 < trajectory.currentScore
                      ? "#E24B4A"
                      : "var(--color-text-secondary)",
                },
              ]).map((c) => (
                <div
                  key={c.label}
                  style={{
                    background: "var(--color-card)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    border: "0.5px solid var(--color-border-secondary, var(--color-border))",
                  }}
                >
                  <div
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {c.label}
                  </div>
                  <div
                    className="tabular-nums mt-1"
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: c.color,
                      lineHeight: 1.1,
                      transition: "color 300ms ease, transform 300ms ease",
                    }}
                    key={`${c.label}-${c.value}`}
                  >
                    {c.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Row 2 — scenario toggle */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: "current", label: "Current pace" },
                { key: "publish2x", label: "2× publishing" },
                { key: "stop", label: "Stop capturing" },
              ] as const).map((b) => {
                const active = scenario === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setScenario(b.key)}
                    className="text-[11px] px-3 py-1.5 rounded-full transition-colors"
                    style={
                      active
                        ? { background: "#F97316", color: "#fff", border: "0.5px solid #F97316" }
                        : {
                            background: "transparent",
                            color: "var(--color-text-secondary)",
                            border: "0.5px solid var(--color-border-secondary, var(--color-border))",
                          }
                    }
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>

            {/* Row 3 — trend summary */}
            <div className="text-[12px] space-y-1" style={{ color: "var(--color-text-secondary)" }}>
              <div>{trajectory.trendText}</div>
              {trajectory.to95Text && <div>{trajectory.to95Text}</div>}
            </div>
          </div>
        )}
      </section>

      {/* ─────────── 5. HEADLINE STATS ─────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HeroStat
          value={latestFollowers !== null ? formatNumber(latestFollowers) : "—"}
          label={latestFollowers !== null ? "LinkedIn followers" : "No data yet"}
          color="#F97316"
        />
        <HeroStat
          value={periodImpressions !== null ? formatCompact(periodImpressions) : "—"}
          label={periodImpressions !== null ? "Impressions" : "No data yet"}
          color="var(--color-text-primary)"
        />
        <HeroStat
          value={periodEngagementRate !== null ? `${periodEngagementRate.toFixed(1)}%` : "—"}
          label={periodEngagementRate !== null ? "Avg engagement rate" : "No data yet"}
          color="#7ab648"
        />
      </div>

      {/* ─────────── 6. FOLLOWER GROWTH ─────────── */}
      <section>
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Follower growth — daily new followers
        </h2>
        {followerRows.length === 0 ? (
          <div
            className="rounded-lg p-6 text-center"
            style={{
              border: "1.5px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
              background: "transparent",
            }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              Import your LinkedIn analytics to see follower growth
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Upload your LinkedIn .xlsx export on this page
            </p>
            {postMetricsCount === 0 && (
              <button
                onClick={handleUploadClick}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: "#F97316", color: "#ffffff" }}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload LinkedIn .xlsx
              </button>
            )}
          </div>
        ) : (
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
          >
            <div style={{ height: 160, width: "100%" }}>
              <ResponsiveContainer>
                <BarChart data={followerSeries} margin={{ top: 6, right: 8, bottom: 4, left: -8 }}>
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
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-border)", opacity: 0.3 }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "0.5px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "var(--color-text-primary)",
                    }}
                    formatter={(value: any) => [`+${value} new followers`, ""]}
                  />
                  <Bar dataKey="growth" fill="#7ab648" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
              <Stat
                label="New followers this period"
                value={newFollowersPeriod > 0 ? `+${formatNumber(newFollowersPeriod)}` : "0"}
                valueColor="#7ab648"
              />
              <Stat
                label="Best single day"
                value={bestDay && bestDay.follower_growth > 0
                  ? `+${bestDay.follower_growth} · ${fmtDateShort(bestDay.snapshot_date)}`
                  : "—"}
                valueColor="#7ab648"
              />
            </div>
          </div>
        )}
      </section>

      {/* ─────────── 7. POST PERFORMANCE ─────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Post performance
          </h2>
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            vs 2.5% LinkedIn avg
          </span>
        </div>

        {postMetricsCount === 0 ? (
          <div
            className="rounded-lg p-6"
            style={{ border: "1.5px dashed var(--color-border)", background: "transparent" }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(249,115,22,0.1)", border: "0.5px solid var(--color-border)" }}
              >
                <Upload className="w-5 h-5" style={{ color: "#F97316" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  No post data for this period
                </h3>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Import your LinkedIn analytics to see post performance.
                </p>
                <ol
                  className="mt-3 text-[11px] leading-relaxed space-y-1 pl-4 list-decimal"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <li>Go to <span style={{ color: "var(--color-text-primary)" }}>linkedin.com/analytics/creator</span></li>
                  <li>Click <span style={{ color: "var(--color-text-primary)" }}>Export</span> (top right)</li>
                  <li>Select date range → Download</li>
                  <li>Upload the .xlsx file below</li>
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
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                      style={{ background: "#F97316", color: "#ffffff" }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload LinkedIn .xlsx file
                    </button>
                  ) : (
                    <>
                      <span className="text-[11px] px-3 py-1.5 rounded-md" style={{ background: "var(--color-border)", color: "var(--color-text-primary)" }}>
                        {selectedFile.name}
                      </span>
                      <button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                        style={{ background: "#F97316", color: "#ffffff" }}
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {uploading ? "Importing..." : "Import"}
                      </button>
                      {!uploading && (
                        <button
                          onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="text-[11px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
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

              // Engagement rate normalization
              const rawEr = Number(p.engagement_rate || 0);
              const erPct = rawEr > 1 ? rawEr : rawEr * 100;
              const isTop = i === 0;
              const fillPct = maxErPct > 0 ? (erPct / maxErPct) * 100 : 0;
              const rankColor = isTop ? "#F97316" : "var(--color-text-muted)";

              let badge: { label: string; bg: string; color: string; border: string } | null = null;
              if (i < 3) {
                badge = { label: "Top post", bg: "#F9731618", color: "#F97316", border: "#F9731644" };
              } else if (erPct > 5) {
                badge = { label: "Exceptional", bg: "#7ab64818", color: "#7ab648", border: "#7ab64844" };
              } else if (erPct >= 3) {
                badge = { label: "Above avg", bg: "#F9731618", color: "#F97316", border: "#F9731644" };
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
                    borderLeft: isTop ? "3px solid #F97316" : undefined,
                    paddingLeft: isTop ? 12 : undefined,
                    background: isTop ? "rgba(249,115,22,0.04)" : undefined,
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
                          style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}
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
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5" style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                        {formatNumber(p.impressions ?? 0)} impressions
                        <span className="mx-1.5" style={{ color: "var(--color-text-muted)" }}>·</span>
                        {formatNumber(p.reactions ?? 0)} reactions
                      </div>
                    </div>

                    {/* Right */}
                    <div className="text-right shrink-0">
                      <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: "#F97316" }}>
                        {erPct.toFixed(1)}%
                      </div>
                      {badge && (
                        <div
                          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 inline-block"
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
                        background: "#F97316",
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
        )}
      </section>

      {/* ─────────── 8. CAPTURE ACTIVITY ─────────── */}
      <section>
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Capture activity — last {selectedDays} days
        </h2>
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--color-card)", border: "0.5px solid var(--color-border)" }}
        >
          <div style={{ height: 120, width: "100%" }}>
            <ResponsiveContainer>
              <BarChart data={captureSeries} margin={{ top: 6, right: 8, bottom: 4, left: -16 }}>
                <XAxis
                  dataKey="label"
                  tick={(p: any) => {
                    const d = captureSeries[p.index];
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
                  allowDataOverflow={false}
                  tickCount={5}
                  tickFormatter={(v) => Math.round(Number(v)).toString()}
                  tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <ReferenceLine
                  y={5}
                  stroke="var(--color-text-muted)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.45}
                  label={{ value: "5", position: "right", fontSize: 9, fill: "var(--color-text-muted)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-border)", opacity: 0.3 }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "var(--color-text-primary)",
                  }}
                  formatter={(value: any) => [`${value} captures`, ""]}
                />
                <Bar dataKey="captures" fill="#F97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Insight line */}
          {daysSinceLastAll !== null && (
            <div
              className="mt-3 text-xs"
              style={{
                color:
                  daysSinceLastAll >= 4 ? "#E24B4A"
                    : daysSinceLastAll === 0 ? "#7ab648"
                      : "#EF9F27",
                fontWeight: 500,
              }}
            >
              {daysSinceLastAll >= 4
                ? `No captures in ${daysSinceLastAll} days — this is why your score dropped.`
                : daysSinceLastAll === 0
                  ? "You captured today — keep the streak going."
                  : "Capture today to maintain your score."}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mt-4 pt-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <Stat label="Captures this month" value={String(capturesThisMonth)} />
            <Stat label="Most active day" value={mostActive.captures > 0 ? mostActive.label : "—"} />
            <Stat
              label="Days since last capture"
              value={
                daysSinceLastAll === null
                  ? "—"
                  : daysSinceLastAll === 0
                    ? "Today"
                    : String(daysSinceLastAll)
              }
              valueColor={daysColor}
            />
          </div>
        </div>
      </section>

      {/* ─────────── 9. CONTENT PERFORMANCE ─────────── */}
      <section>
        <h2
          className="text-label uppercase tracking-wider text-xs font-semibold mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Content performance
        </h2>

        {!contentPerf || contentPerf.postCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No published content data yet. Posts published via Aura or imported from LinkedIn will appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card rounded-xl p-5 border border-border/8">
                <div className="text-foreground font-bold text-lg">{contentPerf.postCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Posts Analyzed</div>
              </div>
              <div className="glass-card rounded-xl p-5 border border-border/8">
                <div className="text-foreground font-bold text-lg capitalize">{contentPerf.topTheme}</div>
                <div className="text-xs text-muted-foreground mt-1">Top Theme</div>
              </div>
              <div className="glass-card rounded-xl p-5 border border-border/8">
                <div className="text-foreground font-bold text-lg">{contentPerf.avgEngagement}%</div>
                <div className="text-xs text-muted-foreground mt-1">Avg Engagement</div>
              </div>
            </div>

            {/* Tone distribution */}
            {contentPerf.tones.length > 0 && (() => {
              const maxToneCount = Math.max(...contentPerf.tones.map(t => t.count), 1);
              return (
                <div className="space-y-3">
                  <div
                    className="text-label uppercase tracking-wider text-xs font-semibold"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Tone distribution
                  </div>
                  <div className="glass-card rounded-2xl p-6 border border-border/8 space-y-3">
                    {contentPerf.tones.map(({ tone, count }) => {
                      const pct = (count / maxToneCount) * 100;
                      return (
                        <div key={tone} className="flex items-center gap-3">
                          <span className="text-sm text-foreground capitalize w-28 shrink-0">{tone}</span>
                          <div className="flex-1 bg-secondary/20 rounded-full h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-primary/40 rounded-full"
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* AI insight */}
            <div className="glass-card rounded-2xl p-6 border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-primary/60" />
                <span className="text-label uppercase tracking-wider text-xs font-semibold text-primary/60">
                  Content insight
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {contentPerf.topTheme !== "—" && contentPerf.topFormat !== "—"
                  ? `Your strongest content theme is "${contentPerf.topTheme}". ${contentPerf.topFormat} format drives your highest engagement. Double down on this combination to compound your authority.`
                  : contentPerf.topTheme !== "—"
                  ? `Your strongest content theme is "${contentPerf.topTheme}". Publish more consistently to unlock format performance insights.`
                  : "Publish and mark content as published to unlock content performance insights."}
              </p>
            </div>
          </div>
        )}
      </section>
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
      className="tabular-nums"
      style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "Inter, sans-serif", lineHeight: 1.1 }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
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
      className="text-xl font-semibold tabular-nums"
      style={{ color: valueColor || "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--color-text-muted)" }}>
      {label}
    </div>
  </div>
);

export default ImpactTab;
