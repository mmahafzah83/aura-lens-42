/**
 * Stages 2 and 4 (model calls) plus the deterministic assembly between them.
 * Kept out of index.ts so a test harness can drive the pipeline directly.
 */
import type { DeckIR } from "./deckIR.ts";
import { type ComposeResult } from "./compose.ts";
import { REQUIRED_SLOTS, OPTIONAL_SLOTS } from "./slots.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface SignalContext {
  signal: Record<string, any>;
  evidence: Array<{ title: string; content: string }>;
  /** Raw, unparaphrased member captures behind this signal. The real voice lives here. */
  raw: Array<{ title: string; content: string; created_at?: string }>;
  /** Every voice profile on file. `voice` is the one matched to the deck language. */
  voices: Array<Record<string, any>>;
  voice: Record<string, any> | null;
  /** True when `voice` is in a different language than the deck: rhythm only, never phrases. */
  voiceRhythmOnly?: boolean;
  profile: Record<string, any>;
  /** The member's approved post. When present, the writer ADAPTS it instead of regenerating. */
  sourceText?: string;
}

/* ------------------------------------------------------------------ */
/* Voice DNA                                                           */
/* ------------------------------------------------------------------ */

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/**
 * The ONE shape test for a sign-off, used by both the `signoffs` bucket and
 * `pickSignOff` so the two can never drift apart. Structural only: no phrase,
 * industry or person appears here.
 *
 * A sign-off is a finished, self-contained declarative statement — no bracketed
 * slot to fill, no trailing colon inviting a list, not a question, and it ends
 * in terminal sentence punctuation.
 */
export function isSignOff(raw: unknown): boolean {
  const u = String(raw ?? "").trim();
  return (
    u.length >= 25 &&
    u.length <= 220 &&
    !/[\[\]{}<>]/.test(u) &&
    !/[:؟?]\s*$/.test(u) &&
    /[.!。۔]\s*$/.test(u)
  );
}

/**
 * A marker is a bare typographic glyph with no letter in it at all — the kind
 * used to structure a LinkedIn post body. Derived from Unicode letter absence,
 * never from a list of glyphs typed into this file.
 */
export function isMarker(raw: unknown): boolean {
  const u = String(raw ?? "").trim();
  return u.length > 0 && !/\p{L}/u.test(u);
}

export function vocab(voice: Record<string, any> | null | undefined) {
  const vp = (voice?.vocabulary_preferences ?? {}) as Record<string, any>;
  const use = asArray(vp.use);
  // `use` is three structurally different kinds of thing wearing one name.
  // Classify by SHAPE and hand each consumer only what it may legitimately use.
  const markers = use.filter(isMarker);
  const signoffs = use.filter((u) => !isMarker(u) && isSignOff(u));
  const openers = use.filter((u) => !isMarker(u) && !isSignOff(u));
  return {
    use,
    markers,
    signoffs,
    openers,
    avoid: asArray(vp.avoid),
    rhythm: typeof vp.rhythm === "string" ? vp.rhythm : asArray(vp.rhythm).join(" "),
    notes: typeof vp.notes === "string" ? vp.notes : asArray(vp.notes).join(" "),
  };
}

/**
 * One voice DNA, matched to the deck language. is_primary is only a fallback:
 * writing an English deck against an Arabic profile is how the member's voice
 * was being lost in the first place.
 */
export function resolveVoice(
  voices: Array<Record<string, any>>,
  lang: "en" | "ar",
): Record<string, any> | null {
  if (!voices?.length) return null;
  const matched = voices.find((v) => String(v.language ?? "").toLowerCase().startsWith(lang));
  const primary = voices.find((v) => v.is_primary);
  const chosen = matched ?? primary ?? voices[0];
  console.log("[generate-deck] voice profile", JSON.stringify({
    deck_lang: lang,
    selected_language: chosen?.language ?? null,
    matched_on_language: Boolean(matched),
    is_primary: Boolean(chosen?.is_primary),
    example_posts: Array.isArray(chosen?.example_posts) ? chosen.example_posts.length : 0,
    use_phrases: vocab(chosen).use.length,
    avoid_rules: vocab(chosen).avoid.length,
  }));
  return chosen ?? null;
}

function examplePostText(p: unknown): string {
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const o = p as Record<string, any>;
    return String(o.content ?? o.text ?? o.post ?? o.body ?? "").trim();
  }
  return "";
}

