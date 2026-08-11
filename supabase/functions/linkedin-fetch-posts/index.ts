/**
 * Fetch a member's LinkedIn posts via Apify and ingest their OWN written posts.
 *
 * Runs for the calling user. The founder may pass { user_id } to run it for
 * someone else (admin/testing); everyone else is silently forced to self.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { isAdmin } from "../_shared/adminRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTOR = "harvestapi~linkedin-profile-posts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Pull the handle out of any linkedin.com/in/<handle> shape. */
function parseHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().split("?")[0].split("#")[0];
  const m = cleaned.match(/linkedin\.com\/in\/([^/?#\s]+)/i) ?? cleaned.match(/^\/?in\/([^/?#\s]+)/i);
  const handle = (m?.[1] ?? "").replace(/[.,;:)\]]+$/, "").replace(/\/+$/, "").trim();
  return handle ? handle : null;
}

/** The 15–25 digit activity id inside a LinkedIn post URL or urn. */
function activityId(value?: string | null): string | null {
  if (!value) return null;
  const ids = String(value).match(/\d{15,25}/g);
  return ids && ids.length ? ids[ids.length - 1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth first, before any service-role work ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    // Founder may act for another user; everyone else is forced to self.
    const requested = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const targetUserId = requested && (await isAdmin(anon, user.id)) ? requested : user.id;

    const handle = parseHandle(body?.profile_url);
    if (!handle) {
      return json({ error: "Enter a valid LinkedIn profile URL like linkedin.com/in/yourname" }, 400);
    }
    const canonical_url = `https://www.linkedin.com/in/${handle}`;

    const rawMax = Number(body?.max_posts ?? 50);
    const max_posts = Math.min(100, Math.max(1, Number.isFinite(rawMax) ? Math.floor(rawMax) : 50));

    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    if (!APIFY_TOKEN) {
      return json({ error: "APIFY_TOKEN not set — add it in Lovable Cloud secrets." }, 400);
    }

    // --- Apify (sync run) ---
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrls: [canonical_url],
            maxPosts: max_posts,
            scrapeReactions: false,
            scrapeComments: false,
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status !== 200 && res.status !== 201) {
      const text = await res.text();
      return json({ error: "Apify request failed", status: res.status, apify_body: text.slice(0, 500) }, 502);
    }

    const items = await res.json();
    const list: any[] = Array.isArray(items) ? items : [];

    // --- Keep only the member's own written posts ---
    const wanted = handle.toLowerCase();
    const kept: any[] = [];
    let skipped_reshares = 0;
    let skipped_empty = 0;
    for (const it of list) {
      const who = String(it?.author?.publicIdentifier ?? "").toLowerCase();
      if (who !== wanted) { skipped_reshares++; continue; }
      const content = typeof it?.content === "string" ? it.content.trim() : "";
      if (!content) { skipped_empty++; continue; }
      kept.push({ ...it, content });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: existingRows } = await db
      .from("linkedin_posts")
      .select("id, post_url, linkedin_post_id, post_text")
      .eq("user_id", targetUserId)
      .limit(5000);

    const byActivity = new Map<string, any>();
    for (const e of existingRows ?? []) {
      const a = activityId(e.post_url) ?? activityId(e.linkedin_post_id);
      if (a && !byActivity.has(a)) byActivity.set(a, e);
    }

    let inserted = 0;
    let updated_existing = 0;

    for (const p of kept) {
      const url: string | null = p.linkedinUrl ?? null;
      const aid = activityId(url) ?? activityId(p.entityId);
      const publishedAt = p?.postedAt?.date ?? p?.postedAt ?? null;
      const when = publishedAt ? new Date(publishedAt) : null;
      const published_at = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
      const like_count = Number(p?.engagement?.likes ?? 0) || 0;
      const comment_count = Number(p?.engagement?.comments ?? 0) || 0;
      const images = Array.isArray(p?.postImages) ? p.postImages : [];

      const hit = aid ? byActivity.get(aid) : undefined;
      if (hit) {
        const hasText = typeof hit.post_text === "string" && hit.post_text.trim().length > 0;
        const update: Record<string, unknown> = {
          like_count,
          comment_count,
          synced_at: new Date().toISOString(),
        };
        if (published_at) update.published_at = published_at;
        if (!hasText) update.post_text = p.content; // never overwrite real text
        const { error } = await db.from("linkedin_posts")
          .update(update)
          .eq("id", hit.id)
          .eq("user_id", targetUserId);
        if (error) console.error(`update ${hit.id} failed: ${error.message}`);
        else updated_existing++;
        continue;
      }

      const { error } = await db.from("linkedin_posts").insert({
        user_id: targetUserId,
        post_text: p.content,
        post_url: url,
        linkedin_post_id: url ?? (aid ? `activity:${aid}` : null),
        published_at,
        like_count,
        comment_count,
        media_type: p?.postVideo ? "video" : images.length ? "image" : "text",
        acquisition: "imported",
        source_type: "imported",
        source_metadata: {
          images,
          video: p?.postVideo?.videoUrl ?? null,
          activity_id: aid,
        },
        synced_at: new Date().toISOString(),
      });
      if (error) console.error(`insert failed: ${error.message}`);
      else {
        inserted++;
        if (aid) byActivity.set(aid, { id: null, post_text: p.content });
      }
    }

    // --- Correct the stored connection details ---
    const first = kept[0] ?? list[0] ?? null;
    const authorName = first?.author?.name ?? null;
    const author = {
      name: authorName,
      headline: first?.author?.info ?? null,
      avatar_url: first?.author?.avatar?.url ?? null,
    };

    const conn: Record<string, unknown> = {
      profile_url: canonical_url,
      handle,
      updated_at: new Date().toISOString(),
    };
    if (authorName) conn.profile_name = authorName;

    const { data: existingConn } = await db
      .from("linkedin_connections")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existingConn?.id) {
      const { error } = await db.from("linkedin_connections").update(conn).eq("id", existingConn.id);
      if (error) console.error(`connection update failed: ${error.message}`);
    } else {
      const { error } = await db.from("linkedin_connections").insert({ user_id: targetUserId, ...conn });
      if (error) console.error(`connection insert failed: ${error.message}`);
    }

    return json({
      handle,
      canonical_url,
      fetched: list.length,
      kept_own_text: kept.length,
      skipped_reshares,
      skipped_empty,
      inserted,
      updated_existing,
      author,
    });
  } catch (error) {
    console.error("linkedin-fetch-posts error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});