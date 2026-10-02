/**
 * Assessment answers are stored by stable code, never by what is displayed.
 *
 * `toCoded` records what the member chose as option `value`s keyed by the
 * question's id. `toLegacyEnglish` rebuilds the legacy
 * `brand_assessment_answers` entry from those codes and the canonical English
 * question row, so the legacy object can never change with the display
 * language. Both are pure.
 */

export interface CanonicalQuestion {
  id: string;
  position: number;
  framework: string | null;
  kind: string;
  band: string | null;
  instrument_version: number | null;
  /** Canonical English prompt from onboarding_questions. */
  prompt: string;
  /** Canonical English labels from onboarding_questions. */
  options: { label: string; value: string }[] | null;
}

/** Reserved code for the "None of these fit" button. */
export const NONE_CODE = "__none__";
export const NONE_LABEL_EN = "None of these fit";

export interface CodedAnswer {
  position: number;
  framework: string | null;
  kind: string;
  band: string | null;
  instrument_version: number | null;
  values: string[];
  text: string | null;
  proposed: { chosen: string; rejected: string[] } | null;
  answered_lang: "en" | "ar";
  answered_at: string;
}

export type CodedAnswers = Record<string, CodedAnswer>;

export interface AnswerInput {
  values?: string[];
  text?: string | null;
  proposed?: { chosen: string; rejected: string[] } | null;
  lang: "en" | "ar";
  at?: string;
}

export function toCoded(q: CanonicalQuestion, input: AnswerInput): CodedAnswer {
  return {
    position: q.position,
    framework: q.framework ?? null,
    kind: q.kind,
    band: q.band ?? null,
    instrument_version: q.instrument_version ?? null,
    values: [...(input.values ?? [])],
    text: input.text ?? null,
    proposed: input.proposed ?? null,
    answered_lang: input.lang,
    answered_at: input.at ?? new Date().toISOString(),
  };
}

/** The legacy key: `Q${n} ${canonical English prompt}`. */
export function legacyKey(n: number, q: CanonicalQuestion): string {
  return `Q${n} ${q.prompt}`;
}

/** The legacy value, in exactly today's format. */
export function toLegacyEnglish(q: CanonicalQuestion, a: CodedAnswer): string {
  if (a.proposed) {
    const { chosen, rejected } = a.proposed;
    return `${chosen}${rejected.length ? ` (not: ${rejected.join(", ")})` : ""}`;
  }
  if (a.values.length === 0) return a.text ?? "";
  const byValue = new Map((q.options ?? []).map((o) => [o.value, o.label]));
  return a.values
    .map((v) => (v === NONE_CODE ? NONE_LABEL_EN : byValue.get(v) ?? ""))
    .filter(Boolean)
    .join(" · ");
}
