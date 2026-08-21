/**
 * Does every Edge Function still start?
 *
 * A named import of an export that does not exist is a LINK-TIME error in
 * Deno: the isolate never boots, the gateway answers 503 with no CORS headers,
 * and the member simply sees "failed to send a request". Nothing in the app
 * notices, because no code inside the function ever runs. Six functions were
 * dark for four weeks that way.
 *
 * So once a day we knock on every door. An OPTIONS request that gets ANY HTTP
 * response proves the isolate booted. No response, or a 503, is the finding.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cron_secret, x-cron-secret",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Every function directory under supabase/functions, _shared excluded. */
const ALL_FUNCTIONS: string[] = [
  "account-brief",
  "activate-framework",
  "admin-active-users",
  "admin-console",
  "admin-delete-user",
  "admin-digest",
  "admin-list-documents",
  "admin-notify",
  "admin-regenerate-report",
  "admin-send-test-email",
  "admin-set-document-type",
  "analyze-image",
  "analyze-linkedin-profile",
  "analyze-potential",
  "api-health-sentinel",
  "ask-aura",
  "audit-interpretation",
  "aura-card-emails",
  "aura-health-audit",
  "aura-ops-report",
  "auras-read",
  "auth-resend-confirmation",
  "auth-signup",
  "backfill-brand-pillars",
  "backfill-document-evidence",
  "backfill-embeddings",
  "backfill-fingerprints",
  "backfill-theme-tags",
  "backfill-unprocessed-entries",
  "brand-assessment",
  "browser-capture",
  "calculate-aura-score",
  "capture-report-snapshot",
  "chat-aura",
  "check-invite-token",
  "check-lifecycle-triggers",
  "classify-posts",
  "cleanup-posts",
  "colleague-invite",
  "completion-invariants-check",
  "compute-imprint",
  "contact-message",
  "cv-crosscheck",
  "daily-briefing",
  "deduplicate-entries",
  "delete-account",
  "delete-source",
  "detect-card-style",
  "detect-market-gaps",
  "detect-signals-v2",
  "discover-linkedin-posts",
  "draft-owner-check",
  "draft-post",
  "draft-profile-copy",
  "draft-ready-email",
  "ef-boot-check",
  "evaluate-content-quality",
  "export-my-data",
  "extract-evidence",
  "extract-evidence-slice",
  "fetch-industry-trends",
  "founder-daily-brief",
  "generate-action-output",
  "generate-authority-content",
  "generate-brand-positioning",
  "generate-branded-post",
  "generate-carousel-v2",
  "generate-deck",
  "generate-edition",
  "generate-framework-diagram",
  "generate-identity-intelligence",
  "generate-impact-narrative",
  "generate-market-mirror",
  "generate-onepager",
  "generate-schematic-spec",
  "generate-silence-alarm",
  "ghost-draft-writer",
  "home-address",
  "import-linkedin-export",
  "ingest-capture",
  "ingest-document",
  "ingest-source-event",
  "integrate-facets",
  "job-worker-voice-distill",
  "knowledge-intelligence",
  "lifecycle-emails",
  "linkedin-claim",
  "linkedin-expert-advisor",
  "linkedin-fetch-posts",
  "linkedin-fetch-profile",
  "linkedin-identity-backfill",
  "linkedin-metrics-sync",
  "linkedin-oauth",
  "linkedin-oauth-callback",
  "linkedin-post-metrics-sync",
  "linkedin-publish",
  "linkedin-share-read",
  "linkedin-sync",
  "linkedin-token-refresh",
  "log-client-error",
  "mark-user-active",
  "market-intelligence",
  "mcp",
  "mirror-read",
  "night-agent-hunt",
  "onboarding-find-article",
  "onboarding-linkedin-prefill",
  "onboarding-proposals",
  "onboarding-read-link",
  "open-document",
  "prepare-weekly-drafts",
  "publish-invariants-check",
  "qa-account",
  "qa-ai-evaluate",
  "qa-sentinel",
  "reap-stuck-documents",
  "reap-stuck-jobs",
  "reap-stuck-publishes",
  "reap-unprocessed-captures",
  "reap-unsignalled-sources",
  "record-lineage",
  "refresh-voice-profile",
  "regenerate-schematic",
  "report-invariants-check",
  "resend-webhook",
  "run-qa-audit",
  "run-qa-walkthrough",
  "send-account-notification",
  "send-decline-email",
  "send-invite",
  "send-lifecycle-email",
  "send-mirror-read",
  "send-morning-signal",
  "send-password-reset",
  "send-read-email",
  "send-resume-email",
  "send-weekly-brief",
  "signal-decay-engine",
  "signature-suggest",
  "sovereign-reading-list",
  "strategic-advisor",
  "strategic-briefing",
  "strategic-critique",
  "strategic-nudge",
  "submit-waitlist",
  "summarize-link",
  "sync-own-posts",
  "test-linkedin-scrape",
  "transcribe-voice",
  "trend-why-matters",
  "update-user-password",
  "voice-classify-posts",
  "voice-compute-outcomes",
  "voice-compute-traits",
  "voice-distill",
  "voice-learn-from-outcomes",
  "voice-profile-cleanup",
  "voice-sample",
  "voice-suggest-rules",
  "wait-estimate",
  "weekly-influence-brief",
  "weekly-progress-summary",
];

