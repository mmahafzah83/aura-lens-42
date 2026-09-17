// send-morning-signal — THE ENVELOPE
//
// Sends one email per user per day, only when The Overnight actually produced
// something. A quiet night sends nothing. Idempotency contract lives in
// lifecycle_email_log with message_key = 'morning_signal:<YYYY-MM-DD Riyadh>'.
//
// dry_run defaults to TRUE. Resend is called ZERO times in dry-run, and no
// idempotency/lifecycle rows are written.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminUserIds } from "../_shared/adminRole.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  renderEmail, heading, paragraph, quote, divider,
  INK, INK_SOFT, INK_FAINT, BODY, MONO, CANVAS, BORDER, ACCENT,
} from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FROM = "Aura <invites@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";
const BASE_CTA_URL = "https://www.aura-intel.org/dashboard?tab=overnight";
const PAUSE_URL = "https://www.aura-intel.org/dashboard?settings=notifications";
const FRESH_WINDOW_HOURS = 14;

// The opportunity card block. Behind a flag so it can be switched off without
// touching anything else this function does.
const OE_CARDS_ENABLED = (Deno.env.get("OE_CARDS_IN_EMAIL") ?? "true") !== "false";
const APP_URL = "https://www.aura-intel.org";
const AMBER = "#B4802A";

const CHAIR_LABEL: Record<string, { en: string; ar: string }> = {
  board: { en: "Board seat", ar: "مقعد مجلس" },
  mandate: { en: "Mandate", ar: "تكليف" },
  role: { en: "Role", ar: "دور" },
  room: { en: "Room", ar: "غرفة" },
  speaking: { en: "Speaking", ar: "منصة" },
  media: { en: "Media", ar: "إعلام" },
  advisory: { en: "Advisory", ar: "استشارة" },
  award: { en: "Award", ar: "جائزة" },
  learning: { en: "Learning", ar: "تعلّم" },
};
const BAND_WORD: Record<string, { en: string; ar: string }> = {
  strong: { en: "strong", ar: "قوية" },
  worth_a_look: { en: "worth a look", ar: "تستحق النظر" },
  stretch: { en: "a stretch", ar: "بعيدة" },
};
const TAP_LABEL = {
  right: { en: "That's right", ar: "صحيح" },
  not_quite: { en: "Not quite", ar: "ليس تماماً" },
  not_my_area: { en: "Not my area", ar: "ليس مجالي" },
  less_from_here: { en: "Less from this issuer", ar: "أقل من هذه الجهة" },
};

type Card = {
  id: string;
  opportunity_id: string | null;
  why_lines: Array<{ text?: string }> | null;
  gap_line: { text?: string } | null;
  quote: string | null;
  clock_text: string | null;
  fit_band: string | null;
  win_band: string | null;
  tap_token: string | null;
  oe_opportunities?: { title?: string; chair_type?: string; time_kind?: string; source_url?: string } | null;
};

function tapButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin:0 6px 6px 0;padding:0 16px;height:36px;line-height:36px;border:1px solid ${BORDER};border-radius:8px;font-family:${BODY};font-size:13px;font-weight:600;color:${INK};text-decoration:none;">${escapeHtml(label)}</a>`;
}

function bandBox(caption: string, word: string): string {
  return `<td style="padding:10px 14px;background:${CANVAS};border:1px solid ${BORDER};border-radius:8px;font-family:${BODY};font-size:13px;color:${INK_SOFT};">${escapeHtml(caption)}: <strong style="color:${INK};">${escapeHtml(word)}</strong></td>`;
}

