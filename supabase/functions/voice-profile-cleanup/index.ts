/**
 * One-off (re-runnable) hygiene pass over every voice profile.
 *
 * Applies exactly what the live write path applies: the avoid and use lists
 * are semantically deduplicated and capped at 12, example posts are migrated
 * to `{content, source, added_at}`, junk entries are dropped, any nested
 * `example_posts_levantine_backup` is promoted, and examples are capped at 10.
 *
 * Service-role or cron only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { normalizeExamples, sanitizeVocabulary, EXAMPLE_CAP } from "../_shared/voiceVocab.ts";
import { sanitizeStyleFields } from "../_shared/voiceStyle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-cleanup-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";

  const CLEANUP_TOKEN = Deno.env.get("VOICE_CLEANUP_TOKEN") || "";
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const isCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
  // One-off maintenance token, used to run the backfill and then removed.
  const isMaintenance = !!CLEANUP_TOKEN && req.headers.get("x-cleanup-token") === CLEANUP_TOKEN;
  if (!isCron && !isMaintenance && bearer !== SERVICE_KEY) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: rows, error } = await admin
    .from("authority_voice_profiles")
    .select("id, tone, preferred_structures, storytelling_patterns, vocabulary_preferences, example_posts, allowed_endings");
  if (error) return json({ error: "load_failed", details: error.message }, 500);

  const summary = { profiles: (rows ?? []).length, updated: 0, failed: 0, examples_dropped: 0, rules_dropped: 0 };

  for (const row of rows ?? []) {
    const beforeRules =
      (Array.isArray((row as any).vocabulary_preferences?.avoid) ? (row as any).vocabulary_preferences.avoid.length : 0) +
      (Array.isArray((row as any).vocabulary_preferences?.use) ? (row as any).vocabulary_preferences.use.length : 0);
    const beforeExamples = Array.isArray((row as any).example_posts) ? (row as any).example_posts.length : 0;

    // Style fields describe HOW the member writes: facts out, ending mandates
    // lifted into allowed_endings.
    const style = sanitizeStyleFields(row as any);
    const { vocabulary, promotedExamples } = sanitizeVocabulary(style.vocabulary_preferences);
    const examples = normalizeExamples(
      [...(Array.isArray((row as any).example_posts) ? (row as any).example_posts : []), ...promotedExamples],
      EXAMPLE_CAP,
    );

    const { error: updErr } = await admin
      .from("authority_voice_profiles")
      .update({
        tone: style.tone,
        preferred_structures: style.preferred_structures,
        storytelling_patterns: style.storytelling_patterns,
        allowed_endings: style.allowed_endings,
        vocabulary_preferences: vocabulary,
        example_posts: examples,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (row as any).id);

    if (updErr) { summary.failed++; continue; }
    summary.updated++;
    summary.rules_dropped += Math.max(0, beforeRules - ((vocabulary.avoid as string[]).length + (vocabulary.use as string[]).length));
    summary.examples_dropped += Math.max(0, beforeExamples - examples.length);
  }

  return json({ ok: true, summary });
});
