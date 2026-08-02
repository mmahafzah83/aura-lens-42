/**
 * DeckIR — the contract between the writer and the renderer.
 *
 * THE MODEL NEVER EMITS LAYOUT. It emits content that validates against this
 * schema; deterministic code composes and renders it. Every rule that can be
 * expressed in the schema is expressed here rather than left to prose.
 */
import { z } from "npm:zod@3.23.8";

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** Text is never a bare string. A run is the smallest bidi-isolatable unit. */
export const RunSchema = z.strictObject({
  t: z.string().min(1),
  lang: z.enum(["en", "ar"]),
});

export const TextNodeSchema = z.strictObject({
  runs: z.array(RunSchema).min(1),
  /** Signals the renderer may hang a trailing mark (dash, colon) off the line. */
  optional_tail: z.boolean().optional(),
});

/**
 * A hero line. `highlight` applies to the WHOLE line and never to a span
 * inside it — a highlight that wraps mid-phrase produces a ragged staircase
 * and an orphaned full stop.
 */
export const HeroLineSchema = z.strictObject({
  runs: z.array(RunSchema).min(1),
  highlight: z.boolean().optional(),
});

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export const ChartSeriesItemSchema = z.strictObject({
  label: TextNodeSchema,
  value: z.number(),
  unit: z.string().optional(),
  /** "accent" is the brand colour and is free; "alert" is red and costs the slide's one emphasis. */
  emphasis: z.enum(["none", "accent", "alert"]).optional(),
});

export const ChartSchema = z.strictObject({
  type: z.literal("bars"),
  series: z.array(ChartSeriesItemSchema).min(1),
});

export const MediaSchema = z.strictObject({
  kind: z.enum(["chart", "photo", "screenshot", "icon", "texture"]),
  placement: z.enum(["full", "lower", "side", "inline"]).optional(),
  src: z.string().optional(),
  /** Explicit null means "the member's own work". Absent is a failure (INV-15). */
  credit: z.string().nullable().optional(),
  chart: ChartSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

/** The nine implemented archetypes. Anything else falls through to a generic layout. */
export const ARCHETYPES = [
  "cover_hero",
  "cover_stat",
  "frame",
  "evidence",
  "benchmark",
  "quote",
  "steps",
  "definition",
  "close",
] as const;

export const ArchetypeSchema = z.enum(ARCHETYPES);

export const SlotsSchema = z.strictObject({
  chip: TextNodeSchema.optional(),
  hero_lines: z.array(HeroLineSchema).optional(),
  subline: TextNodeSchema.optional(),
  headline: TextNodeSchema.optional(),
  body: z.array(TextNodeSchema).max(3).optional(),
  /** Pre-formatted, western digits. The model never computes layout width from it. */
  stat_value: z.string().optional(),
  stat_label: TextNodeSchema.optional(),
  source: TextNodeSchema.optional(),
  callout_label: TextNodeSchema.optional(),
  callout_body: TextNodeSchema.optional(),
  quote: TextNodeSchema.optional(),
  checklist: z.array(TextNodeSchema).max(4).optional(),
  term: TextNodeSchema.optional(),
  term_def: TextNodeSchema.optional(),
  cta_pill: TextNodeSchema.optional(),
  media: MediaSchema.optional(),
});

export const SlideValidationSchema = z.strictObject({
  fits: z.boolean().optional(),
  notes: z.array(z.string()).optional(),
});

export const SlideSchema = z.strictObject({
  index: z.number().int().min(0),
  archetype: ArchetypeSchema,
  slots: SlotsSchema,
  validation: SlideValidationSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Profile and deck                                                    */
/* ------------------------------------------------------------------ */

export const ProfileSchema = z.strictObject({
  name: TextNodeSchema,
  title: TextNodeSchema.optional(),
  /** BARE handle — no "in/" prefix. The LinkedIn glyph replaces the prefix at render. */
  handle: z.string().regex(/^[a-zA-Z0-9-]+$/),
  avatar_url: z.string().nullable().optional(),
  avatar_cutout_url: z.string().nullable().optional(),
  initials: z.string().optional(),
});

export const QualitySchema = z.strictObject({
  score: z.number().optional(),
  notes: z.array(z.string()).optional(),
});

/**
 * Western digits in every language, Arabic included: bidi-safe, and it matches
 * how GCC executives write data. Not an option, not a two-member enum.
 */
export const NUMERALS = "western" as const;

export const DeckIRSchema = z.strictObject({
  deck_id: z.string().min(1),
  signal_id: z.string().min(1),
  primary_lang: z.enum(["en", "ar"]),
  dir: z.enum(["ltr", "rtl"]),
  numerals: z.literal("western"),
  theme: z.enum(["midnight", "clay", "gradient", "paper"]),
  length: z.union([z.literal(5), z.literal(7), z.literal(10)]),
  profile: ProfileSchema,
  slides: z.array(SlideSchema).min(1),
  quality: QualitySchema.optional(),
});

export type Run = z.infer<typeof RunSchema>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export type HeroLine = z.infer<typeof HeroLineSchema>;
export type ChartSeriesItem = z.infer<typeof ChartSeriesItemSchema>;
export type Chart = z.infer<typeof ChartSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type Archetype = (typeof ARCHETYPES)[number];
export type Slots = z.infer<typeof SlotsSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type DeckIR = z.infer<typeof DeckIRSchema>;
export type DeckLength = DeckIR["length"];

/** Flatten a text node to plain characters — for measuring and scanning only. */
export function plainText(node: { runs: Run[] } | undefined | null): string {
  if (!node) return "";
  return node.runs.map((r) => r.t).join("");
}