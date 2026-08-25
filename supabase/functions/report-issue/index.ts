// report-issue — the single path every member-facing reporting surface uses.
// Service role, verify_jwt = false: a crash can happen with no valid session,
// and a report that cannot be filed is the same as no report at all.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MESSAGE = 4000;
const MAX_STACK = 8000;
const MAX_SHORT = 300;
const RATE_LIMIT = 10; // per user or IP, per hour

const cap = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === "feedback" ? "feedback" : body?.kind === "crash" ? "crash" : null;
    if (!kind) return json({ ok: false, error: "kind must be 'crash' or 'feedback'" }, 400);

    const message = cap(body?.message, MAX_MESSAGE);
    if (!message) return json({ ok: false, error: "message is required" }, 400);

    // Caller identity when a session is present — a crash may have none.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = data?.user?.id ?? null;
      } catch {
        userId = null;
      }
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    // Rate limit: 10 per hour per user, or per IP when there is no user.
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countQuery = supabase
      .from("member_issue_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso);
    const { count } = userId
      ? await countQuery.eq("user_id", userId)
      : await countQuery.is("user_id", null).eq("user_agent", `${cap(body?.user_agent, MAX_SHORT) ?? "unknown"} · ${ip}`);
    if ((count ?? 0) >= RATE_LIMIT) {
      return json({ ok: false, error: "Too many reports in the last hour. Please try again later." }, 429);
    }

    const { data, error } = await supabase
      .from("member_issue_reports")
      .insert({
        user_id: userId,
        kind,
        message,
        route: cap(body?.route, MAX_SHORT),
        component_stack: cap(body?.component_stack, MAX_STACK),
        user_agent: userId
          ? cap(body?.user_agent, MAX_SHORT)
          : `${cap(body?.user_agent, MAX_SHORT) ?? "unknown"} · ${ip}`,
        app_version: cap(body?.app_version, MAX_SHORT),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[report-issue] insert failed", error);
      return json({ ok: false, error: "We could not file that report." }, 500);
    }

    return json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[report-issue] failed", e);
    return json({ ok: false, error: "We could not file that report." }, 500);
  }
});
