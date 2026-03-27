import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, CheckCircle2, AlertTriangle, XCircle, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HealthCheck {
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

const DataHealthConsole = () => {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSnapshots, setTotalSnapshots] = useState(0);
  const [coverage, setCoverage] = useState(0);

  useEffect(() => {
    runHealthCheck();
  }, []);

  const runHealthCheck = async () => {
    try {
      const results: HealthCheck[] = [];

      // 1. Count total snapshots
      const { data: snapshots } = await supabase
        .from("influence_snapshots")
        .select("snapshot_date, source_type")
        .order("snapshot_date", { ascending: true });
      const snaps = snapshots || [];
      setTotalSnapshots(snaps.length);

      // 2. Check gaps
      if (snaps.length >= 2) {
        const dates = snaps.map(s => new Date(s.snapshot_date).getTime());
        const first = dates[0];
        const last = dates[dates.length - 1];
        const totalDays = Math.ceil((last - first) / 86400000) + 1;
        const cov = Math.round((snaps.length / totalDays) * 100);
        setCoverage(cov);

        let gapCount = 0;
        for (let i = 1; i < dates.length; i++) {
          const diff = Math.round((dates[i] - dates[i - 1]) / 86400000);
          if (diff > 1) gapCount += diff - 1;
        }

        results.push({
          label: "Data Coverage",
          status: cov >= 80 ? "ok" : cov >= 50 ? "warn" : "error",
          detail: `${cov}% coverage · ${gapCount} gap days over ${totalDays} day span`,
        });
      } else {
        setCoverage(snaps.length > 0 ? 100 : 0);
        results.push({
          label: "Data Coverage",
          status: snaps.length > 0 ? "warn" : "error",
          detail: snaps.length > 0 ? "Only 1 snapshot — need more data for trend analysis" : "No snapshots found",
        });
      }

      // 3. Check source diversity
      const sources = new Set(snaps.map(s => s.source_type));
      results.push({
        label: "Source Attribution",
        status: "ok",
        detail: `${sources.size} source type${sources.size !== 1 ? "s" : ""}: ${[...sources].join(", ") || "none"}`,
      });

      // 4. Check sync runs for errors
      const { data: syncErrors } = await supabase
        .from("sync_errors")
        .select("id")
        .limit(1);
      const hasErrors = (syncErrors?.length || 0) > 0;
      results.push({
        label: "Sync Health",
        status: hasErrors ? "warn" : "ok",
        detail: hasErrors ? "Some sync errors detected — check Source Review panel" : "No sync errors recorded",
      });

      // 5. Check import jobs
      const { data: importJobs } = await supabase
        .from("import_jobs")
        .select("status, skipped_rows, duplicate_rows")
        .order("created_at", { ascending: false })
        .limit(5);
      const failedImports = (importJobs || []).filter(j => j.status === "failed").length;
      const totalDupes = (importJobs || []).reduce((s, j) => s + (j.duplicate_rows || 0), 0);
      results.push({
        label: "Import Integrity",
        status: failedImports > 0 ? "error" : totalDupes > 0 ? "warn" : "ok",
        detail: failedImports > 0
          ? `${failedImports} failed import${failedImports > 1 ? "s" : ""}`
          : totalDupes > 0
            ? `${totalDupes} duplicate${totalDupes > 1 ? "s" : ""} detected and skipped`
            : "All imports clean",
      });

      // 6. LinkedIn connection check
      const { data: conn } = await supabase
        .from("linkedin_connections")
        .select("status, last_synced_at")
        .limit(1);
      const linkedIn = conn?.[0];
      if (linkedIn) {
        const daysSince = linkedIn.last_synced_at
          ? Math.floor((Date.now() - new Date(linkedIn.last_synced_at).getTime()) / 86400000)
          : null;
        results.push({
          label: "LinkedIn Connection",
          status: linkedIn.status === "active" && daysSince !== null && daysSince <= 7 ? "ok" : linkedIn.status === "active" ? "warn" : "error",
          detail: linkedIn.status === "active"
            ? daysSince !== null ? `Active · last sync ${daysSince}d ago` : "Active · never synced"
            : "Disconnected",
        });
      } else {
        results.push({
          label: "LinkedIn Connection",
          status: "error",
          detail: "Not connected",
        });
      }

      setChecks(results);
    } catch {
      setChecks([{ label: "Health Check", status: "error", detail: "Failed to run diagnostics" }]);
    }
    setLoading(false);
  };

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "warn") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  const overallStatus = checks.some(c => c.status === "error") ? "Issues Found" :
    checks.some(c => c.status === "warn") ? "Acceptable" : "Healthy";
  const overallColor = checks.some(c => c.status === "error") ? "text-red-400" :
    checks.some(c => c.status === "warn") ? "text-amber-400" : "text-emerald-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.24 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Data Health Console</h3>
            <p className="text-meta">Gaps, duplicates, sync coverage, and import issues</p>
          </div>
        </div>
        {!loading && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${overallColor}`}>{overallStatus}</span>
            <span className="text-meta tabular-nums">{totalSnapshots} snapshots</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : (
        <>
          {/* Coverage bar */}
          <div className="p-4 rounded-xl bg-secondary/10 border border-border/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Data Coverage</span>
              <span className="text-xs font-bold tabular-nums text-foreground">{coverage}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary/30 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${coverage}%` }}
                transition={{ duration: 0.8 }}
                className={`h-full rounded-full ${
                  coverage >= 80 ? "bg-emerald-500/60" : coverage >= 50 ? "bg-amber-500/60" : "bg-red-500/60"
                }`}
              />
            </div>
            <p className="text-meta">
              {coverage >= 80 ? "Excellent — trend analysis is reliable." :
               coverage >= 50 ? "A few gaps are acceptable — trend analysis can still begin." :
               "Significant gaps — consider importing historical data."}
            </p>
          </div>

          {/* Health checks */}
          <div className="space-y-2">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center justify-between p-3 rounded-xl bg-secondary/8 border border-border/5 hover:bg-secondary/12 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(check.status)}
                  <span className="text-sm font-medium text-foreground">{check.label}</span>
                </div>
                <span className="text-meta text-right max-w-[50%] truncate">{check.detail}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default DataHealthConsole;
