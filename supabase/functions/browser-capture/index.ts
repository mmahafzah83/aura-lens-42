import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/* ── Schemas ── */

const FollowerSnapshotSchema = z.object({
  followers: z.number().int().min(0),
  follower_growth: z.number().int().optional().default(0),
  impressions: z.number().int().min(0).optional().default(0),
  reactions: z.number().int().min(0).optional().default(0),
  comments: z.number().int().min(0).optional().default(0),
  shares: z.number().int().min(0).optional().default(0),
  saves: z.number().int().min(0).optional().default(0),
  post_count: z.number().int().min(0).optional().default(0),
  engagement_rate: z.number().min(0).optional().default(0),
  top_topic: z.string().optional().default(null).nullable(),
  top_format: z.string().optional().default(null).nullable(),
});

const PostSchema = z.object({
  post_url: z.string().url(),
  post_text: z.string().min(1).optional().nullable(),
  title: z.string().optional().nullable(),
  hook: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
  media_type: z.enum(["text", "image", "video", "carousel", "document"]).optional().default("text"),
  format_type: z.string().optional().nullable(),
  content_type: z.string().optional().nullable(),
  topic_label: z.string().optional().nullable(),
  like_count: z.number().int().min(0).optional().default(0),
  comment_count: z.number().int().min(0).optional().default(0),
  repost_count: z.number().int().min(0).optional().default(0),
  engagement_score: z.number().min(0).optional().default(0),
});

const PostMetricSchema = z.object({
  post_url: z.string().url(),
  impressions: z.number().int().min(0).optional().default(0),
  reactions: z.number().int().min(0).optional().default(0),
  comments: z.number().int().min(0).optional().default(0),
  shares: z.number().int().min(0).optional().default(0),
  saves: z.number().int().min(0).optional().default(0),
  engagement_rate: z.number().min(0).optional().default(0),
});

const PayloadSchema = z.object({
  type: z.enum(["follower_snapshot", "posts", "post_metrics", "full_sync"]),
  follower_snapshot: FollowerSnapshotSchema.optional(),
  posts: z.array(PostSchema).optional(),
  post_metrics: z.array(PostMetricSchema).optional(),
});

/* ── Helpers ── */

function normalizeUrl(url: string): string {
  let n = url.replace(/https?:\/\/[a-z]{2,3}\.linkedin\.com/i, "https://www.linkedin.com");
  n = n.replace(/https?:\/\/linkedin\.com/i, "https://www.linkedin.com");
  return n.split("?")[0].replace(/\/+$/, "");
}

const today = () => new Date().toISOString().slice(0, 10);

