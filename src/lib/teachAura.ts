/**
 * Teach Aura — what Aura read, and what it is still missing.
 *
 * Every number here is derived from the member's *included* corpus. Nothing
 * is hardcoded into a component: the coverage thresholds live in one exported
 * constant so they can move without a rebuild of the UI.
 *
 * The "biggest gap" sentence is generated here, not in the component, for the
 * same reason the repetition sentence lives in `voiceOverview.ts`: two
 * surfaces disagreeing about one fact is a defect we already fixed once.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadLinkedInAddress, type LinkedInAddress } from "@/lib/linkedinAddress";

/** Aura needs this many classified posts before it will judge coverage. */
export const MIN_POSTS_FOR_COVERAGE = 8;

export const COVERAGE_THRESHOLDS = {
  arabic: 15,
  english: 15,
  long: 10,
  short: 10,
  recent: 8,
} as const;

export type CoverageKey = keyof typeof COVERAGE_THRESHOLDS;
export type CoverageStatus = "sufficient" | "thin" | "missing";

export const COVERAGE_LABEL: Record<CoverageKey, string> = {
  arabic: "Arabic posts",
  english: "English posts",
  long: "Long-form (over 1,500 characters)",
  short: "Short-form (under 800 characters)",
  recent: "Posts in the last 90 days",
};

/** Plain-language consequence of each gap, used in the single gap sentence. */
const GAP_CONSEQUENCE: Record<CoverageKey, string> = {
  arabic: "Aura can't yet write Arabic posts in your voice",
  english: "Aura can't yet write English posts in your voice",
  long: "Aura can't yet write long posts in your voice",
  short: "Aura can't yet write short posts in your voice",
  recent: "Aura is reading writing that may no longer sound like you",
};

export interface CoverageRow {
  key: CoverageKey;
  label: string;
  count: number;
  threshold: number;
  status: CoverageStatus;
}

export type CorpusState = "included" | "excluded" | "auto_excluded";

export interface CorpusPost {
  id: string;
  publishedAt: string | null;
  excerpt: string;
  textLength: number;
  hookStyle: string | null;
  state: CorpusState;
  reason: string | null;
  countsTowardVoice: boolean;
  sourceLabel: string;
  setAsideReason: string | null;
  /** true when the text is mostly Arabic — used by the review filters. */
  isArabic: boolean;
}

/** Whether Aura can still read this member's LinkedIn. */
export type ConnectionState = "connected" | "needs_reconnect" | "not_set";

/** An example Aura kept, labelled by where it actually came from. */
export interface KeptExample {
  content: string;
  sourceLabel: string;
  addedAt: string | null;
  /** true when the member added it themselves — a paste or an upload. */
  memberAdded: boolean;
}

/** A post the member admires. Reference only — never material Aura reuses. */
export interface AdmiredPost {
  content: string;
  source: string | null;
  addedAt: string | null;
}

/** Sources on an `example_posts` entry that mean "the member added this". */
const MEMBER_ADDED_SOURCES = ["teach", "paste", "upload", "member_added"];

export const EXAMPLE_SOURCE_LABEL = (source: unknown): string => {
  const s = String(source ?? "").trim();
  if (!s) return "Unknown source";
  if (MEMBER_ADDED_SOURCES.includes(s)) return "Added by you";
  if (s === "linkedin_export") return "From your LinkedIn export";
  if (s === "linkedin_own" || s === "imported") return "Your post";
  return "Unknown source";
};

/** Aura will hold this many admired posts and no more. */
export const ADMIRED_CAP = 10;

