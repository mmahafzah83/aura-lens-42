/**
 * THE MEMBER'S REAL DISTRIBUTION — and the one check that holds a draft to it.
 *
 * Measured on live data (2026-08-25) against the only reliable voice profile in
 * the system: Aura was not writing like a stranger, it was writing like a
 * CARICATURE. It found the member's real habits, pushed them to the extreme,
 * dropped the habits it did not model, and added one habit that was not theirs.
 *
 *      opens "Most/معظم"     his own writing 30%   Aura as him 69%
 *      ends on a question                    11%               63%
 *      uses ◆                                54%               88%
 *      uses hashtags                         68%               38%
 *      average length                  1,165 chars       1,500 chars
 *
 * Root cause: `preferred_structures` and `storytelling_patterns` were
 * JSON.stringify'd into the system prompt and NOTHING BRANCHED ON THEM. A voice
 * was a suggestion with no enforcement.
 *
 * Two halves, both required:
 *   1. `computeDistribution` — the member's own shares, stored in
 *      `voice_distribution` by `voice-compute-traits`.
 *   2. `fidelityCheck` — ONE write-time check: no share may run more than
 *      twenty percentage points above the member's own. Habits Aura is DROPPING
 *      are an instruction, never a rejection.
 */

import { OPEN_TYPES, LAND_TYPES, openTypeOfHook, landTypeOfEnding, opensOnBannedWord, type DNALang } from "./contentDNA.ts";
import { MOVE_IDS, type MoveId } from "./moves.ts";
import { hookStyleOf, endingTypeOf } from "./generationMeta.ts";

/**
 * The distribution's OPEN vocabulary is the writing algorithm's OPEN_TYPES plus
 * one refinement: `most_claim`. "Most leaders…" / "معظم القادة…" is a contrarian
 * open, but it is the single habit that ran away with the founder's drafts
 * (30% → 69%), so it is measured, ceilinged and excluded BY NAME.
 */
export const DIST_OPEN_KEYS = ["most_claim", ...OPEN_TYPES] as const;
export type DistOpenKey = (typeof DIST_OPEN_KEYS)[number];

export const DIST_LAND_KEYS = LAND_TYPES;
export type DistLandKey = (typeof DIST_LAND_KEYS)[number];

export const MARKER_KEYS = ["diamond", "hashtags", "markers"] as const;
export type MarkerKey = (typeof MARKER_KEYS)[number];

/** Below this, a distribution is noise. Three posts do not describe a voice. */
export const MIN_DIST_CORPUS = 8;

/** How far above the member's own share any run of drafts may drift. */
export const CEILING_MARGIN = 0.20;

/** Minimum post length that counts as writing for distribution purposes. */
export const DIST_MIN_CHARS = 200;

export interface Distribution {
  corpus_n: number;
  open_type_share: Record<string, number> | null;
  land_type_share: Record<string, number> | null;
  move_share: Record<string, number> | null;
  marker_rate: Record<string, number> | null;
  length_p25: number | null;
  length_p50: number | null;
  length_p75: number | null;
}

// ── classification ──────────────────────────────────────────────────────────

/** Which OPEN key this text actually opens on. `most_claim` is checked first. */
export function openKeyOf(text: string): DistOpenKey {
  if (opensOnBannedWord(text)) return "most_claim";
  return openTypeOfHook(hookStyleOf(text)) ?? "contrarian";
}

/** Which LAND key this text actually closes on. */
export function landKeyOf(text: string): DistLandKey {
  return landTypeOfEnding(endingTypeOf(text)) ?? "statement";
}

/**
 * Approximate MOVE of an already-written post.
 *
 * A member's own LinkedIn post was never written against the MOVES table, so
 * its move can only be inferred. The inference is deliberately coarse and
 * declared here rather than hidden: the OPEN a post commits to is the strongest
 * available signal of the kind of post it is. `move_share` is therefore read as
 * a tendency, never as a verdict — nothing rejects a draft on it.
 */
const MOVE_BY_OPEN: Record<DistOpenKey, MoveId> = {
  most_claim: "comparison",
  contrarian: "comparison",
  specific_number: "case_teardown",
  scene: "single_observation",
  question: "single_observation",
  confession: "lesson_from_failure",
  prediction: "prediction",
};

export function inferMoveOf(text: string): MoveId {
  const guess = MOVE_BY_OPEN[openKeyOf(text)];
  return (MOVE_IDS as readonly string[]).includes(guess) ? guess : MOVE_IDS[0];
}