/** The card, rendered. Returns html and the plain-text twin. */
function buildCardBlock(card: Card, lang: "en" | "ar"): { html: string; text: string } {
  const L = (k: keyof typeof TAP_LABEL) => TAP_LABEL[k][lang];

  if (!card.opportunity_id) {
    const line = lang === "ar" ? "لا شيء قوي اليوم" : "Nothing strong today";
    return {
      html: `<p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_FAINT};">${escapeHtml(line)}</p>${divider()}`,
      text: `${line}\n`,
    };
  }

  const opp = card.oe_opportunities ?? {};
  const kind = CHAIR_LABEL[String(opp.chair_type ?? "")]?.[lang] ?? String(opp.chair_type ?? "");
  const tag = opp.time_kind === "early_signal"
    ? (lang === "ar" ? "إشارة مبكرة" : "early signal")
    : (lang === "ar" ? "مفتوح الآن" : "open now");
  const why = (card.why_lines ?? []).map((w) => String(w?.text ?? "").trim()).filter(Boolean);
  const gap = String(card.gap_line?.text ?? "").trim();
  const base = `${APP_URL}/t/${card.tap_token ?? ""}`;

  const whyHtml = why.map((w) =>
    `<p style="margin:0 0 8px;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_SOFT};"><span style="color:${INK_FAINT};">&bull;</span> ${escapeHtml(w)}</p>`).join("");
  const gapHtml = gap
    ? `<p style="margin:0 0 12px;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_SOFT};"><span style="color:${AMBER};">&bull;</span> ${escapeHtml(gap)}</p>`
    : "";
  const quoteHtml = card.quote
    ? `<p style="margin:0 0 12px;font-family:${BODY};font-size:13px;line-height:1.6;color:${INK_FAINT};">&ldquo;${escapeHtml(card.quote)}&rdquo;${opp.source_url ? ` <a href="${escapeHtml(opp.source_url)}" style="color:${ACCENT};text-decoration:underline;">${lang === "ar" ? "المصدر" : "source"}</a>` : ""}</p>`
    : "";

  const html = `
    <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${escapeHtml(kind)} &middot; ${escapeHtml(tag)}</p>
    <p style="margin:0 0 8px;font-family:${BODY};font-size:19px;line-height:1.35;font-weight:700;color:${INK};">${escapeHtml(String(opp.title ?? ""))}</p>
    ${card.clock_text ? `<p style="margin:0 0 12px;font-family:${MONO};font-size:12px;line-height:1.5;color:${AMBER};">${escapeHtml(card.clock_text)}</p>` : ""}
    ${whyHtml}${gapHtml}${quoteHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>
      ${bandBox(lang === "ar" ? "تناسبك" : "Fits you", BAND_WORD[String(card.fit_band ?? "stretch")]?.[lang] ?? "")}
      <td style="width:10px;">&nbsp;</td>
      ${bandBox(lang === "ar" ? "تستطيع الفوز بها" : "You could win it", BAND_WORD[String(card.win_band ?? "stretch")]?.[lang] ?? "")}
    </tr></table>
    <p style="margin:0 0 6px;">${tapButton(`${base}?a=right`, L("right"))}${tapButton(`${base}?a=not_quite`, L("not_quite"))}${tapButton(`${base}?a=not_my_area`, L("not_my_area"))}</p>
    <p style="margin:0 0 4px;font-family:${BODY};font-size:12px;line-height:1.5;"><a href="${base}?a=less_from_here" style="color:${INK_FAINT};text-decoration:underline;">${escapeHtml(L("less_from_here"))}</a></p>
    ${divider()}`;

  const text = [
    `${kind} · ${tag}`,
    String(opp.title ?? ""),
    card.clock_text ?? "",
    ...why.map((w) => `- ${w}`),
    gap ? `- ${gap}` : "",
    card.quote ? `"${card.quote}"${opp.source_url ? ` (${opp.source_url})` : ""}` : "",
    `${lang === "ar" ? "تناسبك" : "Fits you"}: ${BAND_WORD[String(card.fit_band ?? "stretch")]?.[lang] ?? ""}`,
    `${lang === "ar" ? "تستطيع الفوز بها" : "You could win it"}: ${BAND_WORD[String(card.win_band ?? "stretch")]?.[lang] ?? ""}`,
    `${L("right")}: ${base}?a=right`,
    `${L("not_quite")}: ${base}?a=not_quite`,
    `${L("not_my_area")}: ${base}?a=not_my_area`,
    `${L("less_from_here")}: ${base}?a=less_from_here`,
  ].filter(Boolean).join("\n");

  return { html, text };
}

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

