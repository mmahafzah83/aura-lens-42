/**
 * Client-side sample composer for the "Test your voice" panel.
 *
 * A gateway call per click would be slow and would burn a credit on every
 * interaction, which kills the click-around-and-learn behaviour the panel
 * exists to create. So changing any setting re-composes locally and for free.
 * Its job is to teach the SHAPE of a choice, not to publish.
 */

export interface VoiceSpec {
  language: "en" | "ar" | "mixed";
  tone: string;
  rhythm: string;
  emoji: string;
  opener: string;
  closer: string;
  structure: string;
  length: number;
}

export interface ComposedSample {
  hook: string;
  body: string;
  closer: string;
  text: string;
  isArabic: boolean;
}

const EN_HOOKS: Record<string, string[]> = {
  claim: [
    "Seventy percent of AI value in this region has nothing to do with the software.",
    "The transformation budget is not the constraint. It never was.",
  ],
  number: [
    "Eleven utilities. Four years of data. One consistent predictor of failure.",
    "18 months. Two vendors. Zero change in outage minutes.",
  ],
  story: [
    "The night the model went live, the supervisor turned it off.",
    "A field engineer showed me a spreadsheet that beat our forecasting model.",
  ],
  question: [
    "Who in your organisation actually owns the data the model runs on?",
    "What happens to your roadmap if the asset register is wrong?",
  ],
};

const EN_BODY: Record<string, string[]> = {
  tension_insight: [
    "Everyone budgeted for the model. Nobody budgeted for the meter data.",
    "The pilot cleared its targets in a controlled sample. Production had four years of unreconciled readings behind it, and no owner.",
  ],
  claim_three_proofs: [
    "One: the asset register was three years stale.",
    "Two: the outage log and the billing system disagreed on 12% of sites.",
    "Three: nobody in the operating committee owned either of them.",
  ],
  story_lesson: [
    "He overrode it every night for a month, and he was right every time.",
    "We had trained the model on day-shift patterns and deployed it against a night-shift load curve.",
  ],
};

const EN_CLOSERS: Record<string, string[]> = {
  question: ["So who signs off when the model is wrong at 2am?"],
  suspended: ["And that is the part nobody put in the business case."],
  reframe: ["This was never an AI programme. It was an asset-data programme wearing a better name."],
  equation: ["Clean asset register + owned data + one accountable executive = a model worth funding."],
};

const AR_HOOKS: Record<string, string[]> = {
  claim: ["٧٠٪ من قيمة الذكاء الاصطناعي في المنطقة لا تأتي من البرمجية."],
  number: ["إحدى عشرة مؤسسة. أربع سنوات من البيانات. مؤشر واحد ثابت للفشل."],
  story: ["ليلة تشغيل النموذج، أوقفه المشرف بنفسه."],
  question: ["من يملك فعلياً البيانات التي يعمل عليها النموذج في مؤسستك؟"],
};

const AR_BODY: Record<string, string[]> = {
  tension_insight: ["الجميع خصّص ميزانية للنموذج. لا أحد خصّص ميزانية لبيانات العدادات."],
  claim_three_proofs: ["أولاً: سجل الأصول متأخر ثلاث سنوات.", "ثانياً: سجل الانقطاعات ونظام الفوترة يختلفان في ١٢٪ من المواقع.", "ثالثاً: لا أحد في اللجنة التنفيذية يملك أياً منهما."],
  story_lesson: ["تجاوزه كل ليلة لمدة شهر، وكان محقاً في كل مرة."],
};

const AR_CLOSERS: Record<string, string[]> = {
  question: ["من يوقّع القرار حين يخطئ النموذج الساعة الثانية فجراً؟"],
  suspended: ["وهذا الجزء تحديداً لم يدخل دراسة الجدوى."],
  reframe: ["لم يكن هذا برنامج ذكاء اصطناعي. كان برنامج بيانات أصول باسم أجمل."],
  equation: ["سجل أصول نظيف + بيانات مملوكة + مسؤول تنفيذي واحد = نموذج يستحق التمويل."],
};

const pick = <T,>(arr: T[] | undefined, seed: number, fallback: T): T => {
  if (!arr || arr.length === 0) return fallback;
  return arr[seed % arr.length];
};

const joinByRhythm = (lines: string[], rhythm: string): string => {
  if (rhythm === "clipped") return lines.join("\n\n");
  if (rhythm === "flowing") return lines.join(" ");
  return lines.join("\n");
};

/** Compose a sample instantly from the member's current settings. */
export function composeSample(spec: VoiceSpec, seed = 0): ComposedSample {
  const isArabic = spec.language === "ar";
  const hooks = isArabic ? AR_HOOKS : EN_HOOKS;
  const bodies = isArabic ? AR_BODY : EN_BODY;
  const closers = isArabic ? AR_CLOSERS : EN_CLOSERS;

  const hook = pick(hooks[spec.opener], seed, pick(hooks.claim, seed, ""));
  let lines = bodies[spec.structure] ?? bodies.tension_insight;

  // Length band decides how much proof survives.
  if (spec.length < 1000) lines = lines.slice(0, 1);
  else if (spec.length < 1700) lines = lines.slice(0, 2);

  let body = joinByRhythm(lines, spec.rhythm);

  if (spec.tone === "provocateur") {
    body += isArabic ? "\nولا أحد يقول هذا بصوت عالٍ." : "\nAnd nobody says this out loud in the steering committee.";
  } else if (spec.tone === "warm_mentor") {
    body += isArabic ? "\nلو عدت بالزمن، لبدأت من هنا." : "\nIf I ran it again, this is where I would start.";
  } else if (spec.tone === "cool_analyst") {
    body += isArabic ? "\nالنمط نفسه تكرر في كل الحالات." : "\nThe same pattern held across every case we reviewed.";
  }

  const closer = pick(closers[spec.closer], seed, pick(closers.question, seed, ""));

  let text = `${hook}\n\n${body}\n\n${closer}`;

  if (spec.language === "mixed") {
    text = `${text}\n\nالخلاصة: القرار تشغيلي، لا تقني.`;
  }
  if (spec.emoji === "rare") text = text.replace(hook, `${hook} 📍`);
  if (spec.emoji === "some") {
    text = text.replace(hook, `${hook} ⚡`).replace(closer, `${closer} 👇`);
  }

  return { hook, body, closer, text, isArabic: isArabic || spec.language === "mixed" ? isArabic : false };
}

/** The deliberately generic LinkedIn post, for the comparison toggle. */
export const GENERIC_SAMPLE = `🚀 Excited to share some thoughts on digital transformation!

In today's fast-paced world, organizations must adapt. Here's what I've learned:

✅ Data is the new oil
✅ Culture eats strategy for breakfast
✅ Failing fast is the key to success
✅ Leadership starts with empathy
✅ The future is already here

What are your thoughts? Let me know in the comments 👇

#DigitalTransformation #Leadership #Innovation`;
