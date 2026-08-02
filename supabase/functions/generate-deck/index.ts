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
import { compose, type ComposeResult } from "./compose.ts";
import { REQUIRED_SLOTS, OPTIONAL_SLOTS } from "./slots.ts";

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

/* ------------------------------------------------------------------ */
/* Gateway                                                             */
/* ------------------------------------------------------------------ */

async function callTool(
  system: string,
  user: string,
  tool: { name: string; description: string; parameters: unknown },
): Promise<any> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });

  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("credits_exhausted");
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof args !== "string") throw new Error("model returned no tool call");
  return JSON.parse(args);
}

/* ------------------------------------------------------------------ */
/* Stage 1 — READ                                                      */
/* ------------------------------------------------------------------ */

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

function contextBlock(ctx: SignalContext): string {
  const s = ctx.signal;
  return [
    `SIGNAL: ${s.signal_title}`,
    `EXPLANATION: ${s.explanation ?? ""}`,
    `IMPLICATIONS: ${
      Array.isArray(s.strategic_implications)
        ? s.strategic_implications.join(" | ")
        : s.strategic_implications ?? ""
    }`,
    `THEMES: ${(s.theme_tags ?? []).join(", ")}`,
    `CONFIDENCE: ${s.confidence ?? ""}`,
    "EVIDENCE FRAGMENTS:",
    ...ctx.evidence.map((e, i) => `  [${i + 1}] ${e.title}: ${e.content}`),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Stage 2 — PLAN                                                      */
/* ------------------------------------------------------------------ */

interface Plan {
  hasNumber: boolean;
  numberValue: string | null;
  numberSource: string | null;
  hasComparison: boolean;
  comparisonSeries: Array<{ label: string; value: number; unit?: string }> | null;
  stepCount: number;
  hasDefinableTerm: boolean;
  term: string | null;
  lang: "en" | "ar";
}

const PLAN_TOOL = {
  name: "emit_plan",
  description: "Report what this signal can carry. No prose.",
  parameters: {
    type: "object",
    properties: {
      hasNumber: { type: "boolean" },
      numberValue: { type: ["string", "null"] },
      numberSource: { type: ["string", "null"] },
      hasComparison: { type: "boolean" },
      comparisonSeries: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" },
            unit: { type: "string" },
          },
          required: ["label", "value"],
        },
      },
      stepCount: { type: "integer" },
      hasDefinableTerm: { type: "boolean" },
      term: { type: ["string", "null"] },
      lang: { type: "string", enum: ["en", "ar"] },
    },
    required: [
      "hasNumber", "numberValue", "numberSource", "hasComparison",
      "comparisonSeries", "stepCount", "hasDefinableTerm", "term", "lang",
    ],
  },
};

const PLAN_SYSTEM = `You judge what a strategic signal can carry in a slide deck. You do not write slides and you do not write prose.

hasNumber is true ONLY if a specific figure appears in the signal text or its evidence fragments. If the signal contains no number, hasNumber is false and numberValue is null. Inventing, estimating, or rounding a number from general knowledge is a failure.
numberSource must be quoted from the signal or a fragment, never from general knowledge.
hasComparison is true only if two or more comparable quantities appear in the material.
stepCount is how many distinct, non-obvious actions the material genuinely supports, between 0 and 7. Do not invent steps to reach a number.
lang is the language the deck should be written in.`;

