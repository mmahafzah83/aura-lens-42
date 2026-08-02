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
import { checkInvariants } from "./invariants.ts";
import { compose } from "./compose.ts";
import { plan, writeSlides, assemble, type SignalContext, type Plan, bareHandle } from "./pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SignalContext {
  signal: Record<string, any>;
  evidence: Array<{ title: string; content: string }>;
  voice: Record<string, any> | null;
  profile: Record<string, any>;
}

function bareHandle(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/(?:linkedin\.com\/)?(?:in\/)?([A-Za-z0-9-]+)\/?$/);
  return m ? m[1] : "";
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

  const ids: string[] = Array.isArray(signal.supporting_evidence_ids)
    ? signal.supporting_evidence_ids.slice(0, 12)
    : [];
  let evidence: Array<{ title: string; content: string }> = [];
  if (ids.length) {
    const { data: frags } = await db
      .from("evidence_fragments")
      .select("title, content")
      .in("id", ids);
    evidence = (frags ?? []).map((f: any) => ({
      title: f.title ?? "",
      content: String(f.content ?? "").slice(0, 1200),
    }));
  }

  const { data: voice } = await db
    .from("authority_voice_profiles")
    .select("tone, preferred_structures, storytelling_patterns, example_posts")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile } = await db
    .from("diagnostic_profiles")
    .select(
      "first_name, last_name, level, firm, avatar_url, linkedin_handle, linkedin_url, content_language",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return { signal, evidence, voice: voice ?? null, profile: profile ?? {} };
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
) {
  const started = Date.now();
  const deckId = crypto.randomUUID();

  const ctx = await readContext(db, signalId, userId);
  const p = await plan(ctx);

  const cap = requestedLength === 5 || requestedLength === 7 || requestedLength === 10
    ? (requestedLength as 5 | 7 | 10)
    : undefined;
  const manifest = compose(
    {
      hasNumber: p.hasNumber,
      hasComparison: p.hasComparison,
      stepCount: p.stepCount,
      lang: p.lang,
    },
    cap,
  );

  let retries = 0;
  let corrections: string[] = [];
  let failures: string[] = [];
  let deck: DeckIR | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const slides = await writeSlides(ctx, p, manifest, corrections);
    const candidate = assemble(ctx, p, manifest, slides, theme, deckId);
    const parsed = DeckIRSchema.safeParse(candidate);
    if (!parsed.success) {
      failures = parsed.error.issues.map((i) => `schema: ${i.path.join(".")} — ${i.message}`);
    } else {
      failures = checkInvariants(parsed.data);
      if (failures.length === 0) {
        deck = parsed.data;
        break;
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
      invariant_failures: failures,
      duration_ms,
    });
    return { ok: false, failures, plan: p, duration_ms };
  }

  await logEvent(db, {
    user_id: userId,
    deck_id: deckId,
    signal_id: signalId,
    event: "generated",
    lang: deck.primary_lang,
    theme: deck.theme,
    length: deck.length,
    invariant_failures: [],
    duration_ms,
  });

  return {
    ok: true,
    deck,
    plan: p,
    quality: {
      score: Math.max(0, 100 - retries * 15),
      flags: [
        ...(p.hasNumber ? [] : ["no_number_in_signal"]),
        ...(ctx.voice ? [] : ["no_voice_profile"]),
      ],
      retries,
    },
    duration_ms,
  };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
          const r: any = await generate(db, user.id, s.id, body.length, theme);
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
    const result = await generate(db, user.id, body.signal_id, body.length, theme);
    return json(result, result.ok ? 200 : 422);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});