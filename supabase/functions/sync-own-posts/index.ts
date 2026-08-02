/**
 * Receive the member's OWN posts, captured by the Aura browser extension on
 * their LinkedIn activity page.
 *
 * This is the ongoing counterpart to the one-off data-export import: it keeps
 * the corpus growing without the member downloading anything again. Only their
 * own posts, only from their own activity page.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withObserve } from "../_shared/observe.ts";
import { activityId, normalizeUrl } from "../_shared/linkedinPost.ts";
import { resolveIdentity } from "../_shared/identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PostSchema = z.object({
  post_url: z.string().max(2000),
  post_text: z.string().min(1).max(20000),
  published_at: z.string().max(64).optional().nullable(),
  author_url: z.string().max(2000).optional().nullable(),
  like_count: z.number().int().min(0).optional().nullable(),
  comment_count: z.number().int().min(0).optional().nullable(),
  repost_count: z.number().int().min(0).optional().nullable(),
});

const PayloadSchema = z.object({
  posts: z.array(PostSchema).min(1).max(200),
  page_url: z.string().max(2000).optional().nullable(),
});

Deno.serve(withObserve("sync-own-posts", async (req) => {
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

    const parsed = PayloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { posts, page_url } = parsed.data;

    const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Refuse anything that is not the member's own writing.
    const identity = await resolveIdentity(db, userId);
    const ownHandle = identity.handle.toLowerCase();
    const rejected: string[] = [];

    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const p of posts) {
      const author = (p.author_url ?? "").toLowerCase();
      if (author && ownHandle !== "member" && !author.includes(ownHandle)) {
        rejected.push(p.post_url);
        continue;
      }
      const key = activityId(p.post_url) ?? normalizeUrl(p.post_url) ?? p.post_url;
      if (seen.has(key)) continue;
      seen.add(key);
      const when = p.published_at ? new Date(p.published_at) : null;
      rows.push({
        user_id: userId,
        linkedin_post_id: p.post_url,
        post_url: p.post_url,
        post_text: p.post_text.trim(),
        published_at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
        like_count: p.like_count ?? 0,
        comment_count: p.comment_count ?? 0,
        repost_count: p.repost_count ?? 0,
        source_type: "linkedin_own",
        acquisition: "imported",
        authorship: "user_written",
        tracking_status: "external_reference",
        synced_at: new Date().toISOString(),
      });
    }

    if (!rows.length) {
      return json({ success: true, received: posts.length, saved: 0, rejected: rejected.length });
    }

    // Existing rows keep their metrics and identifiers; we are here for text.
    const { data: existing } = await db
      .from("linkedin_posts")
      .select("id, linkedin_post_id, post_url, post_text")
      .eq("user_id", userId)
      .in("linkedin_post_id", rows.map((r) => r.linkedin_post_id as string));
    const existingByKey = new Map(
      (existing ?? []).map((e: any) => [e.linkedin_post_id as string, e]),
    );

    let saved = 0;
    let updated = 0;
    for (const row of rows) {
      const hit = existingByKey.get(row.linkedin_post_id as string);
      if (hit) {
        if (hit.post_text && hit.post_text.trim().length) continue;
        const { error } = await db.from("linkedin_posts")
          .update({ post_text: row.post_text, source_type: "linkedin_own", synced_at: row.synced_at })
          .eq("id", hit.id).eq("user_id", userId);
        if (error) console.error(`own-post update failed: ${error.message}`);
        else updated++;
        continue;
      }
      const { error } = await db.from("linkedin_posts")
        .upsert(row, { onConflict: "user_id,linkedin_post_id" });
      if (error) console.error(`own-post upsert failed: ${error.message}`);
      else saved++;
    }

    console.log(`[sync-own-posts] ${userId}: ${saved} new, ${updated} texts filled, from ${page_url ?? "activity page"}`);
    return json({ success: true, received: posts.length, saved, updated, rejected: rejected.length });
  } catch (err) {
    console.error("sync-own-posts error:", err);
    return json({ error: "Sync failed", details: (err as Error).message }, 500);
  }
}));