/**
 * THE DICTIONARY - CONCEPT REGISTRY, DENO TWIN.
 *
 * TWIN OF: `src/constants/concepts.ts`. That file is the twin of this one.
 * They must stay identical from the key list onwards; the vocabulary gate
 * compares them and fails the build on drift.
 *
 * This copy exists because `supabase/functions/` cannot import from `src/`.
 * Pure data and pure functions, no imports, no Deno APIs.
 */

export const CONCEPT_KEYS = [
  "capture",
  "document",
  "signal",
  "post_published",
  "post_confirmed",
  "post_tracked",
  "post_discovered",
  "draft",
  "score",
  "pillar",
  "reminder",
  "finding",
] as const;

export type ConceptKey = (typeof CONCEPT_KEYS)[number];

/** Where in the product a concept is allowed to be shown. */
export type ConceptSurface =
  | "library"
  | "desk"
  | "panel"
  | "home"
  | "jump"
  | "publish"
  | "intelligence"
  | "settings"
  | "identity";

export interface Concept {
  key: ConceptKey;
  /** The singular noun, as the member reads it. */
  label: { en: string; ar: string };
  /** The plural noun, as the member reads it. */
  plural: { en: string; ar: string };
  /** One plain sentence. A child should follow it. */
  meaning: string;
  /** The row set the number comes from. Prose, for humans reading the gate. */
  source: string;
  /** The ONE function that may produce this number. `null` = never counted. */
  countFn: string | null;
  /** The ONE vocabulary helper that may render "N <noun>". */
  formatter: string | null;
  /** Words this concept is routinely mistaken for. The gate reads this. */
  neverConfuseWith: ConceptKey[];
  /** Where the member meets this word. */
  appearsIn: ConceptSurface[];
}

