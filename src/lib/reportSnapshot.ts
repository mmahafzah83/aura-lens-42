// Frozen report editions (SLICE 3a).
// The report a user sees/exports comes from their current report_snapshots
// row, so the same edition re-exports byte-stable. Live assembly is only a
// first-run fallback.

import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/buildIdentityReport";

export interface ReportSnapshot {
  version: number;
  created_at: string;
  data: ReportData;
}

export async function fetchCurrentReportSnapshot(userId: string): Promise<ReportSnapshot | null> {
  const { data, error } = await (supabase.from("report_snapshots" as any) as any)
    .select("version, created_at, data")
    .eq("user_id", userId)
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data) return null;
  return { version: data.version, created_at: data.created_at, data: data.data as ReportData };
}

/** Non-blocking capture. Returns the new version, or null on failure
 *  (the edge function logs every failure to ef_error_log). */
export async function captureReportSnapshot(
  createdBy: "user" | "admin" | "system" = "user",
): Promise<number | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-report-snapshot", {
      body: { created_by: createdBy },
    });
    if (error) {
      console.error("[reportSnapshot] capture failed", error);
      return null;
    }
    return (data as any)?.version ?? null;
  } catch (e) {
    console.error("[reportSnapshot] capture threw", e);
    return null;
  }
}
