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

/* ── Enrichment helpers ── */

/** Infer topic_label from post text using keyword matching */
function inferTopicLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();

  const topics: [string, string[]][] = [
    ["digital transformation", ["digital transformation", "digitalization", "digital strategy", "tech adoption"]],
    ["leadership", ["leadership", "leading teams", "executive presence", "c-suite", "ceo", "cfo", "cto"]],
    ["strategy", ["strategy", "strategic", "competitive advantage", "market positioning", "growth strategy"]],
    ["consulting", ["consulting", "advisory", "client engagement", "professional services"]],
    ["AI & technology", ["artificial intelligence", " ai ", "machine learning", "generative ai", "chatgpt", "automation", "data analytics"]],
    ["sustainability", ["sustainability", "esg", "climate", "net zero", "green", "carbon"]],
    ["innovation", ["innovation", "disruption", "startup", "venture", "emerging tech"]],
    ["talent & culture", ["talent", "hiring", "culture", "retention", "employee experience", "workforce"]],
    ["finance & deals", ["m&a", "merger", "acquisition", "valuation", "ipo", "private equity", "capital"]],
    ["risk & governance", ["risk", "governance", "compliance", "regulation", "audit", "cybersecurity"]],
    ["operations", ["operations", "supply chain", "efficiency", "lean", "process improvement", "transformation"]],
    ["personal brand", ["personal brand", "thought leadership", "linkedin", "content strategy", "authority"]],
  ];

  for (const [label, keywords] of topics) {
    for (const kw of keywords) {
      if (t.includes(kw)) return label;
    }
  }
  return null;
}

/** Infer format_type from post text structure */
function inferFormatType(text: string | null | undefined, mediaType: string): string | null {
  if (mediaType === "carousel") return "carousel";
  if (mediaType === "video") return "video";
  if (mediaType === "document") return "document";
  if (!text) return null;

  const lines = text.split("\n").filter(l => l.trim().length > 0);

  // Numbered list pattern
  const numberedLines = lines.filter(l => /^\s*\d+[\.\)]\s/.test(l));
  if (numberedLines.length >= 3) return "listicle";

  // Short punchy lines = opinion/hot-take
  if (lines.length <= 5 && text.length < 300) return "hot_take";

  // Long-form with paragraphs
  if (lines.length >= 8 || text.length > 800) return "long_form";

  // Story pattern (first person narrative)
  const storySignals = ["i remember", "last week", "years ago", "true story", "here's what happened", "i was"];
  if (storySignals.some(s => text.toLowerCase().includes(s))) return "story";

  // Framework pattern
  const frameworkSignals = ["step 1", "phase 1", "pillar", "principle", "framework", "model", "matrix"];
  if (frameworkSignals.some(s => text.toLowerCase().includes(s))) return "framework";

  return "post";
}

/** Infer media_type from post text if not provided */
function inferMediaType(text: string | null | undefined, currentMediaType: string): string {
  if (currentMediaType && currentMediaType !== "text") return currentMediaType;
  if (!text) return "text";
  const t = text.toLowerCase();

  // Carousel signals
  if (t.includes("swipe") || t.includes("slide ") || t.includes("carousel")) return "carousel";

  return "text";
}

/** Compute engagement_score from reactions, comments, shares */
function computeEngagementScore(
  reactions: number,
  comments: number,
  shares: number,
  impressions: number
): number {
  // If we have impressions, compute real engagement rate
  if (impressions > 0) {
    const totalEngagements = reactions + comments * 2 + shares * 3;
    return Math.round((totalEngagements / impressions) * 100 * 10) / 10;
  }
  // Otherwise compute a weighted composite score
  const weighted = reactions + comments * 3 + shares * 5;
  return Math.round(weighted * 10) / 10;
}

/** Extract first line as hook if not provided */
function extractHook(text: string | null | undefined): string | null {
  if (!text) return null;
  const firstLine = text.split("\n").find(l => l.trim().length > 0);
  if (!firstLine) return null;
  return firstLine.trim().slice(0, 200);
}

