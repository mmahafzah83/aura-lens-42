// Single source of truth for loading the frozen Strategic Identity Report.
// Snapshot-first (report_snapshots is_current) → live buildIdentityReport
// fallback + capture on first run. Consumed by Settings and Your Story so the
// two surfaces can never drift.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildIdentityReport, type ReportData } from "@/lib/buildIdentityReport";
import { fetchCurrentReportSnapshot, captureReportSnapshot } from "@/lib/reportSnapshot";

export interface UseReportSnapshotResult {
  report: ReportData | null;
  version: number | null;
  snapshotAt: string | null;
  loading: boolean;
  hasAssessment: boolean;
}

export function useReportSnapshot(): UseReportSnapshotResult {
  const [report, setReport] = useState<ReportData | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAssessment, setHasAssessment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("diagnostic_profiles")
          .select("brand_assessment_completed_at")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!data?.brand_assessment_completed_at) {
          setHasAssessment(false);
          setLoading(false);
          return;
        }
        setHasAssessment(true);
        try {
          // Frozen edition first — the report must not drift between views.
          const snap = await fetchCurrentReportSnapshot(session.user.id);
          if (snap) {
            if (!cancelled) {
              setReport(snap.data);
              setVersion(snap.version);
              setSnapshotAt(snap.created_at);
            }
          } else {
            // No snapshot yet — live fallback, then freeze it for next time.
            const r = await buildIdentityReport(session.user.id);
            if (!cancelled) setReport(r);
            const v = await captureReportSnapshot("user");
            if (!cancelled && v != null) {
              const fresh = await fetchCurrentReportSnapshot(session.user.id);
              if (fresh && !cancelled) {
                setReport(fresh.data);
                setVersion(fresh.version);
                setSnapshotAt(fresh.created_at);
              }
            }
          }
        } catch (re) {
          console.error("[useReportSnapshot] report load failed", re);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } catch (e) {
        console.error("[useReportSnapshot] failed", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { report, version, snapshotAt, loading, hasAssessment };
}

export default useReportSnapshot;
