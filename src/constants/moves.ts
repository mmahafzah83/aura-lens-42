// Aura MOVES — client mirror of `supabase/functions/_shared/moves.ts`.
//
// TWINNED: everything from `export type MoveBeat` onwards is identical to the
// Deno original, character for character, and `scripts/check-vocabulary.mjs`
// fails the build if the two drift apart. Edit one, edit the other.
//
// This is the ONLY move table the client may read. `voiceOptions.ts` derives
// its library from here rather than maintaining a list of its own.
//
// RANGE IS NOT RANDOMNESS. Rotation is a constraint against repetition, always
// subordinate to a learned voice once one exists.

export type MoveBeat = "OPEN" | "GROUND" | "TURN" | "PROOF" | "SO-WHAT" | "LAND";

/** The grammar. The six beats are a SET a post must satisfy — not a sequence.
 *  Each MOVE below declares which of them it uses AND IN WHAT ORDER. */
export const STRUCTURE_BEATS: readonly MoveBeat[] = [
  "OPEN",
  "GROUND",
  "TURN",
  "PROOF",
  "SO-WHAT",
  "LAND",
];

export const MOVE_IDS = [
  "contrarian_argument",
  "case_teardown",
  "pattern_across_three",
  "prediction",
  "lesson_from_failure",
  "single_observation",
  "comparison",
  "question_led_inquiry",
] as const;
export type MoveId = (typeof MOVE_IDS)[number];

/** The lighter fourth dial. Tied to the MOVE, never rotated on its own — a
 *  teardown is naturally list-bearing, an observation naturally is not. */
export type MoveRhythm = "prose" | "line_broken" | "list_bearing";

export interface MoveSpec {
  id: MoveId;
  /** Member-facing name, used in the Voice & Writing tab. */
  label_en: string;
  label_ar: string;
  /** What this kind of post DOES — the one line that separates it from the others. */
  whatItDoes: string;
  whatItDoes_ar: string;
  /**
   * The beat order for this move. The FIRST beat is the entry: it does the work
   * of an opening as well, which is how a teardown leads with PROOF and reaches
   * TURN late. No two moves share a beats array — if they did, one would be a
   * duplicate.
   */
  beats: readonly MoveBeat[];
  /** How to write it. Goes into the prompt verbatim. */
  guidance: string;
  guidance_ar: string;
  ex_en: string;
  ex_ar: string;
  rhythm: MoveRhythm;
  /** OPEN types that fit this move. Rotation picks inside this set. */
  opens: readonly string[];
  /** LAND types that fit this move. */
  lands: readonly string[];
}

