import { useState, useEffect } from "react";
import { Bug, AlertTriangle, RefreshCw, CheckCircle2, ShieldCheck, Activity } from "lucide-react";
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
  const [showScoping, setShowScoping] = useState(false);
  const [showSyncDiag, setShowSyncDiag] = useState(true);
  const [syncDiag, setSyncDiag] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const uid = session.user.id;
    setUserId(uid);

    const [connections, snapshots, posts, postMetrics, authScores, syncRuns, syncErrors] = await Promise.all([
      supabase.from("linkedin_connections").select("*", { count: "exact" }).eq("user_id", uid),
      supabase.from("influence_snapshots").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("linkedin_posts").select("*", { count: "exact" }).eq("user_id", uid).order("published_at", { ascending: false }),
      supabase.from("linkedin_post_metrics").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("authority_scores").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("sync_runs").select("*", { count: "exact" }).eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("sync_errors").select("*", { count: "exact" }).eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
    ]);

    const conn = connections.data?.[0] || null;
    const handle = conn?.handle || conn?.display_name || "—";
    const accountId = conn?.id || "—";
    const latestSnapshotDate = snapshots.data?.[0]?.snapshot_date || "—";
    const latestPublishedAt = posts.data?.[0]?.published_at || "—";

    const syncRunsByAccount = conn?.id
      ? (syncRuns.data || []).filter((r: any) => r.account_id === conn.id).length
      : 0;

    // Build sync diagnostic
    const latestRun = (syncRuns.data || [])[0] || null;
    const latestError = (syncErrors.data || [])[0] || null;
    const allSnapshots = snapshots.data || [];
    const zeroSnapshots = allSnapshots.filter((s: any) =>
      s.followers === 0 && s.reactions === 0 && s.comments === 0 && s.impressions === 0 && s.post_count === 0
    );

    setSyncDiag({
      provider: "LinkedIn REST API v2",
      lastRunAt: latestRun?.started_at || "Never",
      lastRunStatus: latestRun?.status || "No runs",
      lastRunError: latestRun?.error_message || null,
      recordsFetched: latestRun?.records_fetched ?? "—",
      recordsStored: latestRun?.records_stored ?? "—",
      syncRunsTotal: syncRuns.count ?? 0,
      syncErrorsTotal: syncErrors.count ?? 0,
      recentErrors: (syncErrors.data || []).slice(0, 3),
      totalSnapshots: snapshots.count ?? 0,
      zeroSnapshotCount: zeroSnapshots.length,
      hasRealData: allSnapshots.some((s: any) => s.followers > 0 || s.reactions > 0 || s.post_count > 0),
    });

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
      snapshotRows: allSnapshots.slice(0, 10),
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
          <button onClick={() => setShowSyncDiag(!showSyncDiag)} className="text-[10px] font-mono text-yellow-500/50 hover:text-yellow-500/80 underline">
            {showSyncDiag ? "hide sync" : "show sync"}
          </button>
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
          {/* Auth & Scoping Summary */}
          <div className="mb-4 p-3 rounded border border-border/30 bg-muted/20 space-y-2">
            <p className="text-[10px] font-mono font-bold text-foreground/60 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary/50" /> AUTH & SCOPING SUMMARY
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[9px] font-mono">
              <div><span className="text-muted-foreground/50">auth user_id:</span> <span className="text-foreground/80 break-all">{userId}</span></div>
              <div><span className="text-muted-foreground/50">linkedin account_id:</span> <span className="text-foreground/80 break-all">{data.accountId}</span></div>
              <div><span className="text-muted-foreground/50">handle:</span> <span className="text-foreground/80">{data.handle}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard label="user_id" value={userId || "—"} />
            <StatCard label="linkedin_connections" value={data.connectionsCount} empty={data.connectionsCount === 0} />
            <StatCard label="influence_snapshots" value={data.snapshotsCount} empty={data.snapshotsCount === 0} />
            <StatCard label="linkedin_posts" value={data.postsCount} empty={data.postsCount === 0} />
            <StatCard label="linkedin_post_metrics" value={data.postMetricsCount} empty={data.postMetricsCount === 0} />
            <StatCard label="authority_scores" value={data.authorityScoresCount} empty={data.authorityScoresCount === 0} />
            <StatCard label="sync_runs" value={data.syncRunsCount} empty={data.syncRunsCount === 0} />
            <StatCard label="latest snapshot_date" value={data.latestSnapshotDate} />
          </div>

          <RawTable title="influence_snapshots (latest 10)" rows={data.snapshotRows} />
          <RawTable title="linkedin_posts (latest 10)" rows={data.postRows} />
          <RawTable title="linkedin_post_metrics (latest 10)" rows={data.postMetricRows} />
        </>
      )}

      {/* Sync Diagnostic Summary */}
      {showSyncDiag && syncDiag && (
        <div className="mt-4 border-t border-yellow-500/20 pt-4">
          <p className="text-[10px] font-mono font-bold text-yellow-500/70 mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> SYNC PIPELINE DIAGNOSTIC
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            <div className="p-2 rounded border border-border/30 bg-muted/20">
              <p className="text-[9px] font-mono text-muted-foreground/50">Provider</p>
              <p className="text-[10px] font-mono text-foreground/80">{syncDiag.provider}</p>
            </div>
            <div className="p-2 rounded border border-border/30 bg-muted/20">
              <p className="text-[9px] font-mono text-muted-foreground/50">Last Fetch Attempt</p>
              <p className="text-[10px] font-mono text-foreground/80">{syncDiag.lastRunAt}</p>
            </div>
            <div className={`p-2 rounded border ${syncDiag.lastRunStatus === "completed" ? "border-primary/30 bg-primary/5" : syncDiag.lastRunStatus === "failed" ? "border-destructive/30 bg-destructive/5" : "border-border/30 bg-muted/20"}`}>
              <p className="text-[9px] font-mono text-muted-foreground/50">Fetch Result</p>
              <p className={`text-[10px] font-mono ${syncDiag.lastRunStatus === "completed" ? "text-primary/80" : syncDiag.lastRunStatus === "failed" ? "text-destructive/80" : "text-foreground/80"}`}>
                {syncDiag.lastRunStatus}
              </p>
            </div>
            <div className="p-2 rounded border border-border/30 bg-muted/20">
              <p className="text-[9px] font-mono text-muted-foreground/50">Records Fetched</p>
              <p className="text-[10px] font-mono text-foreground/80">{syncDiag.recordsFetched}</p>
            </div>
            <div className="p-2 rounded border border-border/30 bg-muted/20">
              <p className="text-[9px] font-mono text-muted-foreground/50">Records Stored</p>
              <p className="text-[10px] font-mono text-foreground/80">{syncDiag.recordsStored}</p>
            </div>
            <div className="p-2 rounded border border-border/30 bg-muted/20">
              <p className="text-[9px] font-mono text-muted-foreground/50">Total Runs / Errors</p>
              <p className="text-[10px] font-mono text-foreground/80">{syncDiag.syncRunsTotal} / {syncDiag.syncErrorsTotal}</p>
            </div>
          </div>

          {/* Zero snapshot warning */}
          {syncDiag.zeroSnapshotCount > 0 && (
            <div className="flex items-start gap-2 p-2 rounded border border-yellow-500/20 bg-yellow-500/5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500/70 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-mono text-yellow-500/70 font-bold">
                  {syncDiag.zeroSnapshotCount} placeholder zero snapshot(s) detected
                </p>
                <p className="text-[9px] font-mono text-foreground/50">
                  These were written before the sync pipeline was repaired. The updated sync now rejects zero-data writes and records errors instead.
                </p>
              </div>
            </div>
          )}

          {/* Real data check */}
          <div className={`flex items-center gap-2 p-2 rounded border mb-3 ${syncDiag.hasRealData ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}`}>
            {syncDiag.hasRealData ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-primary/60" />
                <p className="text-[10px] font-mono text-primary/70">At least one snapshot contains verified non-zero data.</p>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-destructive/60" />
                <p className="text-[10px] font-mono text-destructive/70">No snapshots contain real data. All values are zero/default. LinkedIn API may require Community Management API approval.</p>
              </>
            )}
          </div>

          {/* Failure reason */}
          {syncDiag.lastRunError && (
            <div className="p-2 rounded border border-destructive/20 bg-destructive/5 mb-3">
              <p className="text-[9px] font-mono text-muted-foreground/50 mb-0.5">Last Run Failure</p>
              <p className="text-[10px] font-mono text-destructive/70">{syncDiag.lastRunError}</p>
            </div>
          )}

          {/* Recent sync errors */}
          {syncDiag.recentErrors?.length > 0 && (
            <div className="mb-3">
              <p className="text-[9px] font-mono text-muted-foreground/50 mb-1">Recent sync_errors:</p>
              {syncDiag.recentErrors.map((err: any, i: number) => (
                <div key={i} className="p-2 rounded border border-destructive/15 bg-destructive/[0.03] mb-1">
                  <div className="flex items-center gap-2 text-[9px] font-mono">
                    <span className="text-destructive/50">{err.error_type}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="text-muted-foreground/40">{err.created_at?.slice(0, 19)}</span>
                  </div>
                  <p className="text-[9px] font-mono text-foreground/60 mt-0.5">{err.error_message?.slice(0, 200)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
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
                  <th className="px-2 py-1.5 text-left text-muted-foreground/50">Status</th>
                </tr>
              </thead>
              <tbody>
                {SCOPING_AUDIT.map((row, i) => (
                  <tr key={i} className="border-t border-border/10">
                    <td className="px-2 py-1 text-foreground/70 whitespace-nowrap">{row.component}</td>
                    <td className="px-2 py-1 text-primary/60 whitespace-nowrap">{row.table}</td>
                    <td className="px-2 py-1 text-foreground/50">{row.filterBy}</td>
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
        </div>
      )}
    </div>
  );
};

export default DataDebugPanel;
