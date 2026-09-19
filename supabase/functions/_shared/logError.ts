import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logEfError } from "./observe.ts";

type CanonSeverity = "debug" | "info" | "warn" | "error" | "fatal";

function mapSeverity(input?: string): CanonSeverity {
  const s = (input ?? "").toLowerCase();
  if (s === "debug" || s === "info" || s === "warn" || s === "error" || s === "fatal") return s;
  if (s === "critical") return "fatal";
  if (s === "high") return "error";
  if (s === "warning" || s === "low" || s === "medium" || s === "med") return "warn";
  if (s === "ok") return "info";
  return "error";
}

/**
 * Back-compat wrapper. Delegates to logEfError in observe.ts so there is a
 * SINGLE writer to ef_error_log. Signature preserved for existing callers.
 */
export async function logError(
  function_name: string,
  error: unknown,
  opts?: { user_id?: string | null; severity?: string; context?: Record<string, unknown> },
) {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await logEfError(admin, {
      function_name,
      error,
      severity: mapSeverity(opts?.severity),
      user_id: opts?.user_id ?? null,
      context: opts?.context ?? {},
    });
  } catch (e) {
    console.error("logError failed (non-blocking):", e);
  }
}