async function plan(ctx: SignalContext): Promise<Plan> {
  const langHint = (ctx.profile.content_language ?? "en") === "ar" ? "ar" : "en";
  const raw = await callTool(
    PLAN_SYSTEM,
    `${contextBlock(ctx)}\n\nThe member writes in "${langHint}".`,
    PLAN_TOOL,
  );
  const p: Plan = {
    hasNumber: Boolean(raw.hasNumber),
    numberValue: raw.numberValue ?? null,
    numberSource: raw.numberSource ?? null,
    hasComparison: Boolean(raw.hasComparison),
    comparisonSeries: Array.isArray(raw.comparisonSeries) ? raw.comparisonSeries : null,
    stepCount: Math.max(0, Math.min(7, Number(raw.stepCount ?? 0))),
    hasDefinableTerm: Boolean(raw.hasDefinableTerm),
    term: raw.term ?? null,
    lang: raw.lang === "ar" ? "ar" : "en",
  };
  // Belt and braces: a number claimed but not present in the material is dropped.
  const corpus = `${contextBlock(ctx)}`;
  if (p.hasNumber && p.numberValue) {
    const digits = String(p.numberValue).replace(/[^0-9]/g, "");
    if (digits && !corpus.replace(/[^0-9]/g, "").includes(digits)) {
      p.hasNumber = false;
      p.numberValue = null;
      p.numberSource = null;
    }
  }
  if (!p.hasNumber) {
    p.numberValue = null;
    p.hasComparison = false;
    p.comparisonSeries = null;
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Stage 4 — WRITE                                                     */
/* ------------------------------------------------------------------ */

const textNode = {
  type: "object",
  properties: {
    runs: {
      type: "array",
      items: {
        type: "object",
        properties: { t: { type: "string" }, lang: { type: "string", enum: ["en", "ar"] } },
        required: ["t", "lang"],
      },
    },
    optional_tail: { type: "boolean" },
  },
  required: ["runs"],
};

const heroLine = {
  type: "object",
  properties: {
    runs: textNode.properties.runs,
    highlight: { type: "boolean" },
  },
  required: ["runs"],
};

const WRITE_TOOL = {
  name: "emit_slides",
  description: "Fill the named slots of each slide in the manifest. Layout is not yours to decide.",
  parameters: {
    type: "object",
    properties: {
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            archetype: { type: "string" },
            slots: {
              type: "object",
              properties: {
                chip: textNode,
                hero_lines: { type: "array", items: heroLine },
                subline: textNode,
                headline: textNode,
                body: { type: "array", items: textNode },
                stat_value: { type: "string" },
                stat_label: textNode,
                source: textNode,
                callout_label: textNode,
                callout_body: textNode,
                quote: textNode,
                checklist: { type: "array", items: textNode },
                term: textNode,
                term_def: textNode,
                cta_pill: textNode,
                media: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["chart", "photo", "screenshot", "icon", "texture"] },
                    placement: { type: "string", enum: ["full", "lower", "side", "inline"] },
                    chart: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["bars"] },
                        series: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              label: textNode,
                              value: { type: "number" },
                              unit: { type: "string" },
                              emphasis: { type: "string", enum: ["none", "accent", "alert"] },
                            },
                            required: ["label", "value"],
                          },
                        },
                      },
                      required: ["type", "series"],
                    },
                  },
                  required: ["kind"],
                },
              },
            },
          },
          required: ["index", "archetype", "slots"],
        },
      },
    },
    required: ["slides"],
  },
};

function writeSystem(): string {
  return `You write the content of a LinkedIn carousel for a senior operator. You fill ONLY the slots named in the manifest. You never choose slides, order, length, or layout.

- Every text node is { runs: [{ t, lang }] } — never a bare string. Put English technical terms inside an Arabic deck in their own run with lang "en" (AI, smart meter, dashboard, KPI, ERP, API). That is what makes mixed text render correctly.
- Hero lines: at most 14 characters for English, 20 for Arabic, and at most 4 lines. Exactly one line may carry highlight true. A longer line wraps and destroys the highlight block.
- Headline maximum 9 words. Body maximum 2 sentences per node; mark the last body node optional_tail true so the fit ladder may drop it losslessly.
- If the plan says hasNumber false, DO NOT emit stat_value on any slide. Say nothing rather than inventing a figure. A fabricated number is the single worst failure for this audience.
- If stat_value is present, source is mandatory and must come from the signal or its evidence, never from general knowledge.
- Write in the member's voice using their voice profile. Contrarian, specific, commercial. Never the words: thought leader, personal brand, game-changing, seamless, unlock, elevate, empower, utilize, facilitate, or leverage as a verb.
- Western digits only, in every language.
- No ellipsis anywhere.

Each slide must carry exactly ONE emphasis: either a stat_value, or exactly one hero line with highlight true, or one chart series with emphasis "alert". Never two.`;
}

