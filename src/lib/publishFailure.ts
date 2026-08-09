/**
 * One place that turns a raw publish error into (a) a stored reason and
 * (b) a sentence a member can act on.
 *
 * Rule: a post is only ever marked "failed" when linkedin-publish was
 * actually called and came back bad. Anything that stops us before the
 * call — an expired session, a missing LinkedIn connection, a dropped
 * network — leaves the post as a draft so it can be sent again.
 */
export type PublishFailure = {
  /** Stored on linkedin_posts.rejection_reason */
  reason: string;
  /** Shown to the member */
  message: string;
  /** true = keep the post as a draft, do not mark it failed */
  keepDraft: boolean;
};

export function classifyPublishError(raw: unknown, attempted: boolean, blocked?: boolean): PublishFailure {
  const text = String((raw as any)?.message ?? raw ?? "").trim();
  const low = text.toLowerCase();

  // Aura's own check held the draft — LinkedIn was never asked.
  if (blocked || /quality gate|quality check/.test(low)) {
    return {
      reason: `Held by Aura's quality check: ${text}`.slice(0, 500),
      message: "Aura's quality check held this draft back before sending. Sharpen it and try again — your draft is saved.",
      keepDraft: true,
    };
  }

  if (/not connected|no linkedin|missing token|not_connected/.test(low)) {
    return {
      reason: `LinkedIn not connected: ${text}`.slice(0, 500),
      message: "Your LinkedIn account isn't connected. Connect it in Settings, then post again. Your draft is saved.",
      keepDraft: true,
    };
  }
  if (/expired|401|unauthorized|invalid_grant|jwt|sign in|not authenticated/.test(low)) {
    return {
      reason: `Sign-in or LinkedIn token expired: ${text}`.slice(0, 500),
      message: "Your sign-in with LinkedIn has expired. Reconnect in Settings, then post again. Your draft is saved.",
      keepDraft: true,
    };
  }
  if (/failed to fetch|network|timeout|offline|econn/.test(low)) {
    return {
      reason: `Network error: ${text}`.slice(0, 500),
      message: "We couldn't reach LinkedIn — the connection dropped. Your draft is saved; try posting again.",
      keepDraft: true,
    };
  }
  if (!attempted) {
    return {
      reason: `Stopped before sending to LinkedIn: ${text}`.slice(0, 500),
      message: `We couldn't get your post ready to send. ${text || "Please try again."} Your draft is saved.`,
      keepDraft: true,
    };
  }
  return {
    reason: `LinkedIn rejected the post: ${text}`.slice(0, 500),
    message: `LinkedIn didn't accept the post. ${text || "Please try again."}`,
    keepDraft: false,
  };
}
