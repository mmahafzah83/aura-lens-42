/**
 * Turn what worked into PROPOSALS — never into changes.
 *
 * Doing nothing is the correct output most of the time, and is reported as a
 * result rather than hidden. Every proposal is capped at ±5 points a run, is
 * clamped to the band the member's own writing proves, and lands in
 * `voice_traits` with `source='aura'` and a null `last_confirmed_at` — the same
 * Confirm / Reject mechanism every other Aura suggestion uses. There is no
 * parallel path, no auto-apply, and no way to reach a locked or member-set trait.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdmin } from "../_shared/adminRole.ts";
import {
  OUTCOME_RULES, analyseStyles, analyseTrait, proposedValue, type OutcomeRow,
} from "../_shared/voiceOutcomes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const REJECTION_MEMORY_DAYS = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    let userId: string | null = null;
    if (isService) {
      userId = typeof body.user_id === "string" ? body.user_id : null;
      if (!userId) return json({ error: "user_id required for service calls" }, 400);
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "").trim();
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await anon.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      userId = typeof body.user_id === "string" && (await isAdmin(anon, user.id)) ? body.user_id : user.id;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: rowsRaw, error: outErr } = await admin
      .from("voice_post_outcomes")
      .select("post_id, performance_index, sample_traits, hook_style, ending_type, published_at")
      .eq("user_id", userId)
      .eq("excluded", false)
      .not("performance_index", "is", null);
    if (outErr) throw new Error(`outcomes fetch failed: ${outErr.message}`);
    const rows = (rowsRaw ?? []) as unknown as OutcomeRow[];

    if (rows.length < OUTCOME_RULES.minOutcomesToLearn) {
      return json({
        learned: false,
        reason: "not_enough_outcomes",
        outcomes: rows.length,
        needed: OUTCOME_RULES.minOutcomesToLearn,
        findings: [],
        proposals: [],
      });
    }

    const { data: pref } = await admin
      .from("voice_learning_prefs").select("learn_from_performance").eq("user_id", userId).maybeSingle();
    const learningOn = pref?.learn_from_performance ?? true;

    const { data: profile } = await admin
      .from("authority_voice_profiles")
      .select("id")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!profile) return json({ learned: false, reason: "no_profile", findings: [], proposals: [] });

    const { data: traitRows } = await admin
      .from("voice_traits")
      .select("id, trait_key, value, band_low, band_high, locked, source")
      .eq("profile_id", profile.id);

    const since = new Date(Date.now() - REJECTION_MEMORY_DAYS * 864e5).toISOString();
    const { data: rejections } = await admin
      .from("voice_trait_rejections")
      .select("trait_key, created_at")
      .eq("user_id", userId)
      .gte("created_at", since);
    const rejected = new Set((rejections ?? []).map((r) => r.trait_key as string));

    const findings: unknown[] = [];
    const proposals: unknown[] = [];
    const refusals: unknown[] = [];

    for (const t of traitRows ?? []) {
      const key = t.trait_key as string;
      const f = analyseTrait(rows, key);
      if (!f) continue;
      findings.push(f);

      // Guards, in order. Feedback and performance are both weaker than an
      // explicit member setting.
      if (t.locked) { refusals.push({ trait_key: key, refused: "locked" }); continue; }
      if (t.source === "user") { refusals.push({ trait_key: key, refused: "set_by_member" }); continue; }
      if (rejected.has(key)) { refusals.push({ trait_key: key, refused: "rejected_within_30_days" }); continue; }
      if (!learningOn) { refusals.push({ trait_key: key, refused: "learning_switched_off" }); continue; }

      const current = Number(t.value);
      const next = proposedValue(
        current, f.raise, f.gap,
        t.band_low === null ? null : Number(t.band_low),
        t.band_high === null ? null : Number(t.band_high),
      );
      if (next === null) { refusals.push({ trait_key: key, refused: "capped_to_measured_band" }); continue; }

      const { error } = await admin
        .from("voice_traits")
        .update({ value: next, source: "aura", last_confirmed_at: null })
        .eq("id", t.id);
      if (error) throw new Error(`proposal write failed for ${key}: ${error.message}`);
      proposals.push({ trait_key: key, from: current, to: next, evidence: f });
    }

    const styleFindings = [...analyseStyles(rows, "hook_style"), ...analyseStyles(rows, "ending_type")];

    return json({
      learned: proposals.length > 0,
      outcomes: rows.length,
      learning_switch: learningOn ? "on" : "off",
      findings,
      style_findings: styleFindings,
      proposals,
      refusals,
    });
  } catch (error) {
    console.error("voice-learn-from-outcomes error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
