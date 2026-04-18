import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import SectionError from "@/components/ui/section-error";
import { formatSmartDate } from "@/lib/formatDate";

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
}
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

  // per-trend UI state
  const [addedSignalIds, setAddedSignalIds] = useState<Set<string>>(new Set());
  const [dismissedTrendIds, setDismissedTrendIds] = useState<Set<string>>(new Set());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load name
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const meta: any = user.user_metadata || {};
      const fallback = (user.email || "").split("@")[0];
      let name = meta.first_name || meta.full_name || meta.name || "";
      try {
        const { data } = await supabase
          .from("diagnostic_profiles")
          .select("first_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.first_name) name = data.first_name;
      } catch {}
      setUserName((name || fallback || "there").toString().split(" ")[0].toUpperCase());
    })();
  }, []);

  // ─── Loaders ───
  const loadBriefing = useCallback(async () => {
    setBriefLoading(true);
    setBriefError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const uid = user.id;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

      const [latestRes, prevRes, lastEntryRes, lastDocRes, sigRes, moveRes, follRes] = await Promise.all([
        supabase.from("score_snapshots").select("score, components, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("score_snapshots").select("score").eq("user_id", uid).lte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("entries").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("documents").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("strategic_signals").select("signal_title, confidence").eq("user_id", uid).eq("status", "active").order("confidence", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("recommended_moves").select("id, title, rationale, output_type").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("influence_snapshots").select("follower_growth").eq("user_id", uid).eq("source_type", "linkedin_export").gte("snapshot_date", thirtyDaysAgo),
      ]);

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
    } catch (e) {
      console.error("[HomeTab] briefing load failed", e);
      setBriefError(true);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  const loadMoves = useCallback(async () => {
    setMovesLoading(true);
    setMovesError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const { data, error } = await supabase
        .from("recommended_moves")
        .select("id, title, rationale, output_type")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      setMoves(data || []);
    } catch (e) {
      console.error("[HomeTab] moves load failed", e);
      setMovesError(true);
    } finally {
      setMovesLoading(false);
    }
  }, []);

  const loadTrends = useCallback(async () => {
    setTrendsLoading(true);
    setTrendsError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const { data, error } = await supabase
        .from("industry_trends")
        .select("id, headline, insight, url, source, fetched_at, status")
        .eq("user_id", user.id)
        .order("fetched_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      setTrends((data || []) as Trend[]);
    } catch (e) {
      console.error("[HomeTab] trends load failed", e);
      setTrendsError(true);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  const loadTrendsBadge = useCallback(async () => {
    setTrendsCountLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { count } = await supabase
        .from("industry_trends")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("fetched_at", sevenDaysAgo);
      setTrendsBadgeCount(count || 0);
    } catch (e) {
      console.error("[HomeTab] trends badge failed", e);
    } finally {
      setTrendsCountLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBriefing();
    loadMoves();
    loadTrends();
    loadTrendsBadge();
  }, [loadBriefing, loadMoves, loadTrends, loadTrendsBadge]);

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

  const visibleTrends = trends.filter(t => !dismissedTrendIds.has(t.id));

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
        {!trendsCountLoading && trendsBadgeCount > 0 && (
          <span style={{
            background: ACCENT, color: "#fff", fontSize: 11, fontWeight: 500,
            padding: "3px 12px", borderRadius: 20,
          }}>
            {trendsBadgeCount} new trend{trendsBadgeCount === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {/* SECTION 2 — AI daily briefing */}
      {briefError ? (
        <div className="rounded-r-lg border border-l-4" style={{ borderColor: "hsl(var(--border) / 0.5)", borderLeftColor: ACCENT, background: "hsl(var(--card))" }}>
          <SectionError onRetry={loadBriefing} message="Couldn't load briefing. " />
        </div>
      ) : briefLoading ? (
        <div className="border border-l-4 rounded-r-lg p-5 space-y-3" style={{ borderColor: "hsl(var(--border) / 0.5)", borderLeftColor: ACCENT, background: "hsl(var(--card))" }}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
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
          <SectionError onRetry={loadMoves} message="Couldn't load moves. " />
        ) : movesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
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
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground) / 0.7)", marginBottom: 10 }}>
          Live Intelligence
        </div>
        {trendsError ? (
          <SectionError onRetry={loadTrends} message="Couldn't load intelligence. " />
        ) : trendsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : visibleTrends.length === 0 ? (
          <div className="rounded-lg border border-dashed text-center" style={{ borderColor: "hsl(var(--border))", padding: "24px 16px" }}>
            <div style={{ fontSize: 12, color: "hsl(var(--foreground))" }}>No live intelligence yet</div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              Aura fetches industry trends automatically based on your signal topics
            </div>
          </div>
        ) : (
          <div>
            {visibleTrends.map((t, idx) => {
              const isAdded = addedSignalIds.has(t.id);
              const isLast = idx === visibleTrends.length - 1;
              return (
                <div
                  key={t.id}
                  className="flex gap-3"
                  style={{
                    padding: "10px 0",
                    borderBottom: isLast ? "none" : "0.5px solid hsl(var(--border))",
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, marginTop: 6, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground) / 0.7)", marginBottom: 3 }}>
                      {t.source ? `FROM ${t.source.toUpperCase()}` : "FROM THE WEB"} · {timeAgo(t.fetched_at)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", marginBottom: 3 }}>
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                          {t.headline}
                        </a>
                      ) : t.headline}
                    </div>
                    {t.insight && (
                      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, marginBottom: 6 }}>
                        {t.insight}
                      </div>
                    )}
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
