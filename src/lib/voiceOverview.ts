/**
 * Voice Overview — the one place the page's numbers come from.
 *
 * Every "recent posts" figure on this page is read from the canonical window
 * (`voice_window()` in the database — the member's most recent 12 own-writing
 * posts, all hook styles included). No component computes a window of its own.
 * Coverage and freshness come from `voice_corpus_stats()`, which applies the
 * same own-writing rule across the whole corpus.
 *
 * An unknown value is `null` and stays `null` all the way to the screen. There
 * is no zero-fill anywhere in this file.
 */
import { supabase } from "@/integrations/supabase/client";

export type Readiness = "forming" | "developing" | "working" | "reliable" | "distinctive";

export const READINESS_ORDER: Readiness[] = ["forming", "developing", "working", "reliable", "distinctive"];

export const READINESS_LABEL: Record<Readiness, string> = {
  forming: "Forming",
  developing: "Developing",
  working: "Working",
  reliable: "Reliable",
  distinctive: "Distinctive",
};

/** English names for the seven canonical hook styles. */
export const HOOK_LABEL: Record<string, string> = {
  contrarian_claim: "a contrarian claim",
  number_first: "a number",
  short_story: "a short story",
  question: "a question",
  experience_led: "your own experience",
  announcement: "an announcement",
  other: "something else",
};

const ALL_HOOKS = Object.keys(HOOK_LABEL);

export interface TraitRow {
  trait_key: string;
  display_name: string;
  value: number | null;
  confidence: string | null;
  source: string | null;
  computable: boolean;
  min_evidence: number;
  updated_at: string | null;
  last_confirmed_at: string | null;
}

export interface ChangeRow {
  at: string;
  text: string;
  emphasis: string;
}

export interface Recommendation {
  key: "diversity" | "freshness" | "confidence" | "confirm" | "none";
  text: string;
  actionLabel?: string;
  actionTab?: "dna" | "teach" | "test";
}

export interface VoiceOverviewModel {
  hasProfile: boolean;
  profileId: string | null;
  readiness: Readiness;
  /** own-writing posts across the whole corpus */
  corpusCount: number;
  /** days since the newest own-writing post, null when there are none */
  freshnessDays: number | null;
  /** size of the canonical window (≤ 12) */
  windowSize: number;
  windowClassified: number;
  /** hook_style → count, over the canonical window */
  windowDist: Record<string, number>;
  /** 0–100, null when the window holds fewer than 8 classified posts */
  diversity: number | null;
  traits: TraitRow[];
  computableComputed: number;
  computableHigh: number;
  changes: ChangeRow[];
  recommendation: Recommendation;
  recommendationDismissed: boolean;
}

const DAY = 86_400_000;

function pct(n: number | null): string {
  return n === null ? "" : `${Math.round(n)}%`;
}

/** One honest sentence about this member's state, built from their numbers. */
export function readinessSentence(m: VoiceOverviewModel): string {
  if (m.corpusCount === 0) {
    return "Aura hasn't read anything you've written yet, so it has nothing to write from.";
  }
  const top = topHook(m.windowDist);
  const lowNames = m.traits
    .filter((t) => t.computable && t.confidence === "low")
    .map((t) => t.display_name);

  if (m.readiness === "forming") {
    return `Aura has read ${m.corpusCount} of your posts. It needs 8 before it can describe your voice at all.`;
  }
  if (m.readiness === "developing") {
    return `Aura has read ${m.corpusCount} posts — enough for a rough shape, not enough to draft in your voice unaided. 20 is the next step.`;
  }
  if (m.readiness === "working") {
    if (lowNames.length) {
      return `Aura drafts in your voice, but ${lowNames.length === 1 ? "one measurement is" : `${lowNames.length} measurements are`} still shaky: ${lowNames.join(", ")}. More posts will settle ${lowNames.length === 1 ? "it" : "them"}.`;
    }
    return `Aura has read ${m.corpusCount} posts and drafts in your voice. 30 posts is where it stops second-guessing.`;
  }
  if (m.readiness === "reliable") {
    if (m.diversity !== null && top) {
      return `Aura drafts reliably in your voice. Your openers repeat more than they should — ${top.count} of your last ${m.windowSize} start with ${HOOK_LABEL[top.key] ?? top.key}. See Voice DNA.`;
    }
    return `Aura drafts reliably in your voice, from ${m.corpusCount} posts. Opener variety is the last thing left to measure.`;
  }
  // distinctive
  if (top) {
    return `Aura drafts in a voice the market can tell apart. Your openers vary well — ${pct(m.diversity)} diversity across your last ${m.windowSize} posts, with ${HOOK_LABEL[top.key] ?? top.key} still your most-used at ${top.count}.`;
  }
  return `Aura drafts in a voice the market can tell apart, from ${m.corpusCount} posts.`;
}

