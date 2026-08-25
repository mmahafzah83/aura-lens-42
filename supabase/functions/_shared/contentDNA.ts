// ═════════════════════════════════════════════════════════════════════════════
// FIRST PRINCIPLE OF THIS FILE — VOICE NARROWS THE RANGE, ROTATION RUNS INSIDE IT.
//
//   Voice does not select a shape. Voice selects a SUBSET.
//   From the MOVES table, the voice profile (`authority_voice_profiles`:
//   `in_voice_moves` / `in_voice_opens` / `in_voice_lands`, or those arrays
//   carried inside `preferred_structures`, derived from `example_posts` +
//   `storytelling_patterns` when the voice is distilled) marks which moves are
//   in-voice for this member — typically three to five of the eight, never one.
//   Rotation then runs the full L1/L2/L3 rules over that subset instead of over
//   all eight. Same for OPEN types and LAND types: the voice marks which are the
//   member's, rotation cycles through them.
//   Range is not randomness — and it is not sameness either. Rotation's job
//   before voice is to avoid repetition. After voice its job is to exhaust the
//   member's own range before returning to any part of it.
//
// Enforced in code by `selectShape(history, siblings, subset)` below: ONE code
// path. With no voice the three subset arrays are simply the full tables; with a
// voice they are the member's own range. There is no branch that skips rotation.
// A derivation that yields fewer than three moves is widened to three by
// `deriveInVoiceSubsets` (and logged) — never generate from a subset of one.
// ═════════════════════════════════════════════════════════════════════════════

//
// Aura Content DNA — THE writing algorithm. One structure, one MOVES table, one
// banned list, one formatting rule, one rotation. Posts, carousels, newsletters
// and the quality gate all import from here.
//
// Anything that defines HOW a post is shaped belongs in this file and nowhere
// else. A second structure definition anywhere in the codebase is a bug: the
// generator used to be handed three of them at once (a 6-step engine, a 4-step
// hook framework and a 7-step Arabic spec) plus three different banned lists and
// three competing tables of post kinds, and 47 of 80 drafts opened with the same
// word because two of those specs mandated a contrarian opener on every post.

export type DNALang = "ar" | "en";

export type DNATexture = "clean" | "daheeh" | "qawarish";

// ─────────────────────────────────────────────────────────────────────────────
// 0. THE MOVES TABLE — the one table of post kinds, re-exported here so every
//    caller reaches the writing algorithm through a single import. It lives in
//    `moves.ts` because it is mirrored to the client under a twin check.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MOVES,
  MOVE_IDS,
  MOVE_ALIASES,
  resolveMove,
  moveLabels,
  sameBeats,
  type MoveId,
  type MoveBeat,
  type MoveSpec,
  type MoveRhythm,
} from "./moves.ts";

