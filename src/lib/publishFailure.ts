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
  /** Translation key + params for the member sentence; the screen resolves it. */
  messageKey: string;
  messageParams: Record<string, string>;
};

/** The member sentence in the screen's language. English is `message`, unchanged. */
export function publishFailureText(
  f: PublishFailure,
  lang: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (lang !== "ar") return f.message;
  const params = { ...f.messageParams };
  if ("text" in params && !params.text) params.text = t("pf.retry");
  return t(f.messageKey, params);
}

export function classifyPublishError(raw: unknown, attempted: boolean, blocked?: boolean): PublishFailure {
  const text = String((raw as any)?.message ?? raw ?? "").trim();
  const low = text.toLowerCase();

  // KnownBy's own check held the draft — LinkedIn was never asked.
  if (blocked || /quality gate|quality check/.test(low)) {
    return {
      reason: `Held by Aura's quality check: ${text}`.slice(0, 500),
      message: "KnownBy's quality check held this draft back before sending. Sharpen it and try again — your draft is saved.",
      keepDraft: true, messageKey: "pf.quality", messageParams: {},
    };
  }

  if (/not connected|no linkedin|missing token|not_connected/.test(low)) {
    return {
      reason: `LinkedIn not connected: ${text}`.slice(0, 500),
      message: "Your LinkedIn account isn't connected. Connect it in Settings, then post again. Your draft is saved.",
      keepDraft: true, messageKey: "pf.notConnected", messageParams: {},
    };
  }
  if (/expired|401|unauthorized|invalid_grant|jwt|sign in|not authenticated/.test(low)) {
    return {
      reason: `Sign-in or LinkedIn token expired: ${text}`.slice(0, 500),
      message: "Your sign-in with LinkedIn has expired. Reconnect in Settings, then post again. Your draft is saved.",
      keepDraft: true, messageKey: "pf.expired", messageParams: {},
    };
  }
  if (/failed to fetch|network|timeout|offline|econn/.test(low)) {
    return {
      reason: `Network error: ${text}`.slice(0, 500),
      message: "We couldn't reach LinkedIn — the connection dropped. Your draft is saved; try posting again.",
      keepDraft: true, messageKey: "pf.network", messageParams: {},
    };
  }
  if (!attempted) {
    return {
      reason: `Stopped before sending to LinkedIn: ${text}`.slice(0, 500),
      message: `We couldn't get your post ready to send. ${text || "Please try again."} Your draft is saved.`,
      keepDraft: true, messageKey: "pf.notReady", messageParams: { text },
    };
  }
  return {
    reason: `LinkedIn rejected the post: ${text}`.slice(0, 500),
    message: `LinkedIn didn't accept the post. ${text || "Please try again."}`,
    keepDraft: false, messageKey: "pf.rejected", messageParams: { text },
  };
}