/* ── Main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const rawBody = await req.json();
    const parsed = PayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const payload = parsed.data;

    const results: Record<string, any> = { type: payload.type };
    const errors: string[] = [];
    const startedAt = new Date().toISOString();

    // ── Follower Snapshot ──
    if ((payload.type === "follower_snapshot" || payload.type === "full_sync") && payload.follower_snapshot) {
      const snap = payload.follower_snapshot;
      // Dedup: one per day
      const { data: existing } = await adminClient
        .from("influence_snapshots")
        .select("id")
        .eq("user_id", userId)
        .eq("snapshot_date", today())
        .eq("source_type", "browser_capture")
        .maybeSingle();

      if (existing) {
        await adminClient.from("influence_snapshots")
          .update({
            followers: snap.followers,
            follower_growth: snap.follower_growth,
            impressions: snap.impressions,
            reactions: snap.reactions,
            comments: snap.comments,
            shares: snap.shares,
            saves: snap.saves,
            post_count: snap.post_count,
            engagement_rate: snap.engagement_rate,
            top_topic: snap.top_topic,
            top_format: snap.top_format,
          })
          .eq("id", existing.id);
        results.follower_snapshot = { action: "updated", id: existing.id };
      } else {
        const { data: inserted, error: insErr } = await adminClient
          .from("influence_snapshots")
          .insert({
            user_id: userId,
            snapshot_date: today(),
            source_type: "browser_capture",
            followers: snap.followers,
            follower_growth: snap.follower_growth,
            impressions: snap.impressions,
            reactions: snap.reactions,
            comments: snap.comments,
            shares: snap.shares,
            saves: snap.saves,
            post_count: snap.post_count,
            posts_count: snap.post_count,
            engagement_rate: snap.engagement_rate,
            top_topic: snap.top_topic,
            top_format: snap.top_format,
          })
          .select("id")
          .single();
        if (insErr) errors.push(`follower_snapshot: ${insErr.message}`);
        else results.follower_snapshot = { action: "inserted", id: inserted?.id };
      }
    }

    // ── Posts ──
    let postsInserted = 0, postsEnriched = 0, postsDuplicate = 0;
    if ((payload.type === "posts" || payload.type === "full_sync") && payload.posts) {
      for (const post of payload.posts) {
        const postUrl = normalizeUrl(post.post_url);

        const { data: existing } = await adminClient
          .from("linkedin_posts")
          .select("id, source_trust, enriched_by, post_text, hook, format_type, content_type, published_at")
          .eq("user_id", userId)
          .eq("post_url", postUrl)
          .maybeSingle();

        if (existing) {
          // Enrich: browser_capture has trust 3, always enriches
          const updates: Record<string, any> = {
            source_type: "browser_capture",
            source_trust: 3,
            enriched_by: [...new Set([...(existing.enriched_by as string[] || []), "browser_capture"])],
            source_metadata: { last_capture: new Date().toISOString() },
          };
          // Browser capture overwrites all fields (highest trust)
          if (post.post_text) updates.post_text = post.post_text;
          if (post.hook) updates.hook = post.hook;
          if (post.title) updates.title = post.title;
          if (post.format_type) updates.format_type = post.format_type;
          if (post.content_type) updates.content_type = post.content_type;
          if (post.published_at) updates.published_at = post.published_at;
          if (post.media_type) updates.media_type = post.media_type;
          if (post.topic_label) updates.topic_label = post.topic_label;
          updates.like_count = post.like_count;
          updates.comment_count = post.comment_count;
          updates.repost_count = post.repost_count;
          updates.engagement_score = post.engagement_score;
          if (existing.tracking_status !== "confirmed") updates.tracking_status = "confirmed";

          await adminClient.from("linkedin_posts").update(updates).eq("id", existing.id);
          postsEnriched++;
        } else {
          const { error: insErr } = await adminClient.from("linkedin_posts").insert({
            user_id: userId,
            linkedin_post_id: postUrl,
            post_url: postUrl,
            post_text: post.post_text || null,
            title: post.title || null,
            hook: post.hook || null,
            published_at: post.published_at || null,
            media_type: post.media_type,
            format_type: post.format_type || null,
            content_type: post.content_type || null,
            topic_label: post.topic_label || null,
            like_count: post.like_count,
            comment_count: post.comment_count,
            repost_count: post.repost_count,
            engagement_score: post.engagement_score,
            tracking_status: "confirmed",
            source_type: "browser_capture",
            source_trust: 3,
            enriched_by: ["browser_capture"],
            source_metadata: { captured_at: new Date().toISOString() },
          });
          if (insErr) {
            if (insErr.code === "23505") postsDuplicate++;
            else errors.push(`post: ${insErr.message}`);
          } else postsInserted++;
        }
      }
      results.posts = { inserted: postsInserted, enriched: postsEnriched, duplicates: postsDuplicate };
    }

    // ── Post Metrics ──
    let metricsInserted = 0, metricsUpdated = 0;
    if ((payload.type === "post_metrics" || payload.type === "full_sync") && payload.post_metrics) {
      for (const metric of payload.post_metrics) {
        const postUrl = normalizeUrl(metric.post_url);

        // Find the post
        const { data: post } = await adminClient
          .from("linkedin_posts")
          .select("id")
          .eq("user_id", userId)
          .eq("post_url", postUrl)
          .maybeSingle();

        if (!post) {
          errors.push(`metric: no post found for ${postUrl}`);
          continue;
        }

        // Dedup: one metric per post per day
        const { data: existingMetric } = await adminClient
          .from("linkedin_post_metrics")
          .select("id")
          .eq("user_id", userId)
          .eq("post_id", post.id)
          .eq("snapshot_date", today())
          .eq("source_type", "browser_capture")
          .maybeSingle();

        if (existingMetric) {
          await adminClient.from("linkedin_post_metrics")
            .update({
              impressions: metric.impressions,
              reactions: metric.reactions,
              comments: metric.comments,
              shares: metric.shares,
              saves: metric.saves,
              engagement_rate: metric.engagement_rate,
            })
            .eq("id", existingMetric.id);
          metricsUpdated++;
        } else {
          const { error: insErr } = await adminClient.from("linkedin_post_metrics").insert({
            user_id: userId,
            post_id: post.id,
            snapshot_date: today(),
            source_type: "browser_capture",
            impressions: metric.impressions,
            reactions: metric.reactions,
            comments: metric.comments,
            shares: metric.shares,
            saves: metric.saves,
            engagement_rate: metric.engagement_rate,
          });
          if (insErr) errors.push(`metric: ${insErr.message}`);
          else metricsInserted++;
        }
      }
      results.post_metrics = { inserted: metricsInserted, updated: metricsUpdated };
    }

    // ── Log sync run ──
    const totalStored = postsInserted + postsEnriched + metricsInserted + metricsUpdated +
      (results.follower_snapshot ? 1 : 0);
    await adminClient.from("sync_runs").insert({
      user_id: userId,
      sync_type: "browser_capture",
      status: errors.length > 0 ? "partial" : "completed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      records_fetched: (payload.posts?.length || 0) + (payload.post_metrics?.length || 0) + (payload.follower_snapshot ? 1 : 0),
      records_stored: totalStored,
      error_message: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
    });

    // Log errors
    if (errors.length > 0) {
      for (const err of errors.slice(0, 10)) {
        await adminClient.from("sync_errors").insert({
          user_id: userId,
          error_type: "browser_capture",
          error_message: err,
        });
      }
    }

    return json({
      success: true,
      ...results,
      errors: errors.length > 0 ? errors : undefined,
      total_stored: totalStored,
    });
  } catch (err: any) {
    console.error("[browser-capture] Error:", err);
    return json({ error: err.message }, 500);
  }
});
