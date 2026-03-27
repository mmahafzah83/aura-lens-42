import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Monitor, CheckCircle2, Clock, AlertCircle, Download, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

interface CaptureStats {
  lastRun: string | null;
  lastRunStatus: string | null;
  totalRecords: number;
  totalErrors: number;
  runsToday: number;
}

const BrowserCapturePanel = () => {
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      const [runsRes, errRes] = await Promise.all([
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
      ]);

      const runs = runsRes.data || [];
      const lastRun = runs[0] || null;
      const totalRecords = runs.reduce((s, r) => s + (r.records_stored || 0), 0);
      const runsToday = runs.filter(r => r.completed_at?.startsWith(todayStr)).length;

      setStats({
        lastRun: lastRun?.completed_at || null,
        lastRunStatus: lastRun?.status || null,
        totalRecords,
        totalErrors: errRes.count || 0,
        runsToday,
      });
    } catch (e) {
      console.error("Capture stats error:", e);
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

  const hasCaptures = stats && stats.totalRecords > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="w-4 h-4 text-primary/50" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">LinkedIn Capture</h3>
            <p className="text-meta mt-0.5">
              Real-time analytics from your browser — highest trust source
            </p>
          </div>
        </div>
        {hasCaptures ? (
          <Wifi className="w-3.5 h-3.5 text-primary/40" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-muted-foreground/25" />
        )}
      </div>

      {loading ? (
        <p className="text-[10px] text-muted-foreground/30">Loading capture status…</p>
      ) : (
        <>
          {/* Status grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-[10px]">
              <p className="text-muted-foreground/30">Status</p>
              <p className={`font-medium ${hasCaptures ? "text-primary/60" : "text-muted-foreground/40"}`}>
                {hasCaptures ? "Connected" : "Not connected"}
              </p>
            </div>
            <div className="text-[10px]">
              <p className="text-muted-foreground/30">Last capture</p>
              <p className="text-muted-foreground/50 font-medium">
                {stats?.lastRun ? formatSmartDate(stats.lastRun) : "—"}
              </p>
            </div>
            <div className="text-[10px]">
              <p className="text-muted-foreground/30">Records received</p>
              <p className="text-primary/50 font-medium">{stats?.totalRecords || 0}</p>
            </div>
            <div className="text-[10px]">
              <p className="text-muted-foreground/30">Errors</p>
              <p className={`font-medium ${(stats?.totalErrors || 0) > 0 ? "text-amber-500/50" : "text-muted-foreground/40"}`}>
                {stats?.totalErrors || 0}
              </p>
            </div>
          </div>

          {stats?.runsToday && stats.runsToday > 0 ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/35">
              <CheckCircle2 className="w-3 h-3 text-primary/30" />
              <span>{stats.runsToday} capture{stats.runsToday !== 1 ? "s" : ""} today</span>
            </div>
          ) : null}

          {/* Setup instructions */}
          {!hasCaptures && (
            <div className="space-y-3 pt-1 border-t border-border/5">
              <p className="text-[10px] text-muted-foreground/35 leading-relaxed">
                Install the Aura Chrome extension to capture real-time LinkedIn analytics directly from your browser session. This is the most accurate data source.
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
        </>
      )}
    </motion.div>
  );
};

export default BrowserCapturePanel;