/**
 * Local-time parts for a member's own timezone. Null/invalid falls back to Riyadh,
 * so a member who never set one keeps the behaviour they have today.
 */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function localParts(tz: string | null | undefined, at: Date): { weekday: number; hour: number; dateKey: string } {
  const zone = tz && String(tz).trim() ? String(tz).trim() : "Asia/Riyadh";
  const build = (z: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: z, weekday: "short", hour: "2-digit", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(at);
  let parts: Intl.DateTimeFormatPart[];
  try { parts = build(zone); } catch { parts = build("Asia/Riyadh"); }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hourRaw = get("hour");
  return {
    weekday: WEEKDAY_INDEX[get("weekday").slice(0, 3)] ?? 0,
    hour: hourRaw === "24" ? 0 : parseInt(hourRaw, 10) || 0,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
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
  const theme = firstTheme(f);
  if (theme) parts.push(theme);
  return parts;
}

function buildEmail(
  lead: Finding | null,
  others: Finding[],
  card?: { html: string; text: string; subject?: string } | null,
) {
  const subject = lead ? buildSubject(lead) : (card?.subject || "Aura has one opportunity for you today");
  const kicker = lead ? `THE OVERNIGHT · ${riyadhHHMM(lead.created_at)}` : "THE OVERNIGHT";
  const headline = lead ? ((lead.title || "").trim() || (lead.url || "").trim()) : "";
  const prov = lead ? provenanceParts(lead) : [];
  const extras = others.slice(0, 3);
  // The button must land on the thing we found, not a generic tab.
  const leadUrl = lead
    ? `https://www.aura-intel.org/dashboard?desk=1&finding=${lead.id}`
    : BASE_CTA_URL;

  const implicationHtml = lead && (lead.implication || "").trim()
    ? quote(escapeHtml(lead.implication!.trim()))
    : "";

  const provHtml = prov.length
    ? `<p style="margin:0 0 6px;font-family:${MONO};font-size:11px;line-height:1.6;letter-spacing:.08em;color:${INK_FAINT};">${escapeHtml(prov.join(" · "))}</p>`
    : "";

  const extrasHtml = extras.length
    ? divider() +
      extras.map((e) =>
        `<p style="margin:0 0 8px;font-family:${BODY};font-size:13px;line-height:1.5;">` +
        `<a href="${escapeHtml(e.url || BASE_CTA_URL)}" style="color:${INK_SOFT};text-decoration:underline;">${escapeHtml((e.title || e.url || "").trim())}</a></p>`
      ).join("")
    : "";

  const html = renderEmail({
    preheader: headline || (card?.subject ?? subject),
    prefsHref: PAUSE_URL,
    prefsLabel: "Pause these emails",
    cta: lead ? { href: leadUrl, label: "Open it in Aura" } : undefined,
    body: `
      <p style="margin:0 0 14px;font-family:${MONO};font-size:11px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${escapeHtml(kicker)}</p>
      ${card?.html ?? ""}
      ${lead ? heading(escapeHtml(headline)) : ""}
      ${implicationHtml}
      ${provHtml}
      ${extrasHtml}
      ${divider()}
      ${paragraph("Sent because last night produced something. Quiet nights send nothing.")}
    `,
  });

  const textLines = [kicker, ""];
  if (card?.text) textLines.push(card.text, "");
  if (lead) {
    textLines.push(headline);
    if ((lead.implication || "").trim()) { textLines.push("", lead.implication!.trim()); }
    if (prov.length) { textLines.push("", prov.join(" · ")); }
    textLines.push("", `Open it in Aura: ${leadUrl}`);
  }
  if (extras.length) {
    textLines.push("", "Also last night:");
    for (const e of extras) textLines.push(`- ${(e.title || e.url || "").trim()}${e.url ? ` (${e.url})` : ""}`);
  }
  textLines.push("", "Sent because last night produced something. Quiet nights send nothing.", `Pause these emails: ${PAUSE_URL}`);

  return { subject, html, text: textLines.join("\n") };
}

async function sendResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  userId: string,
  messageKey: string,
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text,
      // Resend tag values allow only ASCII letters, numbers, underscore and dash.
      tags: [
        { name: "email_type", value: "morning_signal" },
        { name: "user_id", value: userId },
        { name: "message_key", value: messageKey.replace(/[^a-zA-Z0-9_-]/g, "_") },
      ],
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`resend ${res.status}: ${bodyText.slice(0, 400)}`);
  let resendId: string | null = null;
  try { resendId = (JSON.parse(bodyText) as { id?: string })?.id ?? null; } catch { /* non-JSON body */ }
  return { status: res.status, resendId };
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
  const adminIds = new Set(await adminUserIds(admin));

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
      // pending = found, not yet acted on. kept = user accepted it. Both are emailable. duplicate, below_bar and error are not, and must never be.
      .in("status", ["pending", "kept"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    if (onlyUserId) q = q.eq("user_id", onlyUserId);
    const { data: findings, error: fErr } = await q;
    if (fErr) throw fErr;

    const byUser = new Map<string, Finding[]>();
    for (const f of (findings || []) as Finding[]) {
      if (!f.user_id) continue;
      // Founder is excluded from live sends but allowed as a dry-run target.
      if (adminIds.has(f.user_id) && !(dryRun && onlyUserId === f.user_id)) continue;
      if (!((f.title || "").trim() || (f.url || "").trim())) continue;
      const arr = byUser.get(f.user_id) || [];
      arr.push(f);
      byUser.set(f.user_id, arr);
    }

    // A member with an unsent card today is a candidate even if the night was
    // quiet for findings. The card is the reason to write.
    const candidateIds = new Set(byUser.keys());
    if (OE_CARDS_ENABLED) {
      const from = new Date(now.getTime() - 36 * 3600 * 1000).toISOString().slice(0, 10);
      let cq = admin.from("oe_cards").select("user_id").is("sent_at", null).gte("card_date", from);
      if (onlyUserId) cq = cq.eq("user_id", onlyUserId);
      const { data: cardUsers } = await cq;
      for (const c of (cardUsers || []) as Array<{ user_id: string }>) {
        if (!c.user_id) continue;
        if (adminIds.has(c.user_id) && !(dryRun && onlyUserId === c.user_id)) continue;
        candidateIds.add(c.user_id);
      }
    }

    const userIds = Array.from(candidateIds);
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

    // Opt-out gate: overnight_reading_enabled defaults to true; only an explicit
    // false silences a member. No lifecycle rows are written for those skipped.
    // Timezone rides along: 07:00 must mean 07:00 where the member actually is.
    const optedOut = new Set<string>();
    const tzByUser = new Map<string, string | null>();
    const langByUser = new Map<string, "en" | "ar">();
    if (userIds.length) {
      const { data: prefRows } = await admin
        .from("diagnostic_profiles")
        .select("user_id, notification_prefs, timezone, content_language")
        .in("user_id", userIds);
      for (const r of (prefRows || []) as Array<{ user_id: string; notification_prefs: Record<string, unknown> | null; timezone: string | null; content_language: string | null }>) {
        if (r?.notification_prefs?.overnight_reading_enabled === false) optedOut.add(r.user_id);
        tzByUser.set(r.user_id, r.timezone ?? null);
        langByUser.set(r.user_id, r.content_language === "ar" ? "ar" : "en");
      }
    }

    for (const uid of userIds) {
      try {
        if (optedOut.has(uid)) { results.push({ user_id: uid, outcome: "skipped_opted_out" }); continue; }

        const to = emails.get(uid);
        if (!to) { results.push({ user_id: uid, outcome: "skipped_no_email_or_test" }); continue; }

        // 07:00 in THIS member's timezone, and an idempotency key on THEIR local date.
        const lp = localParts(tzByUser.get(uid) ?? null, now);
        if (lp.hour !== 7) { results.push({ user_id: uid, outcome: "skipped_off_hour" }); continue; }
        const userKey = `morning_signal:${lp.dateKey}`;

        const { data: alreadyRow } = await admin
          .from("lifecycle_email_log")
          .select("user_id")
          .eq("message_key", userKey)
          .eq("user_id", uid)
          .maybeSingle();
        if (alreadyRow) {
          skippedAlready++;
          results.push({ user_id: uid, outcome: "skipped_already_sent", message_key: userKey });
          continue;
        }

        const list = (byUser.get(uid) || []).slice().sort((a, b) =>
          (Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0)) ||
          (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        const lead = list[0] ?? null;
        const others = list.slice(1);

        // Today's card, in this member's own day.
        let cardRow: Card | null = null;
        if (OE_CARDS_ENABLED) {
          const { data: c } = await admin
            .from("oe_cards")
            .select("id, opportunity_id, why_lines, gap_line, quote, clock_text, fit_band, win_band, tap_token, oe_opportunities(title, chair_type, time_kind, source_url)")
            .eq("user_id", uid)
            .eq("card_date", lp.dateKey)
            .is("sent_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          cardRow = (c as unknown as Card) ?? null;
        }

        if (!lead && !cardRow) { results.push({ user_id: uid, outcome: "skipped_quiet" }); continue; }

        const lang = langByUser.get(uid) ?? "en";
        const cardBlock = cardRow ? buildCardBlock(cardRow, lang) : null;
        const { subject, html, text } = buildEmail(lead, others, cardBlock);

        if (dryRun) {
          results.push({
            user_id: uid, to, outcome: "would_send", subject, html, text,
            finding_ids: lead ? [lead.id, ...others.slice(0, 3).map((o) => o.id)] : [],
            card_id: cardRow?.id ?? null,
          });
          continue;
        }

        const { status, resendId } = await sendResend(RESEND_KEY, to, subject, html, text, uid, userKey);
        // Only AFTER a successful send do we burn the idempotency key.
        await admin.from("lifecycle_email_log").insert({ user_id: uid, message_key: userKey });
        await admin.from("lifecycle_emails").insert({
          user_id: uid,
          email_type: "morning_signal",
          metadata: {
            message_key: userKey,
            finding_ids: lead ? [lead.id, ...others.slice(0, 3).map((o) => o.id)] : [],
            lead_finding_id: lead?.id ?? null,
            card_id: cardRow?.id ?? null,
            subject,
            resend_id: resendId,
          },
        });
        if (cardRow) {
          await admin.from("oe_cards").update({ sent_at: new Date().toISOString() }).eq("id", cardRow.id);
          await admin.from("notification_events").insert({
            user_id: uid,
            type: "opportunity_card",
            channel: "email",
            title: "Opportunity card sent",
            body: String(cardRow.oe_opportunities?.title ?? cardRow.clock_text ?? ""),
            read: true,
            read_at: new Date().toISOString(),
            metadata: { card_id: cardRow.id, opportunity_id: cardRow.opportunity_id, message_key: userKey },
          });
        }
        sent++;
        // The send ledger every dashboard reads. Bookkeeping must never be able
        // to break a delivery: if this write fails we log it and carry on.
        try {
          const { error: ledgerError } = await admin.from("notification_events").insert({
            user_id: uid,
            type: "morning_signal",
            channel: "email",
            title: "Morning signal sent",
            body: subject,
            read: true,
            read_at: new Date().toISOString(),
            metadata: {
              message_key: userKey,
              lead_finding_id: lead?.id ?? null,
              finding_ids: lead ? [lead.id, ...others.slice(0, 3).map((o) => o.id)] : [],
              resend_id: resendId,
            },
          });
          if (ledgerError) throw new Error(ledgerError.message);
        } catch (ledgerErr) {
          console.error("MORNING_SIGNAL ledger_write_failed", ledgerErr);
          await admin.from("ef_error_log").insert({
            function_name: "send-morning-signal",
            severity: "low",
            error_message: `MORNING_SIGNAL ledger_write_failed: ${(ledgerErr as Error)?.message ?? String(ledgerErr)}`.slice(0, 1000),
            user_id: uid,
            context: { message_key: userKey },
          });
        }
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