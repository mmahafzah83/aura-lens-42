// send-morning-signal — THE ENVELOPE
//
// Sends one email per user per day, only when The Overnight actually produced
// something. A quiet night sends nothing. Idempotency contract lives in
// lifecycle_email_log with message_key = 'morning_signal:<YYYY-MM-DD Riyadh>'.
//
// dry_run defaults to TRUE. Resend is called ZERO times in dry-run, and no
// idempotency/lifecycle rows are written.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FROM = "Aura <invites@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";
const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const CTA_URL = "https://www.aura-intel.org/dashboard?tab=overnight";
const PAUSE_URL = "https://www.aura-intel.org/dashboard?settings=notifications";
const FRESH_WINDOW_HOURS = 14;

const SERIF = "Newsreader,Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const UI = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// Dark-mode safe: mid-tone ink on a mid-tone paper reads in both schemes.
const PAPER = "#F7F5F1";
const INK = "#171512";
const INK_BODY = "#3A342C";
const INK_MUTE = "#6E665A";
const RULE = "#DED8CE";
const ACT = "#1F5FD0"; // blue = user's turn

type Finding = {
  id: string;
  user_id: string;
  url: string | null;
  title: string | null;
  source: string | null;
  relevance_score: number | null;
  implication: string | null;
  created_at: string;
  themes: string[] | null;
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Riyadh is a fixed UTC+3 offset, no DST.
function riyadh(d: Date): Date {
  return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}
function riyadhDateKey(d: Date): string {
  return riyadh(d).toISOString().slice(0, 10);
}
function riyadhHHMM(iso: string): string {
  return riyadh(new Date(iso)).toISOString().slice(11, 16);
}

function firstTheme(f: Finding): string | null {
  const t = Array.isArray(f.themes) ? f.themes.find((x) => !!x && String(x).trim()) : null;
  return t ? String(t).trim() : null;
}

function buildSubject(f: Finding): string {
  const theme = firstTheme(f);
  if (theme) return `Aura found something on ${theme} while you slept`;
  const src = (f.source || "").trim();
  if (src) return `Aura found something in ${src} while you slept`;
  return `Aura found something while you slept`;
}

function provenanceParts(f: Finding): string[] {
  const parts: string[] = [];
  if (f.source && String(f.source).trim()) parts.push(String(f.source).trim());
  if (f.relevance_score !== null && f.relevance_score !== undefined) {
    parts.push(`relevance ${Number(f.relevance_score)}`);
  }
  const theme = firstTheme(f);
  if (theme) parts.push(theme);
  return parts;
}

function buildEmail(lead: Finding, others: Finding[]) {
  const subject = buildSubject(lead);
  const kicker = `THE OVERNIGHT · ${riyadhHHMM(lead.created_at)}`;
  const headline = (lead.title || "").trim() || (lead.url || "").trim();
  const prov = provenanceParts(lead);
  const extras = others.slice(0, 3);

  const implicationHtml = (lead.implication || "").trim()
    ? `<p style="margin:0 0 18px;font-family:${UI};font-size:15px;line-height:1.65;color:${INK_BODY};">${escapeHtml(lead.implication!.trim())}</p>`
    : "";

  const provHtml = prov.length
    ? `<p style="margin:0 0 22px;font-family:${MONO};font-size:11px;line-height:1.6;color:${INK_MUTE};">${escapeHtml(prov.join(" · "))}</p>`
    : "";

  const extrasHtml = extras.length
    ? `<div style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${RULE};">` +
      extras.map((e) =>
        `<p style="margin:0 0 8px;font-family:${UI};font-size:13px;line-height:1.5;">` +
        `<a href="${escapeHtml(e.url || CTA_URL)}" style="color:${INK_BODY};text-decoration:underline;">${escapeHtml((e.title || e.url || "").trim())}</a></p>`
      ).join("") +
      `</div>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${PAPER};border:1px solid ${RULE};border-radius:4px;">
    <tr><td style="height:2px;line-height:2px;font-size:0;background:#12B5CB;background-image:linear-gradient(90deg,#12B5CB 0%,${ACT} 100%);">&nbsp;</td></tr>
    <tr><td style="padding:26px 28px 30px;">
      <p style="margin:0 0 14px;font-family:${MONO};font-size:11px;letter-spacing:.08em;color:${INK_MUTE};">${escapeHtml(kicker)}</p>
      <h1 style="margin:0 0 14px;font-family:${SERIF};font-size:21px;line-height:1.35;font-weight:600;color:${INK};text-align:left;">${escapeHtml(headline)}</h1>
      ${implicationHtml}
      ${provHtml}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:${ACT};border-radius:6px;">
          <a href="${CTA_URL}" style="display:inline-block;padding:12px 22px;font-family:${UI};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">Open it in Aura</a>
        </td></tr></table>
      ${extrasHtml}
      <div style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${RULE};">
        <p style="margin:0;font-family:${UI};font-size:12px;line-height:1.6;color:${INK_MUTE};">Sent because last night produced something. Quiet nights send nothing.<br>
        <a href="${PAUSE_URL}" style="color:${INK_MUTE};text-decoration:underline;">Pause these emails</a></p>
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const textLines = [
    kicker,
    "",
    headline,
  ];
  if ((lead.implication || "").trim()) { textLines.push("", lead.implication!.trim()); }
  if (prov.length) { textLines.push("", prov.join(" · ")); }
  textLines.push("", `Open it in Aura: ${CTA_URL}`);
  if (extras.length) {
    textLines.push("", "Also last night:");
    for (const e of extras) textLines.push(`- ${(e.title || e.url || "").trim()}${e.url ? ` (${e.url})` : ""}`);
  }
  textLines.push("", "Sent because last night produced something. Quiet nights send nothing.", `Pause these emails: ${PAUSE_URL}`);

  return { subject, html, text: textLines.join("\n") };
}

async function sendResend(apiKey: string, to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text }),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`resend ${res.status}: ${bodyText.slice(0, 400)}`);
  return res.status;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Vault secret name is LOWERCASE `cron_secret`.
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

  const apiKey = req.headers.get("apikey") ||
    (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const isCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
  const isServiceRole = !!SERVICE_KEY && apiKey === SERVICE_KEY;
  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let dryRun = true;
  let onlyUserId: string | null = null;
  try {
    const raw = await req.text();
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "dry_run")) {
        dryRun = parsed.dry_run !== false;
      }
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof parsed?.only_user_id === "string" && UUID_RE.test(parsed.only_user_id)) {
        onlyUserId = parsed.only_user_id;
      }
    }
  } catch { /* stay in dry-run */ }

  const now = new Date();
  const dateKey = riyadhDateKey(now);
  const messageKey = `morning_signal:${dateKey}`;
  const cutoff = new Date(now.getTime() - FRESH_WINDOW_HOURS * 3600 * 1000).toISOString();

  const results: Array<Record<string, unknown>> = [];
  let sent = 0, skippedAlready = 0, failed = 0, quiet = 0;

  try {
    let q = admin
      .from("agent_findings")
      .select("id,user_id,url,title,source,relevance_score,implication,created_at,themes")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    if (onlyUserId) q = q.eq("user_id", onlyUserId);
    const { data: findings, error: fErr } = await q;
    if (fErr) throw fErr;

    const byUser = new Map<string, Finding[]>();
    for (const f of (findings || []) as Finding[]) {
      if (!f.user_id) continue;
      // Founder is excluded from live sends but allowed as a dry-run target.
      if (f.user_id === FOUNDER_ID && !(dryRun && onlyUserId === FOUNDER_ID)) continue;
      if (!((f.title || "").trim() || (f.url || "").trim())) continue;
      const arr = byUser.get(f.user_id) || [];
      arr.push(f);
      byUser.set(f.user_id, arr);
    }

    const userIds = Array.from(byUser.keys());
    if (userIds.length === 0) {
      quiet = 1; // nothing fresh anywhere — silence is the correct outcome
    }

    // Emails + test-account exclusion
    const emails = new Map<string, string>();
    for (const uid of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const em = u?.user?.email || "";
      if (!em) continue;
      if (/test/i.test(em)) continue;
      emails.set(uid, em);
    }

    // Already-sent map for today
    const { data: already } = await admin
      .from("lifecycle_email_log")
      .select("user_id")
      .eq("message_key", messageKey)
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const alreadySent = new Set((already || []).map((r) => r.user_id as string));

    for (const uid of userIds) {
      try {
        const to = emails.get(uid);
        if (!to) { results.push({ user_id: uid, outcome: "skipped_no_email_or_test" }); continue; }

        if (alreadySent.has(uid)) {
          skippedAlready++;
          results.push({ user_id: uid, outcome: "skipped_already_sent", message_key: messageKey });
          continue;
        }

        const list = (byUser.get(uid) || []).slice().sort((a, b) =>
          (Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0)) ||
          (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        const lead = list[0];
        const others = list.slice(1);
        const { subject, html, text } = buildEmail(lead, others);

        if (dryRun) {
          results.push({
            user_id: uid, to, outcome: "would_send", subject, html, text,
            finding_ids: [lead.id, ...others.slice(0, 3).map((o) => o.id)],
          });
          continue;
        }

        const status = await sendResend(RESEND_KEY, to, subject, html, text);
        // Only AFTER a successful send do we burn the idempotency key.
        await admin.from("lifecycle_email_log").insert({ user_id: uid, message_key: messageKey });
        await admin.from("lifecycle_emails").insert({
          user_id: uid,
          email_type: "morning_signal",
          metadata: {
            message_key: messageKey,
            finding_ids: [lead.id, ...others.slice(0, 3).map((o) => o.id)],
            lead_finding_id: lead.id,
            subject,
          },
        });
        sent++;
        results.push({ user_id: uid, outcome: "sent", resend_status: status, subject });
      } catch (e) {
        failed++;
        const msg = (e as Error)?.message ?? String(e);
        results.push({ user_id: uid, outcome: "failed", error: msg });
        await admin.from("ef_error_log").insert({
          function_name: "send-morning-signal",
          severity: "high",
          error_message: `MORNING_SIGNAL user_send_failed: ${msg}`.slice(0, 1000),
          user_id: uid,
          context: { message_key: messageKey, dry_run: dryRun },
        });
      }
    }

    // Success telemetry (ef_error_log is the canonical event substrate).
    await admin.from("ef_error_log").insert({
      function_name: "send-morning-signal",
      severity: "info",
      error_message: `MORNING_SIGNAL run candidates=${userIds.length} sent=${sent} skipped=${skippedAlready} failed=${failed} dry_run=${dryRun}`,
      context: { message_key: messageKey, candidates: userIds.length, sent, skipped_already: skippedAlready, failed, quiet, dry_run: dryRun },
    });

    return new Response(JSON.stringify({
      ok: true, dry_run: dryRun, message_key: messageKey,
      candidates: userIds.length, sent, skipped_already: skippedAlready, failed, results,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await admin.from("ef_error_log").insert({
      function_name: "send-morning-signal",
      severity: "critical",
      error_message: `MORNING_SIGNAL run_failed: ${msg}`.slice(0, 1000),
      context: { message_key: messageKey, dry_run: dryRun },
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});