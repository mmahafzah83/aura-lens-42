/**
 * generate-deck — the writer stage of the carousel pipeline.
 *
 * Six stages. The model NEVER emits layout: it emits a judgement (stage 2) and
 * content into named slots (stage 4). Stages 1, 3, 5 and 6 contain no model
 * call. A malformed model response is rejected at the tool-call layer.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DeckIRSchema, type DeckIR } from "./deckIR.ts";
import { checkInvariants, splitByTier } from "./invariants.ts";
import { repairDeck } from "./repair.ts";
import { compose } from "./compose.ts";
import {
  plan,
  writeSlides,
  writeCaption,
  assemble,
  critique,
  resolveVoice,
  vocab,
  type SignalContext,
  type Plan,
  type CritiqueFlag,
  bareHandle,
} from "./pipeline.ts";
import { REQUIRED_SLOTS } from "./slots.ts";
import { resolveIdentityFrom } from "../_shared/identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/**
 * Array caps live in the schema; a model that overshoots them should not cost
 * the member a whole regeneration. Truncate to the cap, drop empty text nodes.
 */
const ARRAY_CAPS: Record<string, number> = { body: 3, checklist: 4 };

function nonEmptyNode(n: unknown): boolean {
  const runs = (n as { runs?: Array<{ t?: string }> } | null)?.runs;
  if (!Array.isArray(runs) || runs.length === 0) return false;
  return runs.some((r) => typeof r?.t === "string" && r.t.trim().length > 0);
}

