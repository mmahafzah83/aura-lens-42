/**
 * SMART PLACEHOLDERS — built from what Aura already read, never from a template.
 *
 * They are suggestions in grey. They are never submitted, and they clear the
 * moment the member types. If nothing was read, a neutral prompt stands in.
 */
import type { ProfileFacts } from "@/lib/profileFacts";

const NEUTRAL = [
  "e.g. the thing you keep saying that nobody acts on",
  "e.g. what most people in your field get wrong",
  "e.g. the part of the work that decides the outcome",
];

const clean = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A short subject word from the headline — "transformation", "procurement". */
const subjectFrom = (headline: string): string | null => {
  const words = clean(headline)
    .replace(/[|·,]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 6 && !/^(director|manager|founder|partner|officer|advisor|consultant|executive|leadership)$/.test(w));
  return words[0] ?? null;
};

export function smartPlaceholders(
  facts: ProfileFacts | null,
  sector: string | null,
  headline: string | null,
): string[] {
  const out: string[] = [];
  const skill = facts?.topSkills?.[0] ? clean(facts.topSkills[0]) : null;
  const skill2 = facts?.topSkills?.[1] ? clean(facts.topSkills[1]) : null;
  const subject = headline ? subjectFrom(headline) : null;
  const field = sector ? clean(sector) : null;

  if (subject) out.push(`e.g. why ${subject} programmes stall after month six`);
  if (skill) out.push(`e.g. most ${field ?? "teams"} treat ${skill} as a step, not a decision`);
  if (skill2) out.push(`e.g. what ${skill2} actually costs when it is done late`);
  if (field && out.length < 3) out.push(`e.g. the thing everyone in ${field} says and nobody funds`);

  for (const n of NEUTRAL) { if (out.length >= 3) break; out.push(n); }
  return out.slice(0, 3);
}
