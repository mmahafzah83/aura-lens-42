import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TimeRange = "7d" | "30d" | "90d" | "all";

const DailySnapshotEngine = () => {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");

  useEffect(() => { loadSnapshots(); }, [range]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth, impressions, reactions, comments, shares, engagement_rate, source_type")
        .order("snapshot_date", { ascending: false });
      if (range !== "all") {
        const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
        query = query.gte("snapshot_date", new Date(Date.now() - days * 86400000).toISOString().split("T")[0]);
      } else {
        query = query.limit(365);
      }
      const { data } = await query;
      setSnapshots(data || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  const totalImpressions = snapshots.reduce((s, r) => s + (r.impressions || 0), 0);
  const totalReactions = snapshots.reduce((s, r) => s + (r.reactions || 0), 0);
  const avgEngagement = snapshots.length > 0
    ? Math.round(snapshots.reduce((s, r) => s + Number(r.engagement_rate || 0), 0) / snapshots.length * 10) / 10
    : 0;
  const latestFollowers = snapshots[0]?.followers || 0;
  const netGrowth = snapshots.length >= 2 ? (snapshots[0]?.followers || 0) - (snapshots[snapshots.length - 1]?.followers || 0) : 0;

  const ranges: { key: TimeRange; label: string }[] = [
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
    { key: "all", label: "All time" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Snapshot Timeline</h3>
          <p className="text-meta mt-0.5">Authority metrics preserved over time</p>
        </div>
        <div className="flex gap-1">
          {ranges.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                range === r.key
                  ? "bg-secondary/30 text-foreground/80"
                  : "text-muted-foreground/40 hover:text-muted-foreground/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-meta text-center py-10">No snapshots in this range. Import or sync to begin.</p>
      ) : (
        <>
          {/* Key figures — restrained */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Followers", value: latestFollowers.toLocaleString(), change: netGrowth },
              { label: "Impressions", value: totalImpressions.toLocaleString() },
              { label: "Reactions", value: totalReactions.toLocaleString() },
              { label: "Avg Engagement", value: `${avgEngagement}%` },
            ].map(m => (
              <div key={m.label} className="p-3.5 rounded-xl bg-secondary/10 border border-border/5">
                <p className="text-lg font-bold text-foreground tabular-nums">{m.value}</p>
                <p className="text-meta mt-0.5">{m.label}</p>
                {"change" in m && m.change !== undefined && m.change !== 0 && (
                  <p className={`text-[10px] mt-1 flex items-center gap-0.5 ${m.change > 0 ? "text-primary/60" : "text-muted-foreground/50"}`}>
                    {m.change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {m.change > 0 ? "+" : ""}{m.change} net
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Timeline — calm list */}
          <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
            {snapshots.slice(0, 30).map(snap => (
              <div key={snap.snapshot_date} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary/8 transition-colors">
                <span className="text-[11px] tabular-nums text-muted-foreground/60 w-24">{snap.snapshot_date}</span>
                <span className="text-[11px] tabular-nums text-foreground/70">{snap.followers?.toLocaleString()}</span>
                {snap.follower_growth !== 0 && (
                  <span className={`text-[10px] tabular-nums w-12 text-right ${snap.follower_growth > 0 ? "text-primary/50" : "text-muted-foreground/40"}`}>
                    {snap.follower_growth > 0 ? "+" : ""}{snap.follower_growth}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/25 w-12 text-right">{snap.source_type === "csv_import" ? "csv" : snap.source_type || "sync"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default DailySnapshotEngine;
