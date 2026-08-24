/**
 * workHandoff — ONE declared contract for handing work to the composer.
 *
 * Every surface that says "write this" (a signal, a draft, a trend, a free
 * subject) fills in the same shape, and the composer reads that one shape.
 * Pure types and data: no React, no Supabase, no side effects.
 */

/** What kind of thing is being handed over. */
export type WorkKind = "draft" | "signal" | "trend" | "subject";

/** The format the sender is asking for. Senders always state it explicitly. */
export type WorkFormat = "post" | "carousel";

export type WorkLanguage = "en" | "ar";

/**
 * Where the way back goes. `tab` is a dashboard tab key; `params` is the
 * query string the existing deep-link handlers already understand
 * (signal, draft, src, format, from).
 */
export interface WorkBackTarget {
  tab: string;
  params?: string;
}

/** Where an arrival came from, in the member's words, and the way back. */
export interface WorkOrigin {
  surface: string;
  label: string;
  back: WorkBackTarget;
}

/** The ids a surface may know about when the way back is derived. */
export interface BackIds {
  signalId?: string | null;
  draftId?: string | null;
}

/**
 * Surface -> label. `?from=` is set by the emails; in-app surfaces name
 * themselves. An unknown surface falls back to an honest generic.
 */
export const ORIGIN: Record<string, string> = {
  weekly_brief: "From your Monday brief",
  post_ready: "From your reminder",
  draft_ready: "From your email",
  m4: "From your signal email",
  morning_signal: "From this morning's signal",
  signals: "From your signal",
  overnight: "From last night's run",
  trend: "From a market trend",
  home: "From your home page",
  my_story: "From your story",
  milestone: "From your next step",
};

export const ORIGIN_FALLBACK_LABEL = "From a link you opened";

/**
 * The way back for a surface. Email surfaces get one too: a cold deep-link
 * arrival has no history behind it, so it must still offer a way up.
 */
export function backTargetFor(surface: string | null | undefined, ids?: BackIds): WorkBackTarget {
  const s = (surface || "").trim();
  const signalId = ids?.signalId || null;
  const onSignal = (): WorkBackTarget =>
    signalId
      ? { tab: "intelligence", params: `signal=${encodeURIComponent(signalId)}` }
      : { tab: "intelligence" };

  switch (s) {
    case "signals":
    case "m4":
      return onSignal();
    case "trend":
      return { tab: "intelligence" };
    case "overnight":
    case "morning_signal":
      return { tab: "overnight" };
    case "my_story":
      return { tab: "identity" };
    case "weekly_brief":
      return signalId ? onSignal() : { tab: "library" };
    case "post_ready":
    case "draft_ready":
      return { tab: "library" };
    case "home":
    case "milestone":
      return { tab: "home" };
    default:
      return { tab: "home" };
  }
}

/** The origin for a surface, with the existing fallback behaviour kept. */
export function originFor(surface: string | null | undefined, ids?: BackIds): WorkOrigin {
  const s = (surface || "").trim();
  const back = backTargetFor(s, ids);
  if (s && ORIGIN[s]) return { surface: s, label: ORIGIN[s], back };
  return { surface: s || "link", label: ORIGIN_FALLBACK_LABEL, back };
}

/** The origin carried by a deep link (`?from=`). */
export function originFromParams(params: URLSearchParams): WorkOrigin {
  return originFor(params.get("from"), {
    signalId: params.get("signal"),
    draftId: params.get("draft"),
  });
}


/**
 * Everything a sender may hand over. `kind` and `origin` are always present;
 * the rest is what that kind of sender actually knows.
 */
export interface WorkHandoff {
  kind: WorkKind;
  /** The row id of the thing itself (draft id, signal id) when there is one. */
  id?: string | null;
  /** The subject in the member's words. */
  topic?: string;
  /** The supporting text the composer writes from. */
  context?: string;
  contentFormat?: WorkFormat;
  language?: WorkLanguage;
  origin: WorkOrigin;

  /* subject / signal / trend */
  signalId?: string;
  signalTitle?: string;
  sourceType?: string;
  sourceTitle?: string;
  trendHeadline?: string;

  /* an existing draft */
  body?: string;
  type?: "carousel" | "framework" | "linkedin_post";
  _source?: "content_items" | "linkedin_posts";
  title?: string | null;
  created_at?: string;
}

/** A subject handed over: signal, trend or free text. */
export type SubjectHandoff = WorkHandoff;
/** An existing draft handed over. */
export type DraftHandoff = WorkHandoff & { id: string; body: string };

/** Hand over a signal. */
export function handoffSignal(input: {
  signalId: string;
  title: string;
  context?: string;
  surface: string;
  contentFormat?: WorkFormat;
  sourceType?: string;
  language?: WorkLanguage;
}): SubjectHandoff {
  return {
    kind: "signal",
    id: input.signalId,
    topic: input.title,
    context: input.context || "",
    signalId: input.signalId,
    signalTitle: input.title,
    sourceType: input.sourceType || "signal",
    sourceTitle: input.title,
    contentFormat: input.contentFormat ?? "post",
    ...(input.language ? { language: input.language } : {}),
    origin: originFor(input.surface, { signalId: input.signalId }),
  };
}

/** Hand over an existing draft. */
export function handoffDraft(input: {
  draft: {
    id: string;
    body: string;
    language: WorkLanguage;
    type: "carousel" | "framework" | "linkedin_post";
    topic?: string | null;
    title?: string | null;
    created_at?: string;
    signalId?: string | null;
    _source?: "content_items" | "linkedin_posts";
  };
  surface: string;
}): DraftHandoff {
  const d = input.draft;
  return {
    kind: "draft",
    id: d.id,
    body: d.body,
    language: d.language,
    type: d.type,
    topic: d.topic ?? undefined,
    title: d.title ?? d.topic ?? null,
    created_at: d.created_at,
    _source: d._source,
    ...(d.signalId ? { signalId: d.signalId } : {}),
    contentFormat: d.type === "carousel" ? "carousel" : "post",
    origin: originFor(input.surface),
  };
}

/** Hand over a free subject — no signal row behind it. */
export function handoffSubject(input: {
  topic: string;
  context?: string;
  surface: string;
  contentFormat?: WorkFormat;
  sourceType?: string;
  sourceTitle?: string;
  trendHeadline?: string;
  language?: WorkLanguage;
  kind?: Extract<WorkKind, "subject" | "trend">;
}): SubjectHandoff {
  return {
    kind: input.kind ?? "subject",
    topic: input.topic,
    context: input.context || "",
    sourceType: input.sourceType,
    sourceTitle: input.sourceTitle ?? (input.topic || undefined),
    ...(input.trendHeadline ? { trendHeadline: input.trendHeadline } : {}),
    contentFormat: input.contentFormat ?? "post",
    ...(input.language ? { language: input.language } : {}),
    origin: originFor(input.surface),
  };
}
