/**
 * Generation metadata for every post Aura writes.
 *
 * The repetition machinery can only see patterns it was told about, so a
 * generated row must always carry how it opened, how it closed, the position
 * it took and what kind of piece it is. Nothing here is optional: when a
 * value can't be read from the text we write "unspecified" so coverage stays
 * auditable rather than silently null.
 */

export const UNSPECIFIED = "unspecified";

const firstLine = (text: string) =>
  text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";

const lastLine = (text: string) => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
};

/** How the piece opens. */
export function hookStyleOf(text: string): string {
  const line = firstLine(text || "");
  if (!line) return UNSPECIFIED;
  if (/[?؟]\s*$/.test(line)) return "question";
  if (/\d+\s*%|\d[\d,.]{2,}|\b\d+x\b/i.test(line)) return "statistic";
  if (/^["“«]/.test(line)) return "quote";
  if (/\b(I|my|we|our|أنا|كنت)\b/.test(line) && /\b(was|were|had|remember|كنت|حين)\b/i.test(line)) return "story";
  if (/\b(most|everyone|nobody|stop|forget|wrong|myth|لا أحد|توقف)\b/i.test(line)) return "contrarian";
  return "statement";
}

/** How the piece closes. */
export function endingTypeOf(text: string): string {
  const line = lastLine(text || "");
  if (!line) return UNSPECIFIED;
  if (/[?؟]\s*$/.test(line)) return "question";
  if (/\b(comment|share|follow|dm|message me|let me know|tell me|شاركني|تابعني|علّق)\b/i.test(line)) return "call_to_action";
  if (/\b(lesson|takeaway|that'?s why|in short|الخلاصة|الدرس)\b/i.test(line)) return "takeaway";
  return "reflection";
}

/** The position the piece takes. */
export function stanceOf(text: string): string {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return UNSPECIFIED;
  if (/\b(disagree|myth|wrong|isn'?t true|contrary|stop believing)\b/.test(t)) return "contrarian";
  if (/\b(caution|risk|careful|beware|danger|warning)\b/.test(t)) return "cautionary";
  if (/\b(should|must|recommend|do this|start|adopt)\b/.test(t)) return "advocacy";
  if (/\b(i learned|i realised|i realized|my experience|when i)\b/.test(t)) return "personal";
  return "analysis";
}

export interface GenerationMetadata {
  hook_style: string;
  ending_type: string;
  stance: string;
  content_type: string;
  original_generated_text: string;
  source_signal_id: string | null;
}

/**
 * The full metadata block for an `aura_generated` insert. Spread this into
 * every such insert; `originalText` is the text as generated, before any edit.
 */
export function generationMetadata(
  originalText: string,
  opts: { contentType?: string | null; signalId?: string | null } = {},
): GenerationMetadata {
  const text = String(originalText ?? "");
  return {
    hook_style: hookStyleOf(text),
    ending_type: endingTypeOf(text),
    stance: stanceOf(text),
    content_type: (opts.contentType ?? "").trim() || "post",
    original_generated_text: text,
    source_signal_id: opts.signalId || null,
  };
}
