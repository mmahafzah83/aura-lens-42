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
function ctaFor(draftId: string, src: "content_items" | "linkedin_posts"): string {
  return `https://www.aura-intel.org/dashboard?tab=authority&draft=${encodeURIComponent(draftId)}&src=${src}`;
}

type DraftRow = {
  draft_id: string;
  user_id: string;
  created_at: string;
  body: string | null;
  title: string | null;
  signal_id: string | null;
  src: "content_items" | "linkedin_posts";
  source_metadata: Record<string, unknown> | null;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Topic values are dropped into the middle of a sentence, so they must not
// carry their own terminal punctuation. Signal titles are frequently full
// sentences and would otherwise produce `standards..`.
function stripTrailingPunct(s: string): string {
  return (s || "").replace(/[\s.,;:]+$/g, "").trim();
}

// Mirror of cleanBody() in src/components/Brief.tsx — strips generator artifacts
// (leading POST / بوست / منشور linkedin header lines and markdown asterisks)
// so the quoted excerpt reads as a real sentence.
function cleanBody(raw: string): string {
  return (raw || "")
    .replace(/^[ \t]*(post|بوست|منشور\s+linkedin)[ \t]*$/gim, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/\*\*/g, "")
    .replace(/^\s*\n+/, "");
}

function excerptFor(raw: string): string {
  return cleanBody(raw).replace(/\s+/g, " ").trim();
}

function deriveShortTopic(opts: {
  themeTags: string[] | null;
  signalTitle: string | null;
  fallbackTitle: string | null;
}): string {
  const { themeTags, signalTitle, fallbackTitle } = opts;
  if (Array.isArray(themeTags) && themeTags.length > 0) {
    const t = (themeTags[0] || "").trim();
    if (t && t.length <= 40) return t;
  }
  const src = (signalTitle && signalTitle.trim()) || (fallbackTitle && fallbackTitle.trim()) || "";
  if (!src) return "";
  const words = src.split(/\s+/).slice(0, 6).join(" ");
  return words.replace(/[.,;:!?—–-]+$/g, "").trim();
}

function clampForSubject(shortTopic: string): string {
  // Subject template: `Your post on ${shortTopic} is ready` = 22 chars of chrome.
  // Keep total under 60 → shortTopic max 38.
  const MAX = 38;
  if (shortTopic.length <= MAX) return shortTopic;
  return shortTopic.slice(0, MAX - 1).replace(/[\s,;:.\-–—]+$/g, "") + "…";
}

function whenPhrase(newestFragmentIso: string | null): string {
  if (!newestFragmentIso) return "";
  const ageDays = (Date.now() - new Date(newestFragmentIso).getTime()) / 86400000;
  if (ageDays < 4) return "this week";
  if (ageDays >= 4 && ageDays <= 10) return "last week";
  return "";
}

function buildEmail(opts: {
  firstName: string | null;
  shortTopic: string;
  fullTopic: string;
  excerpt: string;
  nReadings: number | null;
  nSources: number | null;
  newestFragmentIso: string | null;
  velocityStatus: string | null;
  ctaUrl: string;
}): { subject: string; preheader: string; html: string } {
  const {
    firstName, shortTopic, fullTopic, excerpt,
    nReadings, nSources, newestFragmentIso, velocityStatus, ctaUrl,
  } = opts;

  const shortForSubject = clampForSubject(stripTrailingPunct(shortTopic || fullTopic));
  const subject = `Your post on ${shortForSubject} is ready`;

  const haveCounts =
    typeof nReadings === "number" && nReadings > 0 &&
    typeof nSources === "number" && nSources > 0;

  const preheader = haveCounts
    ? `${nReadings} readings you saved. One post. Four minutes.`
    : `One post. Four minutes.`;

  const namePrefix = firstName ? `${escapeHtml(firstName)} — you` : "You";
  const when = whenPhrase(newestFragmentIso);
  const whenSuffix = when ? ` ${when}` : "";
  // Body sentence needs a NOUN PHRASE after "on" — use the theme tag
  // (shortTopic), never the full signal title. fullTopic is retained only
  // as a subject-line fallback above; it is intentionally not rendered
  // into any body sentence.
  const shortTopicClean = stripTrailingPunct(shortTopic || fullTopic);
  const shortTopicEsc = escapeHtml(shortTopicClean);

  // One idea per line. Each <p> stands on its own so the eye lands on a beat.
  const line1 = haveCounts
    ? `${namePrefix} saved ${nReadings} readings on ${shortTopicEsc}${whenSuffix}.`
    : `${namePrefix} kept a finding on ${shortTopicEsc}.`;
  const line2 = `Nobody asked you to. That was your judgment, not an algorithm's.`;
  const line3 = `Aura put that judgment into a post, written the way you write.`;
  const line4 = `It isn't finished until you've argued with it.`;
  const line5 = `Cut what isn't you. Sharpen what is.`;
  const line6 = `Then it's yours to publish — or not.`;

  const excerptClean = escapeHtml(excerpt.slice(0, 140)) + (excerpt.length > 140 ? "…" : "");
  const quote =
    `<blockquote dir="auto" style="margin:18px 0;padding:4px 0 4px 18px;border-left:2px solid #D6A748;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#1B1712;">${excerptClean}</blockquote>`;

  const closer = `Four minutes. Nothing goes out without you.`;

  const bodyLine = (t: string, mb = 14) =>
    `<p style="font-size:16px;line-height:1.65;margin:0 0 ${mb}px;color:${INK_BODY};">${t}</p>`;

  let ps = "";
  if (velocityStatus === "accelerating") {
    ps = `<p style="font-size:13px;line-height:1.55;margin:22px 0 0;color:#8A8073;">P.S. — ${escapeHtml(shortTopicClean)} is moving right now. The people reading about it this week are the ones who will remember who said it first.</p>`;
  }

  const body = `
    ${headingHtml("You already made this argument.")}
    ${bodyLine(line1)}
    ${bodyLine(line2)}
    ${bodyLine(line3)}
    ${quote}
    ${bodyLine(line4, 8)}
    ${bodyLine(line5, 8)}
    ${bodyLine(line6, 20)}
    <p style="margin:0 0 8px;">${button(ctaUrl, "Open your draft")}</p>
    <p style="font-size:12px;line-height:1.5;margin:0;color:#8A8073;">${closer}</p>
    ${ps}
  `;

  return { subject, preheader, html: emailShell({ preheader, body }) };
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
  let onlyUserId: string | null = null;
  let onlyUserIdRaw: unknown = undefined;
  let onlyDraftId: string | null = null;
  let onlyDraftIdRaw: unknown = undefined;
  let onlyDraftSrc: "content_items" | "linkedin_posts" | null = null;
  try {
    const raw = await req.text();
    if (raw && raw.trim().length > 0) {
      const parsed = JSON.parse(raw);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "dry_run")) {
        dryRun = parsed.dry_run !== false;
      }
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "only_user_id")) {
        onlyUserIdRaw = parsed.only_user_id;
      }
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "only_draft_id")) {
        onlyDraftIdRaw = parsed.only_draft_id;
      }
      if (parsed && typeof parsed.src === "string") {
        if (parsed.src === "content_items" || parsed.src === "linkedin_posts") {
          onlyDraftSrc = parsed.src;
        }
      }
    }
  } catch { /* ignore body parse errors — stay in dry-run */ }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (onlyUserIdRaw !== undefined) {
    if (typeof onlyUserIdRaw !== "string" || !UUID_RE.test(onlyUserIdRaw)) {
      await admin.from("ef_error_log").insert({
        function_name: "draft-ready-email",
        severity: "high",
        error_message: `DRAFT_READY_EMAIL invalid_only_user_id value=${String(onlyUserIdRaw).slice(0, 80)}`,
        context: { only_user_id: String(onlyUserIdRaw).slice(0, 200) },
      });
      return new Response(JSON.stringify({ error: "invalid only_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    onlyUserId = onlyUserIdRaw;
  }

  // only_draft_id: same strict validation as only_user_id. A typo must NEVER
  // fall through to selecting every user's drafts.
  if (onlyDraftIdRaw !== undefined) {
    if (typeof onlyDraftIdRaw !== "string" || !UUID_RE.test(onlyDraftIdRaw)) {
      await admin.from("ef_error_log").insert({
        function_name: "draft-ready-email",
        severity: "high",
        error_message: `DRAFT_READY_EMAIL invalid_only_draft_id value=${String(onlyDraftIdRaw).slice(0, 80)}`,
        context: { only_draft_id: String(onlyDraftIdRaw).slice(0, 200) },
      });
      return new Response(JSON.stringify({ error: "invalid only_draft_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    onlyDraftId = onlyDraftIdRaw;
  }

  const results: Array<{
    user_id: string;
    draft_id: string;
    outcome: "sent" | "would_send" | "skipped_already" | "failed";
    resend_status?: number;
    error?: string;
    subject?: string;
    preheader?: string;
    html?: string;
  }> = [];

  let candidates = 0;
  let sent = 0;
  let skippedAlready = 0;
  let failed = 0;

  try {
    // Pick each user's single newest draft older than 12h — UNLESS only_draft_id
    // targets a specific rehearsal draft, in which case we select that row
    // directly and skip the age gate.
    const cutoffIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    let ciDrafts: any[] | null = null;
    let lpDrafts: any[] | null = null;

    if (onlyDraftId) {
      // Rehearsal path: fetch exactly the targeted draft. Honour `src` hint;
      // otherwise probe content_items first, then linkedin_posts.
      const probeOrder: Array<"content_items" | "linkedin_posts"> = onlyDraftSrc
        ? [onlyDraftSrc]
        : ["content_items", "linkedin_posts"];
      for (const src of probeOrder) {
        if (src === "content_items") {
          let q = admin
            .from("content_items")
            .select("id, user_id, created_at, body, title, signal_id, generation_params")
            .eq("id", onlyDraftId)
            .eq("status", "draft");
          if (onlyUserId) q = q.eq("user_id", onlyUserId);
          const { data, error } = await q.limit(1);
          if (error) throw error;
          if (data && data.length > 0) { ciDrafts = data; break; }
        } else {
          let q = admin
            .from("linkedin_posts")
            .select("id, user_id, created_at, post_text, title, source_signal_id, source_metadata")
            .eq("id", onlyDraftId)
            .eq("tracking_status", "draft")
            .is("published_at", null);
          if (onlyUserId) q = q.eq("user_id", onlyUserId);
          const { data, error } = await q.limit(1);
          if (error) throw error;
          if (data && data.length > 0) { lpDrafts = data; break; }
        }
      }
      // If neither source matched, both remain null → candidates=0, logged in
      // the summary row. Never silently fall back to the newest draft.
    } else {
      let ciQuery = admin
        .from("content_items")
        .select("id, user_id, created_at, body, title, signal_id, generation_params")
        .eq("status", "draft")
        .lt("created_at", cutoffIso);
      if (onlyUserId) ciQuery = ciQuery.eq("user_id", onlyUserId);
      const { data, error } = await ciQuery;
      if (error) throw error;
      ciDrafts = data;

      let lpQuery = admin
        .from("linkedin_posts")
        .select("id, user_id, created_at, post_text, title, source_signal_id, source_metadata")
        .eq("tracking_status", "draft")
        .is("published_at", null)
        .lt("created_at", cutoffIso);
      if (onlyUserId) lpQuery = lpQuery.eq("user_id", onlyUserId);
      const { data: lp, error: lpErr } = await lpQuery;
      if (lpErr) throw lpErr;
      lpDrafts = lp;
    }

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
        source_metadata: null,
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
        source_metadata: (r.source_metadata as Record<string, unknown> | null) ?? null,
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
      let fullTopic = "";
      let shortTopic = "";
      let themeTags: string[] | null = null;
      let signalTitle: string | null = null;
      let velocityStatus: string | null = null;
      let nReadings: number | null = null;
      let nSources: number | null = null;
      let newestFragmentIso: string | null = null;

      if (pick.signal_id) {
        const { data: sig } = await admin
          .from("strategic_signals")
          .select("signal_title, supporting_evidence_ids, theme_tags, velocity_status")
          .eq("id", pick.signal_id)
          .maybeSingle();
        signalTitle = (sig?.signal_title as string | null) ?? null;
        themeTags = (sig?.theme_tags as string[] | null) ?? null;
        velocityStatus = (sig?.velocity_status as string | null) ?? null;
        const evIds = (sig?.supporting_evidence_ids as string[] | null) || [];
        if (evIds.length > 0) {
          const { data: frags } = await admin
            .from("evidence_fragments")
            .select("source_registry_id, created_at")
            .in("id", evIds);
          const distinctSources = new Set(
            (frags || [])
              .map((f) => (f.source_registry_id as string | null))
              .filter((v): v is string => !!v),
          );
          nReadings = evIds.length;
          nSources = distinctSources.size;
          const dates = (frags || [])
            .map((f) => (f.created_at as string | null))
            .filter((v): v is string => !!v)
            .sort();
          if (dates.length > 0) newestFragmentIso = dates[dates.length - 1];
        }
        if (signalTitle) fullTopic = signalTitle;
      }

      // Ghost-draft fallback: use provenance from linkedin_posts.source_metadata.
      let ghostShortTopic: string | null = null;
      if (!fullTopic && pick.src === "linkedin_posts" && pick.source_metadata) {
        const sm = pick.source_metadata;
        if (sm["ghost_draft"] === true) {
          const fs = typeof sm["finding_source"] === "string" ? sm["finding_source"] as string : "";
          // finding_implication is a paragraph, not a topic — never splice it
          // into the topic sentence.
          if (fs) {
            fullTopic = fs.trim();
            ghostShortTopic = fs.trim();
          }
        }
      }

      if (!fullTopic) fullTopic = (pick.title || "").trim();
      shortTopic = ghostShortTopic
        || deriveShortTopic({ themeTags, signalTitle, fallbackTitle: pick.title });
      if (!shortTopic) shortTopic = fullTopic;
      if (!fullTopic) fullTopic = shortTopic || "a finding you kept";
      if (!shortTopic) shortTopic = "a finding you kept";

      // First name for greeting.
      const { data: prof } = await admin
        .from("diagnostic_profiles")
        .select("first_name")
        .eq("user_id", pick.user_id)
        .maybeSingle();
      const firstName = (prof?.first_name as string | null)?.trim() || null;

      const excerpt = excerptFor(pick.body || "");
      const { subject, preheader, html } = buildEmail({
        firstName,
        shortTopic,
        fullTopic,
        excerpt,
        nReadings,
        nSources,
        newestFragmentIso,
        velocityStatus,
        ctaUrl: ctaFor(pick.draft_id, pick.src),
      });


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
          subject,
          preheader,
          html,
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
    await admin.from("ef_event_log").insert({
      function_name: "draft-ready-email",
      severity: "info",
      error_message: `DRAFT_READY_EMAIL dry_run=${dryRun} only_user=${onlyUserId ?? "none"} only_draft=${onlyDraftId ?? "none"} candidates=${candidates} sent=${sent} skipped_already=${skippedAlready} failed=${failed}`,
      context: { dry_run: dryRun, only_user_id: onlyUserId, only_draft_id: onlyDraftId, candidates, sent, skipped_already: skippedAlready, failed },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        only_user_id: onlyUserId,
        only_draft_id: onlyDraftId,
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