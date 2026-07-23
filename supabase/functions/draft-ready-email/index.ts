// draft-ready-email
// Lifecycle email that names the actual finished draft Aura has written for the user.
//
// DRY-RUN BY DEFAULT. When the `dry_run` key is absent from the body, it defaults to true.
// In dry-run mode we do every lookup, build every email, write log rows prefixed
// `dryrun:`, but call Resend ZERO times.
//
// NO CRON is scheduled for this function. It stays manually invocable only until the
// Composer draft-open fix is confirmed live in production. Do not add a cron job here.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  emailShell,
  heading as headingHtml,
  button,
  pullQuote,
  INK_BODY,
} from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FROM = "Aura <invites@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";
const CTA_URL = "https://www.aura-intel.org/dashboard?tab=authority";

type DraftRow = {
  draft_id: string;
  user_id: string;
  created_at: string;
  body: string | null;
  title: string | null;
  signal_id: string | null;
  src: "content_items" | "linkedin_posts";
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail(opts: {
  topic: string;
  excerpt: string;
  nReadings: number | null;
  nSources: number | null;
}): { subject: string; html: string } {
  const { topic, excerpt, nReadings, nSources } = opts;
  const subject = `Aura wrote your post on ${topic}`;

  const haveCounts =
    typeof nReadings === "number" && nReadings > 0 &&
    typeof nSources === "number" && nSources > 0;

  const line1 = haveCounts
    ? `You saved ${nReadings} reading${nReadings === 1 ? "" : "s"} across ${nSources} source${nSources === 1 ? "" : "s"} on ${escapeHtml(topic)} this week. Aura turned them into a post in your voice.`
    : `Aura turned your recent saves on ${escapeHtml(topic)} into a post in your voice.`;

  // dir="auto" so Arabic excerpts render RTL correctly inside an LTR email body.
  const excerptClean = escapeHtml(excerpt.slice(0, 140)) + (excerpt.length > 140 ? "…" : "");
  const quote =
    `<blockquote dir="auto" style="margin:18px 0;padding:4px 0 4px 18px;border-left:2px solid #D6A748;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#1B1712;">${excerptClean}</blockquote>`;

  const body = `
    ${headingHtml("Your post is written.")}
    <p style="font-size:15px;line-height:1.6;margin:0 0 6px;color:${INK_BODY};">${line1}</p>
    ${quote}
    <p style="font-size:15px;line-height:1.6;margin:0 0 6px;color:${INK_BODY};">It's written and waiting. Ten minutes of edits and it's live.</p>
    <p style="margin:24px 0;">${button(CTA_URL, "Open your draft")}</p>
  `;

  return { subject, html: emailShell({ preheader: subject, body }) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

  const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") ||
    (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isServiceRole = !!SERVICE_KEY && apiKey === SERVICE_KEY;
  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // dry_run defaults to TRUE when the key is absent from the body.
  let dryRun = true;
  try {
    const raw = await req.text();
    if (raw && raw.trim().length > 0) {
      const parsed = JSON.parse(raw);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "dry_run")) {
        dryRun = parsed.dry_run !== false;
      }
    }
  } catch { /* ignore body parse errors — stay in dry-run */ }

  const results: Array<{
    user_id: string;
    draft_id: string;
    outcome: "sent" | "would_send" | "skipped_already" | "failed";
    resend_status?: number;
    error?: string;
  }> = [];

  let candidates = 0;
  let sent = 0;
  let skippedAlready = 0;
  let failed = 0;

  try {
    // Pick each user's single newest draft older than 12h.
    const cutoffIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: ciDrafts, error: ciErr } = await admin
      .from("content_items")
      .select("id, user_id, created_at, body, title, signal_id, generation_params")
      .eq("status", "draft")
      .lt("created_at", cutoffIso);
    if (ciErr) throw ciErr;

    const { data: lpDrafts, error: lpErr } = await admin
      .from("linkedin_posts")
      .select("id, user_id, created_at, post_text, title, source_signal_id")
      .eq("tracking_status", "draft")
      .is("published_at", null)
      .lt("created_at", cutoffIso);
    if (lpErr) throw lpErr;

    const all: DraftRow[] = [];
    for (const r of ciDrafts || []) {
      const gp = (r.generation_params as Record<string, unknown> | null) || {};
      const sigFromParams = typeof gp["source_signal_id"] === "string" ? gp["source_signal_id"] as string : null;
      all.push({
        draft_id: r.id as string,
        user_id: r.user_id as string,
        created_at: r.created_at as string,
        body: (r.body as string | null) ?? null,
        title: (r.title as string | null) ?? null,
        signal_id: (r.signal_id as string | null) ?? sigFromParams,
        src: "content_items",
      });
    }
    for (const r of lpDrafts || []) {
      all.push({
        draft_id: r.id as string,
        user_id: r.user_id as string,
        created_at: r.created_at as string,
        body: (r.post_text as string | null) ?? null,
        title: (r.title as string | null) ?? null,
        signal_id: (r.source_signal_id as string | null) ?? null,
        src: "linkedin_posts",
      });
    }

    if (all.length === 0) {
      // Fall through to summary log.
    }

    // Restrict to users with an active LinkedIn connection.
    const uniqueUserIds = Array.from(new Set(all.map((d) => d.user_id)));
    let activeUsers = new Set<string>();
    if (uniqueUserIds.length > 0) {
      const { data: conns } = await admin
        .from("linkedin_connections")
        .select("user_id, status")
        .in("user_id", uniqueUserIds)
        .eq("status", "active");
      activeUsers = new Set((conns || []).map((c) => c.user_id as string));
    }

    // Newest draft per user, only users with active connection.
    const byUser = new Map<string, DraftRow>();
    for (const d of all) {
      if (!activeUsers.has(d.user_id)) continue;
      const cur = byUser.get(d.user_id);
      if (!cur || new Date(d.created_at).getTime() > new Date(cur.created_at).getTime()) {
        byUser.set(d.user_id, d);
      }
    }

    const picks = Array.from(byUser.values());
    candidates = picks.length;

    for (const pick of picks) {
      const keySuffix = `draft_ready:${pick.draft_id}`;
      const bareKey = keySuffix;
      const dryKey = `dryrun:${keySuffix}`;

      // Never nag: if the bare key was ever written, skip regardless of mode.
      // In real-send mode, also treat the bare key as blocking.
      const { data: existing } = await admin
        .from("lifecycle_email_log")
        .select("id, message_key")
        .eq("user_id", pick.user_id)
        .eq("message_key", bareKey)
        .limit(1);
      if (existing && existing.length > 0) {
        skippedAlready += 1;
        results.push({ user_id: pick.user_id, draft_id: pick.draft_id, outcome: "skipped_already" });
        continue;
      }

      // Resolve topic + counts from the linked signal (if any).
      let topic = "";
      let nReadings: number | null = null;
      let nSources: number | null = null;
      if (pick.signal_id) {
        const { data: sig } = await admin
          .from("strategic_signals")
          .select("signal_title, supporting_evidence_ids")
          .eq("id", pick.signal_id)
          .maybeSingle();
        if (sig?.signal_title) topic = sig.signal_title as string;
        const evIds = (sig?.supporting_evidence_ids as string[] | null) || [];
        if (evIds.length > 0) {
          const { data: frags } = await admin
            .from("evidence_fragments")
            .select("source_registry_id")
            .in("id", evIds);
          const distinctSources = new Set(
            (frags || [])
              .map((f) => (f.source_registry_id as string | null))
              .filter((v): v is string => !!v),
          );
          nReadings = evIds.length;
          nSources = distinctSources.size;
        }
      }
      if (!topic) topic = (pick.title || "your latest topic").trim();

      const excerpt = (pick.body || "").trim();
      const { subject, html } = buildEmail({ topic, excerpt, nReadings, nSources });

      // Recipient email
      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(pick.user_id);
      if (userErr || !userData?.user?.email) {
        failed += 1;
        results.push({
          user_id: pick.user_id,
          draft_id: pick.draft_id,
          outcome: "failed",
          error: "user_not_found",
        });
        await admin.from("ef_error_log").insert({
          function_name: "draft-ready-email",
          severity: "high",
          error_message: `DRAFT_READY_EMAIL user_not_found user=${pick.user_id} draft=${pick.draft_id}`,
          user_id: pick.user_id,
          context: { draft_id: pick.draft_id },
        });
        continue;
      }
      const recipient = userData.user.email;

      if (dryRun) {
        await admin.from("lifecycle_email_log").insert({
          user_id: pick.user_id,
          message_key: dryKey,
        });
        results.push({
          user_id: pick.user_id,
          draft_id: pick.draft_id,
          outcome: "would_send",
        });
        // In dry-run we do NOT increment `sent`. It counts real Resend successes only.
        continue;
      }

      // Real send.
      if (!RESEND_KEY) {
        failed += 1;
        results.push({
          user_id: pick.user_id,
          draft_id: pick.draft_id,
          outcome: "failed",
          error: "RESEND_API_KEY missing",
        });
        await admin.from("ef_error_log").insert({
          function_name: "draft-ready-email",
          severity: "high",
          error_message: `DRAFT_READY_EMAIL resend_key_missing user=${pick.user_id}`,
          user_id: pick.user_id,
          context: { draft_id: pick.draft_id },
        });
        continue;
      }

      let resendStatus = 0;
      let resendBody = "";
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            to: [recipient],
            reply_to: REPLY_TO,
            subject,
            html,
          }),
        });
        resendStatus = resp.status;
        if (!resp.ok) resendBody = await resp.text();
      } catch (e) {
        resendStatus = 0;
        resendBody = (e as Error)?.message ?? String(e);
      }

      if (resendStatus >= 200 && resendStatus < 300) {
        await admin.from("lifecycle_email_log").insert({
          user_id: pick.user_id,
          message_key: bareKey,
        });
        sent += 1;
        results.push({
          user_id: pick.user_id,
          draft_id: pick.draft_id,
          outcome: "sent",
          resend_status: resendStatus,
        });
      } else {
        failed += 1;
        results.push({
          user_id: pick.user_id,
          draft_id: pick.draft_id,
          outcome: "failed",
          resend_status: resendStatus,
          error: resendBody.slice(0, 300),
        });
        await admin.from("ef_error_log").insert({
          function_name: "draft-ready-email",
          severity: "high",
          error_message: `DRAFT_READY_EMAIL resend_failed user=${pick.user_id} status=${resendStatus} body=${resendBody.slice(0, 200)}`,
          user_id: pick.user_id,
          context: { draft_id: pick.draft_id, resend_status: resendStatus },
        });
      }
    }

    // Single summary row per run — always, even when nobody qualifies.
    await admin.from("ef_error_log").insert({
      function_name: "draft-ready-email",
      severity: "info",
      error_message: `DRAFT_READY_EMAIL dry_run=${dryRun} candidates=${candidates} sent=${sent} skipped_already=${skippedAlready} failed=${failed}`,
      context: { dry_run: dryRun, candidates, sent, skipped_already: skippedAlready, failed },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        candidates,
        sent,
        skipped_already: skippedAlready,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    try {
      await admin.from("ef_error_log").insert({
        function_name: "draft-ready-email",
        severity: "high",
        error_message: `DRAFT_READY_EMAIL unhandled=${message}`,
        context: { dry_run: dryRun },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Silence unused-import warning: pullQuote is retained for future variants.
void pullQuote;