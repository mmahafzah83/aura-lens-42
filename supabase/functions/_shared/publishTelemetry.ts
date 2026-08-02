// Structured telemetry for every LinkedIn publish attempt.
//
// Successes go to product_events (a success is not a fault and must not sit in
// the fault table). Faults go to ef_error_log. Both carry the same shape so a
// single correlation_id stitches an attempt sequence back together.

import type { AttemptLog, Outcome, PublishStep } from "./publishPolicy.ts";

export interface PublishAttemptRow {
  correlation_id: string;
  post_id: string;
  user_id: string;
  step: PublishStep;
  attempt: number;
  status: number | null;
  /** LinkedIn's response body, verbatim and untruncated. */
  linkedin_body: string;
  elapsed_ms: number;
  outcome: Outcome | "retrying";
  idempotency_key: string;
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/** Derived from the post row id — the same post can never be published twice. */
export function idempotencyKeyFor(postId: string): string {
  return `linkedin-publish:${postId}`;
}

export async function recordAttempt(admin: any, row: PublishAttemptRow): Promise<void> {
  try {
    if (row.outcome === "ok") {
      await admin.from("product_events").insert({
        user_id: row.user_id,
        event: "linkedin_publish_attempt",
        props: { ...row, linkedin_body: row.linkedin_body },
      });
      return;
    }
    await admin.from("ef_error_log").insert({
      function_name: "linkedin-publish",
      severity: row.outcome === "retrying" ? "info" : "high",
      user_id: row.user_id,
      error_message:
        `publish ${row.outcome} step=${row.step} attempt=${row.attempt} status=${row.status ?? "none"} post=${row.post_id}`,
      context: row,
    });
  } catch (e) {
    console.error("[publishTelemetry] non-blocking failure:", (e as Error)?.message ?? e);
  }
}

export function attemptRows(
  base: Omit<PublishAttemptRow, "step" | "attempt" | "status" | "elapsed_ms" | "outcome" | "linkedin_body">,
  logs: AttemptLog[],
  finalOutcome: Outcome,
  finalBody: string,
): PublishAttemptRow[] {
  return logs.map((l, i) => ({
    ...base,
    step: l.step,
    attempt: l.attempt,
    status: l.status,
    elapsed_ms: l.elapsed_ms,
    linkedin_body: i === logs.length - 1 ? finalBody : (l.error_text ?? ""),
    outcome: l.retrying ? "retrying" : finalOutcome,
  }));
}
