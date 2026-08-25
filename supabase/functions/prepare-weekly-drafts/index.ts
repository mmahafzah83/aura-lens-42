import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { detectLang } from "../_shared/lang.ts";
import { writeLineage, type Contribution } from "../_shared/provenance.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

function isoWeek(d: Date): string {
  // ISO week: e.g. 2026-W23
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function startOfIsoWeekUtc(now: Date): Date {
  // Monday 00:00 UTC of the current ISO week
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay() || 7; // 1..7, Mon=1
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const TIER_RANK: Record<string, number> = { live: 3, evergreen: 2, emerging: 1 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = bearer === SERVICE_KEY || apiKey === SERVICE_KEY;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // Resolve target users
    let userIds: string[] = [];
    if (isCron || isServiceRole) {
      if (typeof body?.user_id === "string" && body.user_id) {
        userIds = [body.user_id];
      } else {
        const { data: profiles } = await admin
          .from("diagnostic_profiles")
          .select("user_id");
        userIds = (profiles || []).map((p: any) => p.user_id).filter(Boolean);
      }
    } else {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userIds = [userData.user.id];
    }

    const now = new Date();
    const weekTag = isoWeek(now);
    const weekStartIso = startOfIsoWeekUtc(now).toISOString();
    const twentyOneDaysAgoIso = new Date(now.getTime() - 21 * 86400000).toISOString();

    // ---- Writer gate: don't generate on top of an unlearned voice. ----
    // Cron passes {attempt: 1|2|3} to distinguish the 04:30/04:45/05:00 runs.
    // Manual/user-triggered calls default to attempt=3 (proceed) so a single
    // ad-hoc invocation is never blocked by a stray queue row.
    const attemptRaw = Number((body as any)?.attempt);
    const attempt = Number.isFinite(attemptRaw) && attemptRaw >= 1 && attemptRaw <= 3
      ? Math.floor(attemptRaw)
      : (isCron ? 1 : 3);

    const { count: vdPending } = await admin
      .from("job_queue")
      .select("id", { count: "exact", head: true })
      .eq("job_type", "voice_distill")
      .in("status", ["pending", "claimed"]);
    const pendingN = typeof vdPending === "number" ? vdPending : 0;

    if (pendingN > 0 && attempt < 3) {
      try {
        await admin.from("ef_error_log").insert({
          function_name: "prepare-weekly-drafts",
          severity: "info",
          error_message: `WRITER_DEFERRED pending=${pendingN} attempt=${attempt}`,
          context: { stage: "writer_gate", pending: pendingN, attempt },
        });
      } catch (e) { console.error("writer_gate log failed:", e); }
      return new Response(
        JSON.stringify({ deferred: true, pending: pendingN, attempt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (pendingN > 0 && attempt >= 3) {
      try {
        await admin.from("ef_error_log").insert({
          function_name: "prepare-weekly-drafts",
          severity: "high",
          error_message: `WRITER_PROCEEDED_STALE pending=${pendingN}`,
          context: { stage: "writer_gate", pending: pendingN, attempt },
        });
      } catch (e) { console.error("writer_gate stale log failed:", e); }
    }

    const skipped: Array<{ user_id: string; reason: string; detail?: string }> = [];
    let usersProcessed = 0;
    let draftsCreated = 0;

    for (const userId of userIds) {
      usersProcessed++;
      try {
        // 1) Idempotency: any weekly_ready draft this ISO week?
        const { data: weekRows } = await admin
          .from("content_items")
          .select("id, generation_params")
          .eq("user_id", userId)
          // A discarded draft is not a prepared week. Without this, archiving a
          // week's drafts would look "already prepared" and the member would be
          // silently skipped — or, read the other way, a rewrite could stack on
          // top of rows somebody deliberately threw away.
          .neq("status", "discarded")
          .gte("created_at", weekStartIso);
        const alreadyPrepared = (weekRows || []).some(
          (r: any) => r?.generation_params?.source === "weekly_ready"
        );
        if (alreadyPrepared) {
          skipped.push({ user_id: userId, reason: "already_prepared" });
          continue;
        }

        // 2) No-repeat set: signal_ids used in last 21d
        const { data: recentItems } = await admin
          .from("content_items")
          .select("signal_id")
          .eq("user_id", userId)
          .not("signal_id", "is", null)
          .gte("created_at", twentyOneDaysAgoIso);
        const excludedIds = new Set(
          (recentItems || []).map((r: any) => r.signal_id).filter(Boolean)
        );

        // 3) Pick signals
        const { data: signals } = await admin
          .from("strategic_signals")
          .select("id, signal_title, lifecycle_tier, strength_score, last_evidence_at, strategic_implications, what_it_means_for_you, content_opportunity")
          .eq("user_id", userId)
          .in("lifecycle_tier", ["live", "evergreen", "emerging"]);
        const candidates = (signals || [])
          .filter((s: any) => s?.id && !excludedIds.has(s.id))
          .sort((a: any, b: any) => {
            const ta = TIER_RANK[a.lifecycle_tier] || 0;
            const tb = TIER_RANK[b.lifecycle_tier] || 0;
            if (tb !== ta) return tb - ta;
            const sa = Number(a.strength_score) || 0;
            const sb = Number(b.strength_score) || 0;
            if (sb !== sa) return sb - sa;
            const la = a.last_evidence_at ? new Date(a.last_evidence_at).getTime() : 0;
            const lb = b.last_evidence_at ? new Date(b.last_evidence_at).getTime() : 0;
            return lb - la;
          })
          .slice(0, 3);

        if (candidates.length === 0) {
          skipped.push({ user_id: userId, reason: "no_qualifying_signals" });
          continue;
        }

        // 4) Languages
        const { data: voices } = await admin
          .from("authority_voice_profiles")
          .select("language, is_primary")
          .eq("user_id", userId);
        const primaryRow = (voices || []).find((v: any) => v.is_primary);
        const primaryLang: string = (primaryRow?.language as string) || "en";
        const secondaryRow = (voices || []).find(
          (v: any) => (v.language as string) && v.language !== primaryLang
        );
        const secondaryLang: string | null = secondaryRow?.language || null;

        // 4b) Behavioral mix: mirror how the user actually posts.
        // Fetch up to 30 recent posts, classify per language, compute secondary share.
        let secondarySlots = 0;
        if (secondaryLang) {
        const { data: recentPosts } = await admin
          .from("linkedin_posts")
          .select("post_text")
          .eq("user_id", userId)
          .not("post_text", "is", null)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(30);
          const texts = (recentPosts || [])
            .map((p: any) => String(p?.post_text || "").trim())
            .filter((t: string) => t.length > 0);
          if (texts.length > 0) {
            let secondaryCount = 0;
            for (const t of texts) {
              if (detectLang(t) === secondaryLang) secondaryCount++;
            }
            const secondaryShare = secondaryCount / texts.length;
            if (secondaryShare >= 0.25) secondarySlots = 1;
          }
        }

        // 5+6) Generate + insert
        /**
         * SIBLING AWARENESS. These three drafts are three independent calls to
         * the generator, so without this each one is written as if it were the
         * only one — which is how a single member ended up with seven drafts
         * all opening on the same word. Every shape produced in this run is
         * threaded into the next call so draft 2 and 3 cannot repeat draft 1.
         */
        /**
         * The three drafts of one run must see each other, on all three rotation
         * levels. Passing only the opening back meant draft 2 could repeat draft
         * 1's MOVE and beat order and still pass.
         */
        const siblingShapes: Array<{
          move_id: string | null;
          beats: string[] | null;
          hook_style: string | null;
          ending_type: string | null;
          opening: string;
        }> = [];
        for (let i = 0; i < candidates.length; i++) {
          const signal = candidates[i];
          const isLast = i === candidates.length - 1;
          const draftLang =
            isLast && secondarySlots === 1 && secondaryLang
              ? secondaryLang
              : primaryLang;

          // Build context (trim to ~1500 chars)
          const parts: string[] = [];
          if (signal.strategic_implications) {
            parts.push(
              `Strategic implications: ${
                typeof signal.strategic_implications === "string"
                  ? signal.strategic_implications
                  : JSON.stringify(signal.strategic_implications)
              }`,
            );
          }
          if (signal.what_it_means_for_you) {
            parts.push(
              `What it means for you: ${
                typeof signal.what_it_means_for_you === "string"
                  ? signal.what_it_means_for_you
                  : JSON.stringify(signal.what_it_means_for_you)
              }`,
            );
          }
          if (signal.content_opportunity) {
            parts.push(
              `Content opportunity: ${
                typeof signal.content_opportunity === "string"
                  ? signal.content_opportunity
                  : JSON.stringify(signal.content_opportunity)
              }`,
            );
          }
          const context = parts.join("\n\n").slice(0, 1500);

          try {
            const resp = await fetch(
              `${SUPABASE_URL}/functions/v1/generate-authority-content`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SERVICE_KEY}`,
                  apikey: SERVICE_KEY,
                },
                body: JSON.stringify({
                  action: "generate_content",
                  content_type: "post",
                  topic: signal.signal_title,
                  context,
                  language: draftLang,
                  stream: false,
                  user_id: userId,
                  signal_id: signal.id,
                  // What this run has already written — so this draft cannot
                  // repeat its own siblings' opening.
                  sibling_shapes: siblingShapes,
                }),
              },
            );
            if (!resp.ok) {
              console.error(
                `[prepare-weekly-drafts] gen failed user=${userId} signal=${signal.id} status=${resp.status}`,
              );
              continue;
            }
            const json: any = await resp.json().catch(() => ({}));
            const content: string = json?.content || "";
            if (!json?.success || !content.trim()) {
              console.error(
                `[prepare-weekly-drafts] empty content user=${userId} signal=${signal.id}`,
              );
              continue;
            }

            const prov = json?.provenance ?? null;
            const { data: created, error: insErr } = await admin
              .from("content_items")
              .insert({
                user_id: userId,
                type: "linkedin_post",
                title: signal.signal_title,
                body: content,
                language: draftLang,
                status: "draft",
                signal_id: signal.id,
                // Where this came from, as columns — not buried in JSON.
                made_by: "aura",
                produced_by: "weekly_drafts",
                arrived_by: "generated_in_place",
                confidence: "confirmed",
                prompt_version: prov?.prompt_version ?? null,
                model_used: prov?.model_used ?? null,
                // Classified at write time, so the next generation can see the
                // shape of this one. No backfill; from here on every draft
                // carries its own fingerprint.
                hook_style: json?.hook_style ?? null,
                ending_type: json?.ending_type ?? null,
                move_id: json?.move_id ?? null,
                beats: Array.isArray(json?.beats) ? json.beats : null,
                // A draft that shipped a repeat ships FLAGGED, never silently.
                shape_repeat: json?.rotation_repeat ?? null,
                generation_params: {
                  source: "weekly_ready",
                  week: weekTag,
                  source_signal_id: signal.id,
                  language: draftLang,
                  generated_at: new Date().toISOString(),
                },
              })
              .select("id")
              .single();
            if (insErr || !created) {
              console.error(
                `[prepare-weekly-drafts] insert failed user=${userId} signal=${signal.id}`,
                insErr?.message,
              );
              continue;
            }

            // Nothing is created without its lineage.
            const contributions: Contribution[] = Array.isArray(prov?.contributions)
              ? [...prov.contributions]
              : [];
            if (!contributions.some((c) => c.kind === "signal")) {
              contributions.push({ kind: "signal", id: signal.id, role: "topic" });
            }
            await writeLineage(admin, "content_items", created.id, contributions);

            siblingShapes.push({
              move_id: json?.move_id ?? null,
              beats: Array.isArray(json?.beats) ? json.beats : null,
              hook_style: json?.hook_style ?? null,
              ending_type: json?.ending_type ?? null,
              opening: String(json?.opening_words || content).slice(0, 200),
            });

            draftsCreated++;

          } catch (e) {
            console.error(
              `[prepare-weekly-drafts] draft error user=${userId} signal=${signal.id}`,
              (e as Error).message,
            );
            continue;
          }
        }
      } catch (e) {
        skipped.push({
          user_id: userId,
          reason: "user_error",
          detail: (e as Error).message,
        });
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        users_processed: usersProcessed,
        drafts_created: draftsCreated,
        skipped,
        week: weekTag,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[prepare-weekly-drafts] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});