// Aura MOVES — the consolidated table of post kinds. THE source of truth.
//
// This file is TWINNED with `src/constants/moves.ts`, character for character
// from `export type MoveBeat` onwards, and `scripts/check-vocabulary.mjs`
// fails the build if the two drift apart. The client needs the table (the
// Voice & Writing tab teaches members the moves by name) and Deno cannot import
// from `src/`, so the table is copied and policed rather than duplicated by
// hand.
//
// It replaces three competing lists that never knew about each other:
//   - `POST_TYPE_INSTRUCTIONS_EN` / `_AR` (8 Flash types) in
//     `generate-authority-content`
//   - `FRAMEWORK_PROMPTS` (7 acronym frameworks) in the same file
//   - `MOVES_LIBRARY` in `src/components/voice/voiceOptions.ts`
// Their ids survive as aliases in `MOVE_ALIASES` so old callers keep working.
//
// RANGE IS NOT RANDOMNESS. A real writer has a recognisable core and varies
// within it; a machine that rotates freely reads as inconsistent, which is a
// different way of failing to sound like a person. Rotation is a constraint
// against repetition, always subordinate to a learned voice once one exists.

export type MoveBeat = "OPEN" | "GROUND" | "TURN" | "PROOF" | "SO-WHAT" | "LAND";

/** The grammar. Every move satisfies this SET of beats; only the ORDER moves. */
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
  /** Member-facing name, used in the Voice & Writing tab. */
  label_en: string;
  label_ar: string;
  def_en: string;
  def_ar: string;
  ex_en: string;
  ex_ar: string;
  /**
   * The permitted beat orderings. The FIRST beat of an ordering is the entry:
   * it does the work of OPEN as well, which is how a teardown can lead with
   * PROOF and reach TURN late. Declared here rather than improvised by the
   * model.
   */
  orderings: readonly (readonly MoveBeat[])[];
  rhythm: MoveRhythm;
  /** OPEN types that fit this move. Rotation picks inside this set. */
  opens: readonly string[];
  /** LAND types that fit this move. */
  lands: readonly string[];
  /** True when this move is always a four-beat post: PROOF folds into the run. */
  alwaysCollapse?: boolean;
}

