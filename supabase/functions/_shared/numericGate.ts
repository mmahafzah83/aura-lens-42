/**
 * THE NUMERIC GATE — no figure may leave the Desk that was not handed to it.
 *
 * The same defect kept returning in new costumes: "213% engagement", "205
 * published", "40 items match Neom", invented engagement rates. Prompt rules
 * did not hold it, because a plausible number is free to a language model.
 * So the rule is enforced in code, after generation and before the member.
 *
 * An allowlist of permitted numeric strings is assembled for each turn from
 * everything the Desk was actually handed: the counted account facts, every
 * tool result, the retrieved sources, and the member's own message. The answer
 * is then scanned. A figure that is not on the list is not a fact — the model
 * is re-asked once, naming the exact violation, and if it offends again the
 * sentence carrying the figure is dropped.
 *
 * Quantity words ("most", "the majority", "a handful") are figures too when
 * they describe his record: they assert a count without printing one.
 */

/** Arabic-Indic and Eastern Arabic digits read as the same figure. */
export function toWestern(s: string): string {
  return String(s ?? "").replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const c = d.codePointAt(0)!;
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/** Every comparable form of one numeric token: 4.5 → "4.5", "45", "4,5". */
function variants(raw: string): string[] {
  const bare = raw.replace(/[\s,]/g, "").replace(/\.$/, "");
  if (!bare) return [];
  const out = [bare, bare.replace(/\./g, "")];
  const n = Number(bare);
  if (Number.isFinite(n)) {
    out.push(String(n));
    // A rate written 2.13 is the same claim as 2.1 when rounded in prose.
    if (!Number.isInteger(n)) out.push(n.toFixed(1), n.toFixed(0), String(Math.round(n)));
  }
  return out;
}

/** Build the permitted set from every string the Desk was handed this turn. */
export function buildNumberAllowlist(handed: (string | null | undefined)[]): Set<string> {
  const allow = new Set<string>();
  for (const chunk of handed) {
    const src = toWestern(String(chunk ?? ""));
    for (const m of src.matchAll(/\d[\d,._]*/g)) {
      for (const v of variants(m[0])) allow.add(v);
    }
  }
  // Trivially safe: the small counts prose uses structurally, and the clock of
  // the current year. Neither is ever a claim about his record.
  for (let i = 0; i <= 12; i++) allow.add(String(i));
  const y = new Date().getUTCFullYear();
  for (const yr of [y - 1, y, y + 1]) allow.add(String(yr));
  return allow;
}

/** Quantity claimed in words. Only counts when it describes his own record. */
const QUANTITY_WORDS =
  /\b(most|the majority|majority of|a handful|handful of|several|numerous|many of|nearly all|almost all|the bulk of|a fraction of|dozens?|hundreds?|thousands?)\b/i;
const RECORD_WORDS =
  /\b(post|posts|draft|drafts|capture|captures|signal|signals|pillar|pillars|document|documents|entr(?:y|ies)|published|record|library|vault)\b/i;

/** A numeral that is furniture, not a claim. */
function isFurniture(match: string, index: number, text: string): boolean {
  // A citation reference: [3] or [S-101].
  const before = text.slice(Math.max(0, index - 3), index);
  const after = text.slice(index + match.length, index + match.length + 2);
  if (/\[$|S-$|\[S-$/.test(before) && /^\]?/.test(after)) return true;
  // A line-leading list marker: "1." or "2)".
  const lineStart = text.lastIndexOf("\n", index) + 1;
  if (!text.slice(lineStart, index).trim() && /^\d{1,2}\s*[.)-]/.test(text.slice(index))) return true;
  return false;
}

export interface Violation {
  /** Exactly as it appeared, so the retry can name it back to the model. */
  figure: string;
  kind: "numeral" | "quantity_word";
}

const SENTENCE_SPLIT = /(?<=[.!?؟…])\s+/;

/** Split into sentences, keeping line structure so nothing is re-flowed. */
function sentencesOf(text: string): { line: number; sentence: string }[] {
  const out: { line: number; sentence: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const s of line.split(SENTENCE_SPLIT)) if (s.trim()) out.push({ line: i, sentence: s });
  });
  return out;
}

/** Every figure in `answer` that the allowlist cannot account for. */
export function findForeignFigures(answer: string, allow: Set<string>): Violation[] {
  const text = String(answer ?? "");
  const found: Violation[] = [];
  const seen = new Set<string>();
  const west = toWestern(text);

  for (const m of west.matchAll(/\d[\d,._]*%?/g)) {
    const raw = m[0];
    const index = m.index ?? 0;
    if (isFurniture(raw, index, west)) continue;
    const stripped = raw.replace(/%$/, "");
    const ok = variants(stripped).some((v) => allow.has(v));
    if (ok) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    found.push({ figure: raw, kind: "numeral" });
  }

  // A quantity word standing in for a count of his own record.
  for (const { sentence } of sentencesOf(text)) {
    const q = sentence.match(QUANTITY_WORDS);
    if (!q) continue;
    if (!RECORD_WORDS.test(sentence)) continue;
    const word = q[0].toLowerCase();
    if (seen.has(word)) continue;
    seen.add(word);
    found.push({ figure: q[0], kind: "quantity_word" });
  }

  return found;
}

/** The instruction handed back to the model on the single retry. */
export function retryInstruction(violations: Violation[]): string {
  const lines = violations.map((v) =>
    v.kind === "numeral"
      ? `You used ${v.figure} which is not in the facts. Restate without it.`
      : `You said "${v.figure}" about his record without a count to back it. Restate without it, or use a counted figure from the facts.`,
  );
  return `${lines.join("\n")}\nRewrite your whole answer. Keep the same layers and the same language. Use only figures that appear in YOUR ACCOUNT, IN FACTS or in a tool result from this turn. If you need a figure you do not have, say you cannot see it.`;
}

export interface GateOutcome {
  text: string;
  dropped: Violation[];
}

/**
 * Last resort: remove every sentence carrying a figure that is still foreign.
 * Nothing is cut mid-sentence, and the layer markers are never dropped.
 */
export function dropOffendingSentences(answer: string, allow: Set<string>): GateOutcome {
  const dropped: Violation[] = [];
  const lines = String(answer ?? "").split("\n").map((line) => {
    if (/^§§/.test(line.trim())) return line;
    const bad = findForeignFigures(line, allow);
    if (bad.length === 0) return line;
    const kept = line.split(SENTENCE_SPLIT).filter((s) => {
      const v = findForeignFigures(s, allow);
      if (v.length === 0) return true;
      dropped.push(...v);
      return false;
    });
    return kept.join(" ").replace(/\s{2,}/g, " ").trim();
  });
  const text = lines
    .filter((l, i, all) => l.trim().length > 0 || (i > 0 && all[i - 1].trim().length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, dropped };
}
