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
  voice: Record<string, any> | null;
  profile: Record<string, any>;
}

export function bareHandle(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/(?:linkedin\.com\/)?(?:in\/)?([A-Za-z0-9-]+)\/?$/);
  return m ? m[1] : "";
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

- Every text node is { runs: [{ t, lang }] } — never a bare string. Put English technical terms inside an Arabic deck in their own run with lang "en" (AI, smart meter, dashboard, KPI, ERP, API). That is what makes mixed text render correctly.
- Hero lines: at most 14 characters for English, 20 for Arabic, and at most 4 lines. Count every character including spaces: "Skin in the Game" is 16 and is therefore rejected; "Skin in Game" is 12 and passes. In English that is usually one or two short words per line. Exactly one line may carry highlight true. A longer line wraps and destroys the highlight block.
- Headline maximum 9 words. Body maximum 2 sentences per node; mark the last body node optional_tail true so the fit ladder may drop it losslessly.
- If the plan says hasNumber false, DO NOT emit stat_value on any slide. Say nothing rather than inventing a figure. A fabricated number is the single worst failure for this audience.
- If stat_value is present, source is mandatory and must come from the signal or its evidence, never from general knowledge.
- Write in the member's voice using their voice profile. Contrarian, specific, commercial. Never the words: thought leader, personal brand, game-changing, seamless, unlock, elevate, empower, utilize, facilitate, or leverage as a verb.
- Western digits only, in every language.
- No ellipsis anywhere.

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

  const system = `You write the post body that sits above a LinkedIn carousel, in the member's own voice.

- Between 3 and 6 short lines, one thought per line, separated by single newlines.
- Set the deck up. NEVER repeat the cover wording; the reader can already see it.
- The last line is exactly this closing question: "${closing || "What would you do first?"}".
- Plain, commercial, specific. No emojis. No ellipsis. Western digits.
- Never the words: thought leader, personal brand, game-changing, seamless, unlock, elevate, empower, utilize, facilitate, or leverage as a verb.
- Write in ${p.lang === "ar" ? "Arabic" : "English"}.
- hashtags: exactly 3, drawn from the signal's themes, each a single CamelCase word with no spaces and no "#".`;

  try {
    const raw = await callTool(
      system,
      [contextBlock(ctx), "", `THE COVER ALREADY SAYS (do not repeat): ${coverText}`, "", `THEMES: ${tags.join(", ")}`].join("\n"),
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

export async function writeSlides(
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
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim() || "Member";
  const title = [prof.level, prof.firm].filter(Boolean).join(", ");
  const handle = bareHandle(prof.linkedin_handle || prof.linkedin_url) || "member";
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

