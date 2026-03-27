import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Snapshot {
  snapshot_date: string;
  followers: number;
  follower_growth: number;
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  source_type: string;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

const DailySnapshotEngine = () => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");

  useEffect(() => {
    loadSnapshots();
  }, [range]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
        .order("snapshot_date", { ascending: false });

      if (range !== "all") {
        const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
        const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
        query = query.gte("snapshot_date", since);
      } else {
        query = query.limit(365);
      }

      const { data } = await query;
      setSnapshots((data as Snapshot[]) || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const totalImpressions = snapshots.reduce((s, r) => s + (r.impressions || 0), 0);
  const totalReactions = snapshots.reduce((s, r) => s + (r.reactions || 0), 0);
  const totalComments = snapshots.reduce((s, r) => s + (r.comments || 0), 0);
  const avgEngagement = snapshots.length > 0
    ? Math.round(snapshots.reduce((s, r) => s + Number(r.engagement_rate || 0), 0) / snapshots.length * 10) / 10
    : 0;

  const latestFollowers = snapshots[0]?.followers || 0;
  const netGrowth = snapshots.length >= 2
    ? (snapshots[0]?.followers || 0) - (snapshots[snapshots.length - 1]?.followers || 0)
    : 0;

  const ranges: { key: TimeRange; label: string }[] = [
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "all", label: "All" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Daily Snapshot Engine</h3>
            <p className="text-meta">Authority metrics over time</p>
          </div>
        </div>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                range === r.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-8">
          <BarChart3 className="w-8 h-8 text-primary/15 mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">No snapshots yet</p>
          <p className="text-meta mt-1">Sync or import data to see trends here.</p>
        </div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "Followers", value: latestFollowers.toLocaleString(), sub: netGrowth !== 0 ? `${netGrowth > 0 ? "+" : ""}${netGrowth}` : null, subColor: netGrowth > 0 ? "text-emerald-400" : netGrowth < 0 ? "text-red-400" : "" },
              { label: "Impressions", value: totalImpressions.toLocaleString(), sub: `${range} total` },
              { label: "Reactions", value: totalReactions.toLocaleString(), sub: `${range} total` },
              { label: "Comments", value: totalComments.toLocaleString(), sub: `${range} total` },
              { label: "Avg Engagement", value: `${avgEngagement}%`, sub: `${snapshots.length} snapshots` },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-xl bg-secondary/15 border border-border/8">
                <p className="text-lg font-bold text-foreground tabular-nums">{m.value}</p>
                <p className="text-meta">{m.label}</p>
                {m.sub && <p className={`text-[10px] mt-0.5 ${m.subColor || "text-muted-foreground/40"}`}>{m.sub}</p>}
              </div>
            ))}
          </div>

          {/* Mini timeline */}
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {snapshots.slice(0, 20).map((snap, i) => (
              <div key={snap.snapshot_date} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/8 hover:bg-secondary/15 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-foreground/80 w-20">{snap.snapshot_date}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    snap.source_type === "csv_import" ? "bg-blue-500/10 text-blue-400 border border-blue-500/15" :
                    snap.source_type === "manual" ? "bg-amber-500/10 text-amber-400 border border-amber-500/15" :
                    "bg-secondary/20 text-muted-foreground/60 border border-border/10"
                  }`}>
                    {snap.source_type || "sync"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs tabular-nums text-foreground/70">{snap.followers.toLocaleString()}</span>
                  {snap.follower_growth !== 0 && (
                    <span className={`text-[11px] tabular-nums flex items-center gap-0.5 ${
                      snap.follower_growth > 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {snap.follower_growth > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(snap.follower_growth)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default DailySnapshotEngine;