export const MOVES: Record<MoveId, MoveSpec> = {
  contrarian_argument: {
    id: "contrarian_argument",
    label_en: "Contrarian argument",
    label_ar: "حجة معاكسة",
    whatItDoes: "Takes a position against what the sector believes and holds it.",
    whatItDoes_ar: "يأخذ موقفاً يخالف ما يعتقده القطاع ويدافع عنه.",
    beats: ["OPEN", "TURN", "GROUND", "PROOF", "SO-WHAT", "LAND"],
    guidance: "State the position in the first line. Break the received view immediately, THEN concede what is genuinely true about it, then hold your ground with the evidence. Never soften the claim to make it agreeable.",
    guidance_ar: "اطرح الموقف في السطر الأول. اكسر الرأي السائد فوراً، ثم اعترف بما هو صحيح فيه فعلاً، ثم ثبّت موقفك بالأدلة. لا تلطّف الادعاء ليصبح مقبولاً.",
    ex_en: "The transformation office is not slowing delivery down. It is the only thing holding it together — and the org chart says otherwise on purpose.",
    ex_ar: "مكتب التحول لا يُبطئ التنفيذ. هو الشيء الوحيد الذي يمسكه — والهيكل التنظيمي يقول غير ذلك بقصد.",
    rhythm: "line_broken",
    opens: ["contrarian", "specific_number", "question"],
    lands: ["statement", "contrast", "consequence"],
  },
  case_teardown: {
    id: "case_teardown",
    label_en: "Case teardown",
    label_ar: "تشريح حالة",
    whatItDoes: "Takes one specific thing that happened apart, piece by piece.",
    whatItDoes_ar: "يفكّك شيئاً محدداً حدث فعلاً، قطعة قطعة.",
    beats: ["PROOF", "GROUND", "TURN", "SO-WHAT", "LAND"],
    guidance: "Enter on the evidence itself — the thing that happened, named and dated. Describe the setting only after the reader is already inside the case. The flaw underneath arrives late, once the detail has earned it.",
    guidance_ar: "ابدأ بالدليل نفسه — الشيء الذي حدث، مسمّى ومؤرّخاً. لا تشرح السياق إلا بعد أن يكون القارئ داخل الحالة. الخلل تحت السطح يأتي متأخراً، بعد أن تستحقه التفاصيل.",
    ex_en: "Nine of the eleven dashboards were built for a decision nobody makes any more. We rebuilt three. The other six were switched off and nobody called.",
    ex_ar: "تسع لوحات من إحدى عشرة بُنيت لقرار لم يعد أحد يتخذه. أعدنا بناء ثلاث. أُطفئت الستة الباقية ولم يسأل أحد.",
    rhythm: "list_bearing",
    opens: ["specific_number", "scene", "confession"],
    lands: ["statement", "consequence", "invitation"],
  },
  pattern_across_three: {
    id: "pattern_across_three",
    label_en: "Pattern across three",
    label_ar: "نمط في ثلاث حالات",
    whatItDoes: "Shows the same failure in three separate places, so it stops being an anecdote.",
    whatItDoes_ar: "يُظهر الفشل نفسه في ثلاثة مواضع منفصلة، فيتوقف عن كونه حكاية.",
    beats: ["OPEN", "PROOF", "TURN", "GROUND", "SO-WHAT", "LAND"],
    guidance: "Name the pattern, then give the three instances back to back with nothing between them. The third one is the whole argument. Explain the conditions that produce it only after all three have landed.",
    guidance_ar: "سمِّ النمط، ثم اسرد الحالات الثلاث متتابعة بلا حشو بينها. الحالة الثالثة هي الحجة كلها. لا تشرح الظروف التي تُنتجه إلا بعد أن تستقر الثلاث.",
    ex_en: "Three utilities, three different vendors, the same failure: the asset register was never anyone's job.",
    ex_ar: "ثلاث مرافق، ثلاثة مورّدين، والفشل نفسه: سجل الأصول لم يكن مهمة أحد.",
    rhythm: "list_bearing",
    opens: ["specific_number", "contrarian", "scene"],
    lands: ["statement", "contrast", "invitation"],
  },
  prediction: {
    id: "prediction",
    label_en: "Prediction",
    label_ar: "تنبؤ",
    whatItDoes: "Makes one dateable claim about what happens next and earns it.",
    whatItDoes_ar: "يطرح ادعاءً واحداً قابلاً للتأريخ عمّا سيحدث تالياً ويستحقّه.",
    beats: ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT", "LAND"],
    guidance: "The claim must be specific enough to be wrong, and it must carry a horizon — two budget cycles, next fiscal year. Build from what is already visible today, and name what would have to be true for you to be wrong.",
    guidance_ar: "يجب أن يكون الادعاء محدداً بما يكفي ليكون قابلاً للخطأ، وأن يحمل أفقاً زمنياً — دورتَي ميزانية، السنة المالية القادمة. ابنِ من الظاهر اليوم، وسمِّ ما يجب أن يصحّ لتكون مخطئاً.",
    ex_en: "Within two budget cycles, this team will be asked to defend a system it never chose. The procurement file already shows why.",
    ex_ar: "خلال دورتَي ميزانية، سيُطلب من هذا الفريق الدفاع عن نظام لم يختره. ملف الشراء يوضح السبب سلفاً.",
    rhythm: "prose",
    opens: ["prediction", "specific_number", "contrarian"],
    lands: ["consequence", "statement", "question"],
  },
  lesson_from_failure: {
    id: "lesson_from_failure",
    label_en: "Lesson from failure",
    label_ar: "درس من فشل",
    whatItDoes: "Stays inside something that went wrong for you long enough to be uncomfortable.",
    whatItDoes_ar: "يبقى داخل شيء أخطأت فيه حتى يصبح غير مريح.",
    beats: ["PROOF", "TURN", "SO-WHAT", "GROUND", "LAND"],
    guidance: "Enter on what you did, not on the lesson. Own the decision in the first person before you explain the conditions around it — the context arrives late, as mitigation offered after the admission, never before it. One transferable lesson, not three.",
    guidance_ar: "ابدأ بما فعلته، لا بالدرس. تحمّل القرار بصيغة المتكلم قبل شرح الظروف المحيطة به — السياق يأتي متأخراً، بعد الاعتراف لا قبله. درس واحد قابل للنقل، لا ثلاثة.",
    ex_en: "I recommended the platform. Two years on, I would recommend the opposite — and the reason was in the first workshop.",
    ex_ar: "أنا من أوصى بالمنصة. بعد عامين، أوصي بالعكس — والسبب كان في الورشة الأولى.",
    rhythm: "prose",
    opens: ["confession", "scene", "question"],
    lands: ["statement", "invitation", "contrast"],
  },
  single_observation: {
    id: "single_observation",
    label_en: "Single observation",
    label_ar: "ملاحظة واحدة",
    whatItDoes: "Holds one thing you noticed steady for the whole post.",
    whatItDoes_ar: "يُحكم شيئاً واحداً لاحظته عبر المنشور كله.",
    beats: ["GROUND", "TURN", "PROOF", "LAND"],
    guidance: "Four beats, never more. No list, no second argument, and no explicit SO-WHAT — the proof is folded into the telling and the reader draws the conclusion themselves. If you find yourself adding a second example, this is the wrong move.",
    guidance_ar: "أربع حركات، لا أكثر. لا قائمة ولا حجة ثانية ولا أثر معلن — الدليل مدمج في السرد والقارئ يستنتج بنفسه. إن وجدت نفسك تضيف مثالاً ثانياً فهذه ليست الحركة المناسبة.",
    ex_en: "The steering meeting ran forty minutes. Nobody mentioned the customer once. That is the whole strategy, written in the agenda.",
    ex_ar: "استمر اجتماع التوجيه أربعين دقيقة. لم يُذكر العميل مرة واحدة. تلك هي الاستراتيجية كاملة، مكتوبة في جدول الأعمال.",
    rhythm: "prose",
    opens: ["scene", "question", "contrarian"],
    lands: ["statement", "contrast", "consequence"],
  },
  comparison: {
    id: "comparison",
    label_en: "Comparison",
    label_ar: "مقابلة",
    whatItDoes: "Sets two readings of the same thing against each other and lets the gap carry the point.",
    whatItDoes_ar: "يقابل قراءتين للشيء نفسه ويترك الفجوة تحمل المعنى.",
    beats: ["TURN", "GROUND", "PROOF", "SO-WHAT", "LAND"],
    guidance: "Enter on the gap itself — the board view against the field view, then against now. There is no separate opening: the contradiction IS the first line. Keep both sides in the same grammar so the difference is visible at a glance.",
    guidance_ar: "ابدأ بالفجوة نفسها — رؤية المجلس مقابل رؤية الميدان، أو الأمس مقابل اليوم. لا افتتاح منفصل: التناقض هو السطر الأول. اجعل الطرفين بالتركيب اللغوي نفسه ليظهر الفرق من نظرة واحدة.",
    ex_en: "On the board pack it is a delivery risk. On the floor it is a Tuesday. Same programme, two languages, one of them funded.",
    ex_ar: "في ملف المجلس هو مخاطرة تنفيذ. في الميدان هو يوم ثلاثاء عادي. البرنامج نفسه، بلغتين، واحدة منهما ممولة.",
    rhythm: "line_broken",
    opens: ["contrarian", "scene", "specific_number"],
    lands: ["contrast", "statement", "consequence"],
  },
  question_led_inquiry: {
    id: "question_led_inquiry",
    label_en: "Question-led inquiry",
    label_ar: "تحقيق بسؤال",
    whatItDoes: "Works one uncomfortable question honestly, including where the answer is missing.",
    whatItDoes_ar: "يعمل على سؤال واحد غير مريح بصدق، بما في ذلك حيث تغيب الإجابة.",
    beats: ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT"],
    guidance: "Open on the question and do not answer it in the next line. End on the SO-WHAT with no closing flourish — this move has no LAND beat and must not manufacture a tidy final number. Leaving the question partly open is the honest ending.",
    guidance_ar: "افتح بالسؤال ولا تُجب عنه في السطر التالي. اختم بالأثر بلا زخرفة ختامية — هذه الحركة بلا حركة خاتمة ولا يجوز أن تصطنع رقماً أخيراً مرتباً. ترك السؤال مفتوحاً جزئياً هو الخاتمة الصادقة.",
    ex_en: "Who owns the number on slide four? I asked in three organisations. I got three different names and one shrug.",
    ex_ar: "من يملك الرقم في الشريحة الرابعة؟ سألتُ في ثلاث جهات. حصلتُ على ثلاثة أسماء مختلفة وهزّة كتف.",
    rhythm: "line_broken",
    opens: ["question", "confession", "contrarian"],
    lands: ["question", "statement", "invitation"],
  },
};