export const MOVE_SPECS: Record<MoveId, MoveSpec> = {
  contrarian_argument: {
    label_en: "Contrarian argument",
    label_ar: "حجة معاكسة",
    def_en: "Take a position against what the sector believes, then hold it with evidence. Concede what is genuinely true before breaking it.",
    def_ar: "خُذ موقفاً يخالف ما يعتقده القطاع، ثم دافع عنه بالأدلة. اعترف بما هو صحيح فعلاً قبل أن تكسره.",
    ex_en: "The transformation office is not slowing delivery down. It is the only thing holding it together — and the org chart says otherwise on purpose.",
    ex_ar: "مكتب التحول لا يُبطئ التنفيذ. هو الشيء الوحيد الذي يمسكه — والهيكل التنظيمي يقول غير ذلك بقصد.",
    orderings: [
      ["OPEN", "GROUND", "TURN", "PROOF", "SO-WHAT", "LAND"],
      ["OPEN", "TURN", "GROUND", "PROOF", "SO-WHAT", "LAND"],
    ],
    rhythm: "line_broken",
    opens: ["contrarian", "specific_number", "question"],
    lands: ["statement", "contrast", "consequence"],
  },
  case_teardown: {
    label_en: "Case teardown",
    label_ar: "تشريح حالة",
    def_en: "Lead with the specific thing that happened, take it apart piece by piece, and reach the flaw underneath late.",
    def_ar: "ابدأ بالشيء المحدد الذي حدث، وفكّكه قطعة قطعة، وابلغ الخلل تحت السطح متأخراً.",
    ex_en: "Nine of the eleven dashboards were built for a decision nobody makes any more. We rebuilt three. The other six were switched off and nobody called.",
    ex_ar: "تسع لوحات من إحدى عشرة بُنيت لقرار لم يعد أحد يتخذه. أعدنا بناء ثلاث. أُطفئت الستة الباقية ولم يسأل أحد.",
    orderings: [
      ["PROOF", "TURN", "GROUND", "SO-WHAT", "LAND"],
      ["PROOF", "GROUND", "TURN", "SO-WHAT", "LAND"],
    ],
    rhythm: "list_bearing",
    opens: ["specific_number", "scene", "confession"],
    lands: ["statement", "consequence", "invitation"],
  },
  pattern_across_three: {
    label_en: "Pattern across three",
    label_ar: "نمط في ثلاث حالات",
    def_en: "Name a recurring pattern, then show it in three separate places. The third instance is what makes it a pattern rather than an anecdote.",
    def_ar: "سمِّ نمطاً متكرراً، ثم أظهره في ثلاثة مواضع منفصلة. الحالة الثالثة هي ما يجعله نمطاً لا حكاية.",
    ex_en: "Three utilities, three different vendors, the same failure: the asset register was never anyone's job.",
    ex_ar: "ثلاث مرافق، ثلاثة مورّدين، والفشل نفسه: سجل الأصول لم يكن مهمة أحد.",
    orderings: [
      ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT", "LAND"],
      ["OPEN", "PROOF", "TURN", "GROUND", "SO-WHAT", "LAND"],
    ],
    rhythm: "list_bearing",
    opens: ["specific_number", "contrarian", "scene"],
    lands: ["statement", "contrast", "invitation"],
  },
  prediction: {
    label_en: "Prediction",
    label_ar: "تنبؤ",
    def_en: "Make one specific, dateable claim about what happens next, and earn it with what is already visible today.",
    def_ar: "اطرح ادعاءً واحداً محدداً وقابلاً للتأريخ عمّا سيحدث تالياً، واستحقّه بما هو ظاهر اليوم.",
    ex_en: "Within two budget cycles, this team will be asked to defend a system it never chose. The procurement file already shows why.",
    ex_ar: "خلال دورتَي ميزانية، سيُطلب من هذا الفريق الدفاع عن نظام لم يختره. ملف الشراء يوضح السبب سلفاً.",
    orderings: [
      ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT", "LAND"],
      ["OPEN", "PROOF", "GROUND", "TURN", "SO-WHAT", "LAND"],
    ],
    rhythm: "prose",
    opens: ["prediction", "specific_number", "contrarian"],
    lands: ["consequence", "statement", "question"],
  },
  lesson_from_failure: {
    label_en: "Lesson from failure",
    label_ar: "درس من فشل",
    def_en: "Start inside something that went wrong for you, stay in it long enough to be uncomfortable, then extract the one transferable lesson.",
    def_ar: "ابدأ داخل شيء أخطأت فيه، وابقَ فيه حتى يصبح غير مريح، ثم استخرج الدرس الواحد القابل للنقل.",
    ex_en: "I recommended the platform. Two years on, I would recommend the opposite — and the reason was in the first workshop.",
    ex_ar: "أنا من أوصى بالمنصة. بعد عامين، أوصي بالعكس — والسبب كان في الورشة الأولى.",
    orderings: [
      ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT", "LAND"],
      ["PROOF", "TURN", "SO-WHAT", "GROUND", "LAND"],
    ],
    rhythm: "prose",
    opens: ["confession", "scene", "question"],
    lands: ["statement", "invitation", "contrast"],
  },
  single_observation: {
    label_en: "Single observation",
    label_ar: "ملاحظة واحدة",
    def_en: "One thing you noticed, held steady for the whole post. No list, no second argument — the proof is folded into the telling.",
    def_ar: "شيء واحد لاحظته، مُحكم عبر المنشور كله. لا قائمة ولا حجة ثانية — الدليل مدمج في السرد نفسه.",
    ex_en: "The steering meeting ran forty minutes. Nobody mentioned the customer once. That is the whole strategy, written in the agenda.",
    ex_ar: "استمر اجتماع التوجيه أربعين دقيقة. لم يُذكر العميل مرة واحدة. تلك هي الاستراتيجية كاملة، مكتوبة في جدول الأعمال.",
    orderings: [
      ["GROUND", "TURN", "PROOF", "LAND"],
      ["GROUND", "PROOF", "TURN", "LAND"],
    ],
    rhythm: "prose",
    opens: ["scene", "question", "contrarian"],
    lands: ["statement", "contrast", "consequence"],
    alwaysCollapse: true,
  },
  comparison: {
    label_en: "Comparison",
    label_ar: "مقابلة",
    def_en: "Set two readings of the same thing against each other — the board view and the field view, then and now — and let the gap carry the point.",
    def_ar: "قابِل قراءتين للشيء نفسه — رؤية المجلس ورؤية الميدان، أو الأمس واليوم — واترك الفجوة تحمل المعنى.",
    ex_en: "On the board pack it is a delivery risk. On the floor it is a Tuesday. Same programme, two languages, one of them funded.",
    ex_ar: "في ملف المجلس هو مخاطرة تنفيذ. في الميدان هو يوم ثلاثاء عادي. البرنامج نفسه، بلغتين، واحدة منهما ممولة.",
    orderings: [
      ["OPEN", "GROUND", "TURN", "PROOF", "SO-WHAT", "LAND"],
      ["TURN", "GROUND", "PROOF", "SO-WHAT", "LAND"],
    ],
    rhythm: "line_broken",
    opens: ["contrarian", "scene", "specific_number"],
    lands: ["contrast", "statement", "consequence"],
  },
  question_led_inquiry: {
    label_en: "Question-led inquiry",
    label_ar: "تحقيق بسؤال",
    def_en: "Open on one question the reader cannot answer comfortably, then work it honestly — including where the answer is still missing.",
    def_ar: "افتح بسؤال واحد لا يستطيع القارئ الإجابة عنه بارتياح، ثم اعمل عليه بصدق — بما في ذلك حيث لا تزال الإجابة غائبة.",
    ex_en: "Who owns the number on slide four? I asked in three organisations. I got three different names and one shrug.",
    ex_ar: "من يملك الرقم في الشريحة الرابعة؟ سألتُ في ثلاث جهات. حصلتُ على ثلاثة أسماء مختلفة وهزّة كتف.",
    orderings: [
      ["OPEN", "GROUND", "PROOF", "TURN", "SO-WHAT", "LAND"],
      ["OPEN", "TURN", "PROOF", "GROUND", "SO-WHAT", "LAND"],
    ],
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
  // Flash post types (EN keys)
  reveal: "contrarian_argument",
  pattern: "pattern_across_three",
  tension: "comparison",
  win: "case_teardown",
  prediction: "prediction",
  framework: "pattern_across_three",
  lesson: "lesson_from_failure",
  inspiration: "single_observation",
  // Flash post types (AR labels, as the client sends them)
  "كشف": "contrarian_argument",
  "نمط": "pattern_across_three",
  "خلل": "comparison",
  "إنجاز": "case_teardown",
  "تنبؤ": "prediction",
  "إطار": "pattern_across_three",
  "درس": "lesson_from_failure",
  "إلهام": "single_observation",
  // The retired acronym frameworks
  hook_insight_question: "question_led_inquiry",
  story_lesson_question: "lesson_from_failure",
  slap: "contrarian_argument",
  bab: "comparison",
  pas: "case_teardown",
  wwh: "pattern_across_three",
  chef: "pattern_across_three",
  // Voice-tab structure picks
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

/** Member-facing list for the Voice & Writing tab. */
export function moveLabels(lang: "ar" | "en"): string[] {
  return MOVE_IDS.map((id) => (lang === "ar" ? MOVE_SPECS[id].label_ar : MOVE_SPECS[id].label_en));
}
