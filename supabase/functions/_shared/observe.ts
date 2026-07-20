import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Severity = "critical" | "high" | "info" | "low";

export async function logEfError(
  admin: SupabaseClient,
  opts: {
    function_name: string;
    error: unknown;
    severity?: Severity;
    user_id?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const raw = (opts.error as any)?.message ?? opts.error;
    const error_message = String(raw ?? "unknown error").slice(0, 1000);
    const severity = opts.severity ?? "high";
    // Route non-error telemetry (info/low) to ef_event_log so ef_error_log stays a
    // true error stream. Success summaries (e.g. cluster_summary) are events, not errors.
    const table = (severity === "info" || severity === "low") ? "ef_event_log" : "ef_error_log";
    await admin.from(table).insert({
      function_name: opts.function_name,
      severity,
      error_message,
      user_id: opts.user_id ?? null,
      context: opts.context ?? {},
    });
  } catch (e) {
    // Never allow logging to throw
    console.error("[observe] logEfError failed (non-blocking):", (e as Error)?.message ?? e);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function withObserve(
  function_name: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      // Always surface to logs — never let logging mask the original error
      console.error(`[${function_name}] unhandled error:`, err);
      try {
        const url = Deno.env.get("SUPABASE_URL");
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (url && key) {
          const admin = createClient(url, key);
          await logEfError(admin, { function_name, error: err, severity: "high" });
        }
      } catch (e) {
        console.error(`[${function_name}] observe logging failed:`, e);
      }
      const message = (err as any)?.message ? String((err as any).message) : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}