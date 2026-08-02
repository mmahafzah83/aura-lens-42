// Publish reliability policy — deliberately free of Deno globals so it can be
// unit-tested outside the edge runtime.
//
// Rules (fixed, not tunable by callers):
//   • 3 attempts maximum
//   • exponential backoff with full jitter, honouring Retry-After
//   • 30s per-attempt timeout, 90s overall deadline
//   • retry ONLY on 429, 5xx, and network/timeout errors
//   • never retry 400 / 401 / 403 / 422 (or any other 4xx)

export type PublishStep = "register_upload" | "upload_binary" | "create_post";

export const MAX_ATTEMPTS = 3;
export const PER_ATTEMPT_MS = 30_000;
export const OVERALL_DEADLINE_MS = 90_000;

export type Outcome = "ok" | "refused" | "unreachable" | "timeout";

export interface AttemptLog {
  step: PublishStep;
  attempt: number;
  status: number | null;
  elapsed_ms: number;
  error_text: string | null;
  retrying: boolean;
}

export interface PolicyResult {
  outcome: Outcome;
  status: number | null;
  /** LinkedIn's response body, verbatim and untruncated. */
  body: string;
  headers: Record<string, string>;
  attempts: AttemptLog[];
  elapsed_ms: number;
}

/** Retry ONLY on 429 and 5xx. Every other status is terminal. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function backoffMs(attempt: number, retryAfterHeader?: string | null, rand = Math.random): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
    const when = Date.parse(retryAfterHeader);
    if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), 30_000));
  }
  // exponential with full jitter: attempt 1 -> [0,1s), 2 -> [0,2s), 3 -> [0,4s)
  const ceiling = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return Math.floor(rand() * ceiling);
}

export interface PolicyOptions {
  step: PublishStep;
  /** Performs one HTTP attempt. Must respect the abort signal. */
  fetcher: (signal: AbortSignal) => Promise<Response>;
  /** Absolute epoch ms after which no further work may start. */
  deadlineAt: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  onAttempt?: (log: AttemptLog) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function callWithPolicy(opts: PolicyOptions): Promise<PolicyResult> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? defaultSleep;
  const rand = opts.rand ?? Math.random;
  const attempts: AttemptLog[] = [];
  const started = now();
  let last: { status: number | null; body: string; headers: Record<string, string>; error: string | null } = {
    status: null, body: "", headers: {}, error: "no attempt made",
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (now() >= opts.deadlineAt) {
      attempts.push({ step: opts.step, attempt, status: null, elapsed_ms: now() - started, error_text: "overall_deadline_exceeded", retrying: false });
      return { outcome: "timeout", status: null, body: last.body, headers: last.headers, attempts, elapsed_ms: now() - started };
    }

    const budget = Math.min(PER_ATTEMPT_MS, opts.deadlineAt - now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    const attemptStart = now();
    let status: number | null = null;
    let body = "";
    let headers: Record<string, string> = {};
    let errorText: string | null = null;

    try {
      const res = await opts.fetcher(controller.signal);
      status = res.status;
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      body = await res.text(); // read once, verbatim, never truncated here
    } catch (e) {
      errorText = (e as Error)?.name === "AbortError"
        ? `per_attempt_timeout_${budget}ms`
        : `network_error: ${(e as Error)?.message ?? String(e)}`;
    } finally {
      clearTimeout(timer);
    }

    const elapsed = now() - attemptStart;
    last = { status, body, headers, error: errorText };

    const succeeded = status !== null && status >= 200 && status < 300;
    const retryable = errorText !== null || (status !== null && isRetryableStatus(status));
    const willRetry = !succeeded && retryable && attempt < MAX_ATTEMPTS;

    const log: AttemptLog = { step: opts.step, attempt, status, elapsed_ms: elapsed, error_text: errorText ?? (succeeded ? null : body), retrying: willRetry };
    attempts.push(log);
    opts.onAttempt?.(log);

    if (succeeded) {
      return { outcome: "ok", status, body, headers, attempts, elapsed_ms: now() - started };
    }
    if (!retryable) {
      // 400 / 401 / 403 / 422 and every other 4xx: terminal, zero retries.
      return { outcome: "refused", status, body, headers, attempts, elapsed_ms: now() - started };
    }
    if (!willRetry) break;

    const wait = backoffMs(attempt, headers["retry-after"], rand);
    if (now() + wait >= opts.deadlineAt) {
      return { outcome: "timeout", status, body, headers, attempts, elapsed_ms: now() - started };
    }
    await sleep(wait);
  }

  const timedOut = last.error !== null && last.error.startsWith("per_attempt_timeout");
  return {
    outcome: timedOut ? "timeout" : "unreachable",
    status: last.status,
    body: last.body,
    headers: last.headers,
    attempts,
    elapsed_ms: now() - started,
  };
}

/** One plain sentence the member can act on. Never a raw API error. */
export function memberMessage(outcome: Outcome, status: number | null, body: string, step: PublishStep): string {
  if (outcome === "timeout") {
    return "LinkedIn didn't confirm this in time, so it may or may not have gone through — check your LinkedIn feed before trying again.";
  }
  if (outcome === "unreachable") {
    return "LinkedIn couldn't be reached just now. Nothing was posted — try again in a moment.";
  }
  // refused
  if (status === 401) return "Your LinkedIn connection has expired. Reconnect LinkedIn in Settings, then publish again.";
  if (status === 403) return "LinkedIn refused this post because your account hasn't granted Aura permission to post. Reconnect LinkedIn in Settings and allow posting.";
  if (status === 422 || status === 400) {
    const hint = /duplicate/i.test(body)
      ? "LinkedIn says this is a duplicate of something already on your feed."
      : step === "upload_binary" || step === "register_upload"
        ? "LinkedIn wouldn't accept the image on this post."
        : "LinkedIn wouldn't accept the wording of this post.";
    return `${hint} Nothing was posted — edit it and try again.`;
  }
  if (status === 429) return "LinkedIn is rate-limiting your account right now. Nothing was posted — try again in a few minutes.";
  return `LinkedIn refused this post (error ${status ?? "unknown"}). Nothing was posted — try again, and tell us if it keeps happening.`;
}
