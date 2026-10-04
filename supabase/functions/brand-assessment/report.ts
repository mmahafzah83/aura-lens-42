// Arabic full report: written once as structured data (record_report tool),
// then the server rebuilds the prose + ---JSON--- tail every reader expects.
import { arabicHardFail, arabicCorrectionText, repairValues } from "../_shared/arabicVoice.ts";

export const ARABIC_REPORT_OVERRIDE = "OUTPUT OVERRIDE FOR THIS RUN: do not write the prose sections and do not write ---JSON---. Record the report exactly once with the record_report tool. Each tool field carries the content of the section with the same meaning above, and obeys that section's rule and length: market_read = HOW THE MARKET SEES YOU (maximum 4 sentences, naming the primary archetype, and the secondary positioning style in its last sentence); trust_pattern = HOW YOU BUILD TRUST (1 sentence); natural_tone = YOUR NATURAL TONE (1 sentence); positioning_statement = YOUR ONE-LINER (exactly 3 sentences, first person); unique_capability = WHAT ONLY YOU CAN DO (2 to 3 sentences); the_gap = THE GAP (2 sentences with at least one real computed figure, or the single cannot-be-measured sentence); uncontested_space = THE SPACE NOBODY ELSE OWNS (2 sentences); topics = YOUR 3 TOPICS (3 items: title, and one sentence); invest_next = WHERE TO INVEST NEXT (2 items: area, and one insight sentence); honest_truth = THE HONEST TRUTH (maximum 3 sentences); own_words_quote and own_words_read = IN YOUR OWN WORDS (omit both fields if no post text was supplied). Every value is Arabic except own_words_quote, which stays verbatim in the language it was written in. primary_archetype and secondary_archetype follow the Arabic archetype rule, not 'The [Adjective] [Noun]'. Topic titles are what a decision-maker in the member's field would type in Arabic. The member's answers and capability names are supplied in English; read them, do not copy the English wording. Never write a bracketed placeholder.";

const s = { type: "string" };
export const RECORD_REPORT_TOOL = {
  name: "record_report",
  description: "Record the full positioning report once.",
  input_schema: {
    type: "object",
    properties: {
      primary_archetype: s, secondary_archetype: s, positioning_statement: s, market_read: s,
      trust_pattern: s, natural_tone: s, unique_capability: s, uncontested_space: s,
      the_gap: s, honest_truth: s, authority_style: s, voice_signature: s, key_barrier: s,
      topics: {
        type: "array", minItems: 3, maxItems: 3,
        items: { type: "object", properties: { title: s, description: s }, required: ["title", "description"] },
      },
      invest_next: {
        type: "array", minItems: 2, maxItems: 2,
        items: { type: "object", properties: { area: s, insight: s }, required: ["area", "insight"] },
      },
      growth_areas: { type: "array", minItems: 2, maxItems: 2, items: s },
      own_words_quote: s, own_words_read: s,
    },
    required: [
      "primary_archetype", "secondary_archetype", "positioning_statement", "market_read",
      "trust_pattern", "natural_tone", "unique_capability", "uncontested_space", "the_gap",
      "honest_truth", "authority_style", "voice_signature", "key_barrier", "topics",
      "invest_next", "growth_areas",
    ],
  },
};

export type Report = Record<string, any>;

/** Correction call is started only while under 70 s since the function began. */
export function retryAllowed(elapsedMs: number): boolean {
  return elapsedMs < 70_000;
}

const isBlank = (v: unknown) =>
  v == null || (typeof v === "string" && ["", "null", "none"].includes(v.trim().toLowerCase()));

/** Nullify empty optional fields, repair Arabic (not the quote), derive content_pillars. */
export function normaliseReport(input: Report): Report {
  const o: Report = { ...input };
  for (const k of ["own_words_quote", "own_words_read"]) if (isBlank(o[k])) o[k] = null;
  if (!o.own_words_quote) o.own_words_read = null;
  const first = (x: any, keys: string[]) => {
    for (const k of keys) if (typeof x?.[k] === "string" && x[k].trim()) return x[k].trim();
    return "";
  };
  if (Array.isArray(o.invest_next)) {
    o.invest_next = o.invest_next
      .map((i: any) => ({ area: first(i, ["area"]), insight: first(i, ["insight", "description", "text", "detail", "why"]) }))
      .filter((i: any) => i.area);
  }
  if (Array.isArray(o.topics)) {
    o.topics = o.topics.map((t: any) => ({
      title: first(t, ["title", "name", "area"]),
      description: first(t, ["description", "insight", "text", "detail", "why"]),
    }));
  }
  if (Array.isArray(o.growth_areas)) o.growth_areas = o.growth_areas.filter((g: unknown) => typeof g === "string" && g.trim());
  const r = repairValues(o, ["own_words_quote"]);
  r.content_pillars = Array.isArray(r.topics) ? r.topics.map((t: any) => String(t?.title ?? "")) : [];
  return r;
}