function manifestBlock(manifest: ComposeResult): string {
  return manifest.slots
    .map((s) => {
      const req = REQUIRED_SLOTS[s.archetype].join(", ");
      const opt = OPTIONAL_SLOTS[s.archetype].join(", ") || "none";
      return `slide ${s.index} · archetype ${s.archetype} · role ${s.role}\n  required slots: ${req}\n  optional slots: ${opt}`;
    })
    .join("\n");
}

async function writeSlides(
  ctx: SignalContext,
  p: Plan,
  manifest: ComposeResult,
  corrections: string[],
): Promise<any[]> {
  const voice = ctx.voice
    ? `VOICE — tone: ${JSON.stringify(ctx.voice.tone ?? "")}; structures: ${JSON.stringify(
        ctx.voice.preferred_structures ?? "",
      )}; patterns: ${JSON.stringify(ctx.voice.storytelling_patterns ?? "")}; examples: ${JSON.stringify(
        (ctx.voice.example_posts ?? []).slice?.(0, 2) ?? "",
      ).slice(0, 1500)}`
    : "VOICE: no profile on file. Write plainly, concretely, with no marketing register.";

  const user = [
    contextBlock(ctx),
    "",
    voice,
    "",
    `PLAN: ${JSON.stringify(p)}`,
    p.hasNumber
      ? `The one permitted figure is ${p.numberValue}, sourced from: ${p.numberSource}.`
      : "This signal carries NO number. Do not emit stat_value on any slide.",
    "",
    `LANGUAGE: ${p.lang}`,
    "",
    "MANIFEST — fill exactly these slides and slots:",
    manifestBlock(manifest),
    corrections.length
      ? `\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Correct every one of these and change nothing else:\n${corrections
          .map((c) => `- ${c}`)
          .join("\n")}`
      : "",
  ].join("\n");

  const raw = await callTool(writeSystem(), user, WRITE_TOOL);
  return Array.isArray(raw.slides) ? raw.slides : [];
}

/* ------------------------------------------------------------------ */
/* Assembly (deterministic)                                            */
/* ------------------------------------------------------------------ */

function stripEmpty(o: any): any {
  if (Array.isArray(o)) return o.map(stripEmpty).filter((v) => v !== undefined);
  if (o && typeof o === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === null || v === undefined || v === "") continue;
      const cleaned = stripEmpty(v);
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      out[k] = cleaned;
    }
    return out;
  }
  return o;
}

function assemble(
  ctx: SignalContext,
  p: Plan,
  manifest: ComposeResult,
  slides: any[],
  theme: string,
  deckId: string,
): unknown {
  const prof = ctx.profile;
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim() || "Member";
  const title = [prof.level, prof.firm].filter(Boolean).join(", ");
  const handle = bareHandle(prof.linkedin_handle || prof.linkedin_url) || "member";

  const ordered = manifest.slots.map((slot, i) => {
    const found = slides.find((s) => Number(s?.index) === slot.index) ?? slides[i] ?? {};
    const built: any = {
      index: slot.index,
      archetype: slot.archetype,
      slots: stripEmpty(found.slots ?? {}),
    };
    // The model may not override the composed archetype.
    if (!p.hasNumber) delete built.slots.stat_value;
    return built;
  });

  return stripEmpty({
    deck_id: deckId,
    signal_id: ctx.signal.id,
    primary_lang: p.lang,
    dir: p.lang === "ar" ? "rtl" : "ltr",
    numerals: "western",
    theme,
    length: manifest.length,
    profile: {
      name: { runs: [{ t: name, lang: p.lang === "ar" ? "ar" : "en" }] },
      ...(title ? { title: { runs: [{ t: title, lang: "en" }] } } : {}),
      handle,
      avatar_url: prof.avatar_url ?? null,
    },
    slides: ordered,
  });
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