const TIMEOUT_MS = 5000;
const CONCURRENCY = 6;

interface Probe { name: string; status: number | null; booted: boolean }

async function probe(base: string, apikey: string, name: string): Promise<Probe> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: { apikey, Authorization: `Bearer ${apikey}` },
      signal: ctrl.signal,
    });
    // A body left unread leaks the connection in Deno.
    await res.text().catch(() => "");
    return { name, status: res.status, booted: res.status !== 503 };
  } catch (_e) {
    return { name, status: null, booted: false };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // The Vault key is lowercase `cron_secret`. A 401 here is nearly always case.
  const secret = Deno.env.get("cron_secret") ?? Deno.env.get("CRON_SECRET");
  const offered = req.headers.get("cron_secret") ?? req.headers.get("x-cron-secret");
  if (secret && offered !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const results: Probe[] = [];
  for (let i = 0; i < ALL_FUNCTIONS.length; i += CONCURRENCY) {
    const batch = ALL_FUNCTIONS.slice(i, i + CONCURRENCY);
    results.push(...await Promise.all(batch.map((n) => probe(SUPABASE_URL, SERVICE_KEY, n))));
  }

  const dead = results.filter((r) => !r.booted);

  for (const d of dead) {
    const code = `ef_boot_dead:${d.name}`;
    const detail = `${d.name} cannot start up — it returned ${
      d.status === null ? "no response at all" : `HTTP ${d.status}`
    }. Anyone who reaches the screen that calls it sees an error.`;
    // One open finding per function; today's run only refreshes it.
    const { data: open } = await db
      .from("health_findings")
      .select("id")
      .eq("code", code)
      .is("resolved_at", null)
      .maybeSingle();
    if (open?.id) {
      await db.from("health_findings")
        .update({ last_seen: new Date().toISOString(), detail, severity: "critical" })
        .eq("id", open.id);
    } else {
      await db.from("health_findings").insert({ code, severity: "critical", detail });
    }
  }

  // Anything that boots again closes its own finding.
  const alive = results.filter((r) => r.booted).map((r) => `ef_boot_dead:${r.name}`);
  if (alive.length) {
    await db.from("health_findings")
      .update({ resolved_at: new Date().toISOString() })
      .in("code", alive)
      .is("resolved_at", null);
  }

  const summary = `EF_BOOT_CHECK checked=${results.length} booted=${
    results.length - dead.length
  } dead=${dead.length}`;
  await db.from("ef_error_log").insert({
    function_name: "ef-boot-check",
    severity: dead.length > 0 ? "high" : "info",
    error_message: summary,
    context: { dead: dead.map((d) => ({ name: d.name, status: d.status })) },
  });

  console.log(`[ef-boot-check] ${summary}`);
  return json({ ok: true, checked: results.length, dead: dead.map((d) => d.name) });
});