const PLACEHOLDER = (t: string) => /\[[^\]]{2,40}\]/.test(t) || /sector name/i.test(t) || /zone of genius/i.test(t);

const stringsOf = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(stringsOf) : v && typeof v === "object" ? Object.values(v).flatMap(stringsOf) : [];

/** Every failing check (names + correction lines). Empty = usable. */
export function reportChecks(
  report: Report | null,
  stopReason: string | null | undefined,
): { checks: string[]; message: string } {
  const checks: string[] = [];
  const lines: string[] = [];
  if (stopReason === "max_tokens") { checks.push("truncated_output"); lines.push("Failed check: truncated_output. The answer was cut off; keep every field to its stated length."); }
  if (!report) {
    checks.push("no_tool_result"); lines.push("Failed check: no_tool_result. Record the report with the record_report tool.");
    return { checks, message: "That was not usable. " + lines.join(" ") };
  }
  if (stringsOf(report).some(PLACEHOLDER)) { checks.push("placeholder"); lines.push("Failed check: placeholder. Remove every square bracket, the words \"sector name\" and \"zone of genius\"; name the sector explicitly."); }
  const d = arabicHardFail(report, { skipKeys: ["own_words_quote", "content_pillars"] });
  if (d) { checks.push(d.check); lines.push(arabicCorrectionText(d)); }
  const empty = ["primary_archetype", "market_read", "positioning_statement"].filter((k) => isBlank(report[k]));
  if (empty.length) { checks.push("empty_field"); lines.push(`Failed check: empty_field. Fill: ${empty.join(", ")}.`); }
  const nTopics = Array.isArray(report.topics) ? report.topics.filter((t: any) => t?.title).length : 0;
  if (nTopics < 3) { checks.push("topics_count"); lines.push("Failed check: topics_count. Give exactly 3 topics, each with a title and one sentence."); }
  const nInvest = Array.isArray(report.invest_next) ? report.invest_next.filter((i: any) => i?.area && i?.insight).length : 0;
  if (nInvest < 2) { checks.push("invest_count"); lines.push("Failed check: invest_count. Give exactly 2 invest_next items, each with an area and one insight sentence."); }
  return { checks, message: checks.length ? "That was not usable. " + lines.join(" ") : "" };
}

const JSON_KEYS = [
  "primary_archetype", "secondary_archetype", "positioning_statement", "market_read",
  "trust_pattern", "natural_tone", "unique_capability", "uncontested_space", "topics",
  "content_pillars", "invest_next", "honest_truth", "the_gap", "own_words_quote",
  "own_words_read", "authority_style", "voice_signature", "growth_areas", "key_barrier",
];

/** Prose with the eleven English marker headers, then ---JSON--- and the object. */
export function buildInterpretationFromReport(r: Report): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const topics = Array.isArray(r.topics) ? r.topics : [];
  const invest = Array.isArray(r.invest_next) ? r.invest_next : [];
  const sections: [string, string][] = [
    ["HOW THE MARKET SEES YOU", str(r.market_read)],
    ["HOW YOU BUILD TRUST", str(r.trust_pattern)],
    ["YOUR NATURAL TONE", str(r.natural_tone)],
    ["YOUR ONE-LINER", str(r.positioning_statement)],
    ["WHAT ONLY YOU CAN DO", str(r.unique_capability)],
    ["THE GAP", str(r.the_gap)],
    ["THE SPACE NOBODY ELSE OWNS", str(r.uncontested_space)],
    ["YOUR 3 TOPICS", topics.map((t: any) => `${str(t?.title)}: ${str(t?.description)}`).join("\n")],
    ["WHERE TO INVEST NEXT", invest.map((i: any) => `${str(i?.area)}: ${str(i?.insight)}`).join("\n")],
    ["THE HONEST TRUTH", str(r.honest_truth)],
  ];
  const quote = str(r.own_words_quote);
  if (quote) sections.push(["IN YOUR OWN WORDS", `«${quote}»\n${str(r.own_words_read)}`.trim()]);
  const obj: Report = {};
  for (const k of JSON_KEYS) obj[k] = r[k] ?? null;
  const prose = sections.map(([h, b]) => `${h}\n${b}`).join("\n\n");
  return `${prose}\n\n---JSON---\n${JSON.stringify(obj)}`;
}
