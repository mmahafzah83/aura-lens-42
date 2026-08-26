/**
 * The one rule for "what is the state of this member's LinkedIn?".
 *
 * It used to be answered per component, and one of those answers derived
 * "needs reconnect" from the AGE of `last_synced_at`. That is the wrong
 * question: a stale sync means Aura has not READ recently, not that the
 * connection is broken. A member with a token valid for seven more weeks was
 * being told to reconnect.
 *
 * No component may compute this itself. Import `linkedinStatus`.
 */
import type { LinkedInState } from "@/lib/linkedinState";

export type LinkedInStatusKey =
  | "not_connected"
  | "reconnect_needed"
  | "not_read_recently"
  | "connected";

export interface LinkedInStatusView {
  key: LinkedInStatusKey;
  /** The status word shown to the member. */
  label: string;
  /** Which of the three legal tones the chip takes. */
  tone: "neutral" | "amber" | "green";
  /** The action that actually fixes it, or null when nothing is wrong. */
  action: "connect" | "reconnect" | "reread" | null;
  /** The label for that action. */
  actionLabel: string | null;
  /** One plain sentence saying what is true. */
  explanation: string;
}

/** A sync older than this is a nudge. It is never an alarm. */
export const STALE_AFTER_DAYS = 14;

const BROKEN = ["needs_reconnect", "disconnected", "revoked"];

export interface LinkedInStatusInput {
  /** A connection row exists at all. */
  hasRow: boolean;
  /** `linkedin_connections.status`. */
  status: string | null;
  /** `linkedin_connections.token_expires_at`. */
  tokenExpiresAt: string | null;
  /** `linkedin_connections.last_synced_at`. */
  lastSyncedAt: string | null;
}

export function linkedinStatus(input: LinkedInStatusInput, now: number = Date.now()): LinkedInStatusView {
  if (!input.hasRow) {
    return {
      key: "not_connected",
      label: "Not connected",
      tone: "neutral",
      action: "connect",
      actionLabel: "Connect LinkedIn",
      explanation: "Aura has no LinkedIn address for you yet.",
    };
  }

  const expiry = input.tokenExpiresAt ? new Date(input.tokenExpiresAt).getTime() : null;
  const expired = expiry !== null && Number.isFinite(expiry) && expiry <= now;
  const status = String(input.status ?? "").trim();

  if (expired || BROKEN.includes(status)) {
    return {
      key: "reconnect_needed",
      label: "Reconnect needed",
      tone: "amber",
      action: "reconnect",
      actionLabel: "Reconnect LinkedIn",
      explanation: "LinkedIn stopped accepting your sign-in, so Aura can't read or publish until you sign in again.",
    };
  }

  const synced = input.lastSyncedAt ? new Date(input.lastSyncedAt).getTime() : null;
  const stale =
    synced === null || !Number.isFinite(synced) || now - synced > STALE_AFTER_DAYS * 86_400_000;

  if (stale) {
    return {
      key: "not_read_recently",
      label: "Not read recently",
      tone: "amber",
      action: "reread",
      actionLabel: "Re-read my LinkedIn",
      explanation: `Your connection is fine — Aura just hasn't read your profile in the last ${STALE_AFTER_DAYS} days.`,
    };
  }

  return {
    key: "connected",
    label: "Connected",
    tone: "green",
    action: null,
    actionLabel: null,
    explanation: "Aura can read your profile and publish when you approve it.",
  };
}

/** The same rule, fed from the shared connection state reader. */
export const statusFromLinkedInState = (state: LinkedInState, now?: number): LinkedInStatusView =>
  linkedinStatus(
    {
      hasRow: state.hasRow,
      status: state.connectionStatus,
      tokenExpiresAt: state.tokenExpiresAt,
      lastSyncedAt: state.lastSyncedAt,
    },
    now,
  );

/** True when a reconnect prompt may be shown. Nothing else may ask. */
export const mayPromptReconnect = (view: LinkedInStatusView): boolean =>
  view.key === "reconnect_needed";
