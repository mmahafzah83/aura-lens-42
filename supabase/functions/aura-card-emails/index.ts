import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

serve(withObserve("aura-card-emails", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: lowercase cron_secret from Vault OR uppercase env fallback OR service role.
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const apiKey = req.headers.get("apikey") || (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isService = !!SERVICE_KEY && apiKey === SERVICE_KEY;
  if (!isCron && !isService) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const mode: "nudge" | "monthly" = body?.mode === "monthly" ? "monthly" : "nudge";
  const dryRun = body?.dry_run === true;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const now = Date.now();
  const dayMs = 86_400_000;
  const fortyEightHoursAgoIso = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoIso = new Date(now - 7 * dayMs).toISOString();
  const twentyFiveDaysAgoIso = new Date(now - 25 * dayMs).toISOString();

  // 1) Pull candidate profiles based on readiness.
  let query = admin
    .from("diagnostic_profiles")
    .select("user_id, first_name, avatar_url, country_code, brand_assessment_completed_at, audit_completed_at, aura_card_ready_at, lifecycle_opt_out, onboarding_completed");

  if (mode === "nudge") {
    query = query.is("aura_card_ready_at", null);
  } else {
    query = query.not("aura_card_ready_at", "is", null);
  }

  const { data: profiles, error: pErr } = await query;
  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Load auth users to gate on account age and get email.
  const authUsers = new Map<string, { email: string; created_at: string }>();
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users || []) {
      if (u.email) authUsers.set(u.id, { email: u.email, created_at: u.created_at });
    }
    if (!data.users || data.users.length < 200) break;
    page++;
  }

  // 3) Recent sends for the target email_type.
  const targetType = mode === "nudge" ? "aura_card_nudge" : "aura_card_monthly";
  const dedupeCutoffIso = mode === "nudge" ? sevenDaysAgoIso : twentyFiveDaysAgoIso;
  const { data: recentSends } = await admin
    .from("lifecycle_emails")
    .select("user_id, sent_at")
    .eq("email_type", targetType)
    .gte("sent_at", dedupeCutoffIso);
  const recentlySent = new Set<string>((recentSends || []).map((r: any) => r.user_id));

  const results: Array<{ user_id: string; state: string; missing?: string[] }> = [];

  for (const p of profiles || []) {
    const uid = p.user_id as string;
    try {
      if (uid === ADMIN_USER_ID) { results.push({ user_id: uid, state: "SKIP_ADMIN" }); continue; }
      if (p.lifecycle_opt_out === true) { results.push({ user_id: uid, state: "SKIP_OPT_OUT" }); continue; }

      const authRow = authUsers.get(uid);
      if (!authRow) { results.push({ user_id: uid, state: "SKIP_NO_AUTH" }); continue; }

      // Nudge: only after 48h since signup, and skip mid-onboarding accounts.
      if (mode === "nudge") {
        if (authRow.created_at > fortyEightHoursAgoIso) {
          results.push({ user_id: uid, state: "SKIP_TOO_NEW" }); continue;
        }
        if (p.onboarding_completed !== true) {
          results.push({ user_id: uid, state: "SKIP_MID_ONBOARDING" }); continue;
        }
      }

      if (recentlySent.has(uid)) { results.push({ user_id: uid, state: "SKIP_RECENT" }); continue; }

      // Missing gates (nudge only)
      let missing: string[] = [];
      if (mode === "nudge") {
        if (!p.brand_assessment_completed_at) missing.push("assessment");
        if (!(p as any).audit_completed_at) missing.push("radar");
        if (!p.avatar_url) missing.push("photo");
        if (!p.country_code) missing.push("country");
        if (missing.length === 0) {
          // No gates missing but not marked ready — skip; readiness sweep will handle it.
          results.push({ user_id: uid, state: "SKIP_NO_MISSING" }); continue;
        }
      }

      if (dryRun) {
        results.push({ user_id: uid, state: "DRY_RUN", missing });
        continue;
      }

      const payload: Record<string, unknown> = {
        user_id: uid,
        email_type: targetType,
      };
      if (mode === "nudge") payload.missing_gates = missing;
      if (mode === "monthly") {
        payload.month_name = new Date().toLocaleString("en-US", { month: "long" });
      }

      const { error: invokeErr } = await admin.functions.invoke("send-lifecycle-email", { body: payload });
      if (invokeErr) {
        results.push({ user_id: uid, state: "ERROR", missing });
        console.error("send-lifecycle-email failed", uid, invokeErr.message);
      } else {
        results.push({ user_id: uid, state: `SENT_${targetType.toUpperCase()}`, missing });
      }
    } catch (e: any) {
      console.error("aura-card-emails loop error", uid, e?.message);
      results.push({ user_id: uid, state: "ERROR" });
    }
  }

  return new Response(JSON.stringify({
    mode,
    considered: profiles?.length ?? 0,
    sent: results.filter(r => r.state.startsWith("SENT_")).length,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}));