/**
 * The ids the three retired lists used, mapped onto the move each one really
 * was. Flash post types (`reveal` … `inspiration`) and the acronym frameworks
 * (`slap`, `bab`, `pas` …) both resolve here, so no caller had to change.
 */
export const MOVE_ALIASES: Record<string, MoveId> = {
  reveal: "contrarian_argument",
  pattern: "pattern_across_three",
  tension: "comparison",
  win: "case_teardown",
  prediction: "prediction",
  framework: "pattern_across_three",
  lesson: "lesson_from_failure",
  inspiration: "single_observation",
  "كشف": "contrarian_argument",
  "نمط": "pattern_across_three",
  "خلل": "comparison",
  "إنجاز": "case_teardown",
  "تنبؤ": "prediction",
  "إطار": "pattern_across_three",
  "درس": "lesson_from_failure",
  "إلهام": "single_observation",
  hook_insight_question: "question_led_inquiry",
  story_lesson_question: "lesson_from_failure",
  slap: "contrarian_argument",
  bab: "comparison",
  pas: "case_teardown",
  wwh: "pattern_across_three",
  chef: "pattern_across_three",
  tension_insight: "contrarian_argument",
  claim_three_proofs: "pattern_across_three",
  story_lesson: "lesson_from_failure",
};

/** Resolve any legacy post-type / framework id to a move. Null when unknown. */
export function resolveMove(id: string | null | undefined): MoveId | null {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  if ((MOVE_IDS as readonly string[]).includes(raw)) return raw as MoveId;
  const lower = raw.toLowerCase();
  if ((MOVE_IDS as readonly string[]).includes(lower)) return lower as MoveId;
  return MOVE_ALIASES[raw] || MOVE_ALIASES[lower] || null;
}

/** Member-facing list for the Voice & Writing tab. One source, no second list. */
export function moveLabels(lang: "ar" | "en"): string[] {
  return MOVE_IDS.map((id) => (lang === "ar" ? MOVES[id].label_ar : MOVES[id].label_en));
}

/** True when two beat orderings are the same shape — the L2 rotation test. */
export function sameBeats(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return false;
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