/**
 * The requesting member's own signature, verbatim and unsummarised. Every value
 * here is read from that member's row at request time. Nothing about any
 * individual member is ever hardcoded in this file.
 *
 * `rhythmOnly` is set when the only profile on file is in another language: we
 * borrow the cadence, never the phrases, because phrases do not translate and
 * would read as a different person.
 */
export function voiceBlock(
  voice: Record<string, any> | null,
  rhythmOnly = false,
  scope: "slides" | "caption" = "slides",
): string {
  if (!voice) {
    return [
      "VOICE: this member has no voice profile yet.",
      "Write in a plain, concrete, non-promotional register drawn only from the material below:",
      "short declarative sentences, ordinary working words, no marketing lift, no house style,",
      "no invented personality. Say what the evidence says, in the fewest words that carry it.",
    ].join("\n");
  }
  const v = vocab(voice);
  if (rhythmOnly) {
    return [
      `VOICE: the only profile on file is in "${voice.language ?? "another language"}", and this deck is not in that language.`,
      "Take RHYTHM ONLY from it — sentence length, paragraph density, where the emphasis falls.",
      "Do NOT reuse any phrase, opener, marker or sign-off from it; they belong to the other language.",
      "",
      `RHYTHM: ${v.rhythm || "(not recorded)"}`,
      `TONE: ${String(voice.tone ?? "").trim() || "(not recorded)"}`,
      "",
      "STILL FORBIDDEN — the member's own avoid list applies in every language:",
      ...v.avoid.map((a) => `  - ${a}`),
    ].join("\n");
  }
  const examples = (Array.isArray(voice.example_posts) ? voice.example_posts : [])
    .map(examplePostText)
    .filter((t) => t.length > 80)
    .slice(0, 5);

  // Slides get connectives only. The caption may also close on a sign-off.
  // Markers never reach any model call, for slides or caption.
  const phrases = scope === "caption" ? [...v.openers, ...v.signoffs] : v.openers;
  const heading = scope === "caption"
    ? "THE MEMBER'S OWN CONSTRUCTIONS — connectives to open or frame a line with, and the closing statements they end a post on:"
    : [
        "THE MEMBER'S OWN CONNECTIVES — use these to BEGIN a sentence with, or to frame a contrast.",
        "They are NOT whole lines to reproduce. Never place one on a slide as the slide's entire content:",
      ].join("\n");

  return [
    `VOICE DNA — profile language "${voice.language ?? "unknown"}". This is the member's own signature. Follow it exactly.`,
    "",
    `TONE: ${String(voice.tone ?? "").trim() || "(not recorded)"}`,
    `RHYTHM: ${v.rhythm || "(not recorded)"}`,
    `NOTES: ${v.notes || "(not recorded)"}`,
    `PREFERRED STRUCTURES: ${JSON.stringify(voice.preferred_structures ?? "")}`,
    `STORYTELLING PATTERNS: ${JSON.stringify(voice.storytelling_patterns ?? "")}`,
    "",
    heading,
    ...phrases.map((u) => `  - ${u}`),
    "",
    "THE MEMBER NEVER WRITES THESE. Any of them in your output fails the deck:",
    ...v.avoid.map((a) => `  - ${a}`),
    "",
    "THE MEMBER'S ACTUAL POSTS — this is what they sound like. Match this register, sentence length and rhythm:",
    ...examples.map((e, i) => `--- example ${i + 1} ---\n${e.slice(0, 2200)}`),
  ].join("\n");
}

export function bareHandle(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/(?:linkedin\.com\/)?(?:in\/)?([A-Za-z0-9-]+)\/?$/);
  return m ? m[1] : "";
}

/**
 * A closing line, chosen from the requesting member's OWN `use` array.
 *
 * Structural only — no phrase, industry or person is named here. A sign-off is
 * a self-contained declarative statement: no bracketed slot to fill, no
 * trailing colon inviting a list, no question. If their profile carries an
 * explicit `sign_off`, that wins.
 */
