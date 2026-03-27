import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Eye, Loader2, Trash2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

interface ReviewableSnapshot {
  id: string;
  snapshot_date: string;
  followers: number;
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  source_type: string;
}

const SourceReviewPanel = () => {
  const [snapshots, setSnapshots] = useState<ReviewableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshots();
  }, [filter]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("influence_snapshots")
        .select("id, snapshot_date, followers, impressions, reactions, comments, shares, engagement_rate, source_type")
        .order("snapshot_date", { ascending: false })
        .limit(50);

      if (filter !== "all") {
        query = query.eq("source_type", filter);
      }

      const { data } = await query;
      setSnapshots((data as ReviewableSnapshot[]) || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await supabase.from("influence_snapshots").delete().eq("id", id);
      setSnapshots(prev => prev.filter(s => s.id !== id));
    } catch {
      // silent
    }
    setDeleting(null);
  };

  const sourceTypes = ["all", "sync", "csv_import", "manual"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.32 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Source Review</h3>
            <p className="text-meta">Inspect, validate, and remove imported metrics</p>
          </div>
        </div>
        <div className="flex gap-1">
          {sourceTypes.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all ${
                filter === s
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              {s === "csv_import" ? "CSV" : s}
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
          <Eye className="w-8 h-8 text-primary/15 mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">No data to review</p>
          <p className="text-meta mt-1">Import or sync data to see it here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/10">
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2">Date</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2 text-right">Followers</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2 text-right hidden sm:table-cell">Impressions</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2 text-right hidden sm:table-cell">Reactions</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2 text-right hidden md:table-cell">Engagement</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2">Source</th>
                <th className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => (
                <tr key={snap.id} className="border-b border-border/5 hover:bg-secondary/8 transition-colors">
                  <td className="text-xs text-foreground py-2.5 px-2 tabular-nums">{snap.snapshot_date}</td>
                  <td className="text-xs text-foreground py-2.5 px-2 tabular-nums text-right">{snap.followers.toLocaleString()}</td>
                  <td className="text-xs text-foreground/70 py-2.5 px-2 tabular-nums text-right hidden sm:table-cell">{snap.impressions.toLocaleString()}</td>
                  <td className="text-xs text-foreground/70 py-2.5 px-2 tabular-nums text-right hidden sm:table-cell">{snap.reactions.toLocaleString()}</td>
                  <td className="text-xs text-foreground/70 py-2.5 px-2 tabular-nums text-right hidden md:table-cell">{Number(snap.engagement_rate).toFixed(1)}%</td>
                  <td className="py-2.5 px-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      snap.source_type === "csv_import" ? "bg-blue-500/10 text-blue-400 border border-blue-500/15" :
                      snap.source_type === "manual" ? "bg-amber-500/10 text-amber-400 border border-amber-500/15" :
                      "bg-secondary/20 text-muted-foreground/60 border border-border/10"
                    }`}>
                      {snap.source_type === "csv_import" ? "CSV" : snap.source_type || "sync"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => handleDelete(snap.id)}
                      disabled={deleting === snap.id}
                      className="text-muted-foreground/30 hover:text-red-400 transition-colors disabled:opacity-30"
                      title="Remove this snapshot"
                    >
                      {deleting === snap.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
};

export default SourceReviewPanel;
