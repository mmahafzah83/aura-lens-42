type GroundingInput = {
  signal?: Record<string, unknown> | null;
  fragments?: Array<Record<string, unknown>> | null;
  provenanceRows?: Array<Record<string, unknown>> | null;
  context?: unknown;
  topic?: unknown;
};

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
};

const sourceQuote = (metadata: unknown): string => {
  if (!metadata || typeof metadata !== "object") return "";
  const quote = (metadata as Record<string, unknown>).source_quote;
  if (Array.isArray(quote)) return quote.map(asText).filter(Boolean).join(" ");
  return asText(quote);
};

const line = (label: string, value: unknown): string => {
  const text = asText(value).trim();
  return text ? `${label}: ${text}` : "";
};

/**
 * One canonical grounding string for the writer, judge and provenance guard.
 * It includes the full selected evidence, the full provenance chain, source
 * quotes, and the caller's context/topic so every number has one source of truth.
 */
export function buildGrounding({ signal, fragments, provenanceRows, context, topic }: GroundingInput): string {
  const parts: string[] = [];
  const sig = signal ?? null;
  if (sig) {
    const sigLines = [
      line("Title", sig.signal_title ?? sig.title),
      line("Explanation", sig.explanation),
      line("What it means", sig.what_it_means_for_you),
      line("Strategic implications", sig.strategic_implications),
    ].filter(Boolean);
    if (sigLines.length) parts.push(`SIGNAL\n${sigLines.join("\n")}`);
  }

  const fragmentLines = (fragments ?? [])
    .map((f, i) => {
      const lines = [
        line("Title", f.title),
        line("Content", f.content),
        line("Source quote", sourceQuote(f.metadata)),
      ].filter(Boolean);
      return lines.length ? `${i + 1}. ${lines.join("\n   ")}` : "";
    })
    .filter(Boolean);
  if (fragmentLines.length) parts.push(`EVIDENCE SELECTED\n${fragmentLines.join("\n")}`);

  const seen = new Set<string>();
  const provenanceLines = (provenanceRows ?? [])
    .map((f, i) => {
      const body = [asText(f.title), asText(f.content), sourceQuote(f.metadata)].join("\n").trim();
      const key = `${asText(f.id)}\n${body}`;
      if (!body || seen.has(key)) return "";
      seen.add(key);
      return `${i + 1}. ${[
        line("Title", f.title),
        line("Content", f.content),
        line("Source quote", sourceQuote(f.metadata)),
      ].filter(Boolean).join("\n   ")}`;
    })
    .filter(Boolean);
  if (provenanceLines.length) parts.push(`PROVENANCE CHAIN\n${provenanceLines.join("\n")}`);

  const topicLine = line("Topic", topic);
  const contextLine = line("Context", context);
  if (topicLine || contextLine) parts.push(`CALLER CONTEXT\n${[topicLine, contextLine].filter(Boolean).join("\n")}`);

  if (!parts.length) return "";
  return `GROUNDED EVIDENCE — this is the ONLY source you may draw facts and numbers from:\n\n${parts.join("\n\n")}\n\nIf this evidence contains no usable number, write the post WITHOUT a number.`;
}