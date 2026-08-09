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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- arithmetic helpers ----------

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** Normalise a raw measurement onto 0–100 across an explicit window. */
const norm = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_RE = /[A-Za-z]/g;
const EVIDENCE_RE = /(\d+(?:[.,]\d+)*\s?%|[$€£]\s?\d|\bSAR\b|\bAED\b|\bUSD\b|\b(?:19|20)\d{2}\b|\d+(?:[.,]\d+)*)/g;

const countOf = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** Sentence lengths in words. */
function sentenceWordCounts(text: string): number[] {
  return text
    .split(/[.!?؟\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.split(/\s+/).length);
}

const median = (nums: number[]) => quantile([...nums].sort((a, b) => a - b), 0.5);

type Measured = { value: number; band_low: number | null; band_high: number | null; raw_value: number };

/** Per-post measurement for each computable trait. Returns null when the post carries no signal for it. */
function perPost(trait: string, text: string): number | null {
  const chars = text.length;
  if (chars === 0) return null;
  switch (trait) {
    case "length":
      return chars;
    case "pace": {
      const sents = sentenceWordCounts(text);
      if (sents.length === 0) return null;
      const medWords = median(sents);
      const paras = text.split(/\n{2,}/).filter((p) => p.trim()).length;
      const parasPerK = (paras / chars) * 1000;
      // shorter sentences and more paragraph breaks = more clipped = higher
      return clamp(norm(30 - medWords, 0, 25) * 0.75 + norm(parasPerK, 0, 8) * 0.25);
    }
    case "emoji":
      return (countOf(text, EMOJI_RE) / chars) * 1000;
    case "language_mix": {
      const ar = countOf(text, ARABIC_RE);
      const la = countOf(text, LATIN_RE);
      if (ar + la === 0) return null;
      return (ar / (ar + la)) * 100;
    }
    case "evidence_density":
      return (countOf(text, EVIDENCE_RE) / chars) * 1000;
    default:
      return null;
  }
}

/** Map a raw per-post measurement onto the 0–100 trait scale. */
function scale(trait: string, raw: number): number {
  switch (trait) {
    case "length":
      return norm(raw, 800, 2600);
    case "pace":
      return clamp(raw);
    case "emoji":
      return norm(raw, 0, 12);
    case "language_mix":
      return clamp(raw);
    case "evidence_density":
      return norm(raw, 0, 15);
    default:
      return clamp(raw);
  }
}

function measure(trait: string, texts: string[]): (Measured & { n: number }) | null {
  const raws: number[] = [];
  for (const t of texts) {
    const v = perPost(trait, t);
    if (v !== null && Number.isFinite(v)) raws.push(v);
  }
  if (raws.length === 0) return null; // absent, never zero-filled
  const sorted = [...raws].sort((a, b) => a - b);
  const rawMedian = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    value: Number(scale(trait, rawMedian).toFixed(2)),
    band_low: Number(scale(trait, q1).toFixed(2)),
    band_high: Number(scale(trait, q3).toFixed(2)),
    raw_value: Number(rawMedian.toFixed(2)),
    n: raws.length,
  };
}

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
      .select("id, post_text, authorship, acquisition, source_type")
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