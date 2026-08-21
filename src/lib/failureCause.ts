/**
 * THE CAUSE, IN A MEMBER'S WORDS.
 *
 * Waiting Law Part Two Rule 6: a failure names the failed stage and STATES THE
 * CAUSE. A raw supabase-js string ("Failed to send a request to the Edge
 * Function") is "something went wrong" in technical costume — it tells a senior
 * professional nothing they can act on.
 *
 * Every waiting surface routes its failure copy through `causeOf` so the whole
 * product speaks the same way. The raw error is never removed from our
 * diagnostics — it still goes to the console and to `ef_error_log`. It is
 * removed from the member's screen only.
 */

/** Everything we can read off an unknown thrown value, lowercased. */
function textOf(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error.toLowerCase();
  const e = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown; context?: unknown };
  const parts: string[] = [];
  for (const v of [e.name, e.message, e.code, e.status]) {
    if (typeof v === "string" || typeof v === "number") parts.push(String(v));
  }
  const ctx = e.context as { status?: unknown } | undefined;
  if (ctx && (typeof ctx.status === "string" || typeof ctx.status === "number")) parts.push(String(ctx.status));
  return parts.join(" ").toLowerCase();
}

/** The HTTP status, when the error carries one. */
function statusOf(error: unknown): number | null {
  if (error == null || typeof error === "string") return null;
  const e = error as { status?: unknown; context?: { status?: unknown } };
  const raw = typeof e.status === "number" ? e.status
    : typeof e.context?.status === "number" ? e.context.status
      : null;
  return raw;
}

/** "Reading your posts" → "reading your posts", for use mid-sentence. */
function lower(stageLabel: string): string {
  const s = (stageLabel || "").trim();
  if (!s) return "this step";
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * One plain sentence a senior professional can act on. Never echoes the raw
 * error text.
 */
export function causeOf(error: unknown, stageLabel: string): string {
  const t = textOf(error);
  const status = statusOf(error);
  const stage = lower(stageLabel);

  /* The clock, first — an abort is not a fault. */
  if (t.includes("abort") || t.includes("timeout") || t.includes("timed out") || t.includes("aborterror")) {
    return "That read didn't come back in time. Nothing you had is lost.";
  }

  /* The connection needs renewing — the member CAN act on this one. */
  if (
    status === 401 || status === 403 ||
    t.includes("needs_reconnect") || t.includes("not connected") ||
    t.includes("unauthorized") || t.includes("forbidden") || t.includes(" 401") || t.includes(" 403")
  ) {
    return "Your LinkedIn connection needs renewing before Aura can read this.";
  }

  /* Being asked to slow down. */
  if (status === 429 || t.includes("429") || t.includes("rate limit") || t.includes("too many requests")) {
    return "LinkedIn is asking us to slow down. This usually clears within the hour.";
  }

  /* Ours, and we say so. Includes supabase-js FunctionsFetchError. */
  if (
    status === 503 || status === 502 || status === 504 ||
    t.includes("functionsfetcherror") ||
    t.includes("failed to send a request") ||
    t.includes("failed to fetch") ||
    t.includes("networkerror") ||
    t.includes("503")
  ) {
    return `Aura couldn't reach the step that ${stage}. This is on us, not your LinkedIn — it's been logged.`;
  }

  return `Aura couldn't finish ${stage}. It's been logged and we can see it.`;
}

export default causeOf;
