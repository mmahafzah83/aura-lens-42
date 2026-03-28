import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Monitor, CheckCircle2, Download, Wifi, WifiOff,
  Camera, BarChart3, Users, FileText, Loader2, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

interface CaptureOverview {
  extensionConnected: boolean;
  lastCaptureTime: string | null;
  lastCaptureStatus: string | null;
  snapshotsCaptured: number;
  postsCaptured: number;
  postMetricsCaptured: number;
  totalErrors: number;
  capturesToday: number;
}

const BrowserCapturePanel = () => {
  const [overview, setOverview] = useState<CaptureOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [runsRes, errRes, snapsRes, postsRes, metricsRes] = await Promise.all([
        supabase
          .from("sync_runs")
          .select("completed_at, status, records_stored")
          .eq("sync_type", "browser_capture")
          .order("completed_at", { ascending: false })
          .limit(30),
        supabase
          .from("sync_errors")
          .select("id", { count: "exact", head: true })
          .eq("error_type", "browser_capture"),
        supabase
          .from("influence_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("source_type", "browser_capture"),
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("source_type", "browser_capture"),
        supabase
          .from("linkedin_post_metrics")
          .select("id", { count: "exact", head: true })
          .eq("source_type", "browser_capture"),
      ]);

      const runs = runsRes.data || [];
      const lastRun = runs[0] || null;
      const todayStr = new Date().toISOString().slice(0, 10);
      const capturesToday = runs.filter(r => r.completed_at?.startsWith(todayStr)).length;
      const hasAnyCapture = runs.length > 0;

      setOverview({
        extensionConnected: hasAnyCapture,
        lastCaptureTime: lastRun?.completed_at || null,
        lastCaptureStatus: lastRun?.status || null,
        snapshotsCaptured: snapsRes.count || 0,
        postsCaptured: postsRes.count || 0,
        postMetricsCaptured: metricsRes.count || 0,
        totalErrors: errRes.count || 0,
        capturesToday,
      });
    } catch (e) {
      console.error("Capture overview error:", e);
    }
    setLoading(false);
  };

  const handleDownload = () => {
    fetch("/aura-linkedin-capture.zip")
      .then(res => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "aura-linkedin-capture.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => console.error(err));
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
      </div>
    );
  }

  const connected = overview?.extensionConnected ?? false;
  const hasData = (overview?.snapshotsCaptured || 0) + (overview?.postsCaptured || 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
            <Monitor className="w-4 h-4 text-primary/50" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">LinkedIn Capture</h3>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">
              Captures analytics from your logged-in LinkedIn session
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-primary/60" : "bg-muted-foreground/20"}`} />
          {connected ? (
            <Wifi className="w-3.5 h-3.5 text-primary/40" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground/25" />
          )}
        </div>
      </div>

      {/* Coverage stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
          <div className="flex items-center gap-1.5">
            {connected
              ? <CheckCircle2 className="w-3 h-3 text-primary/40" />
              : <WifiOff className="w-3 h-3 text-muted-foreground/25" />}
            <p className="text-[10px] text-muted-foreground/35">Status</p>
          </div>
          <p className={`text-xs font-semibold ${connected ? "text-primary/60" : "text-muted-foreground/40"}`}>
            {connected ? "Connected" : "Not connected"}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground/25" />
            <p className="text-[10px] text-muted-foreground/35">Snapshots</p>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{overview?.snapshotsCaptured || 0}</p>
        </div>
        <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-muted-foreground/25" />
            <p className="text-[10px] text-muted-foreground/35">Posts</p>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{overview?.postsCaptured || 0}</p>
        </div>
        <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-muted-foreground/25" />
            <p className="text-[10px] text-muted-foreground/35">Metrics</p>
          </div>
          <p className="text-lg font-bold tabular-nums text-foreground">{overview?.postMetricsCaptured || 0}</p>
        </div>
        <div className="p-3 rounded-xl bg-secondary/10 border border-border/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Camera className="w-3 h-3 text-muted-foreground/25" />
            <p className="text-[10px] text-muted-foreground/35">Last capture</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground/50">
            {overview?.lastCaptureTime ? formatSmartDate(overview.lastCaptureTime) : "—"}
          </p>
        </div>
      </div>

      {/* Today's activity */}
      {(overview?.capturesToday || 0) > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/35">
          <CheckCircle2 className="w-3 h-3 text-primary/30" />
          <span>{overview!.capturesToday} capture{overview!.capturesToday !== 1 ? "s" : ""} today</span>
        </div>
      )}

      {/* Errors */}
      {(overview?.totalErrors || 0) > 0 && (
        <p className="text-[10px] text-amber-500/50">
          {overview!.totalErrors} error{overview!.totalErrors !== 1 ? "s" : ""} logged — check sync history for details.
        </p>
      )}

      {/* Guidance */}
      <div className="pt-3 border-t border-border/5 space-y-3">
        <div className="flex items-start gap-2.5">
          <Info className="w-3.5 h-3.5 text-primary/25 mt-0.5 flex-shrink-0" />
          <div className="space-y-2 text-[10px] text-muted-foreground/35 leading-relaxed">
            <p>
              <span className="text-foreground/50 font-medium">Capture This Page</span> — use when you publish a new post or want updated metrics for a specific post.
            </p>
            <p>
              <span className="text-foreground/50 font-medium">Guided Capture</span> — run weekly to refresh follower count, audience analytics, and bulk post metrics in one pass.
            </p>
          </div>
        </div>
      </div>

      {/* Setup instructions (only when no captures yet) */}
      {!connected && (
        <div className="space-y-3 pt-2 border-t border-border/5">
          <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
            Install the Aura Chrome extension to capture analytics directly from your browser.
            LinkedIn does not provide personal analytics via its public API — browser capture is the reliable path.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press"
            >
              <Download className="w-3.5 h-3.5" />
              Download Extension
            </button>
          </div>
          <div className="text-[9px] text-muted-foreground/25 space-y-0.5 pl-1">
            <p>1. Unzip the downloaded file</p>
            <p>2. Open chrome://extensions and enable Developer mode</p>
            <p>3. Click "Load unpacked" and select the folder</p>
            <p>4. Sign in with your Aura credentials</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default BrowserCapturePanel;
