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
import { isAdmin } from "../_shared/adminRole.ts";
import { isOwnWriting, CORPUS_COLUMNS, corpusLang } from "../_shared/voiceCorpus.ts";
// Trait arithmetic lives in ONE module, shared with client-side voice_fidelity.
import { measure } from "../_shared/voiceMeasure.ts";
// How the member ACTUALLY distributes their shapes — the ceilings the writer
// is later held to. Same module the generator checks against.
import { computeDistribution, MIN_DIST_CORPUS } from "../_shared/voiceDistribution.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


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
      userId = typeof body.user_id === "string" && (await isAdmin(anon, user.id)) ? body.user_id : user.id;
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
        // Measurement always writes to the member's own voice — the default
        // row. A mode's traits are set by createMode and by the member.
        .eq("mode_key", "default")
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
      .select(`id, ${CORPUS_COLUMNS}`)
      .eq("user_id", userId)
      .not("post_text", "is", null);
    if (postsErr) throw new Error(`corpus fetch failed: ${postsErr.message}`);

    const kept = (rows ?? []).filter(isOwnWriting);
    const texts = kept.map((r) => String(r.post_text));
    const posts_used = texts.length;
    const posts_excluded = (rows ?? []).length - posts_used;

    /**
     * A draft the member rewrote is the member writing. The edited half of
     * every edit pair joins the measured corpus, so correcting a draft moves
     * the voice itself and not only the rules distilled from it.
     */
    const { data: editRows } = await admin
      .from("linkedin_posts")
      .select("original_generated_text, post_text")
      .eq("user_id", userId)
      .not("original_generated_text", "is", null)
      .not("edited_at", "is", null)
      .order("edited_at", { ascending: false })
      .limit(50);
    const editedTexts = (editRows ?? [])
      .map((r) => ({ original: String(r.original_generated_text ?? ""), edited: String(r.post_text ?? "") }))
      .filter((p) => p.original.trim() && p.edited.trim() && p.original !== p.edited)
      .map((p) => p.edited);
    const edit_pairs_used = editedTexts.length;
    for (const t of editedTexts) texts.push(t);


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

      const m = texts.length > 0 ? measure(key, texts) : null;
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

    // --- the distribution: how this member actually spreads their shapes ---
    // Per language, because the same person opens differently in Arabic. Below
    // MIN_DIST_CORPUS posts every share is written NULL, so the writer falls
    // back to plain rotation instead of obeying noise.
    const byLang: Record<"ar" | "en", string[]> = { ar: [], en: [] };
    for (const t of texts) byLang[corpusLang(t)].push(t);
    const distributions: Record<string, unknown> = {};
    for (const lang of ["en", "ar"] as const) {
      const dist = computeDistribution(byLang[lang]);
      // Nothing at all in this language: no row, no empty shell.
      if (dist.corpus_n === 0) continue;
      const { error: dErr } = await admin.from("voice_distribution").upsert({
        user_id: userId,
        language: lang,
        corpus_n: dist.corpus_n,
        computed_at: new Date().toISOString(),
        open_type_share: dist.open_type_share,
        land_type_share: dist.land_type_share,
        move_share: dist.move_share,
        marker_rate: dist.marker_rate,
        length_p25: dist.length_p25,
        length_p50: dist.length_p50,
        length_p75: dist.length_p75,
      }, { onConflict: "user_id,language" });
      if (dErr) throw new Error(`distribution upsert ${lang} failed: ${dErr.message}`);
      distributions[lang] = {
        corpus_n: dist.corpus_n,
        enforced: dist.corpus_n >= MIN_DIST_CORPUS,
        open_type_share: dist.open_type_share,
        land_type_share: dist.land_type_share,
        marker_rate: dist.marker_rate,
        length_p50: dist.length_p50,
      };
    }


    // readiness, computed from real data by the DB
    const { data: readiness } = await admin.rpc("voice_profile_readiness", { p_profile_id: profileId });
    if (readiness) {
      await admin.from("authority_voice_profiles").update({ readiness }).eq("id", profileId);
    }

    // Rules are proposed from the same reading, but only when there is enough
    // of it and the member is not already covered. Never on a page load.
    let rules_suggested_run = false;
    if (posts_used >= 20) {
      const { data: activeRules } = await admin
        .from("voice_rules")
        .select("kind")
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("active", true);
      const counts: Record<string, number> = {};
      for (const r of activeRules ?? []) counts[r.kind as string] = (counts[r.kind as string] ?? 0) + 1;
      const thin = ["always", "never", "anchor"].some((k) => (counts[k] ?? 0) < 3);
      if (thin) {
        rules_suggested_run = true;
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/voice-suggest-rules`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
            body: JSON.stringify({ user_id: userId }),
          });
        } catch (e) {
          console.error("voice-suggest-rules chain failed:", (e as Error).message);
        }
      }
    }

    /**
     * The edit-pair pass. `voice-distill` is the only place that reads an edit
     * pair for RULES; the re-read chain now runs it so an edit moves both the
     * measured voice (above) and the rules. Failure is logged, never fatal.
     */
    let edit_pairs_distilled = false;
    if (edit_pairs_used > 0) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/voice-distill`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ user_id: userId }),
        });
        edit_pairs_distilled = r.ok;
        if (!r.ok) console.error("voice-distill chain failed:", r.status);
      } catch (e) {
        console.error("voice-distill chain failed:", (e as Error).message);
      }
    }

    return json({
      user_id: userId,
      edit_pairs_used,
      edit_pairs_distilled,
      profile_id: profileId,
      rules_suggested_run,
      traits_written,
      traits_skipped_locked,
      traits_skipped_user_set,
      posts_used,
      posts_excluded,
      values: written,
      distributions,
      readiness: readiness ?? null,

    });
  } catch (error) {
    console.error("voice-compute-traits error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});