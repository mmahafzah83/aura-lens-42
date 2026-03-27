import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SourceReviewPanel = () => {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadSnapshots(); }, [filter]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("influence_snapshots")
        .select("id, snapshot_date, followers, impressions, reactions, comments, shares, engagement_rate, source_type")
        .order("snapshot_date", { ascending: false })
        .limit(50);
      if (filter !== "all") query = query.eq("source_type", filter);
      const { data } = await query;
      setSnapshots(data || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await supabase.from("influence_snapshots").delete().eq("id", id);
      setSnapshots(prev => prev.filter(s => s.id !== id));
    } catch { /* silent */ }
    setDeleting(null);
  };

  const filters = [
    { key: "all", label: "All" },
    { key: "sync", label: "Sync" },
    { key: "csv_import", label: "CSV" },
    { key: "manual", label: "Manual" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.24 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Source Review</h3>
          <p className="text-meta mt-0.5">Inspect and validate imported metrics</p>
        </div>
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                filter === f.key
                  ? "bg-secondary/30 text-foreground/80"
                  : "text-muted-foreground/40 hover:text-muted-foreground/70"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-meta text-center py-10">No data to review in this view.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left min-w-[500px]">
            <thead>
              <tr className="border-b border-border/5">
                {["Date", "Followers", "Impressions", "Reactions", "Eng %", "Source", ""].map(h => (
                  <th key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium py-2 px-2.5 last:w-8">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map(snap => (
                <tr key={snap.id} className="border-b border-border/[0.03] hover:bg-secondary/5 transition-colors">
                  <td className="text-[11px] text-foreground/70 py-2 px-2.5 tabular-nums">{snap.snapshot_date}</td>
                  <td className="text-[11px] text-foreground/60 py-2 px-2.5 tabular-nums">{snap.followers?.toLocaleString()}</td>
                  <td className="text-[11px] text-muted-foreground/40 py-2 px-2.5 tabular-nums">{snap.impressions?.toLocaleString()}</td>
                  <td className="text-[11px] text-muted-foreground/40 py-2 px-2.5 tabular-nums">{snap.reactions?.toLocaleString()}</td>
                  <td className="text-[11px] text-muted-foreground/40 py-2 px-2.5 tabular-nums">{Number(snap.engagement_rate).toFixed(1)}%</td>
                  <td className="text-[10px] text-muted-foreground/25 py-2 px-2.5">
                    {snap.source_type === "csv_import" ? "csv" : snap.source_type || "sync"}
                  </td>
                  <td className="py-2 px-2.5">
                    <button
                      onClick={() => handleDelete(snap.id)}
                      disabled={deleting === snap.id}
                      className="text-muted-foreground/15 hover:text-destructive/50 transition-colors disabled:opacity-30"
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