export interface TeachAuraModel {
  address: LinkedInAddress;
  connectionState: ConnectionState;
  /** Own posts Aura counted, and the ones it set aside. */
  includedCount: number;
  excludedCount: number;
  classifiedCount: number;
  documentCount: number;
  /** Examples Aura kept from the member's posts, with their true source. */
  examples: KeptExample[];
  /** Examples the member added themselves — the honest "you added" figure. */
  addedByYouCount: number;
  admired: AdmiredPost[];
  coverage: CoverageRow[];
  posts: CorpusPost[];
  totalPosts: number;
  /**
   * Posts LinkedIn engagement is known for but whose words were never saved.
   * A real gap: Aura can see they did well and cannot read why.
   */
  textlessWithEngagement: number;
  /**
   * The only rows worth a member's attention: own-writing Aura could not
   * classify, and set-asides it was not sure about. Capped, because a queue of
   * 160 is a labelling job nobody finishes.
   */
  ambiguous: CorpusPost[];
  /** Negative verdicts in the last 14 days, and what they disagreed on. */
  negativeVerdicts: number;
  negativeDimension: string | null;
}

/** How many uncertain items the member is ever asked about at once. */
export const MAX_AMBIGUOUS = 8;

/** An auto-exclude Aura was not confident about. */
const UNSURE_REASON = /uncertain|unsure|low confidence|maybe|possible/i;

const ARABIC = /[\u0600-\u06FF]/;

export const isArabicText = (t: string): boolean => {
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (!letters) return false;
  const arabic = (letters.match(/[\u0600-\u06FF]/g) || []).length;
  return arabic / letters.length > 0.3;
};

function statusFor(count: number, threshold: number): CoverageStatus {
  if (count >= threshold) return "sufficient";
  if (count >= threshold / 2) return "thin";
  return "missing";
}

export const PAGE_SIZE = 20;

