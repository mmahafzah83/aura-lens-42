/**
 * The anonymous assessment session.
 *
 * A stranger can reach the read and the questions with no account. Progress
 * lives in `public.assessment_sessions`, reached only through SECURITY DEFINER
 * functions — the table itself is closed to anon.
 *
 * NOTE ON STORAGE: the token is held in `localStorage` under `aura_session_token`.
 * This is a browser-held token, NOT an HttpOnly cookie — an HttpOnly cookie would
 * have to be set by an edge function, which is a later step.
 */
import { supabase } from "@/integrations/supabase/client";

export const SESSION_KEY = "aura_session_token";

/** Shown only as a heading above the real queue form — never on its own. */
export const QUEUE_MESSAGE = "Aura is reading at its limit for today.";
export const ALREADY_RUN_MESSAGE =
  "You have already run this once. Sign in to see your report.";
const GENERIC = "Something failed on our side. Nothing is lost — try once more.";

export type AssessmentState = {
  step?: string;
  profile_url?: string;
  name?: string | null;
  headline?: string | null;
  avatar_url?: string | null;
  generated_at?: string | null;
  read?: Record<string, unknown> | null;
  answers?: Record<string, string>;
};

/* ── the token, held in the browser ─────────────────────────────── */
export const readToken = (): string | null => {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
};
export const writeToken = (token: string) => {
  try { localStorage.setItem(SESSION_KEY, token); } catch { /* private mode */ }
};
export const clearToken = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
};

/** Postgres raises bare codes; a visitor must never see one. */
const codeOf = (err: unknown): string => {
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  const hit = raw.match(/RATE_LIMIT_IP|RUN_ALREADY_USED|DAILY_CEILING|NO_SESSION|NO_CLAIMABLE_SESSION|NOT_AUTHENTICATED/);
  return hit ? hit[0] : "UNKNOWN";
};

export const messageFor = (code: string): string => {
  switch (code) {
    case "RUN_ALREADY_USED": return ALREADY_RUN_MESSAGE;
    case "DAILY_CEILING":
    case "RATE_LIMIT_IP": return QUEUE_MESSAGE;
    default: return GENERIC;
  }
};

/* ── the five calls ─────────────────────────────────────────────── */

/** Opens a session and keeps the token. Returns an honest message on refusal. */
export async function createSession(): Promise<{ token?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_assessment_session", {});
  if (error) return { error: messageFor(codeOf(error)) };
  const token = typeof data === "string" ? data : null;
  if (!token) return { error: GENERIC };
  writeToken(token);
  return { token };
}

/** Empty result means expired, claimed or unknown — the caller starts fresh. */
export async function loadSession(
  token: string,
): Promise<{ state: AssessmentState; runs_started: number; created_at: string | null } | null> {
  const { data, error } = await supabase.rpc("get_assessment_session", { p_token: token });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    state: (row.state ?? {}) as AssessmentState,
    runs_started: Number(row.runs_started ?? 0),
    /* The genuine start of this run. Never guessed — null when absent. */
    created_at: (row as { created_at?: string | null }).created_at ?? null,
  };
}

export async function saveSession(token: string, state: AssessmentState): Promise<boolean> {
  const { data, error } = await supabase.rpc("save_assessment_session", {
    p_token: token,
    p_state: state as never,
  });
  return !error && data === true;
}

export async function startRun(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const { error } = await supabase.rpc("start_assessment_run", { p_token: token });
  if (error) {
    const code = codeOf(error);
    return { ok: false, error: messageFor(code), code };
  }
  return { ok: true };
}

/**
 * The queue is real: one row, one place in line. The position comes back from
 * the database, so the number a person is shown is the number they hold.
 */
export async function joinReadQueue(
  email: string,
  operation = "linkedin_read",
  anonToken?: string | null,
): Promise<{ ok: true; position: number } | { ok: false; error: string }> {
  const { data, error } = await (supabase.rpc as any)("join_read_queue", {
    p_email: email,
    p_operation: operation,
    p_anon_token: anonToken ?? null,
    p_fingerprint_hash: null,
  });
  if (error) {
    const raw = String((error as { message?: string })?.message ?? "");
    if (raw.includes("INVALID_EMAIL")) return { ok: false, error: "That doesn't look like an email address." };
    return { ok: false, error: GENERIC };
  }
  return { ok: true, position: Number(data ?? 1) };
}

/**
 * Attaches the anonymous run to the account. Called once a session exists.
 * A failure never drops the report: the token stays where it is.
 */
export async function claimSession(token: string): Promise<{ ok: boolean; code: string }> {
  const { error } = await supabase.rpc("claim_assessment_session", { p_token: token });
  if (error) return { ok: false, code: codeOf(error) };
  return { ok: true, code: "OK" };
}

/**
 * Called on any authenticated load. If a browser-held token is present it is
 * attached to the account and then let go. If the session is already claimed
 * or gone, the token is let go too — there is nothing left to attach.
 */
export async function claimPendingSession(): Promise<void> {
  const token = readToken();
  if (!token) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const res = await claimSession(token);
  if (res.ok || res.code === "NO_CLAIMABLE_SESSION") clearToken();
}