export function clampSlots(candidate: unknown): unknown {
  const slides = (candidate as { slides?: unknown[] } | null)?.slides;
  if (!Array.isArray(slides)) return candidate;
  for (const slide of slides) {
    const slots = (slide as { slots?: Record<string, unknown> } | null)?.slots;
    if (!slots || typeof slots !== "object") continue;
    for (const [key, cap] of Object.entries(ARRAY_CAPS)) {
      const arr = slots[key];
      if (!Array.isArray(arr)) continue;
      const cleaned = arr.filter(nonEmptyNode).slice(0, cap);
      if (cleaned.length === 0) delete slots[key];
      else slots[key] = cleaned;
    }
  }
  return candidate;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readContext(db: any, signalId: string, userId: string): Promise<SignalContext> {
  const { data: signal, error } = await db
    .from("strategic_signals")
    .select(
      "id, user_id, signal_title, explanation, strategic_implications, theme_tags, confidence, supporting_evidence_ids",
    )
    .eq("id", signalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`signal read failed: ${error.message}`);
  if (!signal) throw new Error("signal not found");

  // Signals here carry between 8 and 570 fragments. Judging stepCount and
  // hasComparison from a dozen was why every deck came back with neither.
  const ids: string[] = Array.isArray(signal.supporting_evidence_ids)
    ? signal.supporting_evidence_ids.slice(0, 24)
    : [];
  let evidence: Array<{ title: string; content: string }> = [];
  let raw: Array<{ title: string; content: string; created_at?: string }> = [];
  if (ids.length) {
    const { data: frags } = await db
      .from("evidence_fragments")
      .select("title, content, confidence, source_registry_id")
      .in("id", ids);
    const rows = frags ?? [];
    evidence = rows.map((f: any) => ({
      title: f.title ?? "",
      content: String(f.content ?? "").slice(0, 1200),
    }));

    // The fragments are AI summaries of AI summaries. Walk back through the
    // source registry to the member's own captures — that is where his
    // language, his places and his numbers still exist.
    const registryIds = Array.from(
      new Set(rows.map((f: any) => f.source_registry_id).filter(Boolean)),
    ).slice(0, 24);
    if (registryIds.length) {
      const { data: sources } = await db
        .from("source_registry")
        .select("id, source_id, source_type")
        .in("id", registryIds)
        .eq("source_type", "entry");
      const entryIds = Array.from(
        new Set((sources ?? []).map((s: any) => s.source_id).filter(Boolean)),
      ).slice(0, 12);
      if (entryIds.length) {
        const { data: entries } = await db
          .from("entries")
          .select("title, content, created_at")
          .in("id", entryIds)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);
        raw = (entries ?? [])
          .filter((e: any) => String(e.content ?? "").trim().length > 40)
          .map((e: any) => ({
            title: e.title ?? "",
            content: String(e.content ?? "").slice(0, 2000),
            created_at: e.created_at,
          }));
      }
    }

    // No traceable capture behind this signal: fall back to the highest
    // confidence fragments, clearly labelled as summaries in the prompt.
    if (!raw.length) {
      evidence = rows
        .slice()
        .sort((a: any, b: any) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
        .map((f: any) => ({
          title: f.title ?? "",
          content: String(f.content ?? "").slice(0, 1200),
        }));
    }
  }

  // Every profile on file. The one that matches the deck language is chosen
  // later, once the language is known — is_primary is only a fallback.
  const { data: voices } = await db
    .from("authority_voice_profiles")
    .select(
      "language, is_primary, tone, preferred_structures, storytelling_patterns, example_posts, vocabulary_preferences",
    )
    .eq("user_id", userId)
    .order("is_primary", { ascending: false });

  const { data: profile } = await db
    .from("diagnostic_profiles")
    .select(
      "display_name_override, first_name, last_name, level, firm, avatar_url, avatar_cutout_url, linkedin_handle, linkedin_url, content_language",
    )
    .eq("user_id", userId)
    .maybeSingle();

  // The name and handle on a slide come from one resolver, never from
  // whatever columns happen to be at hand.
  const { data: connection } = await db
    .from("linkedin_connections")
    .select("display_name, profile_name, handle, profile_url")
    .eq("user_id", userId)
    .maybeSingle();
  const identity = resolveIdentityFrom(connection, profile);

  console.log("[generate-deck] context", JSON.stringify({
    fragments: evidence.length,
    raw_captures: raw.length,
    voice_profiles: (voices ?? []).map((v: any) => `${v.language}${v.is_primary ? "*" : ""}`),
    identity: `${identity.name} (@${identity.handle}) via ${identity.name_source}/${identity.handle_source}`,
  }));

  return {
    signal,
    evidence,
    raw,
    voices: voices ?? [],
    voice: null,
    profile: profile ?? {},
    identity,
  };
}

/** Sector vocabulary for the specificity test — the signal's own words. */
function domainTermsFor(ctx: SignalContext): string[] {
  const tags = Array.isArray(ctx.signal.theme_tags) ? ctx.signal.theme_tags : [];
  const titleWords = String(ctx.signal.signal_title ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 5);
  return Array.from(new Set([...tags.map(String), ...titleWords].map((t) => t.toLowerCase())));
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

async function logEvent(db: any, row: Record<string, unknown>) {
  try {
    await db.from("deck_events").insert(row);
  } catch (_) {
    // telemetry never breaks generation
  }
}

async function generate(
  db: any,
  userId: string,
  signalId: string,
  requestedLength: number | undefined,
  theme: string,
  requestedLang?: "en" | "ar",
) {
  const started = Date.now();
  const deckId = crypto.randomUUID();

  const ctx = await readContext(db, signalId, userId);
  const langHint: "en" | "ar" =
    requestedLang ?? ((ctx.profile.content_language ?? "en") === "ar" ? "ar" : "en");
  // One voice DNA, matched to the deck language, chosen before any writing.
  ctx.voice = resolveVoice(ctx.voices, langHint);
  const p = await plan(ctx, requestedLang);
  if (p.lang !== langHint) ctx.voice = resolveVoice(ctx.voices, p.lang);
  // A profile in another language gives us cadence, never phrases.
  ctx.voiceRhythmOnly = Boolean(
    ctx.voice && !String(ctx.voice.language ?? "").toLowerCase().startsWith(p.lang),
  );

  const memberVocab = vocab(ctx.voice);
  const invOpts = {
    avoid: memberVocab.avoid,
    // Read from THIS member's own row at request time — never a static list.
    signoffs: memberVocab.signoffs,
    domainTerms: domainTermsFor(ctx),
  };

  const target = requestedLength === 5 || requestedLength === 7 || requestedLength === 10
    ? (requestedLength as 5 | 7 | 10)
    : undefined;
  const manifest = compose(
    {
      hasNumber: p.hasNumber,
      hasComparison: p.hasComparison,
      stepCount: p.stepCount,
      lang: p.lang,
    },
    target,
  );

  let retries = 0;
  let corrections: string[] = [];
  let failures: string[] = [];
  let warnings: string[] = [];
  let repairs: string[] = [];
  let deck: DeckIR | null = null;
  let critiqueFlags: CritiqueFlag[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slides = await writeSlides(ctx, p, manifest, corrections);
    const candidate = assemble(ctx, p, manifest, slides, theme, deckId);
    clampSlots(candidate);
    const parsed = DeckIRSchema.safeParse(candidate);
    if (!parsed.success) {
      failures = parsed.error.issues.map((i) => `schema: ${i.path.join(".")} — ${i.message}`);
    } else {
      // Repair what a machine can undo, then judge what is left. Voice and
      // taste rules mark the deck; they never withhold it.
      const fixed = repairDeck(parsed.data);
      const all = checkInvariants(fixed.deck, invOpts);
      const split = splitByTier(all);
      failures = split.blocking;
      if (split.blocking.length === 0) {
        warnings = split.warnings;
        repairs = fixed.repaired;
        // The invariants catch the mechanical tells. The critique catches the
        // ones only an ear can hear. One regeneration, with the tell quoted back.
        critiqueFlags = await critique(ctx, fixed.deck);
        const generic = critiqueFlags.filter((f) => f.verdict === "generic");
        if (!generic.length || attempt >= 1) {
          deck = fixed.deck;
          break;
        }
        corrections = generic.map(
          (f) =>
            `Slide ${f.index} reads as generic AI, not as this member. The tell: "${f.tell}". Rewrite that slide from the member's own raw captures and example posts. Leave every other slide exactly as it was.`,
        );
        retries = attempt + 1;
        continue;
      }
    }
    corrections = failures;
    retries = attempt + 1;
  }

  const duration_ms = Date.now() - started;

  if (!deck) {
    await logEvent(db, {
      user_id: userId,
      deck_id: deckId,
      signal_id: signalId,
      event: "validation_failed",
      lang: p.lang,
      theme,
      length: manifest.length,
      invariant_failures: [
        ...failures,
        ...critiqueFlags.filter((f) => f.verdict === "generic").map((f) => `VOICE: slide ${f.index} — ${f.tell}`),
      ],
      duration_ms,
    });
    const abstract = failures.some((f) => f.startsWith("INV-19"));
    return {
      ok: false,
      failures,
      message: abstract
        ? "This signal is too abstract to write from — pick another or add a capture."
        : undefined,
      plan: p,
      duration_ms,
    };
  }

  const caption = await writeCaption(ctx, p, deck);

  const genericFlags = critiqueFlags.filter((f) => f.verdict === "generic");
  await logEvent(db, {
    user_id: userId,
    deck_id: deckId,
    signal_id: signalId,
    event: "generated",
    lang: deck.primary_lang,
    theme: deck.theme,
    length: deck.length,
    // Voice flags are logged even on a passing deck so we can measure whether
    // the voice is improving over time.
    invariant_failures: genericFlags.map((f) => `VOICE: slide ${f.index} — ${f.tell}`),
    duration_ms,
  });

  return {
    ok: true,
    deck,
    caption,
    plan: p,
    quality: {
      score: Math.max(0, 100 - retries * 15 - genericFlags.length * 10),
      flags: [
        ...(p.hasNumber ? [] : ["no_number_in_signal"]),
        ...(ctx.voice ? [] : ["no_voice_profile"]),
        ...(ctx.voiceRhythmOnly ? ["voice_profile_other_language"] : []),
        ...(ctx.raw.length ? [] : ["no_raw_captures"]),
        ...genericFlags.map((f) => `voice_generic_slide_${f.index}`),
      ],
      retries,
      voice_profile: ctx.voice ? String(ctx.voice.language ?? "unknown") : null,
      warnings,
      repairs,
    },
    duration_ms,
  };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

/**
 * "Try another angle" — one slide, same shape, different words.
 *
 * The manifest is reduced to the single slide being rewritten, so the model
 * spends its whole budget on that slot set and cannot disturb its neighbours.
 */
async function rewriteSlide(
  db: any,
  userId: string,
  signalId: string,
  index: number,
  archetype: string,
  avoid: string,
  lang?: "en" | "ar",
) {
  const ctx = await readContext(db, signalId, userId);
  const p = await plan(ctx, lang);
  ctx.voice = resolveVoice(ctx.voices, p.lang);
  const manifest = {
    length: 5 as const,
    slots: [{ index, archetype, role: archetype } as any],
  };
  const corrections = [
    `Rewrite slide ${index} from a different angle. Do not reuse this wording: "${avoid.slice(0, 400)}".`,
    `Fill exactly the required slots for ${archetype}: ${(REQUIRED_SLOTS as any)[archetype]?.join(", ") ?? ""}.`,
  ];
  const written = await writeSlides(ctx, p, manifest as any, corrections);
  const slide = written.find((s: any) => Number(s?.index) === index) ?? written[0];
  if (!slide) return { ok: false, failures: ["The writer returned nothing for that slide."] };
  return {
    ok: true,
    slide: { index, archetype, slots: slide.slots ?? {} },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const theme = ["midnight", "clay", "gradient", "paper"].includes(body.theme)
      ? body.theme
      : "midnight";
    const reqLang: "en" | "ar" | undefined =
      body.lang === "ar" ? "ar" : body.lang === "en" ? "en" : undefined;

    // Admin-only self test: run three real signals, one of which carries no number.
    if (body.selftest) {
      const { data: prof } = await db
        .from("diagnostic_profiles")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof?.is_admin) return json({ error: "forbidden" }, 403);

      const { data: signals } = await db
        .from("strategic_signals")
        .select("id, signal_title, explanation")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      const list = signals ?? [];
      const noNumber = list.filter((s: any) => !/\d/.test(`${s.signal_title} ${s.explanation ?? ""}`));
      const withNumber = list.filter((s: any) => /\d/.test(`${s.signal_title} ${s.explanation ?? ""}`));
      const picks = [...noNumber.slice(0, 1), ...withNumber.slice(0, 2)].slice(0, 3);

      const results = [];
      for (const s of picks) {
        try {
          const r: any = await generate(db, user.id, s.id, body.length, theme, reqLang);
          results.push({
            signal_id: s.id,
            signal_title: s.signal_title,
            ok: r.ok,
            plan: r.plan,
            length: r.deck?.length ?? null,
            archetypes: r.deck?.slides?.map((x: any) => x.archetype) ?? [],
            stat_slides: r.deck?.slides?.filter((x: any) => x.slots.stat_value).length ?? 0,
            invariants: r.ok ? "pass" : r.failures,
            deck: r.deck ?? null,
          });
        } catch (e) {
          results.push({ signal_id: s.id, error: String(e) });
        }
      }
      return json({ ok: true, tested: results.length, results });
    }

    if (!body.signal_id) return json({ error: "signal_id required" }, 400);

    /**
     * Admin-only A/B: the same signal written once with the old context
     * (is_primary voice, summaries only, no vocabulary_preferences) and once
     * with the new one. Returns the cover hero lines and the frame body of each.
     */
    if (body.voice_ab) {
      const { data: prof } = await db
        .from("diagnostic_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: "forbidden" }, 403);

      const lang: "en" | "ar" = reqLang ?? "en";
      const ctx = await readContext(db, body.signal_id, user.id);
      const p = await plan(ctx, lang);
      const manifest = compose(
        { hasNumber: p.hasNumber, hasComparison: p.hasComparison, stepCount: p.stepCount, lang: p.lang },
        5,
      );

      const flatten = (slides: any[], archetype: string) => {
        const s = slides.find((x: any) => x?.archetype === archetype) ??
          manifest.slots.map((m, i) => (m.archetype === archetype ? slides[i] : null)).find(Boolean);
        const slots = s?.slots ?? {};
        const runs = (n: any) => (n?.runs ?? []).map((r: any) => r.t).join("");
        return {
          hero_lines: (slots.hero_lines ?? []).map(runs),
          headline: runs(slots.headline),
          subline: runs(slots.subline),
          body: (slots.body ?? []).map(runs),
        };
      };

      // OLD: the primary profile regardless of language, no vocabulary, no raw.
      const oldVoice = ctx.voices.find((v: any) => v.is_primary) ?? ctx.voices[0] ?? null;
      const oldCtx: SignalContext = {
        ...ctx,
        raw: [],
        voice: oldVoice
          ? { ...oldVoice, vocabulary_preferences: {}, example_posts: (oldVoice.example_posts ?? []).slice(0, 2) }
          : null,
      };
      const oldSlides = await writeSlides(oldCtx, p, manifest, []);

      // NEW: language-matched voice, full vocabulary_preferences, raw captures.
      const newCtx: SignalContext = { ...ctx, voice: resolveVoice(ctx.voices, p.lang) };
      const newSlides = await writeSlides(newCtx, p, manifest, []);

      return json({
        ok: true,
        deck_lang: p.lang,
        selected_profile: {
          old: oldVoice ? { language: oldVoice.language, is_primary: oldVoice.is_primary } : null,
          new: newCtx.voice ? { language: newCtx.voice.language, is_primary: newCtx.voice.is_primary } : null,
        },
        raw_captures: ctx.raw.length,
        old: { cover: flatten(oldSlides, "cover_hero"), frame: flatten(oldSlides, "frame") },
        new: { cover: flatten(newSlides, "cover_hero"), frame: flatten(newSlides, "frame") },
      });
    }

    if (typeof body.rewrite_slide === "number" && body.deck) {
      const idx = body.rewrite_slide;
      const existing = (body.deck.slides ?? []).find((s: any) => s.index === idx);
      if (!existing) return json({ error: "slide not found" }, 400);
      const avoid = JSON.stringify(existing.slots ?? {});
      const out = await rewriteSlide(db, user.id, body.signal_id, idx, existing.archetype, avoid, body.deck.primary_lang === "ar" ? "ar" : "en");
      // Always 200: a refusal is an answer the studio must be able to read.
      return json(out);
    }

    const result = await generate(db, user.id, body.signal_id, body.length, theme, reqLang);
    return json(result);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});