export const CONCEPTS: Record<ConceptKey, Concept> = {
  capture: {
    key: "capture",
    label: { en: "capture", ar: "محفوظة" },
    plural: { en: "captures", ar: "محفوظات" },
    meaning: "Something you saved to read or use later. Not a document you uploaded.",
    source: "rows in `entries`",
    countFn: "fetchCaptureCounts",
    formatter: "nCaptures",
    neverConfuseWith: ["document", "signal", "post_published", "draft"],
    appearsIn: ["library", "desk", "panel", "home", "jump"],
  },

  document: {
    key: "document",
    label: { en: "document", ar: "ملف" },
    plural: { en: "documents", ar: "ملفات" },
    meaning: "A file you uploaded — a CV, a deck, a report. Not something you saved to read later.",
    source: "rows in `documents`, deduped by filename",
    countFn: "fetchDocumentCount",
    formatter: null,
    neverConfuseWith: ["capture", "finding"],
    appearsIn: ["library", "desk", "identity"],
  },

  signal: {
    key: "signal",
    label: { en: "signal", ar: "إشارة" },
    plural: { en: "signals", ar: "إشارات" },
    meaning: "Something moving in your market that Aura thinks you should know about.",
    source: "rows in `strategic_signals` with status = 'active'",
    countFn: "fetchSignalCounts",
    formatter: "nSignals",
    neverConfuseWith: ["finding", "capture"],
    appearsIn: ["intelligence", "desk", "home", "jump"],
  },

  post_published: {
    key: "post_published",
    label: { en: "post you published through Aura", ar: "منشور نشرته عبر أورا" },
    plural: { en: "posts you published through Aura", ar: "منشورات نشرتها عبر أورا" },
    meaning: "A post Aura wrote with you, and you put it on LinkedIn yourself.",
    source: "`linkedin_posts` where isAuraPublishedPost() is true",
    countFn: "fetchPublishedCounts",
    formatter: "nPosts",
    neverConfuseWith: ["post_tracked", "post_confirmed", "post_discovered", "draft"],
    appearsIn: ["publish", "desk", "home"],
  },

  post_confirmed: {
    key: "post_confirmed",
    label: { en: "post you confirmed is yours", ar: "منشور أكدت أنه لك" },
    plural: { en: "posts you confirmed are yours", ar: "منشورات أكدت أنها لك" },
    meaning: "A post Aura found on LinkedIn and you said yes, that one is mine.",
    source: "`linkedin_posts` with tracking_status = 'confirmed'",
    countFn: "fetchPublishedCounts",
    formatter: "nPosts",
    neverConfuseWith: ["post_published", "post_discovered"],
    appearsIn: ["publish", "desk"],
  },

  post_tracked: {
    key: "post_tracked",
    label: { en: "post from your history", ar: "منشور من سجلك" },
    plural: { en: "posts from your history", ar: "منشورات من سجلك" },
    meaning: "A post you wrote before Aura, brought in from your LinkedIn history.",
    source: "`linkedin_posts` with tracking_status = 'tracked'",
    countFn: "fetchPublishedCounts",
    formatter: "nPosts",
    neverConfuseWith: ["post_published", "post_confirmed"],
    appearsIn: ["publish", "desk"],
  },

  post_discovered: {
    key: "post_discovered",
    label: { en: "post Aura found", ar: "منشور وجدته أورا" },
    plural: { en: "posts Aura found", ar: "منشورات وجدتها أورا" },
    meaning: "A post Aura believes is yours but you have not confirmed yet.",
    source: "`linkedin_posts` from search_discovery, not yet confirmed",
    countFn: "fetchPublishedCounts",
    formatter: "nPosts",
    neverConfuseWith: ["post_published", "post_confirmed", "finding"],
    appearsIn: ["publish"],
  },

  draft: {
    key: "draft",
    label: { en: "draft", ar: "مسودة" },
    plural: { en: "drafts", ar: "مسودات" },
    meaning: "Something Aura wrote with you that you have not published yet.",
    source: "loadStudioDrafts() — `content_items` + `linkedin_posts`, deduped",
    countFn: "fetchDraftCount",
    formatter: "nDrafts",
    neverConfuseWith: ["post_published", "capture"],
    appearsIn: ["publish", "desk", "home", "jump"],
  },

  score: {
    key: "score",
    label: { en: "score", ar: "الدرجة" },
    plural: { en: "scores", ar: "الدرجات" },
    meaning: "One number for how well you are showing up right now. It moves as you do.",
    source: "the newest `score_snapshots` row",
    countFn: "fetchScore",
    formatter: null,
    neverConfuseWith: [],
    appearsIn: ["home", "desk", "panel"],
  },

  pillar: {
    key: "pillar",
    label: { en: "subject you own", ar: "موضوع تملكه" },
    plural: { en: "subjects you own", ar: "مواضيع تملكها" },
    meaning: "One of the few things you want to be known for.",
    source: "`profiles.brand_pillars`",
    countFn: "fetchPillarCount",
    formatter: null,
    neverConfuseWith: ["signal"],
    appearsIn: ["identity", "desk", "publish"],
  },

  reminder: {
    key: "reminder",
    label: { en: "reminder", ar: "تذكير" },
    plural: { en: "reminders", ar: "تذكيرات" },
    meaning: "A note that waits for you inside Aura. It never leaves the screen.",
    source: "`notification_events` with type = 'member_reminder'",
    countFn: "fetchReminderCount",
    formatter: null,
    neverConfuseWith: ["finding"],
    appearsIn: ["desk", "home"],
  },

  finding: {
    key: "finding",
    label: { en: "page Aura read", ar: "صفحة قرأتها أورا" },
    plural: { en: "pages Aura read", ar: "صفحات قرأتها أورا" },
    meaning: "A page Aura went and read overnight, on its own, so you did not have to.",
    source: "rows in `agent_findings`",
    countFn: "fetchFindingCount",
    formatter: "nPages",
    neverConfuseWith: ["capture", "signal", "document"],
    appearsIn: ["desk", "intelligence", "home"],
  },
};

/** Every concept, in declaration order. */
export const ALL_CONCEPTS: Concept[] = CONCEPT_KEYS.map((k) => CONCEPTS[k]);

/** The countFn a concept is allowed to use. Nothing else may produce it. */
export function countFnFor(key: ConceptKey): string | null {
  return CONCEPTS[key].countFn;
}

/** The noun, agreeing with a count, in either language. */
export function conceptNoun(key: ConceptKey, n: number, lang: "en" | "ar"): string {
  const c = CONCEPTS[key];
  return n === 1 ? c.label[lang] : c.plural[lang];
}

/** The plain meaning, for a tooltip or an "what does this mean" line. */
export function conceptMeaning(key: ConceptKey): string {
  return CONCEPTS[key].meaning;
}