/* ── URL normalization ── */

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
        if (insErr) {
            console.error("[browser-capture] follower_snapshot insert failed:", JSON.stringify(insErr));
            errors.push(`follower_snapshot: ${insErr.message}`);
          } else results.follower_snapshot = { action: "inserted", id: inserted?.id };
      }
    }

    // ── Posts (with auto-enrichment) ──
    let postsInserted = 0, postsEnriched = 0, postsDuplicate = 0;
    if ((payload.type === "posts" || payload.type === "full_sync") && payload.posts) {
      for (const post of payload.posts) {
        const postUrl = normalizeUrl(post.post_url);
        const postText = post.post_text || null;

        // Auto-infer fields if not provided by the extension
        const inferredMediaType = inferMediaType(postText, post.media_type || "text");
        const inferredFormatType = post.format_type || inferFormatType(postText, inferredMediaType);
        const inferredTopicLabel = post.topic_label || inferTopicLabel(postText);
        const inferredHook = post.hook || extractHook(postText);
        const computedEngagement = post.engagement_score > 0
          ? post.engagement_score
          : computeEngagementScore(post.like_count, post.comment_count, post.repost_count, 0);

        const { data: existing } = await adminClient
          .from("linkedin_posts")
          .select("id, source_trust, enriched_by, post_text, hook, format_type, content_type, published_at")
          .eq("user_id", userId)
          .eq("post_url", postUrl)
          .maybeSingle();

        if (existing) {
          const updates: Record<string, any> = {
            source_type: "browser_capture",
            source_trust: 3,
            enriched_by: [...new Set([...(existing.enriched_by as string[] || []), "browser_capture"])],
            source_metadata: { last_capture: new Date().toISOString() },
            like_count: post.like_count,
            comment_count: post.comment_count,
            repost_count: post.repost_count,
            engagement_score: computedEngagement,
          };
          if (postText) updates.post_text = postText;
          if (inferredHook) updates.hook = inferredHook;
          if (post.title) updates.title = post.title;
          if (inferredFormatType) updates.format_type = inferredFormatType;
          if (post.content_type) updates.content_type = post.content_type;
          if (post.published_at) updates.published_at = post.published_at;
          updates.media_type = inferredMediaType;
          if (inferredTopicLabel) updates.topic_label = inferredTopicLabel;
          updates.tracking_status = "confirmed";

          await adminClient.from("linkedin_posts").update(updates).eq("id", existing.id);
          postsEnriched++;
        } else {
          const { error: insErr } = await adminClient.from("linkedin_posts").insert({
            user_id: userId,
            linkedin_post_id: postUrl,
            post_url: postUrl,
            post_text: postText,
            title: post.title || null,
            hook: inferredHook,
            published_at: post.published_at || null,
            media_type: inferredMediaType,
            format_type: inferredFormatType,
            content_type: post.content_type || null,
            topic_label: inferredTopicLabel,
            like_count: post.like_count,
            comment_count: post.comment_count,
            repost_count: post.repost_count,
            engagement_score: computedEngagement,
            tracking_status: "confirmed",
            source_type: "browser_capture",
            source_trust: 3,
            enriched_by: ["browser_capture"],
            source_metadata: { captured_at: new Date().toISOString() },
          });
          if (insErr) {
            console.error("[browser-capture] post insert failed:", JSON.stringify({ code: insErr.code, message: insErr.message, postUrl }));
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

        const { data: post } = await adminClient
          .from("linkedin_posts")
          .select("id, like_count, comment_count, repost_count")
          .eq("user_id", userId)
          .eq("post_url", postUrl)
          .maybeSingle();

        if (!post) {
          errors.push(`metric: no post found for ${postUrl}`);
          continue;
        }

        // Also update the post's engagement_score from latest metrics
        const metricEngagement = computeEngagementScore(
          metric.reactions, metric.comments, metric.shares, metric.impressions
        );
        await adminClient.from("linkedin_posts").update({
          like_count: metric.reactions,
          comment_count: metric.comments,
          repost_count: metric.shares,
          engagement_score: metricEngagement,
          tracking_status: "metrics_imported",
        }).eq("id", post.id);

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
              engagement_rate: metric.engagement_rate || metricEngagement,
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
            engagement_rate: metric.engagement_rate || metricEngagement,
          });
          if (insErr) {
            console.error("[browser-capture] metric insert failed:", JSON.stringify({ code: insErr.code, message: insErr.message, postId: post.id }));
            errors.push(`metric: ${insErr.message}`);
          } else metricsInserted++;
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
