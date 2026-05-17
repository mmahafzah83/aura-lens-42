import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, Globe, Monitor, PenTool, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SOURCE_META: Record<string, { label: string; icon: typeof Globe; description: string }> = {
  browser_capture: { label: "Browser Capture", icon: Monitor, description: "Highest trust — captured directly from LinkedIn" },
  manual_import: { label: "Manual Import", icon: PenTool, description: "CSV or bulk import" },
  manual_url: { label: "Manual URL", icon: PenTool, description: "Individual post added by URL" },
  search_discovery: { label: "Historical Discovery", icon: Search, description: "Found via search indexing — may lack private metrics" },
};

const SourceHealthSummary = () => {
  const [loading, setLoading] = useState(true);
  const [postsBySource, setPostsBySource] = useState<Record<string, number>>({});
  const [postsWithMetrics, setPostsWithMetrics] = useState(0);
  const [followerSnapshots, setFollowerSnapshots] = useState(0);
  const [browserSnapshots, setBrowserSnapshots] = useState(0);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [postRes, snapRes] = await Promise.all([
        supabase
          .from("linkedin_posts")
          .select("source_type, like_count, comment_count, engagement_score")
          .neq("tracking_status", "rejected"),
        supabase
          .from("influence_snapshots")
          .select("source_type"),
      ]);

      const posts = postRes.data || [];
      const counts: Record<string, number> = {};
      let withMetrics = 0;
      posts.forEach((p: any) => {
        const src = p.source_type || "search_discovery";
        counts[src] = (counts[src] || 0) + 1;
        if (p.like_count > 0 || p.comment_count > 0 || Number(p.engagement_score) > 0) {
          withMetrics++;
        }
      });
      setPostsBySource(counts);
      setPostsWithMetrics(withMetrics);

      const snaps = snapRes.data || [];
      setFollowerSnapshots(snaps.length);
      setBrowserSnapshots(snaps.filter((s: any) => s.source_type === "browser_capture").length);
    } catch (e) {
      console.error("Source health load error:", e);
    }
    setLoading(false);
  };

  const totalPosts = Object.values(postsBySource).reduce((s, c) => s + c, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Database className="w-4 h-4 text-primary/50" />
          Source Health
        </h3>
        <p className="text-meta mt-0.5">Where your influence data comes from</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
              <p className="text-lg font-bold tabular-nums text-foreground">{totalPosts}</p>
              <p className="text-[10px] text-muted-foreground/35">Posts discovered</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
              <p className="text-lg font-bold tabular-nums text-foreground">{postsBySource["browser_capture"] || 0}</p>
              <p className="text-[10px] text-muted-foreground/35">Browser captured</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
              <p className="text-lg font-bold tabular-nums text-foreground">{postsWithMetrics}</p>
              <p className="text-[10px] text-muted-foreground/35">With metrics</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
              <p className="text-lg font-bold tabular-nums text-foreground">{followerSnapshots}</p>
              <p className="text-[10px] text-muted-foreground/35">Follower snapshots</p>
            </div>
          </div>

          {/* Source breakdown */}
          <div className="space-y-2">
            {Object.entries(SOURCE_META).map(([key, meta]) => {
              const count = postsBySource[key] || 0;
              if (count === 0 && key !== "browser_capture") return null;
              const Icon = meta.icon;
              const pct = totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0;
              return (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground/30" />
                    <div>
                      <span className="text-xs text-foreground/70">{meta.label}</span>
                      <p className="text-[9px] text-muted-foreground/25">{meta.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums text-foreground/50 font-medium">{count}</span>
                    {totalPosts > 0 && (
                      <span className="text-[9px] tabular-nums text-muted-foreground/25 w-8 text-right">{pct}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {browserSnapshots > 0 && (
            <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
              {browserSnapshots} follower snapshot{browserSnapshots !== 1 ? "s" : ""} on file.
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default SourceHealthSummary;