function topHook(dist: Record<string, number>): { key: string; count: number } | null {
  const entries = Object.entries(dist);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { key: entries[0][0], count: entries[0][1] };
}

function leastUsedHook(dist: Record<string, number>): string | null {
  const unused = ALL_HOOKS.filter((h) => h !== "other" && !dist[h]);
  if (unused.length) return unused[0];
  const entries = Object.entries(dist).filter(([k]) => k !== "other");
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

/** Priority order is fixed: first match wins. Every branch carries a real number. */
export function buildRecommendation(m: Omit<VoiceOverviewModel, "recommendation" | "recommendationDismissed">): Recommendation {
  if (m.diversity !== null && m.diversity < 50) {
    const top = topHook(m.windowDist);
    const alt = leastUsedHook(m.windowDist);
    if (top) {
      return {
        key: "diversity",
        text: `${top.count} of your last ${m.windowSize} posts open with ${HOOK_LABEL[top.key] ?? top.key}. Try opening with ${HOOK_LABEL[alt ?? "question"] ?? "a question"} next time — you have used it ${m.windowDist[alt ?? ""] ?? 0} times in this window.`,
        actionLabel: "See Voice DNA",
        actionTab: "dna",
      };
    }
  }
  if (m.freshnessDays !== null && m.freshnessDays > 90) {
    return {
      key: "freshness",
      text: `Your newest sample is ${m.freshnessDays} days old. Voice drifts after about 90 days — give Aura something recent to read.`,
      actionLabel: "Teach Aura",
      actionTab: "teach",
    };
  }
  const low = m.traits.find((t) => t.computable && t.confidence === "low");
  if (low) {
    const needed = Math.max(1, low.min_evidence - m.corpusCount);
    return {
      key: "confidence",
      text: `Aura is unsure about ${low.display_name}. About ${needed} more of your posts would settle it.`,
      actionLabel: "Teach Aura",
      actionTab: "teach",
    };
  }
  const unconfirmed = m.traits.find((t) => t.source === "aura" && !t.last_confirmed_at);
  if (unconfirmed) {
    return {
      key: "confirm",
      text: `Aura guessed your ${unconfirmed.display_name} at ${unconfirmed.value ?? "?"}. Confirm it or correct it — it is the only trait you have not signed off.`,
      actionLabel: "Test & Improve",
      actionTab: "test",
    };
  }
  return { key: "none", text: "Your voice is current. Nothing needs attention." };
}

/** Turn a trait/feedback/profile row into one line of plain English. */
function describeTrait(t: {
  display_name: string; value: number | null; source: string | null; confidence: string | null;
}): { text: string; emphasis: string } {
  const v = t.value === null ? null : Math.round(Number(t.value));
  if (t.source === "user") {
    return {
      emphasis: t.display_name,
      text: v === null
        ? ` was set by you. Aura will stop adjusting it.`
        : ` is set to ${v} by you. Aura will stop adjusting it.`,
    };
  }
  return {
    emphasis: t.display_name,
    text: v === null
      ? ` was re-read from your posts.`
      : ` was measured at ${v} from your posts, confidence ${t.confidence ?? "unknown"}.`,
  };
}

const VERDICT_TEXT: Record<string, string> = {
  sounds_like_me: "You told Aura a sample sounded like you.",
  partly: "You told Aura a sample was only partly right.",
  not_me: "You told Aura a sample did not sound like you.",
  too_formal: "You told Aura a sample was too formal.",
  too_generic: "You told Aura a sample was too generic.",
  too_aggressive: "You told Aura a sample was too aggressive.",
  would_never_say: "You flagged wording you would never use.",
};

export async function loadVoiceOverview(userId: string): Promise<VoiceOverviewModel> {
  const [{ data: profiles }, { data: registry }, corpus, windowRes, diversityRes, { data: feedback }, { data: dp }] =
    await Promise.all([
      supabase
        .from("authority_voice_profiles")
        .select("id, readiness, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase.from("voice_trait_registry").select("trait_key, display_name, computable, min_evidence, sort_order").eq("active", true),
      supabase.rpc("voice_corpus_stats", { p_user_id: userId }),
      supabase.rpc("voice_window", { p_user_id: userId }),
      supabase.rpc("voice_opener_diversity", { p_user_id: userId }),
      supabase.from("voice_feedback").select("verdict, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
      supabase.from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle(),
    ]);

  const profile = profiles?.[0] ?? null;
  const stats = (corpus.data as { post_count: number; newest_published_at: string | null }[] | null)?.[0] ?? null;
  const windowRows = (windowRes.data as { hook_style: string | null; published_at: string | null }[] | null) ?? [];

  const windowDist: Record<string, number> = {};
  for (const r of windowRows) {
    if (!r.hook_style) continue;
    windowDist[r.hook_style] = (windowDist[r.hook_style] ?? 0) + 1;
  }

  const corpusCount = stats?.post_count ?? 0;
  const newest = stats?.newest_published_at ?? null;
  const freshnessDays = newest ? Math.max(0, Math.floor((Date.now() - new Date(newest).getTime()) / DAY)) : null;

  let traits: TraitRow[] = [];
  if (profile) {
    const { data: rows } = await supabase
      .from("voice_traits")
      .select("trait_key, value, confidence, source, updated_at, last_confirmed_at")
      .eq("profile_id", profile.id);
    const reg = new Map((registry ?? []).map((r) => [r.trait_key, r]));
    traits = (rows ?? [])
      .map((r) => {
        const meta = reg.get(r.trait_key);
        return {
          trait_key: r.trait_key,
          display_name: meta?.display_name ?? r.trait_key,
          value: r.value === null ? null : Number(r.value),
          confidence: r.confidence,
          source: r.source,
          computable: meta?.computable ?? false,
          min_evidence: meta?.min_evidence ?? 8,
          updated_at: r.updated_at,
          last_confirmed_at: r.last_confirmed_at,
        };
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  const computable = traits.filter((t) => t.computable);

  // Change log — traits, feedback and the profile itself, merged newest first.
  const changes: ChangeRow[] = [];
  for (const t of traits) {
    if (!t.updated_at) continue;
    const d = describeTrait(t);
    changes.push({ at: t.updated_at, emphasis: d.emphasis, text: d.text });
  }
  for (const f of feedback ?? []) {
    changes.push({ at: f.created_at, emphasis: "Your feedback", text: ` — ${VERDICT_TEXT[f.verdict] ?? f.verdict}` });
  }
  if (profile?.updated_at) {
    changes.push({
      at: profile.updated_at,
      emphasis: "Readiness",
      text: ` was recalculated to ${READINESS_LABEL[(profile.readiness as Readiness) ?? "forming"] ?? "Forming"} from ${corpusCount} posts.`,
    });
  }
  changes.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const base = {
    hasProfile: Boolean(profile),
    profileId: profile?.id ?? null,
    readiness: ((profile?.readiness as Readiness) ?? "forming"),
    corpusCount,
    freshnessDays,
    windowSize: windowRows.length,
    windowClassified: windowRows.filter((r) => r.hook_style).length,
    windowDist,
    diversity: diversityRes.data === null || diversityRes.data === undefined ? null : Number(diversityRes.data),
    traits,
    computableComputed: computable.length,
    computableHigh: computable.filter((t) => t.confidence === "high").length,
    changes: changes.slice(0, 6),
  };

  const recommendation = buildRecommendation(base);
  const dismissals = (dp?.ui_dismissals ?? {}) as Record<string, string>;
  const until = dismissals[`voice_reco_${recommendation.key}`];
  const recommendationDismissed = Boolean(until && new Date(until).getTime() > Date.now());

  return { ...base, recommendation, recommendationDismissed };
}

/** Hide the current recommendation for seven days. */
export async function dismissRecommendation(userId: string, key: string) {
  const { data } = await supabase.from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle();
  const next = { ...((data?.ui_dismissals ?? {}) as Record<string, string>) };
  next[`voice_reco_${key}`] = new Date(Date.now() + 7 * DAY).toISOString();
  await supabase.from("diagnostic_profiles").update({ ui_dismissals: next }).eq("user_id", userId);
}