/**
 * Measure a member's voice traits from the posts they actually wrote.
 *
 * Pure text arithmetic — no AI calls, no estimation. A trait with no evidence
 * is simply absent: the surfaces above this read "unknown", never zero.
 *
 * Traits are ROWS keyed by `voice_trait_registry.trait_key`. Adding a new
 * dimension means one registry insert plus one branch in `measure()` — never
 * a migration.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isOwnWriting } from "../_shared/voiceCorpus.ts";
// Trait arithmetic lives in ONE module, shared with client-side voice_fidelity.
import { measure } from "../_shared/voiceMeasure.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // --- auth before any service-role write ---
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
      userId = user.id === FOUNDER_USER_ID && typeof body.user_id === "string" ? body.user_id : user.id;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- target profile ---
    let profileId = typeof body.profile_id === "string" ? body.profile_id : null;
    if (profileId) {
      const { data: p } = await admin
        .from("authority_voice_profiles").select("id").eq("id", profileId).eq("user_id", userId).maybeSingle();
      if (!p) return json({ error: "Profile not found for this user" }, 404);
    } else {
      const { data: p } = await admin
        .from("authority_voice_profiles")
        .select("id, is_primary, created_at")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!p) return json({ error: "No voice profile for this user" }, 404);
      profileId = p.id as string;
    }

    // --- corpus ---
    const { data: rows, error: postsErr } = await admin
      .from("linkedin_posts")
      .select("id, post_text, authorship, acquisition, source_type, voice_corpus_status")
      .eq("user_id", userId)
      .not("post_text", "is", null);
    if (postsErr) throw new Error(`corpus fetch failed: ${postsErr.message}`);

    const kept = (rows ?? []).filter(isOwnWriting);
    const texts = kept.map((r) => String(r.post_text));
    const posts_used = texts.length;
    const posts_excluded = (rows ?? []).length - posts_used;

    // --- registry ---
    const { data: registry, error: regErr } = await admin
      .from("voice_trait_registry")
      .select("trait_key, computable, min_evidence, active")
      .eq("active", true)
      .eq("computable", true);
    if (regErr) throw new Error(`registry fetch failed: ${regErr.message}`);

    const { data: existing, error: exErr } = await admin
      .from("voice_traits")
      .select("trait_key, locked, source")
      .eq("profile_id", profileId);
    if (exErr) throw new Error(`existing traits fetch failed: ${exErr.message}`);
    const prior = new Map((existing ?? []).map((r) => [r.trait_key as string, r]));

    let traits_written = 0;
    let traits_skipped_locked = 0;
    let traits_skipped_user_set = 0;
    const written: Record<string, number> = {};

    for (const reg of registry ?? []) {
      const key = reg.trait_key as string;
      const before = prior.get(key);
      if (before?.locked) { traits_skipped_locked += 1; continue; }

      const m = posts_used > 0 ? measure(key, texts) : null;
      if (!m) continue; // no evidence -> no row

      const minEv = Number(reg.min_evidence ?? 8);
      const bandWidth = (m.band_high ?? 0) - (m.band_low ?? 0);
      const confidence = m.n >= minEv * 2 && bandWidth <= 20 ? "high" : m.n >= minEv ? "medium" : "low";
      const now = new Date().toISOString();

      if (before?.source === "user") {
        // Never overwrite a value the member set themselves.
        const { error } = await admin
          .from("voice_traits")
          .update({ band_low: m.band_low, band_high: m.band_high, evidence_count: m.n, computed_at: now })
          .eq("profile_id", profileId)
          .eq("trait_key", key);
        if (error) throw new Error(`update (user-set) ${key} failed: ${error.message}`);
        traits_skipped_user_set += 1;
        continue;
      }

      const { error } = await admin.from("voice_traits").upsert({
        user_id: userId,
        profile_id: profileId,
        trait_key: key,
        value: m.value,
        band_low: m.band_low,
        band_high: m.band_high,
        raw_value: m.raw_value,
        confidence,
        source: "learned",
        evidence_count: m.n,
        computed_at: now,
      }, { onConflict: "profile_id,trait_key" });
      if (error) throw new Error(`upsert ${key} failed: ${error.message}`);
      traits_written += 1;
      written[key] = m.value;
    }

    // readiness, computed from real data by the DB
    const { data: readiness } = await admin.rpc("voice_profile_readiness", { p_profile_id: profileId });
    if (readiness) {
      await admin.from("authority_voice_profiles").update({ readiness }).eq("id", profileId);
    }

    return json({
      user_id: userId,
      profile_id: profileId,
      traits_written,
      traits_skipped_locked,
      traits_skipped_user_set,
      posts_used,
      posts_excluded,
      values: written,
      readiness: readiness ?? null,
    });
  } catch (error) {
    console.error("voice-compute-traits error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});