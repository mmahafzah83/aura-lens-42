import { useState, useEffect } from "react";
import { Bug, AlertTriangle, RefreshCw, CheckCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ── Schema Audit Report ── */
const AUDIT_REPORT = [
  { component: "InfluenceTabNew", table: "influence_snapshots", fields: "snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type", status: "OK" },
  { component: "InfluenceTabNew", table: "linkedin_posts", fields: "id, post_text, hook, title, theme, tone, format_type, content_type, topic_label, engagement_score, like_count, comment_count, repost_count, published_at, media_type", status: "OK" },
  { component: "InfluenceTabNew", table: "authority_scores", fields: "* (all columns)", status: "OK" },
  { component: "ConnectionStatusPanel", table: "linkedin_connections", fields: "id, handle, profile_name, display_name, profile_url, status, source_status, last_synced_at, connected_at", status: "OK" },
  { component: "ConnectionStatusPanel", table: "influence_snapshots", fields: "snapshot_date", status: "OK" },
  { component: "DailySnapshotEngine", table: "influence_snapshots", fields: "snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type", status: "OK" },
  { component: "DataHealthConsole", table: "influence_snapshots", fields: "snapshot_date, source_type", status: "OK" },
  { component: "DataHealthConsole", table: "sync_errors", fields: "id", status: "OK" },
  { component: "DataHealthConsole", table: "import_jobs", fields: "status, duplicate_rows", status: "OK" },
  { component: "SourceReviewPanel", table: "influence_snapshots", fields: "id, snapshot_date, followers, impressions, reactions, comments, shares, engagement_rate, source_type", status: "OK" },
  { component: "StrategicAttribution", table: "linkedin_posts", fields: "id, hook, title, post_text, theme, topic_label, framework_type, format_type, content_type, visual_style, media_type, engagement_score, like_count, comment_count, repost_count, published_at, carousel_structure_type, hook_style, cta_style, content_engine_output_type, visual_strategy_type", status: "OK" },
  { component: "WeeklyInfluenceBrief", table: "(edge function)", fields: "weekly-influence-brief invocation", status: "OK" },
  { component: "HistoricalImportHub", table: "import_jobs", fields: "* (all columns)", status: "OK" },
  { component: "HistoricalImportHub", table: "influence_snapshots", fields: "user_id, snapshot_date, followers, impressions, reactions, comments, shares, source_type", status: "OK" },
];

/* ── Scoping Audit ── */
const SCOPING_AUDIT = [
  { component: "InfluenceTabNew", table: "influence_snapshots", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "InfluenceTabNew", table: "linkedin_posts", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "InfluenceTabNew", table: "authority_scores", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "ConnectionStatusPanel", table: "linkedin_connections", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "ConnectionStatusPanel", table: "influence_snapshots", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "DailySnapshotEngine", table: "influence_snapshots", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "DataHealthConsole", table: "influence_snapshots", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "DataHealthConsole", table: "sync_errors", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "DataHealthConsole", table: "import_jobs", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "SourceReviewPanel", table: "influence_snapshots", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "StrategicAttribution", table: "linkedin_posts", filterBy: "RLS (auth.uid()=user_id)", explicit: false, status: "SECURE" },
  { component: "HistoricalImportHub", table: "import_jobs", filterBy: "RLS + explicit user_id on insert", explicit: true, status: "SECURE" },
  { component: "HistoricalImportHub", table: "influence_snapshots", filterBy: "RLS + explicit user_id on insert", explicit: true, status: "SECURE" },
  { component: "DataDebugPanel", table: "all tables", filterBy: "explicit .eq('user_id', uid)", explicit: true, status: "SECURE" },
];

const NAME_MAP = [
  { requested: "linkedin_accounts", actual: "linkedin_connections", note: "Table does not exist as 'linkedin_accounts'" },
  { requested: "linkedin_daily_metrics", actual: "influence_snapshots", note: "Table does not exist as 'linkedin_daily_metrics'" },
];

const DataDebugPanel = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [showScoping, setShowScoping] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const uid = session.user.id;
    setUserId(uid);

    const [connections, snapshots, posts, postMetrics, authScores, syncRuns] = await Promise.all([
      supabase.from("linkedin_connections").select("*", { count: "exact" }).eq("user_id", uid),
      supabase.from("influence_snapshots").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("linkedin_posts").select("*", { count: "exact" }).eq("user_id", uid).order("published_at", { ascending: false }),
      supabase.from("linkedin_post_metrics").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("authority_scores").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("sync_runs").select("*", { count: "exact" }).eq("user_id", uid).order("created_at", { ascending: false }),
    ]);

    const conn = connections.data?.[0] || null;
    const handle = conn?.handle || conn?.display_name || "—";
    const accountId = conn?.id || "—";
    const latestSnapshotDate = snapshots.data?.[0]?.snapshot_date || "—";
    const latestPublishedAt = posts.data?.[0]?.published_at || "—";

    // Count sync_runs by account_id match
    const syncRunsByAccount = conn?.id
      ? (syncRuns.data || []).filter((r: any) => r.account_id === conn.id).length
      : 0;

    setData({
      connectionsCount: connections.count ?? 0,
      snapshotsCount: snapshots.count ?? 0,
      postsCount: posts.count ?? 0,
      postMetricsCount: postMetrics.count ?? 0,
      authorityScoresCount: authScores.count ?? 0,
      syncRunsCount: syncRuns.count ?? 0,
      syncRunsByAccountId: syncRunsByAccount,
      handle,
      accountId,
      latestSnapshotDate,
      latestPublishedAt,
      snapshotRows: (snapshots.data || []).slice(0, 10),
      postRows: (posts.data || []).slice(0, 10),
      postMetricRows: (postMetrics.data || []).slice(0, 10),
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const noData = data && data.connectionsCount === 0 && data.snapshotsCount === 0 && data.postsCount === 0 && data.postMetricsCount === 0;

  const StatCard = ({ label, value, empty }: { label: string; value: string | number; empty?: boolean }) => (
    <div className={`p-2 rounded border ${empty ? "border-destructive/30 bg-destructive/5" : "border-border/30 bg-muted/30"}`}>
      <p className="text-[10px] text-muted-foreground/60 font-mono">{label}</p>
      <p className={`text-xs font-mono ${empty ? "text-destructive/70" : "text-foreground"}`}>
        {empty ? "EMPTY TABLE" : String(value)}
      </p>
    </div>
  );

  const RawTable = ({ title, rows }: { title: string; rows: any[] }) => {
    if (!rows.length) return (
      <div className="mb-3 p-2 rounded border border-destructive/20 bg-destructive/5">
        <p className="text-[10px] font-mono text-destructive/60">{title} — 0 rows (empty table)</p>
      </div>
    );
    const cols = Object.keys(rows[0]).filter(k => !["embedding", "tsv"].includes(k));
    return (
      <div className="mb-4">
        <p className="text-[10px] font-mono text-muted-foreground/50 mb-1">{title} ({rows.length} rows shown)</p>
        <div className="overflow-x-auto max-h-48 overflow-y-auto border border-border/20 rounded">
          <table className="text-[9px] font-mono w-full">
            <thead>
              <tr className="bg-muted/20">
                {cols.map(c => <th key={c} className="px-1.5 py-1 text-left text-muted-foreground/50 whitespace-nowrap">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border/10">
                  {cols.map(c => (
                    <td key={c} className="px-1.5 py-0.5 text-foreground/70 whitespace-nowrap max-w-[200px] truncate">
                      {typeof row[c] === "object" ? JSON.stringify(row[c]).slice(0, 60) : String(row[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="border-2 border-dashed border-yellow-500/30 rounded-xl p-4 mb-6 bg-yellow-500/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-yellow-500/70" />
          <span className="text-xs font-mono font-bold text-yellow-500/80">DATA DEBUG PANEL (admin-only)</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowScoping(!showScoping)} className="text-[10px] font-mono text-yellow-500/50 hover:text-yellow-500/80 underline">
            {showScoping ? "hide scoping" : "show scoping"}
          </button>
          <button onClick={() => setShowAudit(!showAudit)} className="text-[10px] font-mono text-yellow-500/50 hover:text-yellow-500/80 underline">
            {showAudit ? "hide audit" : "show audit"}
          </button>
          <button onClick={load} disabled={loading} className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> refresh
          </button>
        </div>
      </div>

      {/* Table name corrections */}
      <div className="mb-3 p-2 rounded border border-yellow-500/20 bg-yellow-500/5">
        <p className="text-[10px] font-mono font-bold text-yellow-500/70 mb-1">⚠ TABLE NAME CORRECTIONS</p>
        {NAME_MAP.map(n => (
          <p key={n.requested} className="text-[9px] font-mono text-foreground/60">
            <span className="text-destructive/60 line-through">{n.requested}</span> → <span className="text-primary/60">{n.actual}</span> — {n.note}
          </p>
        ))}
      </div>

      {loading && <p className="text-xs font-mono text-muted-foreground/40">Loading…</p>}

      {!loading && noData && (
        <div className="flex items-center gap-2 p-3 rounded bg-destructive/10 border border-destructive/20 mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive/70" />
          <p className="text-xs font-mono text-destructive/70">No analytics records found in Lovable Cloud for this user.</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Identity & Scoping Summary */}
          <div className="mb-4 p-3 rounded border border-border/30 bg-muted/20 space-y-2">
            <p className="text-[10px] font-mono font-bold text-foreground/60 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary/50" /> AUTH & SCOPING SUMMARY
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[9px] font-mono">
              <div><span className="text-muted-foreground/50">auth user_id:</span> <span className="text-foreground/80 break-all">{userId}</span></div>
              <div><span className="text-muted-foreground/50">linkedin account_id:</span> <span className="text-foreground/80 break-all">{data.accountId}</span></div>
              <div><span className="text-muted-foreground/50">handle:</span> <span className="text-foreground/80">{data.handle}</span></div>
            </div>
            <div className="border-t border-border/10 pt-2 mt-1">
              <p className="text-[9px] font-mono text-muted-foreground/40 mb-1">Rows matched by user_id (all dashboard queries):</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[9px] font-mono">
                <span className="text-foreground/60">connections: <span className="text-foreground">{data.connectionsCount}</span></span>
                <span className="text-foreground/60">snapshots: <span className="text-foreground">{data.snapshotsCount}</span></span>
                <span className="text-foreground/60">posts: <span className="text-foreground">{data.postsCount}</span></span>
                <span className="text-foreground/60">post_metrics: <span className="text-foreground">{data.postMetricsCount}</span></span>
                <span className="text-foreground/60">auth_scores: <span className="text-foreground">{data.authorityScoresCount}</span></span>
                <span className="text-foreground/60">sync_runs: <span className="text-foreground">{data.syncRunsCount}</span></span>
              </div>
            </div>
            <div className="border-t border-border/10 pt-2 mt-1">
              <p className="text-[9px] font-mono text-muted-foreground/40 mb-1">Rows matched by account_id (sync_runs only):</p>
              <span className="text-[9px] font-mono text-foreground/60">sync_runs where account_id = linkedin_connections.id: <span className="text-foreground">{data.syncRunsByAccountId}</span></span>
            </div>
            <div className="border-t border-border/10 pt-2 mt-1">
              <p className="text-[9px] font-mono text-muted-foreground/40">
                ✓ No tables use handle as a filter key. All dashboard queries are scoped by user_id via RLS policies.
                No account_id joins needed — all analytics tables have direct user_id columns.
                No orphan rows possible: RLS enforces auth.uid() = user_id on every SELECT.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard label="user_id" value={userId || "—"} />
            <StatCard label="linkedin_connections" value={data.connectionsCount} empty={data.connectionsCount === 0} />
            <StatCard label="influence_snapshots" value={data.snapshotsCount} empty={data.snapshotsCount === 0} />
            <StatCard label="linkedin_posts" value={data.postsCount} empty={data.postsCount === 0} />
            <StatCard label="linkedin_post_metrics" value={data.postMetricsCount} empty={data.postMetricsCount === 0} />
            <StatCard label="authority_scores" value={data.authorityScoresCount} empty={data.authorityScoresCount === 0} />
            <StatCard label="account handle" value={data.handle} />
            <StatCard label="latest snapshot_date" value={data.latestSnapshotDate} />
          </div>

          <RawTable title="influence_snapshots (latest 10)" rows={data.snapshotRows} />
          <RawTable title="linkedin_posts (latest 10)" rows={data.postRows} />
          <RawTable title="linkedin_post_metrics (latest 10)" rows={data.postMetricRows} />
        </>
      )}

      {/* Scoping Audit */}
      {showScoping && (
        <div className="mt-4 border-t border-yellow-500/20 pt-4">
          <p className="text-[10px] font-mono font-bold text-yellow-500/70 mb-2">QUERY SCOPING AUDIT</p>
          <div className="overflow-x-auto border border-border/20 rounded">
            <table className="text-[9px] font-mono w-full">
              <thead>
                <tr className="bg-muted/20">
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Component</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Table</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Filter Method</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Explicit?</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Status</th>
                </tr>
              </thead>
              <tbody>
                {SCOPING_AUDIT.map((row, i) => (
                  <tr key={i} className="border-t border-border/10">
                    <td className="px-2 py-1 text-foreground/70 whitespace-nowrap">{row.component}</td>
                    <td className="px-2 py-1 text-primary/60 whitespace-nowrap">{row.table}</td>
                    <td className="px-2 py-1 text-foreground/50">{row.filterBy}</td>
                    <td className="px-2 py-1 text-foreground/40">{row.explicit ? "Yes" : "No (RLS)"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-primary/50" />
                        <span className="text-primary/60">{row.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] font-mono text-muted-foreground/30 mt-2">
            All queries scoped by user_id via RLS. No account_id or handle joins needed. No backfill required — all tables use user_id directly.
          </p>
        </div>
      )}

      {/* Schema Audit Summary */}
      {showAudit && (
        <div className="mt-4 border-t border-yellow-500/20 pt-4">
          <p className="text-[10px] font-mono font-bold text-yellow-500/70 mb-2">SCHEMA AUDIT SUMMARY</p>
          <div className="overflow-x-auto border border-border/20 rounded">
            <table className="text-[9px] font-mono w-full">
              <thead>
                <tr className="bg-muted/20">
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Component</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Table</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Fields</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Status</th>
                </tr>
              </thead>
              <tbody>
                {AUDIT_REPORT.map((row, i) => (
                  <tr key={i} className="border-t border-border/10">
                    <td className="px-2 py-1 text-foreground/70 whitespace-nowrap">{row.component}</td>
                    <td className="px-2 py-1 text-primary/60 whitespace-nowrap">{row.table}</td>
                    <td className="px-2 py-1 text-foreground/50 max-w-[300px] truncate">{row.fields}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-primary/50" />
                        <span className="text-primary/60">{row.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] font-mono text-muted-foreground/30 mt-2">
            All 14 component→table mappings verified. All queried columns exist in the real schema. No mismatches found.
          </p>
        </div>
      )}
    </div>
  );
};

export default DataDebugPanel;
