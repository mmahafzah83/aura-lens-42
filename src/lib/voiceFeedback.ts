/**
 * The correction loop.
 *
 * A verdict is weaker evidence than an explicit setting, so it obeys three
 * hard rules:
 *   1. it never moves a trait that is `locked` or `source = 'user'`;
 *   2. it never invents a `learned` value — an unmeasured trait it touches is
 *      created as `source = 'user'`, and the member is told so;
 *   3. it is scoped to the active mode unless the member asks for all modes.
 * `partly` and `not_me` move nothing on their own: one bad draft is not
 * evidence. Three consistent negatives in 14 days asks for a corpus re-read.
 */
import { supabase } from "@/integrations/supabase/client";
import { isArTr, isoNum, scopeWord, voiceWord, traitWord, type VoiceTr } from "@/lib/voiceText";
import { arabicList } from "@/lib/arDisplay";

export const VERDICTS = [
  "sounds_like_me",
  "partly",
  "not_me",
  "too_formal",
  "too_generic",
  "too_aggressive",
  "would_never_say",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  sounds_like_me: "Sounds like me",
  partly: "Partly",
  not_me: "Not me",
  too_formal: "Too formal",
  too_generic: "Too generic",
  too_aggressive: "Too aggressive",
  would_never_say: "I would never say that",
};

/** A verdict's label in the interface language. */
export const verdictLabel = (v: Verdict, tr?: VoiceTr | null): string =>
  isArTr(tr) ? tr!.t(`vo.fb.v.${v}`) : VERDICT_LABEL[v] ?? v;

export const NEGATIVE_VERDICTS: Verdict[] = ["partly", "not_me"];

export interface AppliedChange {
  trait_key: string;
  from: number | null;
  to: number | null;
  scope: string;
}

export interface FeedbackTrait {
  id: string | null;
  trait_key: string;
  display_name: string;
  value: number | null;
  band_low: number | null;
  band_high: number | null;
  locked: boolean;
  source: string | null;
  computable: boolean;
}

export interface FeedbackPlan {
  changes: AppliedChange[];
  /** What Aura will say afterwards — one plain sentence per fact. */
  lines: string[];
  /** true when the verdict needs the "which phrase?" field before it can be written */
  needsPhrase: boolean;
  /** true when a touched trait had no measured value and will be created as the member's own */
  creates: boolean;
}

const STEP = 6;
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

function target(traits: FeedbackTrait[], key: string) {
  return traits.find((t) => t.trait_key === key) ?? null;
}

/**
 * Work out what a verdict would do — without doing it. The panel shows this
 * to the member as the report of what changed and what did not.
 */
