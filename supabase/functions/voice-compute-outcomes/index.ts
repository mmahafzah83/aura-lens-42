/**
 * Read what actually happened to the member's published posts.
 *
 * This function writes no opinions. It measures each published post with the
 * one shared trait module, joins the newest metrics snapshot, and records how
 * the post did against the member's OWN trailing median — never against another
 * member and never against an absolute. Idempotent: one row per post, upserted.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isOwnWriting } from "../_shared/voiceCorpus.ts";
// Trait arithmetic lives in ONE module, shared with voice-compute-traits and the client.
import { COMPUTABLE_TRAITS, measureOne } from "../_shared/voiceMeasure.ts";
import { OUTCOME_RULES, trailingBaseline, winsorise } from "../_shared/voiceOutcomes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isService = authHeader === `Bearer ${SERVICE_ROLE}` ||
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let userIds: string[] = [];
    if (isService) {
      if (typeof body.user_id === "string") userIds = [body.user_id];
      else if (body.all === true) {
        const { data } = await admin.from("linkedin_post_metrics").select("user_id");
        userIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
      } else return json({ error: "user_id or all required for service calls" }, 400);
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "").trim();
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await anon.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      userIds = [user.id === FOUNDER_USER_ID && typeof body.user_id === "string" ? body.user_id : user.id];
    }

    const report: unknown[] = [];

    for (const userId of userIds) {
      const { data: posts, error: postErr } = await admin
        .from("linkedin_posts")
        .select("id, post_text, published_at, hook_style, ending_type, authorship, acquisition, source_type, voice_corpus_status")
        .eq("user_id", userId)
        .not("published_at", "is", null)
        .order("published_at", { ascending: true });
      if (postErr) throw new Error(`posts fetch failed: ${postErr.message}`);

      const ids = (posts ?? []).map((p) => p.id as string);
      const metricsByPost = new Map<string, Record<string, number>>();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: mets } = await admin
          .from("linkedin_post_metrics")
          .select("post_id, snapshot_date, impressions, reactions, comments, shares, engagement_rate")
          .in("post_id", chunk)
          .order("snapshot_date", { ascending: true });
        // newest snapshot per post wins
        for (const m of mets ?? []) metricsByPost.set(m.post_id as string, m as unknown as Record<string, number>);
      }

      const { data: snaps } = await admin
        .from("linkedin_profile_snapshots")
        .select("fetched_at, followers")
        .eq("user_id", userId)
        .order("fetched_at", { ascending: true });
      const followersAt = (iso: string | null): number | null => {
        if (!iso) return null;
        const t = new Date(iso).getTime();
        let best: number | null = null;
        for (const s of snaps ?? []) {
          if (new Date(s.fetched_at as string).getTime() <= t && s.followers !== null) best = Number(s.followers);
        }
        return best;
      };

      const now = Date.now();
      const excluded: Record<string, number> = {};
      const rows: Record<string, unknown>[] = [];
      const priorRates: number[] = [];
      const rawIndices: number[] = [];

      for (const p of posts ?? []) {
        const met = metricsByPost.get(p.id as string) ?? null;
        const rate = met && met.engagement_rate !== null ? Number(met.engagement_rate) : null;
        const publishedAt = p.published_at as string | null;
        const ageDays = publishedAt ? (now - new Date(publishedAt).getTime()) / DAY : null;

        let reason: string | null = null;
        if (!p.post_text || String(p.post_text).trim().length === 0) reason = "no_text";
        else if (!isOwnWriting(p)) reason = "not_own_writing";
        else if (p.voice_corpus_status !== "included") reason = "not_in_corpus";
        else if (!met) reason = "no_metrics_yet";
        else if (ageDays !== null && ageDays < OUTCOME_RULES.settleDays) reason = "too_new";
        else if (Number(met.impressions ?? 0) < OUTCOME_RULES.minImpressions) reason = "too_few_impressions";

        // The baseline is built from every measured post, including ones we do
        // not learn from: the member's typical reach is a fact about them.
        const baseline = trailingBaseline(priorRates);
        if (rate !== null) priorRates.push(rate);

        const traits: Record<string, number> = {};
        if (p.post_text) {
          for (const key of COMPUTABLE_TRAITS) {
            const m = measureOne(key, String(p.post_text));
            if (m) traits[key] = Number(m.scaled.toFixed(2));
          }
        }

        const rawIndex = reason === null && rate !== null && baseline !== null ? rate / baseline : null;
        if (rawIndex !== null) rawIndices.push(rawIndex);

        if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;

        rows.push({
          user_id: userId,
          post_id: p.id,
          published_at: publishedAt,
          followers_at_publish: followersAt(publishedAt),
          impressions: met ? Number(met.impressions ?? 0) : null,
          engagement_rate: rate,
          reactions: met ? Number(met.reactions ?? 0) : null,
          comments: met ? Number(met.comments ?? 0) : null,
          shares: met ? Number(met.shares ?? 0) : null,
          performance_index_raw: rawIndex,
          performance_index: rawIndex, // winsorised below, once the member's own spread is known
          baseline_engagement_rate: baseline,
          sample_traits: traits,
          hook_style: p.hook_style ?? null,
          ending_type: p.ending_type ?? null,
          computed_at: new Date().toISOString(),
          excluded: reason !== null,
          exclusion_reason: reason,
        });
      }

      // One viral post must not dominate: clip to the member's own 5th/95th.
      const clip = winsorise(rawIndices);
      for (const r of rows) {
        r.performance_index = r.performance_index_raw === null ? null : Number(clip(r.performance_index_raw as number).toFixed(4));
      }

      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin
          .from("voice_post_outcomes")
          .upsert(rows.slice(i, i + 200), { onConflict: "post_id" });
        if (error) throw new Error(`outcome upsert failed: ${error.message}`);
      }

      const kept = rows.filter((r) => !r.excluded);
      const idx = kept.map((r) => r.performance_index).filter((v): v is number => typeof v === "number");
      report.push({
        user_id: userId,
        posts_seen: rows.length,
        rows_kept: kept.length,
        excluded_by_reason: excluded,
        baseline_engagement_rate: trailingBaseline(priorRates),
        performance_index_range: idx.length ? [Math.min(...idx), Math.max(...idx)] : null,
      });
    }

    return json({ ok: true, members: report });
  } catch (error) {
    console.error("voice-compute-outcomes error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