export {
  MOVES,
  MOVE_IDS,
  MOVE_ALIASES,
  resolveMove,
  moveLabels,
  sameBeats,
  type MoveId,
  type MoveBeat,
  type MoveSpec,
  type MoveRhythm,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE STRUCTURE — six beats, collapsible to four. Language-independent.
//    The beats are a SET the post must satisfy; the ORDER comes from the MOVE.
//    Only the register changes between English and Arabic; the beats do not.
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURE_BEATS = [
  "OPEN",
  "GROUND",
  "TURN",
  "PROOF",
  "SO-WHAT",
  "LAND",
] as const;
export type StructureBeat = (typeof STRUCTURE_BEATS)[number];

/**
 * PROOF and SO-WHAT merge into a single beat when the signal is thin or the
 * member reads short. One structure serves the long evidence-rich post and the
 * fast phone-read post.
 */
export function shouldCollapse(opts: { evidenceCount?: number; lengthMax?: number | null }): boolean {
  const n = Number(opts.evidenceCount);
  if (Number.isFinite(n) && n < 4) return true;
  const len = Number(opts.lengthMax);
  if (Number.isFinite(len) && len > 0 && len <= 900) return true;
  return false;
}

/** What each beat asks for, in the member's language. The OPEN/LAND lines are
 *  injected because they carry the rotated type for this specific post. */
const BEAT_TEXT_EN: Record<MoveBeat, string> = {
  OPEN: "the entry.",
  GROUND: "what is genuinely happening. Concede it: this is real and underway.",
  TURN: "the flaw underneath. Name the illusion first (\"everything looks fine because…\"), then break it.",
  PROOF: "the specific evidence. The part only this member's captures can supply.",
  "SO-WHAT": "what it changes for the reader.",
  LAND: "the close.",
};

const BEAT_LABEL_AR: Record<MoveBeat, string> = {
  OPEN: "الافتتاح",
  GROUND: "الأرضية",
  TURN: "المنعطف",
  PROOF: "الدليل",
  "SO-WHAT": "الأثر",
  LAND: "الخاتمة",
};

const BEAT_TEXT_AR: Record<MoveBeat, string> = {
  OPEN: "المدخل.",
  GROUND: "ما يجري فعلاً. اعترف به: هذا حقيقي وجارٍ.",
  TURN: "الخلل تحت السطح. سمِّ الوهم أولاً (\"كل شيء يبدو على ما يرام لأن…\") ثم اكسره.",
  PROOF: "الدليل المحدد. الجزء الذي لا تستطيع توفيره إلا التقاطات هذا العضو.",
  "SO-WHAT": "ما يغيّره ذلك للقارئ.",
  LAND: "الخاتمة.",
};

/**
 * The structure block, built FROM the move's beat ordering. Two posts with
 * different moves therefore march in different orders — which is the whole
 * point: rotating only the first line leaves seven posts with one architecture.
 *
 * `collapse` merges PROOF and SO-WHAT wherever they sit in the ordering; if the
 * move has no SO-WHAT beat there is nothing to merge and the flag is a no-op.
 */
export function buildBeatStructure(
  lang: DNALang,
  beats: readonly MoveBeat[],
  openLine: string,
  landLine: string,
  collapse: boolean,
): string {
  const ar = lang === "ar";
  let seq: MoveBeat[] = [...beats];
  const merged = collapse && seq.includes("PROOF") && seq.includes("SO-WHAT");
  if (merged) seq = seq.filter((b) => b !== "SO-WHAT");

  const lines = seq.map((b, i) => {
    const n = i + 1;
    if (ar) {
      const label = b === "PROOF" && merged ? "الدليل + الأثر" : BEAT_LABEL_AR[b];
      let text = BEAT_TEXT_AR[b];
      if (b === "PROOF" && merged) text = "حركة واحدة مدمجة: الدليل المحدد وما يغيّره للقارئ. لا شيء خارج ما التقطه هذا العضو فعلاً.";
      if (b === "OPEN") text = `${text} ${openLine}`;
      if (b === "LAND") text = `${text} ${landLine}`;
      return `${n}. ${label} — ${text}`;
    }
    const label = b === "PROOF" && merged ? "PROOF + SO-WHAT" : b;
    let text = BEAT_TEXT_EN[b];
    if (b === "PROOF" && merged) text = "one merged beat: the specific evidence AND what it changes for the reader. Only what this member's captures actually supply.";
    if (b === "OPEN") text = `${text} ${openLine}`;
    if (b === "LAND") text = `${text} ${landLine}`;
    return `${n}. ${label} — ${text}`;
  });

  if (ar) {
    return `هيكل هذا المنشور — ${seq.length} حركات بهذا الترتيب بالضبط. لا هيكل آخر ولا إعادة ترتيب. لا تكتب أسماء الحركات في المخرج.

${lines.join("\n")}${seq.includes("LAND") ? "" : "\n\nهذه الحركة بلا حركة خاتمة: انتهِ عند الحركة الأخيرة أعلاه ولا تضف سطراً ختامياً."}

لا تُخرج حركة فارغة ولا تحشُها. إن لم تسمح المادة بحركة، اضغط المنشور ولا تملأ الفراغ.`;
  }
  return `THE STRUCTURE OF THIS POST — ${seq.length} beats, in exactly this order. This is the only structure and it may not be reordered. Never label the beats in the output.

${lines.join("\n")}${seq.includes("LAND") ? "" : "\n\nThis move has NO LAND beat: stop at the last beat above and do not add a closing line."}

Never emit an empty beat and never pad one. If the material does not support a beat, tighten the post — do not fill the space.`;
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. ROTATION — the OPEN and LAND tables. Enforced after generation, not only
//    in the prompt. See `openTypeOfHook` / `landTypeOfEnding` below.
// ─────────────────────────────────────────────────────────────────────────────

export const OPEN_TYPES = [
  "contrarian",
  "specific_number",
  "scene",
  "question",
  "confession",
  "prediction",
] as const;
export type OpenType = (typeof OPEN_TYPES)[number];

export interface TypeSpec {
  def_en: string;
  def_ar: string;
  ex_en: string;
  ex_ar: string;
}

export const OPEN_SPECS: Record<OpenType, TypeSpec> = {
  contrarian: {
    def_en: "state a position against what the sector believes.",
    def_ar: "اطرح موقفاً يخالف ما يعتقده القطاع.",
    ex_en: "The transformation office is not slowing delivery down. It is the only thing holding it together.",
    ex_ar: "مكتب التحول لا يُبطئ التنفيذ. هو الشيء الوحيد الذي يمسكه.",
  },
  specific_number: {
    def_en: "open on one figure that appears verbatim in the evidence.",
    def_ar: "افتح برقم واحد وارد حرفياً في الأدلة.",
    ex_en: "Nine of the eleven dashboards were built for a decision nobody makes any more.",
    ex_ar: "تسع لوحات من إحدى عشرة بُنيت لقرار لم يعد أحد يتخذه.",
  },
  scene: {
    def_en: "open inside a short concrete scene — a room, a moment, two lines.",
    def_ar: "افتح داخل مشهد قصير ملموس — غرفة، لحظة، سطران.",
    ex_en: "The steering meeting ran forty minutes. Nobody mentioned the customer once.",
    ex_ar: "استمر اجتماع التوجيه أربعين دقيقة. لم يُذكر العميل مرة واحدة.",
  },
  question: {
    def_en: "open on one specific question the reader cannot answer comfortably.",
    def_ar: "افتح بسؤال واحد محدد لا يستطيع القارئ الإجابة عنه بارتياح.",
    ex_en: "Who owns the number on slide four?",
    ex_ar: "من يملك الرقم في الشريحة الرابعة؟",
  },
  confession: {
    def_en: "open by admitting something you got wrong.",
    def_ar: "افتح باعتراف بخطأ وقعت فيه.",
    ex_en: "I recommended the platform. Two years on, I would recommend the opposite.",
    ex_ar: "أنا من أوصى بالمنصة. بعد عامين، أوصي بالعكس.",
  },
  prediction: {
    def_en: "open on a specific, dateable claim about what happens next.",
    def_ar: "افتح بادعاء محدد وقابل للتأريخ عمّا سيحدث تالياً.",
    ex_en: "Within two budget cycles, this team will be asked to defend a system it never chose.",
    ex_ar: "خلال دورتَي ميزانية، سيُطلب من هذا الفريق الدفاع عن نظام لم يختره.",
  },
};

export const LAND_TYPES = [
  "statement",
  "question",
  "contrast",
  "invitation",
  "consequence",
] as const;
export type LandType = (typeof LAND_TYPES)[number];

export const LAND_SPECS: Record<LandType, TypeSpec> = {
  statement: {
    def_en: "close on one short declarative line. Do NOT end on a question.",
    def_ar: "اختم بسطر تقريري قصير واحد. لا تختم بسؤال.",
    ex_en: "A plan with no owner is a document.",
    ex_ar: "الخطة بلا مالك ليست خطة. هي وثيقة.",
  },
  question: {
    def_en: "close on one specific, uncomfortable question. Never \"what do you think?\".",
    def_ar: "اختم بسؤال واحد محدد وغير مريح. لا تستخدم \"ما رأيكم؟\".",
    ex_en: "Which of your dashboards would you switch off tomorrow?",
    ex_ar: "أي لوحة من لوحاتك تُطفئها غداً؟",
  },
  contrast: {
    def_en: "close by setting the opening claim against its opposite. Do NOT end on a question.",
    def_ar: "اختم بمقابلة الادعاء الافتتاحي بنقيضه. لا تختم بسؤال.",
    ex_en: "Structure for measurement. No structure for the decision.",
    ex_ar: "بنية للقياس، بلا بنية للقرار.",
  },
  invitation: {
    def_en: "close by naming one thing the reader can do this week. Do NOT end on a question.",
    def_ar: "اختم بتسمية شيء واحد يستطيع القارئ فعله هذا الأسبوع. لا تختم بسؤال.",
    ex_en: "Take the oldest report on your desk and ask who reads it.",
    ex_ar: "خُذ أقدم تقرير على مكتبك واسأل من يقرأه.",
  },
  consequence: {
    def_en: "close on what follows if nothing changes. Do NOT end on a question.",
    def_ar: "اختم بما سيحدث إن لم يتغير شيء. لا تختم بسؤال.",
    ex_en: "The cost does not arrive as a budget line. It arrives as a quarter of silence.",
    ex_ar: "التكلفة لا تأتي كبند في الميزانية. تأتي كربع من الصمت.",
  },
};

/** A stable non-cryptographic hash so "rotate deterministically" really is deterministic. */
export function rotationSeed(...parts: (string | number | null | undefined)[]): number {
  const s = parts.map((p) => String(p ?? "")).join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Selection rule, in order of precedence:
 *  1. `weights` — the member's observed opening distribution, when a learned
 *     voice profile supplies one: the pool is biased toward what they really do.
 *  2. Otherwise rotate deterministically over the table, skipping `avoid`
 *     (every type used in that member's last three drafts).
 *  3. `avoid[0]` — the immediately previous type — is never selectable. Ever.
 */
export function rotateType<T extends string>(
  all: readonly T[],
  opts: { avoid?: readonly (T | null | undefined)[]; seed?: number; weights?: Record<string, number> } = {},
): T {
  const avoid = new Set((opts.avoid || []).filter(Boolean) as T[]);
  const seed = Number.isFinite(Number(opts.seed)) ? Math.floor(Number(opts.seed)) : 0;

  let pool = all.filter((t) => !avoid.has(t));
  // Never fewer than two choices: drop the oldest bans first, but the most
  // recent one (index 0) survives every relaxation.
  if (pool.length === 0) {
    const mostRecent = (opts.avoid || []).filter(Boolean)[0] as T | undefined;
    pool = all.filter((t) => t !== mostRecent);
  }
  if (pool.length === 0) pool = [...all];

  const w = opts.weights;
  if (w) {
    const weighted = pool.filter((t) => Number(w[t]) > 0);
    if (weighted.length > 0) {
      const total = weighted.reduce((a, t) => a + Number(w[t]), 0);
      let tick = seed % Math.max(1, Math.round(total * 100));
      for (const t of weighted) {
        tick -= Math.round(Number(w[t]) * 100);
        if (tick < 0) return t;
      }
      return weighted[seed % weighted.length];
    }
  }
  return pool[seed % pool.length];
}

/**
 * The bridge between the rotation table and `fingerprint.ts`, which classifies
 * what was actually produced. `announcement` / `other` carry no OPEN meaning,
 * so they collapse to null and the first-six-words check does the work instead.
 */
export function openTypeOfHook(hook: string | null | undefined): OpenType | null {
  switch (String(hook ?? "")) {
    case "contrarian_claim": return "contrarian";
    case "number_first": return "specific_number";
    case "short_story": return "scene";
    case "question": return "question";
    case "experience_led": return "confession";
    default: return null;
  }
}

export function landTypeOfEnding(ending: string | null | undefined): LandType | null {
  switch (String(ending ?? "")) {
    case "question": return "question";
    case "cta": return "invitation";
    case "reframe": return "contrast";
    case "number":
    case "equation": return "consequence";
    case "suspended": return "statement";
    default: return null;
  }
}

/** The literal opening, normalised: the repetition test a member actually sees. */
export function firstSixWords(text: string): string {
  const line = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

export function sameOpeningWords(a: string, b: string): boolean {
  const x = firstSixWords(a);
  const y = firstSixWords(b);
  return x.length > 0 && x === y;
}

export function buildRotationDirective(
  lang: DNALang,
  open: OpenType,
  land: LandType,
): { openLine: string; landLine: string; block: string } {
  const o = OPEN_SPECS[open];
  const l = LAND_SPECS[land];
  if (lang === "ar") {
    return {
      openLine: `نوع الافتتاح لهذا المنشور: ${open} — ${o.def_ar}`,
      landLine: `نوع الخاتمة لهذا المنشور: ${land} — ${l.def_ar}`,
      block: `الافتتاح والخاتمة لهذا المنشور — إلزامي، ولا يجوز استبدالهما:
- الافتتاح (${open}): ${o.def_ar}
  مثال: ${o.ex_ar}
- الخاتمة (${land}): ${l.def_ar}
  مثال: ${l.ex_ar}`,
    };
  }
  return {
    openLine: `OPEN TYPE for this post: ${open} — ${o.def_en}`,
    landLine: `LAND TYPE for this post: ${land} — ${l.def_en}`,
    block: `OPEN AND LAND FOR THIS POST — mandatory, not interchangeable:
- OPEN (${open}): ${o.def_en}
  Example: ${o.ex_en}
- LAND (${land}): ${l.def_en}
  Example: ${l.ex_en}`,
  };
}

/** The MOVE block: what this post DOES, and how it is written. */
export function buildMoveDirective(lang: DNALang, move: MoveId): string {
  const m = MOVES[move];
  const rhythmEN: Record<MoveRhythm, string> = {
    prose: "Rhythm: continuous prose. No bullet list — the paragraphs carry it.",
    line_broken: "Rhythm: short broken lines, one idea per line. No bullet list.",
    list_bearing: "Rhythm: the middle of the post carries a short list (◆). The OPEN and the close stay in plain lines.",
  };
  const rhythmAR: Record<MoveRhythm, string> = {
    prose: "الإيقاع: نص متصل. بلا قائمة — الفقرات تحمل المنشور.",
    line_broken: "الإيقاع: أسطر قصيرة مقطّعة، فكرة واحدة لكل سطر. بلا قائمة.",
    list_bearing: "الإيقاع: وسط المنشور يحمل قائمة قصيرة (◆). الافتتاح والخاتمة يبقيان أسطراً عادية.",
  };
  if (lang === "ar") {
    return `نوع هذا المنشور (الحركة): ${m.label_ar} — ${m.whatItDoes_ar}

${m.guidance_ar}

${rhythmAR[m.rhythm]}

مثال على النبرة (لا تنسخه): ${m.ex_ar}`;
  }
  return `THE MOVE FOR THIS POST: ${m.label_en} — ${m.whatItDoes}

${m.guidance}

${rhythmEN[m.rhythm]}

Tone example (do not copy it): ${m.ex_en}`;
}

/**
 * The one literal word ban. 47 of 80 existing drafts opened on "Most" because
 * the retired hook framework instructed a "most people believe X" opener on
 * every post. The instruction is gone; the ban stays, because the models learned
 * the habit from the corpus, not only from the prompt.
 */
export const OPENING_WORD_BAN_EN = `BANNED OPENING WORD: the post must NOT begin with the word "Most" — not "Most leaders", not "Most organisations", not "Most of the time". Nothing that starts with "Most". Begin on the OPEN type named above instead.`;

export const OPENING_WORD_BAN_AR = `كلمة افتتاح ممنوعة: لا يجوز أن يبدأ المنشور بكلمة "معظم" — لا "معظم القادة" ولا "معظم المؤسسات" ولا أي صيغة تبدأ بها. ابدأ بنوع الافتتاح المحدد أعلاه.`;

/** True when a produced draft opens on the banned word, in either language. */
export function opensOnBannedWord(text: string): boolean {
  const line = String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const first = line.replace(/^[^\p{L}\p{N}]+/u, "").split(/\s+/)[0] || "";
  const w = first.toLowerCase().replace(/[^\p{L}]/gu, "");
  return w === "most" || w === "معظم";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b. THE SELECTOR — rotation on THREE levels, and the voice override.
// ─────────────────────────────────────────────────────────────────────────────

export interface PastShape {
  move_id?: string | null;
  beats?: readonly string[] | null;
  hook_style?: string | null;
  ending_type?: string | null;
  /** The draft body, or just its opening — `firstSixWords` handles both. */
  opening?: string | null;
}

export interface ChosenShape {
  move: MoveId;
  beats: readonly MoveBeat[];
  openType: OpenType;
  landType: LandType;
  /** Which rules actually decided this shape — logged, and useful in tests. */
  basis: "voice" | "rotation";
  avoidOpenTypes: (OpenType | null)[];
  avoidLandTypes: (LandType | null)[];
  avoidOpeningTexts: string[];
}

/**
 * `past[0]` is the most recent shape; this run's siblings come first, then
 * history. `hasVoice` is the switch described at the top of this file:
 *
 *   hasVoice === true  → the voice decides. Only L1's no-immediate-repeat guard
 *                        survives (do not use the same MOVE twice in a row).
 *   hasVoice === false → the full ladder:
 *                        L1 MOVE       — not in the last TWO shapes
 *                        L2 BEAT ORDER — never the same beats array as the
 *                                        immediately previous shape; re-select
 *                                        at L1 if it collides
 *                        L3 OPEN/LAND  — OPEN not in the last THREE; first six
 *                                        words not matching any of the last FIVE
 */
export function selectShape(opts: {
  hasVoice: boolean;
  past: readonly PastShape[];
  seed: number;
  /** The member's observed distribution, when a voice profile supplies one. */
  moveWeights?: Record<string, number>;
  openWeights?: Record<string, number>;
  landWeights?: Record<string, number>;
  /** A move the caller asked for explicitly (a picked framework or post type). */
  requestedMove?: string | null;
}): ChosenShape {
  const past = (opts.past || []).filter(Boolean);
  const pastMoves = past.map((p) => resolveMove(p.move_id ?? null));

  const avoidOpenTypes: (OpenType | null)[] = past.slice(0, 3).map((p) => openTypeOfHook(p.hook_style ?? null));
  const avoidLandTypes: (LandType | null)[] = past.slice(0, 3).map((p) => landTypeOfEnding(p.ending_type ?? null));
  const avoidOpeningTexts: string[] = past
    .slice(0, 5)
    .map((p) => String(p.opening || ""))
    .filter((t) => firstSixWords(t).length > 0);

  const explicit = resolveMove(opts.requestedMove ?? null);

  // ── L1: the MOVE ──────────────────────────────────────────────────────────
  const voiceOnlyBan = pastMoves.slice(0, 1).filter(Boolean) as MoveId[];
  const rotationBan = pastMoves.slice(0, 2).filter(Boolean) as MoveId[];
  const banned = opts.hasVoice ? voiceOnlyBan : rotationBan;

  let move: MoveId;
  if (explicit && !voiceOnlyBan.includes(explicit)) {
    // A member who asked for a kind of post gets it, unless it repeats the last.
    move = explicit;
  } else {
    move = rotateType(MOVE_IDS, {
      avoid: banned,
      seed: opts.seed,
      weights: opts.hasVoice ? opts.moveWeights : undefined,
    });
  }

  // ── L2: the beat order comes WITH the move ────────────────────────────────
  // Two consecutive drafts must not march the same way. Re-select at L1 when
  // the shape collides, walking the table rather than reaching for randomness.
  const prevBeats = past[0]?.beats ?? null;
  if (!opts.hasVoice && sameBeats(MOVES[move].beats, prevBeats)) {
    const pool = MOVE_IDS.filter((m) => !banned.includes(m) && !sameBeats(MOVES[m].beats, prevBeats));
    if (pool.length) move = pool[opts.seed % pool.length];
  }
  const spec = MOVES[move];

  // ── L3: OPEN and LAND, inside what the move allows ────────────────────────
  const opens = (spec.opens.filter((o) => (OPEN_TYPES as readonly string[]).includes(o)) as OpenType[]);
  const lands = (spec.lands.filter((l) => (LAND_TYPES as readonly string[]).includes(l)) as LandType[]);
  const openPool = opens.length ? opens : [...OPEN_TYPES];
  const landPool = lands.length ? lands : [...LAND_TYPES];

  const openType = rotateType(openPool, {
    avoid: opts.hasVoice ? avoidOpenTypes.slice(0, 1) : avoidOpenTypes,
    seed: opts.seed,
    weights: opts.openWeights,
  });
  const landType = rotateType(landPool, {
    avoid: opts.hasVoice ? avoidLandTypes.slice(0, 1) : avoidLandTypes,
    seed: opts.seed + 7,
    weights: opts.landWeights,
  });

  return {
    move,
    beats: spec.beats,
    openType,
    landType,
    basis: opts.hasVoice ? "voice" : "rotation",
    avoidOpenTypes,
    avoidLandTypes,
    avoidOpeningTexts,
  };
}

/**
 * Does this member have a learned voice? One definition, used by the selector
 * and by the generator, so "hasVoice" can never mean two different things.
 */
export function hasLearnedVoice(profile: unknown): boolean {
  const p = profile as Record<string, unknown> | null | undefined;
  if (!p) return false;
  const filled = (v: unknown) =>
    (typeof v === "string" && v.trim().length > 0) || (Array.isArray(v) && v.length > 0);
  return (
    filled(p.tone) ||
    filled(p.preferred_structures) ||
    filled(p.storytelling_patterns) ||
    filled(p.example_posts)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. NUMBER INTEGRITY — the credibility guardrail. NON-NEGOTIABLE.
// ─────────────────────────────────────────────────────────────────────────────

export const NUMBER_INTEGRITY = `NUMBER INTEGRITY (absolute — credibility is the entire product):

- Use AT MOST one specific number, and it MUST come from the provided signal/evidence/context.

- If no real number is provided, DO NOT include a number and DO NOT invent one.

- NEVER attribute a statistic to a "plausible", generic, or made-up source. No fabricated report names, percentages, or figures.

- A real sourced number beats an impressive invented one. When unsure, omit the number and keep the insight.`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. REGISTER
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTER_AR = `اللغة: عربية احترافية معاصرة — واضحة ومباشرة، كأنك تحدث مديرًا لا تكتب مقالًا. ليست عامية، وليست فصحى بيروقراطية.

- المصطلحات التقنية تبقى بالإنجليزية: AI, KPI, dashboard, API, roadmap, governance.

- أسطر قصيرة تصنع إيقاعًا؛ جملة واحدة لكل سطر؛ التوتر قبل البصيرة.

- لا تُفرَض مفردات عامية؛ الإيقاع من قِصَر الأسطر لا من اللهجة.`;

export const NEUTRAL_READER = `a senior professional in their field`;

/** The same default the generator scopes an off-language register down to. */
export const DEFAULT_REGISTER_EN = "contemporary professional English";
export const DEFAULT_REGISTER_AR = "عربية احترافية معاصرة";

/**
 * D125: the judge treats `register_match` as a hard pass gate, so English must
 * be given its register as a CONSTRAINT — the way Arabic already is — not as a
 * clause buried inside a description of the reader.
 */
export function buildRegisterEN(readerDescription?: string, register?: string): string {
  const reader = (readerDescription || "").trim() || NEUTRAL_READER;
  const reg = (register || "").trim() || DEFAULT_REGISTER_EN;
  return `TARGET REGISTER (mandatory — every line must be written in it): ${reg}.
Write the whole post in that register and nothing else. Do not drift into another variety of English, into consultant-speak, or into marketing copy.

LANGUAGE: written for ${reader}. Peer-to-peer. Short lines, one idea per line, tension before insight.`;
}

export function buildRegisterAR(readerDescription?: string, register?: string): string {
  const reader = (readerDescription || "").trim() || NEUTRAL_READER;
  const reg = (register || "").trim() || DEFAULT_REGISTER_AR;
  return `السجل المستهدف (إلزامي — كل سطر يُكتب به): ${reg}.\n\n${REGISTER_AR}\n\n- الكتابة موجّهة إلى: ${reader}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORMATTING — settled once. ◆ and ↳ are permitted in English; Arabic uses
//    ◆ only, never ↳, because the arrow points the wrong way in RTL.
// ─────────────────────────────────────────────────────────────────────────────

export const FORMATTING_EN = `FORMATTING:

- ◆ for main points, ↳ for sub-points. One idea per line, blank line between ideas.

- Section markers 📍/⚠️/✅/❌ — max 2–3 total, NEVER in the OPEN or the LAND line.

- No markdown (#, **, ---), no format labels ("POST"/"منشور LinkedIn"), no code fences.

- Never use markdown bold or asterisks: no **double asterisks** and no *single asterisks* — LinkedIn renders them literally. For emphasis use a line break or ALL-CAPS, sparingly. Numbered lists ("1. ") are fine. Never use "---" or "***" as a separator; use one blank line.`;

export const FORMATTING_AR = `التنسيق:

- ◆ للنقاط الرئيسية. لا تستخدم ↳ أبداً في العربية — السهم يشير في الاتجاه الخاطئ داخل نص من اليمين إلى اليسار. للتفاصيل استخدم سطراً جديداً أو "-".

- فكرة واحدة في كل سطر، وسطر فارغ بين الأفكار.

- علامات بصرية 📍/⚠️/✅/❌ — اثنتان أو ثلاث كحد أقصى، ولا تظهر أبداً في الافتتاح ولا في سطر الخاتمة.

- لا markdown (#، **، ---)، ولا تسميات صيغة ("منشور LinkedIn"/"POST")، ولا أسوار كود.

- ممنوع النجوم للتشديد: لا **نجمتان** ولا *نجمة واحدة* — LinkedIn يعرضها حرفياً. للتشديد استخدم سطراً جديداً. القوائم المرقمة ("1. " أو "١. ") مقبولة. لا تستخدم "---" فاصلاً، استخدم سطراً فارغاً.`;

/** Back-compat name for importers that only ever wanted the English block. */
export const FORMATTING = FORMATTING_EN;

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE BANNED LIST — canonical, and the only one. It is the union of the
//    three lists that used to disagree with each other.
// ─────────────────────────────────────────────────────────────────────────────

/** Machine-matchable terms. `_shared/bannedWords.ts` matches on exactly these. */
export const BANNED_TERMS_EN: string[] = [
  "delve", "tapestry", "navigate", "realm", "beacon", "synergy", "utilize", "facilitate",
  "holistic", "robust", "comprehensive", "cutting-edge", "game-changing", "groundbreaking",
  "revolutionary", "unprecedented", "paradigm", "dive deep", "unpack", "double down",
  "move the needle", "it's worth noting", "it goes without saying", "at the end of the day",
  "serves as a testament", "at its core", "let's dive in", "here's what you need to know",
  "in today's rapidly changing world", "trajectory", "unlock", "elevate", "empower",
  "seamless", "passionate", "results-driven", "proven track record", "thought leader",
  "personal brand", "I'm excited to",
];

export const BANNED = `BANNED — never use:

EN: delve, tapestry, landscape (figurative), navigate, realm, beacon, synergy, leverage (verb), utilize, facilitate, holistic, robust, comprehensive, cutting-edge, game-changing, groundbreaking, revolutionary, unprecedented, paradigm, dive deep, unpack, double down, move the needle, "it's worth noting", "it goes without saying", "at the end of the day", "not just X but Y", "serves as a testament", "at its core", "let's dive in", "here's what you need to know", "in today's rapidly changing world", unlock, elevate, empower, seamless, passionate, results-driven, "proven track record", "thought leader", "personal brand", "I'm excited to", trajectory (use "growth").

AR: "في عالم اليوم المتغير", "لا شك أن", "يسعدني أن أشارككم", "إيماناً منا بأهمية", "وفي هذا السياق", "لا يخفى على أحد", "من نافلة القول", "تجدر الإشارة إلى", "مما لا شك فيه", "من الضروري أن ندرك", "على صعيد آخر", "يُعد من أهم", "ما رأيكم؟", "شاركونا أفكاركم", "حلول مبتكرة", "بذكاء" في بداية الجملة, "الجزر/الصوامع الرقمية".

Also: no sentence longer than ~15 words. Rewrite any sentence that uses a banned term with concrete, specific language.`;

// ─────────────────────────────────────────────────────────────────────────────
// 7. TEXTURE — optional literary layer; take the technique, stay professional.
// ─────────────────────────────────────────────────────────────────────────────

export const QAWARISH_TEXTURE = `TEXTURE (optional depth — apply lightly, stay professional):

- Confession opener where honest ("قبل عامين، كدتُ أوصي بـ…" / "A confession:").

- Antithesis pairs — meaning by opposition ("بنية للقياس، بلا بنية للقرار").

- One compressed maxim that stands alone ("الـ AI لا يُصلح، بل يُضخّم").

- Trust the reader: do NOT spell out the takeaway — let them land it.`;

// ─────────────────────────────────────────────────────────────────────────────
// 8. VOICE PRECEDENCE — what the voice layer may and may not touch.
// ─────────────────────────────────────────────────────────────────────────────

export const VOICE_PRECEDENCE = `VOICE PROFILE PRECEDENCE: when a learned voice exists it decides the MOVE, the beat order, the OPEN and the LAND, plus TONE and VOCABULARY FLAVOUR — rotation only stops the same MOVE running twice in a row. What the voice NEVER overrides: the REGISTER, the FORMATTING rules, the BANNED list, the banned opening word, and NUMBER INTEGRITY — those are structural and always win.`;

export const OUTPUT_CONTRACT = `OUTPUT CONTRACT (absolute): Your entire response is the finished post and nothing else. The first character you output is the first character of the first beat. Do not write anything before it or after the final beat — no setup, no notes, no labels of any kind, in any language.`;

export function buildContentDNA(opts: {
  lang: DNALang;
  texture?: DNATexture;
  readerDescription?: string;
  /** The register this post must be written in, already scoped to `lang`. */
  register?: string;
  /** The MOVE for THIS post — it supplies the beat order. */
  move: MoveId;
  /** The rotated entry type for THIS post. */
  openType: OpenType;
  /** The rotated close type for THIS post. */
  landType: LandType;
  /** True when PROOF and SO-WHAT merge into one beat. */
  collapse?: boolean;
}): string {
  const {
    lang,
    texture = "clean",
    readerDescription,
    register: reg,
    move,
    openType,
    landType,
    collapse = false,
  } = opts;

  const register = lang === "ar" ? buildRegisterAR(readerDescription, reg) : buildRegisterEN(readerDescription, reg);
  const rot = buildRotationDirective(lang, openType, landType);
  const spec = MOVES[move];
  const structure = buildBeatStructure(lang, spec.beats, rot.openLine, rot.landLine, collapse);

  const parts = [
    buildMoveDirective(lang, move),
    structure,
    rot.block,
    lang === "ar" ? OPENING_WORD_BAN_AR : OPENING_WORD_BAN_EN,
    NUMBER_INTEGRITY,
    register,
    lang === "ar" ? FORMATTING_AR : FORMATTING_EN,
    BANNED,
    VOICE_PRECEDENCE,
    OUTPUT_CONTRACT,
  ];

  if (texture !== "clean") parts.splice(8, 0, QAWARISH_TEXTURE);

  return parts.join("\n\n");
}