export async function loadTeachAura(userId: string, _page = 0): Promise<TeachAuraModel> {
  const [address, postsRes, docsRes, voiceRes, textlessRes, connRes, feedbackRes] = await Promise.all([
    loadLinkedInAddress(userId),
    supabase.rpc("voice_corpus_review", { p_user_id: userId }),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    // Every default-mode row: examples live per language, and both languages
    // are the same member's voice.
    supabase
      .from("authority_voice_profiles")
      .select("example_posts, admired_posts, is_primary, updated_at")
      .eq("user_id", userId)
      .eq("mode_key", "default")
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false }),
    // Engagement is known, the words were never saved. Aura can see these did
    // well and cannot read why.
    supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("post_text", null)
      .gt("engagement_score", 0),
    // Connection state, read where the address lives.
    supabase.from("linkedin_connections").select("handle, access_token").eq("user_id", userId).maybeSingle(),
    supabase
      .from("voice_feedback")
      .select("verdict, applied_changes, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (postsRes.error) throw new Error(postsRes.error.message);
  const rows = postsRes.data || [];

  const posts: CorpusPost[] = rows.map((r: any) => {
    const countsTowardVoice = Boolean(r.counts_toward_voice);
    const fullText = String(r.excerpt || "").trim();
    const setAsideReason = (r.set_aside_reason as string | null) ?? null;
    return {
      id: String(r.id),
      publishedAt: (r.published_at as string | null) || (r.created_at as string | null),
      excerpt: fullText.slice(0, 90),
      textLength: fullText.length,
      hookStyle: (r.hook_style as string | null) ?? null,
      state: countsTowardVoice ? "included" : "excluded",
      reason: setAsideReason,
      countsTowardVoice,
      sourceLabel: String(r.source_label || "Unknown source"),
      setAsideReason,
      isArabic: isArabicText(fullText),
    };
  });

  const included = posts.filter((p) => p.countsTowardVoice);
  const cutoff = Date.now() - 90 * 86_400_000;

  const counts: Record<CoverageKey, number> = { arabic: 0, english: 0, long: 0, short: 0, recent: 0 };
  for (const p of included) {
    if (p.isArabic) counts.arabic += 1;
    else counts.english += 1;
    if (p.textLength > 1500) counts.long += 1;
    if (p.textLength < 800) counts.short += 1;
    const when = p.publishedAt;
    if (when && new Date(when).getTime() >= cutoff) counts.recent += 1;
  }

  const coverage: CoverageRow[] = (Object.keys(COVERAGE_THRESHOLDS) as CoverageKey[]).map((key) => ({
    key,
    label: COVERAGE_LABEL[key],
    count: counts[key],
    threshold: COVERAGE_THRESHOLDS[key],
    status: statusFor(counts[key], COVERAGE_THRESHOLDS[key]),
  }));

  const profileRows = (voiceRes.data as any[]) || [];
  const examples: KeptExample[] = profileRows.flatMap((row) =>
    (Array.isArray(row?.example_posts) ? row.example_posts : []).map((e: any) => {
      const source = e?.source ?? null;
      return {
        content: String(e?.content ?? "").trim(),
        sourceLabel: EXAMPLE_SOURCE_LABEL(source),
        addedAt: (e?.added_at as string | null) ?? null,
        memberAdded: MEMBER_ADDED_SOURCES.includes(String(source ?? "")),
      };
    }),
  ).filter((e: KeptExample) => e.content.length > 0);

  const admiredRow = profileRows.find((r) => Array.isArray(r?.admired_posts) && r.admired_posts.length > 0)
    ?? profileRows[0];
  const admired: AdmiredPost[] = (Array.isArray(admiredRow?.admired_posts) ? admiredRow.admired_posts : [])
    .map((a: any) => ({
      content: String(a?.content ?? "").trim(),
      source: (a?.source as string | null) ?? null,
      addedAt: (a?.added_at as string | null) ?? null,
    }))
    .filter((a: AdmiredPost) => a.content.length > 0);

  const conn = (connRes.data as any) || null;
  const connectionState: ConnectionState = !address.handle && !conn?.handle
    ? "not_set"
    : String(conn?.access_token ?? "").length > 0
      ? "connected"
      : "needs_reconnect";

  const negatives = ((feedbackRes.data as any[]) || [])
    .filter((r) => r.verdict === "partly" || r.verdict === "not_me");
  const dimension = negatives
    .flatMap((r) => (Array.isArray(r.applied_changes) ? r.applied_changes : []))
    .map((c: any) => String(c?.trait_key ?? "").replace(/_/g, " "))
    .find(Boolean) ?? null;

  const ambiguous = posts
    .filter((p) =>
      (p.state === "included" && !p.hookStyle) ||
      (p.state === "auto_excluded" && (!p.reason || UNSURE_REASON.test(p.reason))))
    .slice(0, MAX_AMBIGUOUS);

  return {
    address,
    includedCount: included.length,
    excludedCount: posts.length - included.length,
    classifiedCount: included.filter((p) => p.hookStyle).length,
    documentCount: docsRes.count ?? 0,
    connectionState,
    examples,
    addedByYouCount: examples.filter((e) => e.memberAdded).length,
    admired,
    negativeVerdicts: negatives.length,
    negativeDimension: dimension,
    coverage,
    // The whole list; the page filters and pages it client-side so a filter
    // change costs nothing.
    posts,
    totalPosts: posts.length,
    textlessWithEngagement: textlessRes.count ?? 0,
    ambiguous,
  };
}

/**
 * The single biggest gap, in words. Returns null when Aura hasn't read enough
 * to judge — the caller says so rather than showing a zero.
 */
export function biggestGapSentence(m: Pick<TeachAuraModel, "coverage" | "includedCount">): string | null {
  if (m.includedCount < MIN_POSTS_FOR_COVERAGE) return null;

  const rank: Record<CoverageStatus, number> = { missing: 0, thin: 1, sufficient: 2 };
  const worst = [...m.coverage].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.count / a.threshold - b.count / b.threshold;
  })[0];
  if (!worst || worst.status === "sufficient") {
    return "Aura has enough of every kind of writing it looks for. Keep publishing and it keeps refining.";
  }

  const missing = worst.threshold - worst.count;
  const noun = worst.label.toLowerCase().replace(/ \(.*\)$/, "");
  return `${GAP_CONSEQUENCE[worst.key]} — it has ${worst.count} of the ${worst.threshold} ${noun} it needs. ${missing} more would settle it.`;
}

