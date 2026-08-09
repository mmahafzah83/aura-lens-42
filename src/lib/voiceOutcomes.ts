/**
 * What worked — the data layer for the performance loop.
 *
 * Every figure here is the member's own history compared against the member's
 * own trailing median. There is no cross-member benchmark, no absolute target
 * and no forecast. The arithmetic is the shared module the edge functions use,
 * so the sentence on screen and the proposal Aura writes can never disagree.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  OUTCOME_RULES, analyseStyles, analyseTrait, type OutcomeRow, type StyleFinding, type TraitFinding,
} from "../../supabase/functions/_shared/voiceOutcomes";
import { COMPUTABLE_TRAITS } from "../../supabase/functions/_shared/voiceMeasure";
import { HOOK_NAME, ENDING_NAME } from "@/lib/voiceDna";

export const EXCLUSION_LABEL: Record<string, string> = {
  no_text: "no text saved",
  not_own_writing: "not your own writing",
  not_in_corpus: "not in what Aura reads",
  no_metrics_yet: "no performance figures yet",
  no_performance_data: "no performance figures yet",
  other_measure: "measured a different way",
  too_new: `published less than ${OUTCOME_RULES.settleDays} days ago`,
  too_few_impressions: `fewer than ${OUTCOME_RULES.minImpressions} impressions`,
};

export interface WhatWorkedModel {
  outcomes: OutcomeRow[];
  excludedCounts: Record<string, number>;
  learningOn: boolean;
  traitFindings: TraitFinding[];
  styleFindings: StyleFinding[];
  /** null when the member has no dated evidence at all */
  learningSinceDays: number | null;
  postsRead: number;
  correctionsApplied: number;
  proposalsConfirmed: number;
  proposalsRejected: number;
}

export async function loadWhatWorked(userId: string): Promise<WhatWorkedModel> {
  const [outRes, prefRes, feedbackRes, traitRes, rejRes] = await Promise.all([
    supabase
      .from("voice_post_outcomes")
      .select("post_id, performance_index, sample_traits, hook_style, ending_type, published_at, excluded, exclusion_reason")
      .eq("user_id", userId)
      .order("published_at", { ascending: true }),
    supabase.from("voice_learning_prefs").select("learn_from_performance").eq("user_id", userId).maybeSingle(),
    supabase.from("voice_feedback").select("applied_changes").eq("user_id", userId),
    supabase.from("voice_traits").select("source, last_confirmed_at, computed_at, created_at").eq("user_id", userId),
    supabase.from("voice_trait_rejections").select("id").eq("user_id", userId),
  ]);

  const all = (outRes.data ?? []) as unknown as (OutcomeRow & { excluded: boolean; exclusion_reason: string | null })[];
  const kept = all.filter((r) => !r.excluded && r.performance_index !== null);
  const excludedCounts: Record<string, number> = {};
  for (const r of all) {
    if (!r.excluded) continue;
    const k = r.exclusion_reason ?? "unknown";
    excludedCounts[k] = (excludedCounts[k] ?? 0) + 1;
  }

  const traitFindings = COMPUTABLE_TRAITS
    .map((k) => analyseTrait(kept, k))
    .filter((f): f is TraitFinding => f !== null)
    .sort((a, b) => b.effect - a.effect);

  const styleFindings = [...analyseStyles(kept, "hook_style"), ...analyseStyles(kept, "ending_type")];

  const corrections = (feedbackRes.data ?? []).reduce(
    (n, row) => n + (Array.isArray(row.applied_changes) ? row.applied_changes.length : 0), 0,
  );

  const traits = traitRes.data ?? [];
  const dates: number[] = [];
  for (const t of traits) {
    for (const iso of [t.computed_at, t.created_at]) {
      if (iso) dates.push(new Date(iso as string).getTime());
    }
  }
  for (const r of all) if (r.published_at) dates.push(new Date(r.published_at).getTime());
  const earliest = dates.length ? Math.min(...dates) : null;

  return {
    outcomes: kept,
    excludedCounts,
    learningOn: prefRes.data?.learn_from_performance ?? true,
    traitFindings,
    styleFindings,
    learningSinceDays: earliest === null ? null : Math.max(0, Math.floor((Date.now() - earliest) / 864e5)),
    postsRead: all.filter((r) =>
      !r.excluded || r.exclusion_reason === "no_metrics_yet" || r.exclusion_reason === "no_performance_data"
    ).length,
    correctionsApplied: corrections,
    proposalsConfirmed: traits.filter((t) => t.source === "aura" && t.last_confirmed_at).length,
    proposalsRejected: (rejRes.data ?? []).length,
  };
}

export async function setLearningSwitch(userId: string, on: boolean) {
  const { error } = await supabase
    .from("voice_learning_prefs")
    .upsert({ user_id: userId, learn_from_performance: on }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Run the learning step. Never on a render — only when the member asks. */
export async function runLearnFromOutcomes() {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Sign in to check what worked.");
  const { data, error } = await supabase.functions.invoke("voice-learn-from-outcomes", { body: {} });
  if (error) throw error;
  return data as { learned: boolean; outcomes: number; proposals: unknown[] };
}

/* ── sentences — one generator, used by the card and by nothing else ─────── */

const x = (n: number) => `${n.toFixed(1)}×`;

export function traitFindingSentence(f: TraitFinding, displayName: string): string {
  const dir = f.raise ? "more" : "less";
  return `Your posts with ${dir} ${displayName.toLowerCase()} earned ${x(f.ratio)} your typical engagement — ${f.topN} posts versus ${f.bottomN}.`;
}

export function styleFindingSentence(f: StyleFinding): string {
  const name = (f.kind === "hook" ? HOOK_NAME[f.style] : ENDING_NAME[f.style]) ?? f.style;
  const verb = f.ratio >= 1 ? "earned" : "earned only";
  return `${f.kind === "hook" ? "Openers" : "Endings"} using ${name.toLowerCase()} ${verb} ${x(f.ratio)} your typical reach, across ${f.n} ${f.n === 1 ? "post" : "posts"}.`;
}

export function proposalSentence(f: TraitFinding, displayName: string, from: number, to: number): string {
  return `${traitFindingSentence(f, displayName)} Aura suggests ${f.raise ? "raising" : "lowering"} ${displayName.toLowerCase()} from ${Math.round(from)}% to ${Math.round(to)}%.`;
}