export function planVerdict(
  verdict: Verdict,
  traits: FeedbackTrait[],
  modeLabel: string,
  otherModeLabels: string[],
  applyToAll: boolean,
  tr?: VoiceTr | null,
): FeedbackPlan {
  /** Stored value — English, always. */
  const scope = applyToAll ? "all modes" : modeLabel;
  const ar = isArTr(tr);
  const scopeShown = ar ? scopeWord(scope, tr) : scope;
  const pctA = (n: number | null) => (n === null ? "—" : isoNum(Math.round(n)));
  const untouched = otherModeLabels.filter((l) => l !== modeLabel);
  const unchangedLine = applyToAll || untouched.length === 0
    ? null
    : ar
      ? tr!.t("vo.fb.unchanged", { modes: arabicList(untouched.map((l) => scopeWord(l, tr))) })
      : `${untouched.join(" and ")} ${untouched.length === 1 ? "is" : "are"} unchanged.`;

  if (verdict === "sounds_like_me") {
    return {
      changes: [],
      lines: [ar ? tr!.t("vo.fb.recorded") : "Recorded. Nothing changed — KnownBy is more sure of what it already had."],
      needsPhrase: false,
      creates: false,
    };
  }

  if (verdict === "partly" || verdict === "not_me") {
    return {
      changes: [],
      lines: [ar ? tr!.t("vo.fb.watching") : "No change: one verdict is not enough to move a trait. KnownBy is watching for a pattern."],
      needsPhrase: false,
      creates: false,
    };
  }

  if (verdict === "would_never_say") {
    return {
      changes: [],
      lines: [],
      needsPhrase: true,
      creates: false,
    };
  }

  const key = verdict === "too_formal" ? "formality" : verdict === "too_generic" ? "evidence_density" : "challenge";
  const t = target(traits, key);
  if (!t) {
    return { changes: [], lines: [ar ? tr!.t("vo.fb.untracked", { trait: traitWord(key, tr) }) : `KnownBy does not track ${key.replace("_", " ")} yet, so nothing moved.`], needsPhrase: false, creates: false };
  }
  if (t.locked) {
    return { changes: [], lines: [ar ? tr!.t("vo.fb.locked", { name: voiceWord(t.display_name, tr) }) : `${t.display_name} is locked, so nothing moved. Feedback is weaker than a setting you made yourself.`], needsPhrase: false, creates: false };
  }
  if (t.source === "user") {
    return { changes: [], lines: [ar ? tr!.t("vo.fb.userSet", { name: voiceWord(t.display_name, tr) }) : `${t.display_name} is set by you, so a verdict will not move it. Change it on Your voice if you want it different.`], needsPhrase: false, creates: false };
  }

  // Rule 2 — a verdict may not invent a learned value.
  if (t.value === null) {
    const seed = verdict === "too_formal" ? 40 : verdict === "too_generic" ? 60 : 45;
    const lines = [
      ar
        ? tr!.t("vo.fb.seeded", { name: voiceWord(t.display_name, tr), seed: isoNum(seed), scope: scopeShown })
        : `${t.display_name} had no measured value, so KnownBy has set it to ${seed}% as your own setting in ${scope} — not as something it learned.`,
    ];
    if (unchangedLine) lines.push(unchangedLine);
    return { changes: [{ trait_key: key, from: null, to: seed, scope }], lines, needsPhrase: false, creates: true };
  }

  if (verdict === "too_aggressive") {
    // Narrow the band rather than shove the value: the member is asking for
    // less range at the sharp end, not a different centre.
    const lo = t.band_low;
    const hi = t.band_high;
    if (lo === null || hi === null) {
      const to = clamp100(t.value - STEP);
      const lines = [ar
        ? tr!.t("vo.fb.challenge", { a: pctA(t.value), b: pctA(to), scope: scopeShown })
        : `Challenge lowered ${pct(t.value)} → ${pct(to)} in ${scope}.`];
      if (unchangedLine) lines.push(unchangedLine);
      return { changes: [{ trait_key: key, from: t.value, to, scope }], lines, needsPhrase: false, creates: false };
    }
    const newHigh = Number(Math.max(lo, hi - (hi - lo) * 0.25).toFixed(2));
    const to = clamp100(Math.min(t.value, newHigh));
    const lines = [
      ar
        ? tr!.t("vo.fb.narrowed", { lo: pctA(lo), hi: pctA(hi), newHi: pctA(newHigh), scope: scopeShown })
        : `Challenge range narrowed ${pct(lo)}–${pct(hi)} → ${pct(lo)}–${pct(newHigh)} in ${scope}.`,
    ];
    if (unchangedLine) lines.push(unchangedLine);
    return { changes: [{ trait_key: key, from: t.value, to, scope }], lines, needsPhrase: false, creates: false };
  }

  const to = clamp100(verdict === "too_formal" ? t.value - STEP : t.value + STEP);
  const lines = ar
    ? verdict === "too_formal"
      ? [tr!.t("vo.fb.formality", { a: pctA(t.value), b: pctA(to), scope: scopeShown })]
      : [tr!.t("vo.fb.evidence", { a: pctA(t.value), b: pctA(to), scope: scopeShown }), tr!.t("vo.fb.evidenceRule")]
    : verdict === "too_formal"
      ? [`Formality lowered ${pct(t.value)} → ${pct(to)} in ${scope}.`]
      : [`Evidence raised ${pct(t.value)} → ${pct(to)} in ${scope}.`, "Every draft now needs one specific number before the close."];
  if (unchangedLine) lines.push(unchangedLine);
  return { changes: [{ trait_key: key, from: t.value, to, scope }], lines, needsPhrase: false, creates: false };
}

