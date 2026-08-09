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
  evidence_count: number | null;
}

export interface ChangeRow {
  at: string;
  text: string;
  emphasis: string;
}

export interface Recommendation {
  key: "repetition" | "diversity" | "freshness" | "confidence" | "confirm" | "none";
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
  /** share of the window taken by the single most-used real opener, 0–100 */
  topShare: number | null;
  topStyleKey: string | null;
  topStyleCount: number | null;
  /** true when 'other' outnumbers the reported top style */
  otherDominant: boolean;
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

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

/**
 * One honest sentence. It always names the single binding constraint — the
 * thing standing between this member and the next rung — with a real number
 * from their own data. No compliment is paired with a contradiction.
 */
export function readinessSentence(m: VoiceOverviewModel): string {
  if (m.corpusCount === 0) {
    return "Aura hasn't read anything you've written yet, so it has nothing to write from.";
  }
  const lowNames = m.traits.filter((t) => t.computable && t.confidence === "low").map((t) => t.display_name);
  const medNames = m.traits.filter((t) => t.computable && t.confidence === "medium").map((t) => t.display_name);

  if (m.readiness === "forming") {
    return `Aura has read ${m.corpusCount} of your posts. It needs 8 before it can describe your voice at all — that is the only thing missing.`;
  }
  if (m.readiness === "developing") {
    return `Aura has read ${m.corpusCount} posts. Volume is the constraint: 20 is where it can draft in your voice unaided.`;
  }
  if (m.readiness === "working") {
    if (lowNames.length) {
      return `${lowNames.length === 1 ? "One measurement is" : `${lowNames.length} measurements are`} still unreliable — ${lowNames.join(", ")}. That is what is holding your voice back, not the ${m.corpusCount} posts Aura has read.`;
    }
    return `Aura has read ${m.corpusCount} posts. Volume is still the constraint: 30 is where it stops second-guessing.`;
  }
  if (m.readiness === "reliable") {
    // Binding constraint first: repetition, then breadth, then measurement.
    if (m.topShare !== null && m.topShare > 35 && m.topStyleKey && m.topStyleCount) {
      return `Aura drafts reliably in your voice. ${word(m.topStyleCount).replace(/^./, (c) => c.toUpperCase())} of your last ${word(m.windowSize)} posts opened the same way — that is what stands between you and a voice the market can tell apart.`;
    }
    if (m.diversity !== null && m.diversity < 60) {
      return `Aura drafts reliably in your voice. Your openers only vary ${pct(m.diversity)} across your last ${m.windowSize} posts — 60% is the bar for a voice the market can tell apart.`;
    }
    if (m.diversity === null) {
      return `Aura drafts reliably in your voice, from ${m.corpusCount} posts. Opener variety cannot be measured yet — ${m.windowClassified} of your last ${m.windowSize} posts have a labelled opener, and 8 are needed.`;
    }
    if (medNames.length) {
      return `Aura drafts reliably in your voice. ${medNames.length === 1 ? `${medNames[0]} is` : `${medNames.join(" and ")} are`} still measured at medium confidence — more of your writing would settle ${medNames.length === 1 ? "it" : "them"}.`;
    }
    return `Aura drafts reliably in your voice, from ${m.corpusCount} posts.`;
  }
  // distinctive — both gates already passed, so the numbers can be stated plainly.
  if (m.topShare !== null && m.topStyleKey && m.topStyleCount) {
    return `Aura drafts in a voice the market can tell apart: ${pct(m.diversity)} opener variety across your last ${m.windowSize} posts, and your most-used opener — ${HOOK_LABEL[m.topStyleKey] ?? m.topStyleKey} — accounts for only ${m.topStyleCount} of them.`;
  }
  return `Aura drafts in a voice the market can tell apart, from ${m.corpusCount} posts.`;
}

export function leastUsedHook(dist: Record<string, number>): string | null {
  const unused = ALL_HOOKS.filter((h) => h !== "other" && !dist[h]);
  if (unused.length) return unused[0];
  const entries = Object.entries(dist).filter(([k]) => k !== "other");
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

/**
 * The one sentence about opener repetition. Two surfaces render it — the
 * Overview recommendation and the Voice DNA variation engine — and they must
 * never disagree, so there is exactly one generator. Returns null when
 * repetition is not the binding problem.
 */
export function repetitionSentence(m: {
  topShare: number | null;
  topStyleKey: string | null;
  topStyleCount: number | null;
  windowSize: number;
  windowDist: Record<string, number>;
}): string | null {
  if (m.topShare === null || m.topShare <= 40 || !m.topStyleKey || !m.topStyleCount) return null;
  const alt = leastUsedHook(m.windowDist);
  return `${m.topStyleCount} of your last ${m.windowSize} posts open with ${HOOK_LABEL[m.topStyleKey] ?? m.topStyleKey} — ${Math.round(m.topShare)}% of the window. Try opening with ${HOOK_LABEL[alt ?? "question"] ?? "a question"} next time; you have used it ${m.windowDist[alt ?? ""] ?? 0} times in these ${m.windowSize} posts.`;
}

/** Priority order is fixed: first match wins. Every branch carries a real number. */
export function buildRecommendation(m: Omit<VoiceOverviewModel, "recommendation" | "recommendationDismissed">): Recommendation {
  // 1 — repetition. Entropy is forgiving of one dominant opener, so this gate leads.
  const repetition = repetitionSentence(m);
  if (repetition) {
    return { key: "repetition", text: repetition, actionLabel: "See Voice DNA", actionTab: "dna" };
  }
  // 2 — breadth.
  if (m.diversity !== null && m.diversity < 60) {
    const alt = leastUsedHook(m.windowDist);
    return {
      key: "diversity",
      text: `Your openers vary ${Math.round(m.diversity)}% across your last ${m.windowSize} posts; 60% is the bar. Opening with ${HOOK_LABEL[alt ?? "question"] ?? "a question"} would widen it — you have used it ${m.windowDist[alt ?? ""] ?? 0} times in this window.`,
      actionLabel: "See Voice DNA",
      actionTab: "dna",
    };
  }
  // 3 — freshness.
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
    const needed = Math.max(1, low.min_evidence - (low.evidence_count ?? m.corpusCount));
    return {
      key: "confidence",
      text: `Aura is unsure about ${low.display_name}. About ${needed} more of your posts would settle it.`,
      actionLabel: "Teach Aura",
      actionTab: "teach",
    };
  }
  // 5 — medium-confidence traits still deserve a next step.
  const medium = m.traits.find((t) => t.computable && t.confidence === "medium");
  if (medium) {
    const gap = medium.evidence_count === null ? null : Math.max(1, medium.min_evidence * 2 - medium.evidence_count);
    return {
      key: "confidence",
      text: gap === null
        ? `${medium.display_name} is measured at medium confidence. More of your own writing would lift it to high.`
        : `${medium.display_name} is measured at medium confidence from ${medium.evidence_count} posts. About ${gap} more would lift it to high.`,
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
  const [{ data: profiles }, { data: registry }, corpus, windowRes, diversityRes, topRes, { data: feedback }, { data: dp }] =
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
      (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>)(
        "voice_top_style_share", { p_user_id: userId },
      ),
      supabase.from("voice_feedback").select("verdict, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
      supabase.from("diagnostic_profiles").select("ui_dismissals").eq("user_id", userId).maybeSingle(),
    ]);

  const profile = profiles?.[0] ?? null;
  const stats = (corpus.data as { post_count: number; newest_published_at: string | null }[] | null)?.[0] ?? null;
  const windowRows = (windowRes.data as { hook_style: string | null; published_at: string | null }[] | null) ?? [];

  const topRow = (topRes.data as
    { share: number | null; top_style: string | null; top_count: number | null; other_dominant: boolean | null }[] | null
  )?.[0] ?? null;

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
      .select("trait_key, value, confidence, source, updated_at, last_confirmed_at, evidence_count")
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
          evidence_count: r.evidence_count === null || r.evidence_count === undefined ? null : Number(r.evidence_count),
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
    topShare: topRow?.share === null || topRow?.share === undefined ? null : Number(topRow.share),
    topStyleKey: topRow?.top_style ?? null,
    topStyleCount: topRow?.top_count === null || topRow?.top_count === undefined ? null : Number(topRow.top_count),
    otherDominant: Boolean(topRow?.other_dominant),
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