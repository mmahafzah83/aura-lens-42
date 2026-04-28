import { toast } from "sonner";

/**
 * Shared error-handling helpers for Supabase queries and Edge Function calls.
 *
 * Goals:
 *  - Wrap any async data fetch with try/catch + 15s timeout
 *  - Show a consistent red toast on failure
 *  - Detect expired sessions (401 / JWT errors) and redirect to landing
 *  - Never surface raw error messages to the user
 *
 * Usage:
 *   const { data, error } = await safeQuery(
 *     () => supabase.from("entries").select("*"),
 *     { context: "Loading entries" }
 *   );
 *   if (error) return; // toast already shown
 */

const ERROR_TOAST_STYLE = {
  background: "#2a0a0a",
  border: "0.5px solid #ff444433",
  color: "#ff8888",
};

const SESSION_TOAST_STYLE = {
  background: "#2a1a0a",
  border: "0.5px solid #F9731633",
  color: "var(--brand)",
};

const DEFAULT_TIMEOUT_MS = 15_000;
const GENERIC_MSG = "Something went wrong. Please try again.";
const SESSION_MSG = "Your session expired. Please sign in again.";

let sessionRedirectScheduled = false;

function isAuthError(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.code ?? err?.context?.status;
  if (status === 401 || status === "401") return true;
  const msg = String(err.message || err.error_description || err).toLowerCase();
  return (
    msg.includes("jwt") ||
    msg.includes("session") && msg.includes("expired") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token") ||
    msg.includes("unauthorized")
  );
}

function handleSessionExpired() {
  if (sessionRedirectScheduled) return;
  sessionRedirectScheduled = true;
  toast(SESSION_MSG, {
    duration: 4000,
    position: "bottom-right",
    style: SESSION_TOAST_STYLE,
  });
  setTimeout(() => {
    sessionRedirectScheduled = false;
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, 2000);
}

function showErrorToast() {
  toast(GENERIC_MSG, {
    duration: 4000,
    position: "bottom-right",
    style: ERROR_TOAST_STYLE,
  });
}

/** Wrap a promise (or thenable, e.g. a Supabase query builder) with a timeout. */
export function withTimeout<T>(p: PromiseLike<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

interface SafeOptions {
  /** Short label used only in console logs, e.g. "Home: load entries" */
  context?: string;
  /** Suppress the toast (still logs + handles 401). Default false. */
  silent?: boolean;
  /** Timeout in ms (default 15000). */
  timeoutMs?: number;
}

/**
 * Safely run a Supabase query builder. Returns Supabase's { data, error } shape.
 * On thrown errors / timeouts / 401s: toasts + logs and returns { data: null, error }.
 */
export async function safeQuery<T = any>(
  fn: () => PromiseLike<{ data: T | null; error: any }>,
  options: SafeOptions = {}
): Promise<{ data: T | null; error: any }> {
  const { context = "query", silent = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  try {
    const result = await withTimeout(Promise.resolve(fn()), timeoutMs);
    if (result?.error) {
      console.error(`[safeQuery:${context}]`, result.error);
      if (isAuthError(result.error)) {
        handleSessionExpired();
      } else if (!silent) {
        showErrorToast();
      }
    }
    return result ?? { data: null, error: new Error("empty result") };
  } catch (err: any) {
    console.error(`[safeQuery:${context}]`, err);
    if (isAuthError(err)) {
      handleSessionExpired();
    } else if (!silent) {
      showErrorToast();
    }
    return { data: null, error: err };
  }
}

/**
 * Safely invoke an Edge Function via supabase.functions.invoke().
 * Same return shape; never shows raw error details to the user.
 */
export async function safeInvoke<T = any>(
  fn: () => PromiseLike<{ data: T | null; error: any }>,
  options: SafeOptions = {}
): Promise<{ data: T | null; error: any }> {
  return safeQuery<T>(fn, { ...options, context: options.context ?? "edge-function" });
}

/** Manually trigger the standard error toast (e.g. after a non-Supabase failure). */
export function showQueryErrorToast() {
  showErrorToast();
}