/** Flip one post in or out of the corpus. Returns the state it landed on. */
export async function setCorpusState(postId: string, next: CorpusState): Promise<void> {
  return setCorpusStates([postId], next);
}

/**
 * Flip a batch in one round trip. Every caller queues its changes and applies
 * them together, so one recompute follows one Apply rather than one per click.
 */
export async function setCorpusStates(postIds: string[], next: CorpusState): Promise<void> {
  if (postIds.length === 0) return;
  const { error } = await supabase
    .from("linkedin_posts")
    .update({
      voice_corpus_status: next,
      voice_corpus_reason: next === "excluded" ? "Excluded by you" : null,
    })
    .in("id", postIds);
  if (error) throw new Error(error.message);
}
/* ── controls the page offers ────────────────────────────────────────────── */

/** Split a pasted block into posts: blank line or a rule between them. */
export const splitPastedPosts = (text: string): string[] =>
  String(text ?? "").split(/\n\s*-{3,}\s*\n|\n{2,}/).map((s) => s.trim()).filter(Boolean);

export interface AddWritingResult {
  admitted: number;
  tooShort: number;
  wrongSource: number;
}

/**
 * Add the member's own writing — a paste or an uploaded .txt/.md.
 *
 * Everything goes through `voice-distill` stamped `member_added`, which is the
 * only branch that writes rows the one corpus rule will admit. Nothing here
 * decides for itself what counts as the member's writing.
 */
export async function addOwnWriting(posts: string[]): Promise<AddWritingResult> {
  if (posts.length === 0) throw new Error("Add at least one post first.");
  const { data, error } = await supabase.functions.invoke("voice-distill", {
    body: { posts, store_samples: true, source: "member_added" },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error(String((data as any).error));
  const rejected = (data as any)?.rejected ?? {};
  return {
    admitted: Number((data as any)?.admitted ?? 0),
    tooShort: Number(rejected.too_short ?? 0),
    wrongSource: Number(rejected.wrong_source ?? 0),
  };
}

/** The default-mode row that holds this member's admired posts. */
async function admiredRowId(userId: string): Promise<{ id: string; list: AdmiredPost[] }> {
  const { data, error } = await supabase
    .from("authority_voice_profiles")
    .select("id, admired_posts")
    .eq("user_id", userId)
    .eq("mode_key", "default")
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aura has no voice profile for you yet — read your posts first.");
  /** Stored shape, kept exactly as the database holds it. */
  const list = (Array.isArray((data as any).admired_posts) ? (data as any).admired_posts : [])
    .map((a: any) => ({
      content: String(a?.content ?? "").trim(),
      source: (a?.source as string | null) ?? null,
      added_at: (a?.added_at as string | null) ?? null,
    }))
    .filter((a: { content: string }) => a.content.length > 0);
  return { id: String((data as any).id), list };
}

/** Add a post the member admires. Someone else's writing, held as reference. */
export async function addAdmiredPost(userId: string, content: string, source: string): Promise<void> {
  const text = String(content ?? "").trim();
  if (text.length < 50) throw new Error("That is too short to learn a tone from.");
  const { id, list } = await admiredRowId(userId);
  const next = [{ content: text, source: source.trim() || null, added_at: new Date().toISOString() }, ...list]
    .slice(0, ADMIRED_CAP);
  const { error } = await supabase
    .from("authority_voice_profiles")
    .update({ admired_posts: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Remove one admired post by its position in the list on screen. */
export async function removeAdmiredPost(userId: string, index: number): Promise<void> {
  const { id, list } = await admiredRowId(userId);
  const next = list.filter((_: unknown, i: number) => i !== index);
  const { error } = await supabase
    .from("authority_voice_profiles")
    .update({ admired_posts: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

