/**
 * ONE RUN, ONE ROW.
 *
 * Every opportunity-engine function records that it ran: when it started, when
 * it finished, what it counted, and how serious the outcome was. A function
 * that leaves no row cannot be watched, and `oe_heartbeat` reads exactly these
 * rows to say whether a job has gone quiet.
 *
 * Wrap the handler; nothing else in the function changes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type RunSeverity = "info" | "warn" | "error";

export function withRun(
  runKind: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return await handler(req);

    const startedAt = new Date().toISOString();
    let response: Response;
    let severity: RunSeverity = "info";
    let counts: Record<string, unknown> = {};
    let error: string | null = null;

    try {
      response = await handler(req);
    } catch (e) {
      severity = "error";
      error = String((e as Error)?.message ?? e).slice(0, 500);
      response = new Response(JSON.stringify({ ok: false, error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // A refused knock is not a run of the job.
    if (response.status === 401 || response.status === 403) return response;

    if (!error) {
      try {
        const body = await response.clone().json() as Record<string, unknown>;
        const raw = (body?.counts ?? body) as Record<string, unknown>;
        counts = typeof raw === "object" && raw !== null ? raw : {};
        if (body?.ok === false) severity = "warn";
        if (typeof body?.error === "string") error = body.error.slice(0, 500);
      } catch { /* a non-JSON body is not a failure */ }
      if (response.status >= 500) severity = "error";
    }

    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await admin.from("oe_runs").insert({
        run_kind: runKind,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        outcome: severity === "error" ? "error" : "ok",
        severity,
        counts,
        error,
      });
    } catch { /* a missing run row must never break the job itself */ }

    return response;
  };
}
