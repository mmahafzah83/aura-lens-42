/**
 * A voice rule must be OBSERVED, never inferred.
 *
 * The extractor used to write rules like "never uses emoji" from the mere
 * absence of emoji in six sampled posts — and the generator then enforced a
 * constraint the member does not hold. Absence of a thing in a sample is not
 * evidence that the member avoids it.
 *
 * So every entry in `vocabulary_preferences.avoid` / `.use` carries:
 *   - `evidence`  — the member's own sample text that supports the rule
 *   - `verified`  — whether that evidence exists
 *   - `contradictions` — how many times the member's saved edits have done the
 *     opposite. Three contradictions and the rule stops being enforced:
 *     observed behaviour outranks an inferred rule, always.
 *
 * Pure functions only, so the extractor, the generator and the backfill share
 * exactly one definition of what a rule is.
 */
import { conceptRegexOf } from "./voiceVocab.ts";

export interface VoiceRule {
  rule: string;
  evidence: string | null;
  verified: boolean;
  contradictions: number;
  [key: string]: unknown;
}

/** Three contradictions retire a rule. */
export const CONTRADICTION_LIMIT = 3;

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Any historical shape — bare string, {rule}, {text} — becomes one shape. */
export function toRule(entry: unknown): VoiceRule | null {
  if (typeof entry === "string") {
    const rule = clean(entry);
    return rule.length > 1 ? { rule, evidence: null, verified: false, contradictions: 0 } : null;
  }
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    const rule = clean(o.rule ?? o.text ?? "");
    if (rule.length < 2) return null;
    const evidence = typeof o.evidence === "string" && o.evidence.trim() ? clean(o.evidence) : null;
    const { rule: _r, text: _t, evidence: _e, verified: _v, contradictions: _c, ...rest } = o;
    return {
      ...rest,
      rule,
      evidence,
      // A rule is verified only when it actually carries evidence.
      verified: Boolean(evidence),
      contradictions: Number(o.contradictions) > 0 ? Math.floor(Number(o.contradictions)) : 0,
    };
  }
  return null;
}

