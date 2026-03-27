import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HealthCheck {
  label: string;
  status: "ok" | "warn" | "issue";
  detail: string;
}

const DataHealthConsole = () => {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState(0);

  useEffect(() => { runHealthCheck(); }, []);

  const runHealthCheck = async () => {
    try {
      const results: HealthCheck[] = [];

      const { data: snapshots } = await supabase
        .from("influence_snapshots")
        .select("snapshot_date, source_type")
        .order("snapshot_date", { ascending: true });
      const snaps = snapshots || [];

      if (snaps.length >= 2) {
        const dates = snaps.map(s => new Date(s.snapshot_date).getTime());
        const totalDays = Math.ceil((dates[dates.length - 1] - dates[0]) / 86400000) + 1;
        const cov = Math.round((snaps.length / totalDays) * 100);
        setCoverage(cov);
        let gapDays = 0;
        for (let i = 1; i < dates.length; i++) {
          const diff = Math.round((dates[i] - dates[i - 1]) / 86400000);
          if (diff > 1) gapDays += diff - 1;
        }
        results.push({
          label: "Coverage",
          status: cov >= 80 ? "ok" : cov >= 50 ? "warn" : "issue",
          detail: `${cov}% · ${gapDays} gap day${gapDays !== 1 ? "s" : ""} across ${totalDays} days`,
        });
      } else {
        setCoverage(snaps.length > 0 ? 100 : 0);
        results.push({
          label: "Coverage",
          status: snaps.length > 0 ? "warn" : "issue",
          detail: snaps.length > 0 ? "Single snapshot — more data needed for trends" : "No snapshots yet",
        });
      }

      const sources = new Set(snaps.map(s => s.source_type));
      results.push({
        label: "Sources",
        status: "ok",
        detail: sources.size > 0 ? [...sources].join(", ") : "None",
      });

      const { data: syncErrors } = await supabase.from("sync_errors").select("id").limit(1);
      results.push({
        label: "Sync integrity",
        status: (syncErrors?.length || 0) > 0 ? "warn" : "ok",
        detail: (syncErrors?.length || 0) > 0 ? "Errors detected" : "Clean",
      });

      const { data: importJobs } = await supabase
        .from("import_jobs")
        .select("status, duplicate_rows")
        .order("created_at", { ascending: false })
        .limit(5);
      const dupes = (importJobs || []).reduce((s, j) => s + (j.duplicate_rows || 0), 0);
      results.push({
        label: "Import quality",
        status: dupes > 0 ? "warn" : "ok",
        detail: dupes > 0 ? `${dupes} duplicate${dupes !== 1 ? "s" : ""} skipped` : "All clean",
      });

      setChecks(results);
    } catch {
      setChecks([{ label: "Diagnostics", status: "issue", detail: "Could not complete" }]);
    }
    setLoading(false);
  };

  const statusDot = (s: string) => (
    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
      s === "ok" ? "bg-primary/50" : s === "warn" ? "bg-muted-foreground/40" : "bg-destructive/50"
    }`} />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.18 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Data Health</h3>
          <p className="text-meta mt-0.5">Gaps, coverage, and import integrity</p>
        </div>
        {!loading && (
          <span className="text-[11px] font-medium text-muted-foreground/50 tabular-nums">{coverage}% coverage</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
        </div>
      ) : (
        <>
          {/* Coverage bar */}
          <div className="h-1.5 rounded-full bg-secondary/20 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${coverage}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-primary/30"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/30 -mt-2">
            {coverage >= 80 ? "Trend analysis is reliable." :
             coverage >= 50 ? "A few gaps are acceptable — trend analysis can still begin." :
             "Consider importing historical data to strengthen trend accuracy."}
          </p>

          {/* Checks */}
          <div className="space-y-2 pt-1">
            {checks.map(check => (
              <div key={check.label} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2.5">
                  {statusDot(check.status)}
                  <span className="text-xs text-foreground/70">{check.label}</span>
                </div>
                <span className="text-[11px] text-muted-foreground/40">{check.detail}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default DataHealthConsole;