export interface SubmitArgs {
  userId: string;
  profileId: string | null;
  /** every profile the change may land on when the member chose "all modes" */
  allProfileIds: string[];
  applyToAll: boolean;
  modeScope: string;
  verdict: Verdict;
  sampleText: string;
  traits: FeedbackTrait[];
  plan: FeedbackPlan;
  /** only for `would_never_say` */
  phrase?: string;
  /** display language for the returned lines; nothing stored depends on it */
  tr?: VoiceTr | null;
}

/** Write the verdict, apply whatever the plan allowed, and return the lines to show. */
export async function submitVerdict(args: SubmitArgs): Promise<string[]> {
  const { userId, profileId, applyToAll, allProfileIds, modeScope, verdict, sampleText, traits, plan } = args;
  const lines = [...plan.lines];
  const applied: AppliedChange[] = [];

  const targets = applyToAll ? allProfileIds : profileId ? [profileId] : [];

  for (const change of plan.changes) {
    const t = traits.find((x) => x.trait_key === change.trait_key);
    if (!t || t.locked || t.source === "user") continue; // rule 1, enforced again at the write
    for (const pid of targets) {
      const existing = pid === profileId ? t : null;
      if (existing?.id) {
        const patch: { value: number | null; last_confirmed_at: string; band_high?: number } = { value: change.to, last_confirmed_at: new Date().toISOString() };
        if (verdict === "too_aggressive" && t.band_high !== null && t.band_low !== null) {
          patch.band_high = Number(Math.max(t.band_low, t.band_high - (t.band_high - t.band_low) * 0.25).toFixed(2));
        }
        const { error } = await supabase.from("voice_traits").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voice_traits").upsert(
          {
            user_id: userId,
            profile_id: pid,
            trait_key: change.trait_key,
            value: change.to,
            source: change.from === null ? "user" : "learned",
            confidence: change.from === null ? "high" : "medium",
            last_confirmed_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,trait_key" },
        );
        if (error) throw error;
      }
    }
    applied.push(change);
  }

  if (verdict === "would_never_say" && args.phrase?.trim()) {
    const { error } = await supabase.from("voice_rules").insert({
      user_id: userId,
      profile_id: applyToAll ? null : profileId,
      kind: "never",
      text: args.phrase.trim(),
      source: "user",
      rank: 0,
    });
    if (error) throw error;
    lines.push(isArTr(args.tr)
      ? args.tr!.t("vo.fb.never", { phrase: args.phrase.trim() })
      : `Added to your never list: "${args.phrase.trim()}". KnownBy will not write it again.`);
  }

  if (verdict === "sounds_like_me" && profileId) {
    // Evidence toward confidence only — no value moves.
    const ids = traits.filter((t) => t.id && !t.locked).map((t) => t.id as string);
    if (ids.length) {
      await supabase.from("voice_traits").update({ last_confirmed_at: new Date().toISOString() }).in("id", ids);
    }
  }

  const { error: insErr } = await supabase.from("voice_feedback").insert({
    user_id: userId,
    profile_id: profileId,
    verdict,
    sample_text: sampleText,
    mode_scope: applyToAll ? "all" : modeScope,
    applied_changes: JSON.parse(JSON.stringify(applied)), // always present — an empty array is the honest record of "nothing moved"
  });
  if (insErr) throw insErr;

  return lines;
}

export interface FeedbackRow {
  id: string;
  verdict: Verdict;
  mode_scope: string | null;
  applied_changes: AppliedChange[];
  created_at: string;
}

export async function loadFeedbackHistory(userId: string, limit = 10): Promise<FeedbackRow[]> {
  const { data } = await supabase
    .from("voice_feedback")
    .select("id, verdict, mode_scope, applied_changes, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      verdict: row.verdict as Verdict,
      mode_scope: (row.mode_scope as string) ?? null,
      applied_changes: Array.isArray(row.applied_changes) ? (row.applied_changes as AppliedChange[]) : [],
      created_at: String(row.created_at),
    };
  });
}

/**
 * Three consistent negatives inside 14 days is a pattern, and a pattern is
 * worth a re-read. Two is not.
 */
export function needsCorpusReread(rows: FeedbackRow[], now = Date.now()): boolean {
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  const recent = rows.filter(
    (r) => NEGATIVE_VERDICTS.includes(r.verdict) && new Date(r.created_at).getTime() >= cutoff,
  );
  return recent.length >= 3;
}
