// Sleeping Agent Phase 5 — ghost draft writer.
// The night AFTER a user keeps an overnight finding, draft ONE LinkedIn post
// in their voice by reusing generate-authority-content, and save it as a
// linkedin_posts draft. Never publishes. Fail-silent per user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { withObserve } from "../_shared/observe.ts";
import { logError } from "../_shared/logError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const STALENESS_MS = 72 * 60 * 60 * 1000; // 72h — skip stale kept findings

Deno.serve(withObserve("ghost-draft-writer", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Vault stores this as lowercase `cron_secret`; also accept uppercase env fallback.
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isServiceRole = !!bearer && bearer === SERVICE_KEY;

  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Discover eligible users: those with at least one 'kept' finding that has
  // an entry_id, created in the last 72h, with no ghost draft yet.
  const staleCutoffIso = new Date(Date.now() - STALENESS_MS).toISOString();
  const { data: keptRows, error: keptErr } = await admin
    .from("agent_findings")
    .select("id, user_id, entry_id, title, url, source, implication, created_at")
    .eq("status", "kept")
    .not("entry_id", "is", null)
    .gte("created_at", staleCutoffIso)
    .order("created_at", { ascending: false })
    .limit(500);

  if (keptErr) {
    await logError("ghost-draft-writer", keptErr, { severity: "high", context: { step: "load_kept" } });
    return new Response(JSON.stringify({ error: "load_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Newest kept finding per user; enforces the 1-draft-per-user-per-run cap.
  const byUser = new Map<string, any>();
  for (const row of (keptRows || [])) {
    if (!byUser.has((row as any).user_id)) byUser.set((row as any).user_id, row);
  }

  const summary = {
    considered: byUser.size,
    drafted: 0,
    skipped_existing: 0,
    skipped_no_entry: 0,
    error: 0,
  };

  for (const [userId, finding] of byUser.entries()) {
    try {
      // Already drafted for this finding? Skip.
      const { data: existing } = await admin
        .from("linkedin_posts")
        .select("id")
        .eq("user_id", userId)
        .eq("source_metadata->>ghost_draft_finding_id", finding.id)
        .limit(1);
      if (existing && existing.length > 0) {
        summary.skipped_existing++;
        continue;
      }

      // Load the entry so we can build topic + context.
      const { data: entry } = await admin
        .from("entries")
        .select("id, content, title, summary")
        .eq("id", finding.entry_id)
        .maybeSingle();
      if (!entry) { summary.skipped_no_entry++; continue; }

      // Language: read from diagnostic_profiles (content_language), default 'en'.
      const { data: profile } = await admin
        .from("diagnostic_profiles")
        .select("content_language")
        .eq("user_id", userId)
        .maybeSingle();
      const language = ((profile as any)?.content_language === "ar") ? "ar" : "en";

      const topic = String(finding.title || (entry as any).title || "").slice(0, 240)
        || (String(finding.implication || "").slice(0, 240));
      const contextParts: string[] = [];
      if (finding.implication) contextParts.push(String(finding.implication));
      const entrySummary = String((entry as any).summary || "").trim();
      const entryContent = String((entry as any).content || "").trim();
      if (entrySummary) contextParts.push(entrySummary);
      else if (entryContent) contextParts.push(entryContent.slice(0, 1200));
      if (finding.source) contextParts.push(`Source: ${finding.source}`);
      const context = contextParts.join("\n\n").slice(0, 2500);

      // Reuse generate-authority-content via service-role call.
      const genRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-authority-content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate_content",
          user_id: userId,
          content_type: "linkedin_post",
          topic,
          context,
          language,
          stream: false,
        }),
      });
      if (!genRes.ok) {
        const detail = await genRes.text().catch(() => "");
        await logError("ghost-draft-writer", new Error(`generate ${genRes.status}: ${detail.slice(0, 240)}`), {
          severity: "high", user_id: userId, context: { finding_id: finding.id },
        });
        summary.error++;
        continue;
      }
      const genJson = await genRes.json();
      const body: string = String(genJson?.content || "").trim();
      if (!body) {
        summary.error++;
        continue;
      }

      // Save as a linkedin_posts draft — same shape AuthorityTab uses.
      const { error: insErr } = await admin.from("linkedin_posts").insert({
        user_id: userId,
        post_text: body,
        format_type: "post",
        tracking_status: "draft",
        source_type: "aura_generated",
        authorship: "aura_drafted",
        source_signal_id: null,
        framework_type: null,
        source_metadata: {
          source: "ghost_draft",
          topic: topic || null,
          language,
          _language: language,
          ghost_draft: true,
          ghost_draft_finding_id: finding.id,
          finding_url: finding.url || null,
          finding_source: finding.source || null,
        },
      });
      if (insErr) {
        await logError("ghost-draft-writer", insErr, {
          severity: "high", user_id: userId, context: { finding_id: finding.id },
        });
        summary.error++;
        continue;
      }
      summary.drafted++;
    } catch (e) {
      await logError("ghost-draft-writer", e, {
        severity: "high", user_id: userId, context: { finding_id: finding?.id },
      });
      summary.error++;
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));