const HASHTAG = /(^|\s)[#＃][^\s#＃]{2,}/;
const DIAMOND = /[◆◇◈]/;
const OTHER_MARKERS = /[▪▸►•·‣⁃—–]|↳|↲|➤|»/;

export function markersOf(text: string): Record<MarkerKey, boolean> {
  const t = String(text ?? "");
  return {
    diamond: DIAMOND.test(t),
    hashtags: HASHTAG.test(t),
    markers: DIAMOND.test(t) || OTHER_MARKERS.test(t),
  };
}

// ── measurement ─────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function shareOf<K extends string>(keys: readonly K[], counts: Record<string, number>, n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = n > 0 ? round3((counts[k] ?? 0) / n) : 0;
  return out;
}

/**
 * The member's own distribution. Below `MIN_DIST_CORPUS` posts every share is
 * NULL — the row still records `corpus_n`, so downstream can tell "no
 * distribution yet" from "never computed".
 */
export function computeDistribution(texts: string[]): Distribution {
  const kept = (texts ?? []).map((t) => String(t ?? "")).filter((t) => t.trim().length >= DIST_MIN_CHARS);
  const corpus_n = kept.length;
  if (corpus_n < MIN_DIST_CORPUS) {
    return {
      corpus_n,
      open_type_share: null,
      land_type_share: null,
      move_share: null,
      marker_rate: null,
      length_p25: null,
      length_p50: null,
      length_p75: null,
    };
  }

  const opens: Record<string, number> = {};
  const lands: Record<string, number> = {};
  const moves: Record<string, number> = {};
  const marks: Record<string, number> = { diamond: 0, hashtags: 0, markers: 0 };
  const lengths: number[] = [];

  for (const t of kept) {
    opens[openKeyOf(t)] = (opens[openKeyOf(t)] ?? 0) + 1;
    lands[landKeyOf(t)] = (lands[landKeyOf(t)] ?? 0) + 1;
    moves[inferMoveOf(t)] = (moves[inferMoveOf(t)] ?? 0) + 1;
    const m = markersOf(t);
    for (const k of MARKER_KEYS) if (m[k]) marks[k] += 1;
    lengths.push(t.trim().length);
  }
  lengths.sort((a, b) => a - b);

  return {
    corpus_n,
    open_type_share: shareOf(DIST_OPEN_KEYS, opens, corpus_n),
    land_type_share: shareOf(DIST_LAND_KEYS, lands, corpus_n),
    move_share: shareOf(MOVE_IDS, moves, corpus_n),
    marker_rate: shareOf(MARKER_KEYS, marks, corpus_n),
    length_p25: percentile(lengths, 0.25),
    length_p50: percentile(lengths, 0.5),
    length_p75: percentile(lengths, 0.75),
  };
}

// ── the one write-time check ────────────────────────────────────────────────

export interface FidelityVerdict {
  /** False only when the draft must be regenerated. */
  ok: boolean;
  /** Why it was rejected, machine-readable, for the flag on the row. */
  violations: string[];
  /** OPEN keys the regeneration must not use, named explicitly. */
  excluded_opens: DistOpenKey[];
  /** LAND keys the regeneration must not use, named explicitly. */
  excluded_lands: DistLandKey[];
  /** Habits the member HAS that recent drafts are dropping — prompt, not reject. */
  restore: MarkerKey[];
  /** Length band this draft must land inside, when a distribution exists. */
  length_band: { min: number; max: number; target: number } | null;
  /** The running shares this verdict was decided on, for the log. */
  running: Record<string, number>;
  /** Why no check ran, when that is the case. */
  reason: "no_distribution" | "checked";
  /** Ready-to-append regeneration directive, empty when `ok`. */
  directive: string;
}

const emptyVerdict = (reason: FidelityVerdict["reason"]): FidelityVerdict => ({
  ok: true,
  violations: [],
  excluded_opens: [],
  excluded_lands: [],
  restore: [],
  length_band: null,
  running: {},
  reason,
  directive: "",
});

const OPEN_NAMES_AR: Record<DistOpenKey, string> = {
  most_claim: 'الافتتاح بكلمة "معظم"',
  contrarian: "افتتاح مخالف للقطاع",
  specific_number: "افتتاح برقم محدد",
  scene: "افتتاح بمشهد",
  question: "افتتاح بسؤال",
  confession: "افتتاح باعتراف",
  prediction: "افتتاح بتوقع",
};
const LAND_NAMES_AR: Record<DistLandKey, string> = {
  statement: "خاتمة تقريرية",
  question: "خاتمة بسؤال",
  contrast: "خاتمة بمقابلة",
  invitation: "خاتمة بدعوة لفعل",
  consequence: "خاتمة بالنتيجة",
};
const MARKER_NAMES: Record<MarkerKey, { en: string; ar: string }> = {
  diamond: { en: "the ◆ marker", ar: "علامة ◆" },
  hashtags: { en: "hashtags at the end of the post", ar: "الهاشتاقات في نهاية المنشور" },
  markers: { en: "line markers", ar: "علامات الأسطر" },
};

