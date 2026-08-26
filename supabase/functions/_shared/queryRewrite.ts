/**
 * Turn a conversational follow-up into a standalone search query.
 *
 * "and what about the risks?" carries no subject. Searched raw, it returns
 * noise. This helper carries the subject forward from the recent turns.
 *
 * Cheap path first: a message that already stands on its own is returned
 * unchanged, with no model call. Every failure path returns the raw message —
 * a rewrite must never block or break a chat turn.
 */

export interface ChatTurn {
  role: string;
  content: string;
}

export interface RewriteResult {
  query: string;
  rewritten: boolean;
  original: string;
}

export interface RewriteOptions {
  /** Structured logging tag: which function asked. */
  caller: string;
  /** Hard cap on the whole rewrite attempt. */
  timeoutMs?: number;
}

const SELF_CONTAINED_CHARS = 60;
const MAX_TURNS = 3;
const HARD_TIMEOUT_MS = 4000;

const SYSTEM_PROMPT =
  "Rewrite the user's latest message as a standalone search query that carries forward any subject, company, document or topic from the recent conversation. Output ONLY the query, no quotes, no explanation, maximum 25 words.";

function warn(caller: string, reason: string, error?: unknown): void {
  console.warn(
    JSON.stringify({
      stage: "query_rewrite",
      caller,
      reason,
      error: error ? ((error as Error)?.message ?? String(error)) : undefined,
    }),
  );
}

export async function buildSearchQuery(
  messages: ChatTurn[],
  opts: RewriteOptions,
): Promise<RewriteResult> {
  const list = Array.isArray(messages) ? messages : [];
  const original =
    [...list].reverse().find((m) => m?.role === "user")?.content?.toString() ?? "";

  // Cheap path: already a standalone question.
  if (original.trim().length > SELF_CONTAINED_CHARS) {
    return { query: original, rewritten: false, original };
  }
  if (!original.trim()) {
    return { query: original, rewritten: false, original };
  }

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    warn(opts.caller, "no_api_key");
    return { query: original, rewritten: false, original };
  }

  // Last up-to-3 turns of context, newest message excluded from the history.
  const history = list.slice(0, -1).slice(-MAX_TURNS)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? HARD_TIMEOUT_MS);

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 60,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Recent conversation:\n${history || "—"}\n\nLatest message:\n${original}`,
          },
        ],
      }),
    });
    if (!r.ok) {
      warn(opts.caller, `gateway_${r.status}`);
      return { query: original, rewritten: false, original };
    }
    const j = await r.json();
    const out = String(j?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    if (!out) {
      warn(opts.caller, "empty_rewrite");
      return { query: original, rewritten: false, original };
    }
    return { query: out, rewritten: true, original };
  } catch (e) {
    warn(opts.caller, "rewrite_failed", e);
    return { query: original, rewritten: false, original };
  } finally {
    clearTimeout(timer);
  }
}
