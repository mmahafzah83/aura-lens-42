import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
export async function logError(function_name: string, error: unknown, opts?: { user_id?: string | null; severity?: string; context?: Record<string, unknown> }) {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("ef_error_log").insert({
      function_name,
      user_id: opts?.user_id ?? null,
      severity: opts?.severity ?? "error",
      error_message: error instanceof Error ? error.message : String(error),
      context: opts?.context ?? {},
    });
  } catch (e) { console.error("logError failed (non-blocking):", e); }
}