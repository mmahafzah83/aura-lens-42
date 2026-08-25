// One path for every member-facing report — crash cards and the feedback
// widget. The client never writes to member_issue_reports directly; the
// report-issue function holds the service role so an anonymous crash still
// files. An action that reports success must have verified success, so this
// returns the function's own { ok } rather than assuming it.

import { supabase } from "@/integrations/supabase/client";

export type IssueKind = "crash" | "feedback";

export interface ReportIssueResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function reportIssue(input: {
  kind: IssueKind;
  message: string;
  route?: string | null;
  componentStack?: string | null;
}): Promise<ReportIssueResult> {
  try {
    const { data, error } = await supabase.functions.invoke("report-issue", {
      body: {
        kind: input.kind,
        message: input.message,
        route:
          input.route ??
          (typeof location !== "undefined" ? location.pathname : null),
        component_stack: input.componentStack ?? null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        app_version: (import.meta as any)?.env?.MODE ?? null,
      },
    });
    if (error) return { ok: false, error: error.message || "send failed" };
    if (!data || (data as any).ok !== true) {
      return { ok: false, error: (data as any)?.error || "send failed" };
    }
    return { ok: true, id: (data as any).id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "send failed" };
  }
}
