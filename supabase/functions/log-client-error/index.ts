import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SEVERITY = new Set(["critical", "high", "info", "low"]);

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok();

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Validate + clamp inputs
    let message = typeof body?.message === "string" ? body.message : "unknown client error";
    if (message.length > 1000) message = message.slice(0, 1000);

    const rawSeverity = typeof body?.severity === "string" ? body.severity.toLowerCase() : "";
    const severity = (ALLOWED_SEVERITY.has(rawSeverity) ? rawSeverity : "high") as
      | "critical"
      | "high"
      | "info"
      | "low";

    let route = typeof body?.route === "string" ? body.route : "unknown";
    if (route.length > 200) route = route.slice(0, 200);

    let safeContext: Record<string, unknown> = {};
    try {
      const ctxStr = JSON.stringify(body?.context ?? {});
      if (ctxStr.length > 4096) {
        safeContext = { truncated: true };
      } else {
        safeContext = (body?.context && typeof body.context === "object") ? body.context : {};
      }
    } catch {
      safeContext = { truncated: true };
    }

    // Derive user_id ONLY from Authorization header — never from body.
    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      try {
        const anon = createClient(url, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data } = await anon.auth.getUser();
        user_id = data?.user?.id ?? null;
      } catch {
        user_id = null;
      }
    }

    try {
      const admin = createClient(url, serviceKey);
      await logEfError(admin, {
        function_name: "client:" + (route || "unknown"),
        error: message,
        severity,
        user_id,
        context: { source: "client", ...safeContext },
      });
    } catch (e) {
      console.error("[log-client-error] write failed (non-blocking):", e);
    }

    return ok();
  } catch (e) {
    console.error("[log-client-error] outer failure (non-blocking):", e);
    return ok();
  }
});