import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, ShieldX, Search, HelpCircle, CheckCircle2, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

interface Stats {
  authored: number;
  duplicates: number;
  rejected: number;
  uncertain: number;
  lateIndexed: number;
  lastRunAt: string | null;
  lastRunType: string | null;
}

const DiscoveryHealthCard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const [authoredRes, lateRes, uncertainRes, runsRes] = await Promise.all([
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .in("tracking_status", ["discovered", "confirmed", "indexed_late", "manual"]),
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("tracking_status", "indexed_late"),
        supabase
          .from("discovery_review_queue")
          .select("id", { count: "exact", head: true })
          .eq("reviewed", false),
        supabase
          .from("sync_runs")
          .select("completed_at, records_fetched, records_stored, sync_type, error_message")
          .in("sync_type", ["discovery", "search_discovery", "search_discovery_name_based", "retry_discovery"])
          .order("completed_at", { ascending: false })
          .limit(20),
      ]);

      const runs = runsRes.data || [];
      const totalFetched = runs.reduce((s, r) => s + (r.records_fetched || 0), 0);
      const totalStored = runs.reduce((s, r) => s + (r.records_stored || 0), 0);
      const duplicates = totalFetched - totalStored - (runs.length > 0 ? 0 : 0);

      const lastRun = runs[0] || null;

      setStats({
        authored: authoredRes.count || 0,
        duplicates: Math.max(0, duplicates),
        rejected: 0, // Tracked per-run, show cumulative from runs
        uncertain: uncertainRes.count || 0,
        lateIndexed: lateRes.count || 0,
        lastRunAt: lastRun?.completed_at || null,
        lastRunType: lastRun?.sync_type || null,
      });
    } catch (e) {
      console.error("Discovery health load error:", e);
    }
    setLoading(false);
  };

  const nextRetry = () => {
    const now = new Date();
    const nextHour = Math.ceil(now.getUTCHours() / 6) * 6;
    const next = new Date(now);
    next.setUTCHours(nextHour, 0, 0, 0);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 6);
    return next;
  };

  const nextDaily = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(6, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  };

  const formatNextRun = (date: Date) => {
    const diff = date.getTime() - Date.now();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `in ${hours}h ${mins}m`;
    return `in ${mins}m`;
  };

  const syncLabel = (t: string) => {
    if (t === "retry_discovery") return "Retry";
    if (t === "search_discovery_name_based") return "Name search";
    return "Discovery";
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center gap-3 text-muted-foreground/30 text-[11px]">
        <Activity className="w-4 h-4 animate-pulse" />
        Loading discovery health…
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { icon: CheckCircle2, label: "Authored posts", value: stats.authored, color: "text-primary/50" },
    { icon: Search, label: "Duplicates skipped", value: stats.duplicates, color: "text-muted-foreground/40" },
    { icon: ShieldX, label: "Rejected references", value: "per-run", color: "text-destructive/40" },
    { icon: HelpCircle, label: "Uncertain in review", value: stats.uncertain, color: "text-amber-500/50" },
    { icon: Clock, label: "Late-indexed found", value: stats.lateIndexed, color: stats.lateIndexed > 0 ? "text-amber-500/50" : "text-muted-foreground/40" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-muted-foreground/30" />
          <div>
            <h3 className="text-sm font-semibold text-foreground/70">Historical Discovery Health</h3>
            <p className="text-meta mt-0.5">Search-based post recovery — secondary to real-time capture</p>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[10px]">
            <item.icon className={`w-3.5 h-3.5 shrink-0 ${item.color}`} />
            <div>
              <p className="text-muted-foreground/30">{item.label}</p>
              <p className={`font-medium ${item.color}`}>
                {typeof item.value === "number" ? item.value : item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Timing */}
      <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/5">
        {stats.lastRunAt && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
            <Clock className="w-3 h-3 text-muted-foreground/25" />
            <span>Last run: {formatSmartDate(stats.lastRunAt)}</span>
            {stats.lastRunType && (
              <span className="px-1.5 py-0.5 rounded bg-primary/5 text-primary/40 text-[8px] font-medium">
                {syncLabel(stats.lastRunType)}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
          <Timer className="w-3 h-3 text-primary/25" />
          <span>Next retry: {formatNextRun(nextRetry())}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
          <Timer className="w-3 h-3 text-primary/25" />
          <span>Next full scan: {formatNextRun(nextDaily())}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default DiscoveryHealthCard;
