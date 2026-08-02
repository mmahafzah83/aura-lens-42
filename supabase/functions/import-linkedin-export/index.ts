/**
 * Import the member's official LinkedIn data export (Shares.csv).
 *
 * Analytics sync gives us metrics and URLs but never the post commentary —
 * the scope that returns text is restricted. The member's own data export is
 * the only complete source of their history, so this endpoint takes the rows
 * the browser parsed out of Shares.csv and fills in the text we are missing.
 *
 * Matching order per row: exact URL, then the numeric activity id, then the
 * same publication day plus overlapping slug words. Never creates duplicates.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withObserve } from "../_shared/observe.ts";
import { activityId, normalizeUrl, slugTokens, textTokens, dayKey } from "../_shared/linkedinPost.ts";
import { refreshVoiceProfiles } from "../_shared/voiceRefresh.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RowSchema = z.object({
  text: z.string().min(1).max(20000),
  url: z.string().max(2000).optional().nullable(),
  date: z.string().max(64).optional().nullable(),
});

const PayloadSchema = z.object({
  rows: z.array(RowSchema).min(1).max(5000),
  dry_run: z.boolean().optional().default(false),
});

interface Existing {
  id: string;
  linkedin_post_id: string | null;
  post_url: string | null;
  published_at: string | null;
  post_text: string | null;
}

Deno.serve(withObserve("import-linkedin-export", async (req) => {
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
    const { rows, dry_run } = parsed.data;

    const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingRows, error: readErr } = await db
      .from("linkedin_posts")
      .select("id, linkedin_post_id, post_url, published_at, post_text")
      .eq("user_id", userId)
      .limit(5000);
    if (readErr) return json({ error: "Could not read your posts", details: readErr.message }, 500);

    const existing: Existing[] = existingRows ?? [];
    const byUrl = new Map<string, Existing>();
    const byActivity = new Map<string, Existing>();
    const byDay = new Map<string, Existing[]>();
    for (const e of existing) {
      const u = normalizeUrl(e.post_url) ?? normalizeUrl(e.linkedin_post_id);
      if (u && !byUrl.has(u)) byUrl.set(u, e);
      const a = activityId(e.post_url) ?? activityId(e.linkedin_post_id);
      if (a && !byActivity.has(a)) byActivity.set(a, e);
      const d = dayKey(e.published_at);
      if (d) byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }

    const claimed = new Set<string>();
    const fills: { id: string; post_text: string; post_url: string | null }[] = [];
    const inserts: Record<string, unknown>[] = [];
    let matched = 0;
    let alreadyHadText = 0;
    const insertKeys = new Set<string>();

    for (const row of rows) {
      const text = row.text.trim();
      if (!text) continue;
      const url = row.url?.trim() || null;
      const aid = activityId(url);
      const nurl = normalizeUrl(url);
      const publishedAt = row.date ? new Date(row.date) : null;
      const validDate = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;

      let hit: Existing | undefined;
      if (nurl) hit = byUrl.get(nurl);
      if (!hit && aid) hit = byActivity.get(aid);
      if (!hit && validDate) {
        // Same day, and the URL slug of the stored row echoes the export text.
        const candidates = (byDay.get(dayKey(validDate.toISOString())!) ?? [])
          .filter((c) => !claimed.has(c.id));
        const words = textTokens(text);
        let best: { row: Existing; score: number } | null = null;
        for (const c of candidates) {
          const tokens = slugTokens(c.post_url ?? c.linkedin_post_id);
          if (!tokens.length) continue;
          const overlap = tokens.filter((t) => words.has(t)).length / tokens.length;
          if (overlap >= 0.5 && (!best || overlap > best.score)) best = { row: c, score: overlap };
        }
        if (best) hit = best.row;
        else if (candidates.length === 1) hit = candidates[0];
      }

      if (hit && !claimed.has(hit.id)) {
        claimed.add(hit.id);
        matched++;
        if (hit.post_text && hit.post_text.trim().length > 0) alreadyHadText++;
        else fills.push({ id: hit.id, post_text: text, post_url: hit.post_url ?? url });
        continue;
      }
      if (hit) continue;

      const key = aid ?? nurl ?? `${dayKey(validDate?.toISOString() ?? null)}|${text.slice(0, 60)}`;
      if (insertKeys.has(key)) continue;
      insertKeys.add(key);
      inserts.push({
        user_id: userId,
        linkedin_post_id: url ?? `export:${key}`,
        post_url: url,
        post_text: text,
        published_at: validDate ? validDate.toISOString() : null,
        source_type: "linkedin_export",
        acquisition: "imported",
        authorship: "user_written",
        tracking_status: "external_reference",
        synced_at: new Date().toISOString(),
      });
    }

    if (dry_run) {
      return json({
        dry_run: true,
        rows_in_file: rows.length,
        matched,
        would_fill: fills.length,
        would_add: inserts.length,
      });
    }

    let filled = 0;
    for (const f of fills) {
      const { error } = await db
        .from("linkedin_posts")
        .update({ post_text: f.post_text, synced_at: new Date().toISOString() })
        .eq("id", f.id)
        .eq("user_id", userId);
      if (!error) filled++;
      else console.error(`fill ${f.id} failed: ${error.message}`);
    }

    let added = 0;
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      const { data, error } = await db
        .from("linkedin_posts")
        .upsert(chunk, { onConflict: "user_id,linkedin_post_id", ignoreDuplicates: true })
        .select("id");
      if (error) console.error(`insert chunk failed: ${error.message}`);
      else added += data?.length ?? 0;
    }

    // The whole point of the import is a better voice profile — do it now.
    let voice: unknown = null;
    try {
      voice = await refreshVoiceProfiles(db, userId);
    } catch (e) {
      console.error("voice refresh after import failed:", (e as Error).message);
    }

    const summary =
      `Matched ${matched} posts, filled ${filled} texts, added ${added} new.`;
    console.log(`[import-linkedin-export] ${userId}: ${summary}`);

    return json({
      success: true,
      summary,
      rows_in_file: rows.length,
      matched,
      filled,
      added,
      already_had_text: alreadyHadText,
      voice,
    });
  } catch (err) {
    console.error("import-linkedin-export error:", err);
    return json({ error: "Import failed", details: (err as Error).message }, 500);
  }
}));