export function pickSignOff(voice: Record<string, any> | null | undefined): string | null {
  const vp = (voice?.vocabulary_preferences ?? {}) as Record<string, any>;
  const explicit = typeof vp.sign_off === "string" ? vp.sign_off.trim() : "";
  if (explicit) return explicit;

  // Same shape test as the `signoffs` bucket — one definition, two call sites.
  return vocab(voice).signoffs[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Gateway                                                             */
/* ------------------------------------------------------------------ */

export async function callTool(
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

export function contextBlock(ctx: SignalContext): string {
  const s = ctx.signal;
  const out = [
    `SIGNAL: ${s.signal_title}`,
    `EXPLANATION: ${s.explanation ?? ""}`,
    `IMPLICATIONS: ${
      Array.isArray(s.strategic_implications)
        ? s.strategic_implications.join(" | ")
        : s.strategic_implications ?? ""
    }`,
    `THEMES: ${(s.theme_tags ?? []).join(", ")}`,
    `CONFIDENCE: ${s.confidence ?? ""}`,
  ];

  if (ctx.raw?.length) {
    out.push(
      "",
      "RAW MATERIAL — the member's own captures, in his own words, unedited. Take FACTS from here. Never copy the phrasing of the summaries below over these.",
      ...ctx.raw.map((e, i) =>
        `  [raw ${i + 1}${e.created_at ? ` · ${String(e.created_at).slice(0, 10)}` : ""}] ${e.title}: ${e.content}`
      ),
    );
  }

  out.push(
    "",
    "EVIDENCE FRAGMENTS — these are AI SUMMARIES, not the member's writing. Use them for facts only. Never borrow their wording; their register is not his.",
    ...ctx.evidence.map((e, i) => `  [summary ${i + 1}] ${e.title}: ${e.content}`),
  );
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Stage 2 — PLAN                                                      */
/* ------------------------------------------------------------------ */

export interface Plan {
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

export const PLAN_TOOL = {
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

export const PLAN_SYSTEM = `You judge what a strategic signal can carry in a slide deck. You do not write slides and you do not write prose.

hasNumber is true ONLY if a specific figure appears in the signal text or its evidence fragments. If the signal contains no number, hasNumber is false and numberValue is null. Inventing, estimating, or rounding a number from general knowledge is a failure.
numberSource must be quoted from the signal or a fragment, never from general knowledge.
hasComparison is true only if two or more comparable quantities appear in the material.
stepCount is how many distinct, non-obvious actions the material genuinely supports, between 0 and 7. Do not invent steps to reach a number.
lang is the language the deck should be written in.`;

export async function plan(ctx: SignalContext, forceLang?: "en" | "ar"): Promise<Plan> {
  // The studio's language control wins over the profile default. A member who
  // picks العربية gets an Arabic deck even when their profile says English.
  const langHint = forceLang ?? ((ctx.profile.content_language ?? "en") === "ar" ? "ar" : "en");
  const raw = await callTool(
    PLAN_SYSTEM,
    `${contextBlock(ctx)}\n\nWrite this deck in "${langHint}". Report lang as "${langHint}".`,
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
    lang: forceLang ?? (raw.lang === "ar" ? "ar" : "en"),
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
  // A comparison without at least two plotted quantities cannot become a chart.
  if (p.hasComparison && (p.comparisonSeries?.length ?? 0) < 2) {
    p.hasComparison = false;
    p.comparisonSeries = null;
  }
  console.log("[generate-deck] plan", JSON.stringify({
    hasNumber: p.hasNumber,
    hasComparison: p.hasComparison,
    series: p.comparisonSeries?.length ?? 0,
    stepCount: p.stepCount,
    lang: p.lang,
    evidence: ctx.evidence.length,
  }));
  return p;
}

/* ------------------------------------------------------------------ */
/* Stage 4 — WRITE                                                     */
/* ------------------------------------------------------------------ */

export const textNode = {
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

export const heroLine = {
  type: "object",
  properties: {
    runs: textNode.properties.runs,
    highlight: { type: "boolean" },
  },
  required: ["runs"],
};

export const WRITE_TOOL = {
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

export function writeSystem(): string {
  return `You write the content of a LinkedIn carousel for a senior operator. You fill ONLY the slots named in the manifest. You never choose slides, order, length, or layout.

THE ONE RULE ABOVE ALL OTHERS: take FACTS from the evidence, LANGUAGE from the member's own example posts. Never the reverse. The evidence fragments are machine summaries written by another model — their register is not the member's, and copying it is the exact failure you are here to prevent. If a sentence you are about to write could not appear in one of their example posts, delete it and write it again. If no example posts are supplied, write plainly and concretely and invent no personality.

- Every text node is { runs: [{ t, lang }] } — never a bare string. Put English technical terms inside an Arabic deck in their own run with lang "en" (AI, dashboard, KPI, ERP, API). That is what makes mixed text render correctly.
- Hero lines: at most 14 characters for English, 20 for Arabic, and at most 4 lines. Count every character including spaces: "Skin in the Game" is 16 and is therefore rejected; "Skin in Game" is 12 and passes. In English that is usually one or two short words per line. Exactly one line may carry highlight true. A longer line wraps and destroys the highlight block.
- Headline maximum 9 words. Body maximum 2 sentences per node; mark the last body node optional_tail true so the fit ladder may drop it losslessly.
- If the plan says hasNumber false, DO NOT emit stat_value on any slide. Say nothing rather than inventing a figure. A fabricated number is the single worst failure for this audience.
- If stat_value is present, source is mandatory and must come from the signal or its evidence, never from general knowledge.
- Never the words: thought leader, personal brand, game-changing, seamless, unlock, elevate, empower, utilize, facilitate, or leverage as a verb.
- Western digits only, in every language.
- No ellipsis anywhere.
- NO SYMBOL MARKERS ON A SLIDE. A slide is typography, not a text post. Hierarchy comes from the renderer — size, weight, colour and position. Emit no decorative glyphs, no bullet symbols, no arrows and no emoji of any kind inside any text node. A marker inside a paragraph is a rendering defect, not a style, and in a right-to-left paragraph it destroys the edge of the text block.
- THE QUOTE SLOT: a quote is ONE sharp line ABOUT THE SUBJECT, distilled from the member's raw captures or from the evidence. It is never a statement about the member, never a description of what they do for a living, never a sign-off, never a personal motto, and never attributed to a named person. If the material will not yield such a line, say the plainest true thing the evidence supports rather than reaching for something that sounds quotable.
- Every argument slide (frame, evidence, callout, steps, definition, quote, benchmark) must carry at least one concrete particular in the language you are writing: a named organisation, place, standard or programme, a number, or a first-person observation. A slide made only of abstractions fails. In an Arabic deck a Latin brand or standard name in its own lang "en" run counts, and so does a named entity introduced by its category word.
- Arabic hero lines are 20 characters INCLUDING spaces. Count them before you emit. Two short words is usually the maximum; split a third word onto its own line.

THE AI TELLS. Each of these fails the deck outright, so do not write them:
- "Stop X. Start Y." and every imperative antithesis of that shape.
- The openers "In today's landscape", "In an era of", "As we navigate", "It's no secret that", "In a world where".
- More than one three-item parallel list in the whole deck ("people, process and technology").
- Abstractions with no object: drive value, unlock potential, foundation for, key to success, critical enabler, robust framework, holistic approach, comprehensive strategy, strategic imperative, paradigm shift.
- Any sentence over 28 words.
- Any slide that could appear in any company's deck in any industry. Every substantive slide carries at least one of: a named organisation or place, a number, a first-person observation, or a term specific to this sector.

THE SPECIFICITY FLOOR. The deck as a whole must contain at least one concrete particular — a named place or organisation, a dated event, a sourced number, or a first-person observation taken from the member's own raw captures. A beautiful, empty deck is worse than no deck.

Do NOT emit chart data yourself. When the manifest contains a benchmark slide the chart is supplied deterministically from the plan; fill only its headline, hero_lines and source.

Each slide must carry exactly ONE emphasis: either a stat_value, or exactly one hero line with highlight true, or one chart series with emphasis "alert". Never two.`;
}

/* ------------------------------------------------------------------ */
/* Icons — chosen deterministically from the signal's own theme tags   */
/* ------------------------------------------------------------------ */

const ICON_RULES: Array<[RegExp, string]> = [
  [/water|desal|wastewater|sewer|hydro/i, "water"],
  [/energy|power|grid|electric|solar|renewab|carbon|emission/i, "energy"],
  [/data|analytic|\bai\b|digital|software|platform|sensor|meter/i, "data"],
  [/growth|revenue|market|commercial|sales|demand/i, "growth"],
  [/risk|threat|complian|regulat|security|govern/i, "risk"],
  [/people|talent|team|workforce|leader|customer|citizen/i, "people"],
  [/time|delay|schedul|deadline|lead time/i, "time"],
  [/cost|capital|invest|financ|budget|funding|tariff|price/i, "money"],
  [/network|ecosystem|partner|supply|integrat/i, "network"],
  [/operat|process|efficien|maintenance|asset|infrastructur/i, "gear"],
];

export function iconFor(tags: unknown, fallbackText: string, salt = 0): string {
  const corpus = `${Array.isArray(tags) ? tags.join(" ") : ""} ${fallbackText}`;
  const hits = ICON_RULES.filter(([re]) => re.test(corpus)).map(([, key]) => key);
  if (hits.length) return hits[salt % hits.length];
  return ["gear", "data", "network"][salt % 3];
}

/* ------------------------------------------------------------------ */
/* Stage 6 — CAPTION                                                   */
/* ------------------------------------------------------------------ */

const CAPTION_TOOL = {
  name: "emit_caption",
  description: "The LinkedIn post body that carries the deck.",
  parameters: {
    type: "object",
    properties: {
      lines: { type: "array", items: { type: "string" } },
      hashtags: { type: "array", items: { type: "string" } },
    },
    required: ["lines", "hashtags"],
  },
};

export async function writeCaption(
  ctx: SignalContext,
  p: Plan,
  deck: any,
): Promise<string> {
  const cover = deck?.slides?.[0]?.slots ?? {};
  const coverText = [
    ...(cover.hero_lines ?? []).map((l: any) => (l.runs ?? []).map((r: any) => r.t).join("")),
    (cover.subline?.runs ?? []).map((r: any) => r.t).join(""),
  ].join(" ");
  const closing = ((deck?.slides ?? [])
    .find((s: any) => s.archetype === "close")?.slots?.cta_pill?.runs ?? [])
    .map((r: any) => r.t).join("");
  const tags: string[] = Array.isArray(ctx.signal.theme_tags) ? ctx.signal.theme_tags : [];

  const v = vocab(ctx.voice);
  // A sign-off the member actually uses beats a closing question written by a
  // machine — but it must come from THEIR own `use` array. No literal from any
  // real person may ever appear here.
  const signOff = ctx.voiceRhythmOnly ? null : pickSignOff(ctx.voice);

  const system = `You write the post body that sits above a LinkedIn carousel. This is a LinkedIn post in its own right and it must sound exactly like the member's own posts — same rhythm, same phrase set, same sentence length. Take FACTS from the material below, LANGUAGE from their example posts. Never the reverse.

- Between 3 and 6 short lines, one thought per line, separated by single newlines.
- Set the deck up. NEVER repeat the cover wording; the reader can already see it.
${
    signOff
      ? `- End on the member's own sign-off, verbatim: "${signOff}". Do not modify it, do not add a question after it.`
      : `- The last line is exactly this closing question: "${closing || "What would you do first?"}".`
  }
- Plain, commercial, specific. No emojis. No ellipsis. Western digits.
- No "Stop X. Start Y." construction. No openers of the shape "In today's landscape", "In an era of", "As we navigate", "It's no secret that". No sentence over 28 words. At most one three-item list.
- Never the words: thought leader, personal brand, game-changing, seamless, unlock, elevate, empower, utilize, facilitate, or leverage as a verb.
- Write in ${p.lang === "ar" ? "Arabic" : "English"}.
- hashtags: exactly 3, drawn from the signal's themes, each a single CamelCase word with no spaces and no "#".`;

  try {
    const raw = await callTool(
      system,
      [
        voiceBlock(ctx.voice, ctx.voiceRhythmOnly, "caption"),
        "",
        contextBlock(ctx),
        "",
        `THE COVER ALREADY SAYS (do not repeat): ${coverText}`,
        "",
        `THEMES: ${tags.join(", ")}`,
      ].join("\n"),
      CAPTION_TOOL,
    );
    const lines: string[] = (Array.isArray(raw.lines) ? raw.lines : [])
      .map((l: unknown) => String(l).trim()).filter(Boolean).slice(0, 6);
    const hashtags: string[] = (Array.isArray(raw.hashtags) ? raw.hashtags : [])
      .map((h: unknown) => `#${String(h).replace(/[^A-Za-z0-9\u0600-\u06FF]/g, "")}`)
      .filter((h: string) => h.length > 2).slice(0, 3);
    if (!lines.length) return "";
    return [lines.join("\n"), hashtags.join(" ")].filter(Boolean).join("\n\n");
  } catch (e) {
    console.error("[generate-deck] caption failed:", String(e));
    return "";
  }
}

export function manifestBlock(manifest: ComposeResult): string {
  return manifest.slots
    .map((s) => {
      const req = REQUIRED_SLOTS[s.archetype].join(", ");
      const opt = OPTIONAL_SLOTS[s.archetype].join(", ") || "none";
      return `slide ${s.index} · archetype ${s.archetype} · role ${s.role}\n  required slots: ${req}\n  optional slots: ${opt}`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Stage 5b — SELF-CRITIQUE                                            */
/* ------------------------------------------------------------------ */

export interface CritiqueFlag {
  index: number;
  verdict: "member" | "generic";
  tell: string;
}

const CRITIQUE_TOOL = {
  name: "emit_verdicts",
  description: "One verdict per slide. No prose, no praise, no suggestions.",
  parameters: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            verdict: { type: "string", enum: ["member", "generic"] },
            tell: { type: "string" },
          },
          required: ["index", "verdict", "tell"],
        },
      },
    },
    required: ["verdicts"],
  },
};

/** Flatten a slide to the words a reader actually sees. */
export function slideText(slide: any): string {
  const out: string[] = [];
  const walk = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") {
      if (Array.isArray(v.runs)) { out.push(v.runs.map((r: any) => r?.t ?? "").join("")); return; }
      Object.values(v).forEach(walk);
      return;
    }
    if (typeof v === "string") out.push(v);
  };
  walk(slide?.slots ?? {});
  return out.filter(Boolean).join(" · ");
}

/**
 * One short call. Does each slide sound like the member's own posts, or like an
 * assistant? The judge names the tell; it never rewrites.
 */
export async function critique(ctx: SignalContext, deck: any): Promise<CritiqueFlag[]> {
  const v = vocab(ctx.voiceRhythmOnly ? { vocabulary_preferences: { avoid: vocab(ctx.voice).avoid } } : ctx.voice);
  const examples = (ctx.voiceRhythmOnly ? [] : Array.isArray(ctx.voice?.example_posts) ? ctx.voice!.example_posts : [])
    .map(examplePostText).filter((t: string) => t.length > 80).slice(0, 3);

  const system = `You are this member's editor. You know exactly how they write. For each slide, answer one question only: does this sound like their example posts, or like a generic AI assistant?

Verdict "generic" whenever the slide could have been written about any company in any industry, borrows the register of a machine-written summary, uses a construction this member never uses, or reaches for an abstraction with no object. Judge only against the material below — never against any other person's writing.
"tell" is the specific giveaway, quoted from the slide, in under 15 words. Never suggest a rewrite. Never praise.`;

  const user = [
    "THIS MEMBER NEVER WRITES:",
    ...v.avoid.slice(0, 40).map((a) => `  - ${a}`),
    "",
    // Connectives only. Sign-offs belong in the caption, markers nowhere.
    "THIS MEMBER'S OWN CONNECTIVES:",
    ...v.openers.map((u) => `  - ${u}`),
    "",
    ...examples.map((e: string, i: number) => `--- their post ${i + 1} ---\n${e.slice(0, 1400)}`),
    "",
    "THE DECK:",
    ...(deck?.slides ?? []).map((s: any) => `slide ${s.index} (${s.archetype}): ${slideText(s)}`),
  ].join("\n");

  try {
    const raw = await callTool(system, user, CRITIQUE_TOOL);
    const flags: CritiqueFlag[] = (Array.isArray(raw.verdicts) ? raw.verdicts : [])
      .map((x: any) => ({
        index: Number(x?.index),
        verdict: x?.verdict === "generic" ? "generic" : "member",
        tell: String(x?.tell ?? "").slice(0, 160),
      }))
      .filter((x: CritiqueFlag) => Number.isFinite(x.index));
    console.log("[generate-deck] critique", JSON.stringify(flags));
    return flags;
  } catch (e) {
    console.error("[generate-deck] critique failed:", String(e));
    return [];
  }
}

export async function writeSlides(
  ctx: SignalContext,
  p: Plan,
  manifest: ComposeResult,
  corrections: string[],
): Promise<any[]> {
  const src = typeof ctx.sourceText === "string" ? ctx.sourceText.trim() : "";
  const adaptation = src
    ? [
        `THE MEMBER'S APPROVED POST — this is the source of truth. Your job is to ADAPT it into slides, not to write something new:\n\n<<<\n${src}\n>>>`,
        "",
        "ADAPTATION DOCTRINE — it overrides any instruction to invent from the signal:",
        "1. SOURCE OF TRUTH is the approved post above. Take the WORDS and the VOICE from it. Do NOT introduce any claim, number, name, or line that is not already in the post. The evidence below may only VERIFY a number that is already in the post — never add new facts.",
        "2. ONE IDEA PER SLIDE. Split the post's argument into its distinct points; each point becomes one slide, in the post's own order.",
        "3. THE COVER carries the post's opening hook — the strongest line — as the hero line and headline. Keep the member's hook; do not invent a new one.",
        "4. EACH SLIDE EARNS THE NEXT: end a slide on a line that opens a small tension the next slide resolves. Sequence for momentum; do not merely chunk.",
        "5. SIMPLIFY WITHOUT LOSING VALUE: compress each point to its essential sentence, but KEEP the one concrete particular (the number or the name). If a line is over the hero-line budget, reshape it shorter — never drop the number to fit.",
        "6. PRESERVE VOICE: use the member's phrasing, connectives, and register from the post. Do not run a fresh voice pass that overwrites their words.",
        "7. THE CLOSE is the post's closing question or line.",
        "8. STAY IN THE POST'S LANGUAGE exactly — never translate. An Arabic post becomes an Arabic carousel in the member's own words.",
        "All existing budgets, banned vocabulary, number-integrity and AI-tell rules remain in force on the adapted text.",
        "",
      ].join("\n")
    : "";
  const user = [
    adaptation,
    voiceBlock(ctx.voice, ctx.voiceRhythmOnly),
    "",
    contextBlock(ctx),
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

export function stripEmpty(o: any): any {
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

export function assemble(
  ctx: SignalContext,
  p: Plan,
  manifest: ComposeResult,
  slides: any[],
  theme: string,
  deckId: string,
): unknown {
  const prof = ctx.profile;
  // Identity comes pre-resolved (override > LinkedIn > profile columns).
  const ident: any = (ctx as any).identity ?? {};
  const name = String(ident.name ?? "").trim()
    || [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim()
    || "Member";
  const title = [prof.level, prof.firm].filter(Boolean).join(", ");
  const handle = String(ident.handle ?? "").trim()
    || bareHandle(prof.linkedin_handle || prof.linkedin_url)
    || "member";
  const tn = (t: string) => ({ runs: [{ t, lang: /[\u0600-\u06FF]/.test(t) ? "ar" : "en" }] });

  const ordered = manifest.slots.map((slot, i) => {
    const found = slides.find((s) => Number(s?.index) === slot.index) ?? slides[i] ?? {};
    const built: any = {
      index: slot.index,
      archetype: slot.archetype,
      slots: stripEmpty(found.slots ?? {}),
    };
    // The model may not override the composed archetype.
    if (!p.hasNumber) delete built.slots.stat_value;

    // A benchmark slide EXISTS to hold a chart. The plan already produced the
    // series, so the chart is assembled deterministically rather than hoped for
    // from the model — a benchmark slide with no bars is a blank slide.
    if (slot.archetype === "benchmark") {
      const series = (p.comparisonSeries ?? []).slice(0, 5);
      if (series.length >= 2) {
        const peak = Math.max(...series.map((x) => Math.abs(Number(x.value) || 0)));
        built.slots.media = {
          kind: "chart",
          placement: "inline",
          chart: {
            type: "bars",
            series: series.map((x) => ({
              label: tn(String(x.label ?? "")),
              value: Number(x.value) || 0,
              ...(x.unit ? { unit: String(x.unit) } : {}),
              emphasis: Math.abs(Number(x.value) || 0) === peak ? "accent" : "none",
            })),
          },
        };
      } else if (built.slots.media?.kind === "chart") {
        delete built.slots.media;
      }
    } else if (
      (slot.archetype === "frame" || slot.archetype === "definition") &&
      !built.slots.media
    ) {
      // A mark, drawn from the signal's own themes. Never decoration for its
      // own sake, and never an emoji.
      built.slots.media = {
        kind: "icon",
        placement: "inline",
        src: `icon:${iconFor(ctx.signal.theme_tags, String(ctx.signal.signal_title ?? ""), slot.index)}`,
      };
    }
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
      name: { runs: [{ t: name, lang: /[\u0600-\u06FF]/.test(name) ? "ar" : "en" }] },
      ...(title ? { title: { runs: [{ t: title, lang: "en" }] } } : {}),
      handle,
      avatar_url: prof.avatar_url ?? null,
      avatar_cutout_url: prof.avatar_cutout_url ?? null,
    },
    slides: ordered,
  });
}

