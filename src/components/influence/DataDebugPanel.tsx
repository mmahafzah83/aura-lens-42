import { useState, useEffect } from "react";
import { Bug, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DataDebugPanel = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const uid = session.user.id;
    setUserId(uid);

    const [connections, snapshots, posts, postMetrics] = await Promise.all([
      supabase.from("linkedin_connections").select("*", { count: "exact" }).eq("user_id", uid),
      supabase.from("influence_snapshots").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
      supabase.from("linkedin_posts").select("*", { count: "exact" }).eq("user_id", uid).order("published_at", { ascending: false }),
      supabase.from("linkedin_post_metrics").select("*", { count: "exact" }).eq("user_id", uid).order("snapshot_date", { ascending: false }),
    ]);

    const handle = connections.data?.[0]?.handle || connections.data?.[0]?.display_name || "—";
    const latestSnapshotDate = snapshots.data?.[0]?.snapshot_date || "—";
    const latestPublishedAt = posts.data?.[0]?.published_at || "—";

    setData({
      connectionsCount: connections.count ?? 0,
      snapshotsCount: snapshots.count ?? 0,
      postsCount: posts.count ?? 0,
      postMetricsCount: postMetrics.count ?? 0,
      handle,
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

  const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <div className="p-2 rounded bg-muted/30 border border-border/30">
      <p className="text-[10px] text-muted-foreground/60 font-mono">{label}</p>
      <p className="text-xs font-mono text-foreground">{String(value)}</p>
    </div>
  );

  const RawTable = ({ title, rows }: { title: string; rows: any[] }) => {
    if (!rows.length) return (
      <div className="mb-3">
        <p className="text-[10px] font-mono text-muted-foreground/50 mb-1">{title} (0 rows)</p>
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
        <button onClick={load} disabled={loading} className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> refresh
        </button>
      </div>

      {loading && <p className="text-xs font-mono text-muted-foreground/40">Loading…</p>}

      {!loading && noData && (
        <div className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-xs font-mono text-red-300">No analytics records found in Lovable Cloud for this user.</p>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard label="user_id" value={userId || "—"} />
            <StatCard label="linkedin_connections" value={data.connectionsCount} />
            <StatCard label="influence_snapshots" value={data.snapshotsCount} />
            <StatCard label="linkedin_posts" value={data.postsCount} />
            <StatCard label="linkedin_post_metrics" value={data.postMetricsCount} />
            <StatCard label="account handle" value={data.handle} />
            <StatCard label="latest snapshot_date" value={data.latestSnapshotDate} />
            <StatCard label="latest published_at" value={data.latestPublishedAt} />
          </div>

          <RawTable title="influence_snapshots (latest 10)" rows={data.snapshotRows} />
          <RawTable title="linkedin_posts (latest 10)" rows={data.postRows} />
          <RawTable title="linkedin_post_metrics (latest 10)" rows={data.postMetricRows} />
        </>
      )}
    </div>
  );
};

export default DataDebugPanel;