/**
 * THE write-time voice check. One function, one call site.
 *
 * The member's last ten drafts PLUS the candidate are measured together; any
 * share that runs more than twenty percentage points above the member's own
 * share rejects the candidate and names the offending type for the
 * regeneration. Worked example, non-negotiable: a member who opens `most_claim`
 * 30% of the time has a ceiling of 50%; if the last ten drafts already sit at
 * 60%, the next draft may not be `most_claim`.
 *
 * Downward drift — a habit the member HAS and Aura is dropping — is an
 * instruction in the prompt, never a rejection. A draft is never failed for
 * missing hashtags.
 */
export function fidelityCheck(opts: {
  dist: Distribution | null | undefined;
  /** The member's last ten draft texts, newest first. */
  recent: string[];
  candidate: string;
  lang: DNALang;
}): FidelityVerdict {
  const { dist, candidate, lang } = opts;
  const isAr = lang === "ar";
  // No distribution, or a corpus too small to describe a voice: plain rotation
  // decides everything and nothing here may reject a draft.
  if (!dist || dist.corpus_n < MIN_DIST_CORPUS || !dist.open_type_share || !dist.land_type_share) {
    return emptyVerdict("no_distribution");
  }

  const recent = (opts.recent ?? []).map((t) => String(t ?? "")).filter((t) => t.trim()).slice(0, 10);
  const window = [...recent, candidate];
  const n = window.length;
  const share = (hits: number) => hits / n;

  const running: Record<string, number> = {};
  const violations: string[] = [];
  const excluded_opens: DistOpenKey[] = [];
  const excluded_lands: DistLandKey[] = [];
  const restore: MarkerKey[] = [];

  const candOpen = openKeyOf(candidate);
  const candLand = landKeyOf(candidate);
  const candMarks = markersOf(candidate);

  // OPEN — ceiling on the type this candidate actually opened on.
  {
    const own = Number(dist.open_type_share[candOpen] ?? 0);
    const runShare = share(window.filter((t) => openKeyOf(t) === candOpen).length);
    running[`open:${candOpen}`] = round3(runShare);
    if (runShare > own + CEILING_MARGIN) {
      violations.push(`open_share_ceiling:${candOpen}:${Math.round(runShare * 100)}%>${Math.round((own + CEILING_MARGIN) * 100)}%`);
      excluded_opens.push(candOpen);
    }
  }

  // LAND — the closing question is the habit Aura invented (11% → 63%).
  {
    const own = Number(dist.land_type_share[candLand] ?? 0);
    const runShare = share(window.filter((t) => landKeyOf(t) === candLand).length);
    running[`land:${candLand}`] = round3(runShare);
    if (runShare > own + CEILING_MARGIN) {
      violations.push(`land_share_ceiling:${candLand}:${Math.round(runShare * 100)}%>${Math.round((own + CEILING_MARGIN) * 100)}%`);
      excluded_lands.push(candLand);
    }
  }

  // MARKERS — up is a rejection, down is an instruction.
  const dropMarkers: MarkerKey[] = [];
  if (dist.marker_rate) {
    for (const k of MARKER_KEYS) {
      const own = Number(dist.marker_rate[k] ?? 0);
      const runShare = share(window.filter((t) => markersOf(t)[k]).length);
      running[`marker:${k}`] = round3(runShare);
      if (candMarks[k] && runShare > own + CEILING_MARGIN) {
        violations.push(`marker_share_ceiling:${k}:${Math.round(runShare * 100)}%>${Math.round((own + CEILING_MARGIN) * 100)}%`);
        dropMarkers.push(k);
      } else if (runShare + CEILING_MARGIN < own) {
        // The member does this and the recent drafts are omitting it.
        restore.push(k);
      }
    }
  }

  // LENGTH — target p50, band p25..p75 widened by 20%.
  let length_band: FidelityVerdict["length_band"] = null;
  if (dist.length_p25 && dist.length_p50 && dist.length_p75) {
    const min = Math.round(dist.length_p25 * 0.8);
    const max = Math.round(dist.length_p75 * 1.2);
    length_band = { min, max, target: dist.length_p50 };
    const len = candidate.trim().length;
    if (len < min || len > max) {
      violations.push(`length_out_of_band:${len}∉${min}..${max}`);
    }
  }

  if (violations.length === 0) {
    return { ...emptyVerdict("checked"), running, restore, length_band, directive: restoreDirective(restore, isAr) };
  }

  // ── the regeneration directive: every constraint stated explicitly ────────
  const lines: string[] = [];
  for (const o of excluded_opens) {
    lines.push(isAr
      ? `- ممنوع تماماً: ${OPEN_NAMES_AR[o]}. مسوداتك الأخيرة استُخدم فيها هذا الافتتاح أكثر بكثير من كتابة العضو نفسه. اختر نوع افتتاح آخر.`
      : `- FORBIDDEN OPEN TYPE: "${o}". The recent drafts use it far more than this member's own writing does. Open on a different OPEN type.`);
  }
  for (const l of excluded_lands) {
    lines.push(isAr
      ? `- ممنوع تماماً: ${LAND_NAMES_AR[l]}. اختم بنوع خاتمة آخر.`
      : `- FORBIDDEN LAND TYPE: "${l}". Close on a different LAND type.`);
  }
  for (const k of dropMarkers) {
    lines.push(isAr
      ? `- لا تستخدم ${MARKER_NAMES[k].ar} في هذا المنشور.`
      : `- Do not use ${MARKER_NAMES[k].en} in this post.`);
  }
  const lengthViolation = violations.find((v) => v.startsWith("length_out_of_band"));
  if (lengthViolation && length_band) {
    lines.push(isAr
      ? `- الطول: اكتب نحو ${length_band.target} حرفاً، وابقَ بين ${length_band.min} و${length_band.max} حرفاً.`
      : `- LENGTH: write about ${length_band.target} characters, and stay between ${length_band.min} and ${length_band.max}.`);
  }
  const restoreLine = restoreDirective(restore, isAr);

  const directive = (isAr
    ? `\n\nإعادة كتابة إلزامية — الشكل خرج عن أسلوب العضو نفسه:\n${lines.join("\n")}`
    : `\n\nMANDATORY REWRITE — the shape has drifted away from how this member actually writes:\n${lines.join("\n")}`) + restoreLine;

  return { ok: false, violations, excluded_opens, excluded_lands, restore, length_band, running, reason: "checked", directive };
}

