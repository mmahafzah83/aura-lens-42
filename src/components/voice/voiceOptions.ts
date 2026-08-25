import { MOVES, MOVE_IDS } from "@/constants/moves";
/**
 * Curated option sets for the Voice & Writing tab.
 *
 * Every single-choice dimension is a pick, never free text: members do not
 * know the vocabulary, and free text produced unusable values. Each option
 * carries a worked example written in the register of a senior GCC executive —
 * the example is the teaching.
 */

export interface VoiceOption {
  id: string;
  label: string;
  example: string;
}

export const TONE_OPTIONS: VoiceOption[] = [
  { id: "blunt_practitioner", label: "Blunt practitioner", example: "We ran the pilot for nine months. It failed on data quality, not on the model. Everyone knew by week three." },
  { id: "warm_mentor", label: "Warm mentor", example: "The team that shipped it had never touched a utility billing system. That is exactly why it worked — and here is what I would tell them again." },
  { id: "cool_analyst", label: "Cool analyst", example: "Across eleven GCC utilities, the ones that cut outage time were not the ones with the largest AI budget. They were the ones that fixed their asset register first." },
  { id: "provocateur", label: "Provocateur", example: "Most boards in this region are not funding transformation. They are funding a slide deck with a two-year runway." },
];

export const RHYTHM_OPTIONS: VoiceOption[] = [
  { id: "clipped", label: "Clipped", example: "The pilot worked. The rollout did not. Same model. Different data." },
  { id: "balanced", label: "Balanced", example: "The pilot worked and the rollout did not, and the difference was never the model — it was the data we fed it in production." },
  { id: "flowing", label: "Flowing", example: "The pilot worked, the rollout did not, and once we traced it back through six months of readings it became obvious that the model had never been the constraint — the production data was, and nobody owned it." },
];

export const EMOJI_OPTIONS: VoiceOption[] = [
  { id: "none", label: "None", example: "Three regulators moved this quarter. Only one of them told the market why." },
  { id: "rare", label: "Minimal", example: "Three regulators moved this quarter. Only one told the market why." },
  { id: "some", label: "Frequent", example: "Three regulators moved this quarter. Only one told the market why. The rest are still drafting." },
];

export const LANGUAGE_OPTIONS: VoiceOption[] = [
  { id: "en", label: "English", example: "The UAE regulated agentic AI before most utilities finished their data strategy." },
  { id: "ar", label: "العربية", example: "نظّمت الإمارات الذكاء الاصطناعي الوكيل قبل أن تُنهي معظم المرافق استراتيجيتها للبيانات." },
  { id: "mixed", label: "Mixed 50-50", example: "نظّمت الإمارات الذكاء الاصطناعي الوكيل — and most utilities are still drafting a data strategy." },
];

export const STRUCTURE_OPTIONS: VoiceOption[] = [
  { id: "tension_insight", label: "Tension → insight", example: "Everyone budgeted for the model. Nobody budgeted for the meter data. That gap is where the eighteen months went." },
  { id: "claim_three_proofs", label: "Claim → 3 proofs", example: "AI value in utilities is an operations problem. One: the asset register. Two: the outage log. Three: the field crew schedule." },
  { id: "story_lesson", label: "Story → lesson", example: "A control room supervisor overrode the model every night for a month. He was right every time. We had trained it on the wrong shift." },
];

export const OPENER_OPTIONS: VoiceOption[] = [
  { id: "claim", label: "A claim they will argue with", example: "Seventy percent of AI value in this region has nothing to do with the software." },
  { id: "number", label: "Number first", example: "Eleven utilities. Four years of data. One consistent predictor of failure." },
  { id: "story", label: "Short story", example: "The night the model went live, the supervisor turned it off." },
  { id: "question", label: "Uncomfortable question", example: "Who in your organisation actually owns the data the model runs on?" },
];

export const CLOSER_OPTIONS: VoiceOption[] = [
  { id: "question", label: "Uncomfortable question", example: "So who signs off when the model is wrong at 2am?" },
  { id: "suspended", label: "Suspended sentence", example: "And that is the part nobody put in the business case." },
  { id: "reframe", label: "Reframe", example: "This was never an AI programme. It was an asset-data programme wearing a better name." },
  { id: "equation", label: "Equation", example: "Clean asset register + owned data + one accountable executive = a model worth funding." },
];

/** Curated libraries for the ordered list dimensions. */
export const OPENER_LIBRARY: string[] = OPENER_OPTIONS.map((o) => o.label).concat([
  "Contrarian observation from the field",
  "A number the market got wrong",
  "One line of dialogue from a meeting",
  "What the report did not say",
]);

export const CLOSER_LIBRARY: string[] = CLOSER_OPTIONS.map((o) => o.label).concat([
  "A single instruction",
  "The cost of doing nothing",
  "One sentence naming the next decision",
  "Close on a figure",
]);

/**
 * THE CLOSER ROUND-TRIP.
 *
 * `allowed_endings` is a CONTROLLED column: the writer only understands six
 * ending keys. This screen shows human labels, and for months it wrote those
 * labels straight into the column, where the writer's own filter dropped every
 * one of them — the member picked closers and nothing changed. Labels are
 * translated to keys on the way in and back to labels on the way out, so a
 * choice made here survives the round trip.
 */
export const CLOSER_KEY_BY_LABEL: Record<string, string> = {
  "Uncomfortable question": "question",
  "Suspended sentence": "hanging_line",
  "Reframe": "reframe",
  "Equation": "equation",
  "A single instruction": "signature",
  "One sentence naming the next decision": "signature",
  "The cost of doing nothing": "reframe",
  "Close on a figure": "number",
};

export const CLOSER_LABEL_BY_KEY: Record<string, string> = {
  question: "Uncomfortable question",
  hanging_line: "Suspended sentence",
  reframe: "Reframe",
  equation: "Equation",
  signature: "A single instruction",
  number: "Close on a figure",
};

/** Labels (or already-stored keys) in — controlled ending keys out, deduplicated. */
export function closerKeysFromLabels(labels: string[]): string[] {
  const out: string[] = [];
  for (const raw of labels ?? []) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const key = CLOSER_LABEL_BY_KEY[v] ? v : CLOSER_KEY_BY_LABEL[v];
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Stored keys out of the column, back to the labels this screen shows. */
export function closerLabelsFromKeys(keys: string[]): string[] {
  const out: string[] = [];
  for (const raw of keys ?? []) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const label = CLOSER_LABEL_BY_KEY[v] ?? (CLOSER_KEY_BY_LABEL[v] ? v : "");
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * ONE table of moves. This used to be a free-text list maintained here, in
 * `POST_TYPE_INSTRUCTIONS_EN` and in `FRAMEWORK_PROMPTS` — three answers to the
 * same question. It now derives from the mirrored MOVES table, which the
 * vocabulary gate holds character-identical to its Deno twin.
 */
export const MOVES_LIBRARY: string[] = MOVE_IDS.map((id) => MOVES[id].label_en);

export const MOVES_LIBRARY_AR: string[] = MOVE_IDS.map((id) => MOVES[id].label_ar);

export const optionLabel = (opts: VoiceOption[], id: string): string =>
  opts.find((o) => o.id === id)?.label ?? "";

export const optionExample = (opts: VoiceOption[], id: string): string =>
  opts.find((o) => o.id === id)?.example ?? "";