export function toRules(input: unknown): VoiceRule[] {
  const out: VoiceRule[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input) ? input : []) {
    const r = toRule(raw);
    if (!r) continue;
    const key = r.rule.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export const ruleTexts = (rules: VoiceRule[]): string[] => rules.map((r) => r.rule);

const STOP = new Set([
  "avoid","avoids","avoiding","never","not","no","dont","does","do","use","uses","using",
  "the","a","an","and","or","of","to","in","on","for","with","without","that","this",
  "these","those","is","are","be","been","it","its","as","at","by","from","any","all",
  "language","words","word","phrases","phrase","style","such","like","too","very",
  "overly","more","most","your","you","their","them","they","we","our","writer","writes",
  "sentences","sentence","posts","post","tone","text","always","often","rarely",
]);

/** The distinctive words of a rule — what would actually be visible in a sample. */
function distinctiveTokens(rule: string): string[] {
  return [...new Set(
    rule.toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  )];
}

/** Phrases the rule quotes verbatim — the strongest possible evidence. */
function quotedPhrases(rule: string): string[] {
  const out: string[] = [];
  for (const m of rule.matchAll(/["“«'‘]([^"”»'’]{3,60})["”»'’]/g)) out.push(m[1].trim());
  return out;
}

/** The sentence of `sample` that contains `needle`, trimmed for storage. */
function evidenceSnippet(sample: string, needle: string): string {
  const text = String(sample ?? "");
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  const from = at < 0 ? 0 : Math.max(0, at - 60);
  return clean(text.slice(from, from + 200));
}

/**
 * Positive evidence for a `use` rule: the thing the rule describes is present
 * in the member's own writing.
 */
export function findUseEvidence(rule: string, samples: string[]): string | null {
  const texts = samples.map((s) => String(s ?? "")).filter((s) => s.trim().length > 0);
  if (texts.length === 0) return null;

  for (const phrase of quotedPhrases(rule)) {
    for (const t of texts) {
      if (t.toLowerCase().includes(phrase.toLowerCase())) return evidenceSnippet(t, phrase);
    }
  }
  const concept = conceptRegexOf(rule);
  if (concept) {
    for (const t of texts) {
      const m = t.match(concept);
      if (m) return evidenceSnippet(t, m[0]);
    }
  }
  const tokens = distinctiveTokens(rule);
  if (tokens.length === 0) return null;
  for (const t of texts) {
    const lower = t.toLowerCase();
    const hit = tokens.find((tok) => lower.includes(tok));
    if (hit) return evidenceSnippet(t, hit);
  }
  return null;
}

export interface EditPair { original: string; edited: string }

/**
 * Positive evidence for an `avoid` rule can only come from the member ACTING:
 * a pattern present in what Aura generated and gone from what the member saved.
 * Nothing else is evidence — a sample that simply lacks emoji says nothing
 * about whether the member avoids them.
 */
export function findAvoidEvidence(rule: string, edits: EditPair[]): string | null {
  const concept = conceptRegexOf(rule);
  const needles = [...quotedPhrases(rule), ...(concept ? [] : distinctiveTokens(rule))];
  for (const { original, edited } of edits) {
    const o = String(original ?? "");
    const e = String(edited ?? "");
    if (!o.trim() || !e.trim()) continue;
    if (concept) {
      const m = o.match(concept);
      if (m && !concept.test(e)) return `removed on edit: ${evidenceSnippet(o, m[0])}`;
      continue;
    }
    for (const n of needles) {
      if (n.length < 4) continue;
      if (o.toLowerCase().includes(n.toLowerCase()) && !e.toLowerCase().includes(n.toLowerCase())) {
        return `removed on edit: ${evidenceSnippet(o, n)}`;
      }
    }
  }
  return null;
}

/**
 * A member's saved edit that DOES the thing an avoid rule bans, or drops the
 * thing a use rule requires, contradicts that rule.
 */
export function countContradictions(
  rule: VoiceRule,
  kind: "avoid" | "use",
  edits: EditPair[],
): number {
  const concept = conceptRegexOf(rule.rule);
  const needles = concept ? [] : [...quotedPhrases(rule.rule), ...distinctiveTokens(rule.rule)];
  let hits = 0;
  for (const { original, edited } of edits) {
    const e = String(edited ?? "");
    if (!e.trim()) continue;
    const present = concept
      ? concept.test(e)
      : needles.some((n) => n.length >= 4 && e.toLowerCase().includes(n.toLowerCase()));
    // The member kept doing the banned thing in text they themselves saved.
    if (kind === "avoid" && present) hits++;
    // A `use` rule is only contradicted where the member removed the pattern.
    if (kind === "use" && !present) {
      const o = String(original ?? "");
      const wasThere = concept
        ? concept.test(o)
        : needles.some((n) => n.length >= 4 && o.toLowerCase().includes(n.toLowerCase()));
      if (wasThere) hits++;
    }
  }
  return hits;
}

/** Apply a fresh reading of the member's edits to a stored rule list. */
export function applyContradictions(
  rules: VoiceRule[],
  kind: "avoid" | "use",
  edits: EditPair[],
): VoiceRule[] {
  if (edits.length === 0) return rules;
  return rules.map((r) => ({
    ...r,
    contradictions: Math.max(r.contradictions, countContradictions(r, kind, edits)),
  }));
}

/**
 * Candidate rules from an extraction, kept only where the member's own material
 * supports them. An unsupported candidate is discarded, never written.
 */
export function verifyCandidates(
  candidates: unknown,
  kind: "avoid" | "use",
  samples: string[],
  edits: EditPair[],
): VoiceRule[] {
  const out: VoiceRule[] = [];
  for (const raw of toRules(candidates)) {
    const evidence = kind === "use"
      ? findUseEvidence(raw.rule, samples)
      : findAvoidEvidence(raw.rule, edits);
    if (!evidence) continue;
    out.push({ ...raw, evidence, verified: true });
  }
  return out;
}

/**
 * What the generator is allowed to say. A verified rule is a constraint; an
 * unverified one is guidance the model may set aside; a rule the member has
 * contradicted three times is not mentioned at all.
 */
export function splitForPrompt(input: unknown): { hard: string[]; soft: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  for (const r of toRules(input)) {
    if (r.contradictions >= CONTRADICTION_LIMIT) continue;
    (r.verified ? hard : soft).push(r.rule);
  }
  return { hard, soft };
}

/** Every rule still in force, whatever its strength. */
export function activeRuleTexts(input: unknown): string[] {
  const { hard, soft } = splitForPrompt(input);
  return [...hard, ...soft];
}

/** Only rules strong enough to be enforced mechanically after generation. */
export function enforcedRuleTexts(input: unknown): string[] {
  return splitForPrompt(input).hard;
}