/**
 * Habits the member has that the recent drafts are dropping. An instruction,
 * always — a draft is never rejected for these.
 */
export function restoreDirective(restore: MarkerKey[], isAr: boolean): string {
  if (!restore.length) return "";
  const names = restore.map((k) => (isAr ? MARKER_NAMES[k].ar : MARKER_NAMES[k].en));
  return isAr
    ? `\n\nملاحظة أسلوبية: هذا العضو يستخدم ${names.join(" و")} في كتابته، والمسودات الأخيرة أهملت ذلك. أعِد ذلك بشكل طبيعي.`
    : `\n\nVOICE NOTE: this member uses ${names.join(" and ")} in their own writing, and the recent drafts have been omitting it. Put it back, naturally.`;
}

/** The prompt lines that describe the member's own distribution to the model. */
export function distributionPromptBlock(dist: Distribution | null | undefined, isAr: boolean): string {
  if (!dist || dist.corpus_n < MIN_DIST_CORPUS || !dist.open_type_share) return "";
  const top = (rec: Record<string, number> | null) =>
    Object.entries(rec ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ");
  const marks = Object.entries(dist.marker_rate ?? {}).map(([k, v]) => `${k} ${Math.round(Number(v) * 100)}%`).join(", ");
  return isAr
    ? `\n\nكيف يكتب هذا العضو فعلاً (من ${dist.corpus_n} منشوراً بقلمه):\n- الافتتاحات: ${top(dist.open_type_share)}\n- الخواتيم: ${top(dist.land_type_share)}\n- العلامات: ${marks}\n- الطول المعتاد: نحو ${dist.length_p50} حرفاً.\nلا تبالغ في أي عادة من هذه: النسبة هي الأسلوب، لا العادة وحدها.`
    : `\n\nHOW THIS MEMBER ACTUALLY WRITES (from ${dist.corpus_n} posts they wrote themselves):\n- Opens: ${top(dist.open_type_share)}\n- Closes: ${top(dist.land_type_share)}\n- Markers: ${marks}\n- Usual length: about ${dist.length_p50} characters.\nDo not exaggerate any one of these habits. The PROPORTION is the voice, not the habit.`;
}
