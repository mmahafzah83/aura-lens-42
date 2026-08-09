/**
 * The client-side template bank behind the sample panel.
 *
 * Composed from the member's measured traits, instantly and for free, so
 * clicking around teaches the shape of a choice without burning a credit.
 * The gateway is called only when the member presses "Another sample".
 */

export type SegmentKind = "hook" | "body" | "evidence" | "closer";

export interface Segment {
  text: string;
  kind: SegmentKind;
  /** what produced this segment, shown on hover */
  reason?: string;
}

export interface SampleTraits {
  /** measured 0–100 values, missing keys stay missing */
  values: Record<string, number | null>;
  targetChars: number | null;
  hookKey: string;
  closerKey: string;
}

const EN_HOOKS: Record<string, string[]> = {
  contrarian_claim: [
    "The transformation budget was never the constraint.",
    "Most AI programmes in this region fail before a single model is trained.",
  ],
  number_first: [
    "Eleven utilities. Four years of data. One consistent predictor of failure.",
    "18 months, two vendors, zero change in outage minutes.",
  ],
  short_story: [
    "The night the model went live, the supervisor turned it off.",
    "A field engineer showed me a spreadsheet that beat our forecasting model.",
  ],
  question: [
    "Who in your organisation actually owns the data the model runs on?",
    "What happens to the roadmap if the asset register is wrong?",
  ],
  experience_led: [
    "I have sat in four of these steering committees this year.",
    "After a decade of these programmes, the pattern is boring and consistent.",
  ],
  announcement: [
    "We finished the twelve-month review this week.",
    "The programme closed on Thursday. Here is what it actually cost.",
  ],
  other: ["There is a quieter version of this problem nobody puts on a slide."],
};

const EN_BODY: string[] = [
  "Everyone budgeted for the model. Nobody budgeted for the meter data.",
  "The pilot cleared its targets in a controlled sample. Production had years of unreconciled readings behind it, and no owner.",
  "The work that decides the outcome happens before anyone opens a notebook.",
];

const EN_EVIDENCE: string[] = [
  "The outage log and the billing system disagreed on 12% of sites.",
  "Three years of asset records, 41% of them never reconciled.",
  "Two teams, one register, 18 months of drift.",
];

const EN_CLOSERS: Record<string, string[]> = {
  question: ["So who signs off when the model is wrong at 2am?"],
  suspended: ["And that is the part nobody put in the business case."],
  reframe: ["This was never an AI programme. It was an asset-data programme wearing a better name."],
  equation: ["Clean register + owned data + one accountable executive = a model worth funding."],
  number: ["One number decided it: 12%."],
  cta: ["If you are mid-programme, go and audit the register this week."],
  other: ["The rest is procurement."],
};

const AR_HOOKS: Record<string, string[]> = {
  contrarian_claim: ["ميزانية التحول لم تكن يوماً هي العائق."],
  number_first: ["إحدى عشرة مؤسسة. أربع سنوات من البيانات. مؤشر واحد ثابت للفشل."],
  short_story: ["ليلة تشغيل النموذج، أوقفه المشرف بنفسه."],
  question: ["من يملك فعلياً البيانات التي يعمل عليها النموذج في مؤسستك؟"],
  experience_led: ["حضرت أربع لجان توجيهية من هذا النوع هذا العام."],
  announcement: ["أنهينا مراجعة الاثني عشر شهراً هذا الأسبوع."],
  other: ["هناك نسخة أهدأ من هذه المشكلة لا تظهر في العروض."],
};

const AR_BODY = [
  "الجميع خصّص ميزانية للنموذج. لا أحد خصّص ميزانية لبيانات العدادات.",
  "التجربة نجحت في عينة مضبوطة، والإنتاج كان خلفه سنوات من قراءات غير مطابقة بلا مالك.",
];

const AR_EVIDENCE = ["سجل الانقطاعات ونظام الفوترة يختلفان في ١٢٪ من المواقع."];

const AR_CLOSERS: Record<string, string[]> = {
  question: ["من يوقّع القرار حين يخطئ النموذج الساعة الثانية فجراً؟"],
  suspended: ["وهذا الجزء تحديداً لم يدخل دراسة الجدوى."],
  reframe: ["لم يكن هذا برنامج ذكاء اصطناعي. كان برنامج بيانات أصول باسم أجمل."],
  equation: ["سجل نظيف + بيانات مملوكة + مسؤول واحد = نموذج يستحق التمويل."],
  number: ["رقم واحد حسم الأمر: ١٢٪."],
  cta: ["إن كنت في منتصف البرنامج، راجع سجل الأصول هذا الأسبوع."],
  other: ["الباقي مشتريات."],
};

const pick = <T,>(arr: T[] | undefined, seed: number, fallback: T): T =>
  !arr || arr.length === 0 ? fallback : arr[Math.abs(seed) % arr.length];

export interface ComposedSample {
  segments: Segment[];
  text: string;
  isArabic: boolean;
}

/** Compose a sample from the member's measured traits. Pure, instant, free. */
export function composeFromTraits(t: SampleTraits, seed = 0, hookLabel = "your opener bank"): ComposedSample {
  const lang = t.values.language_mix;
  const isArabic = lang !== null && lang !== undefined && lang >= 50;
  const pace = t.values.pace;
  const evidence = t.values.evidence_density;
  const target = t.targetChars ?? 1200;

  const hooks = isArabic ? AR_HOOKS : EN_HOOKS;
  const bodies = isArabic ? AR_BODY : EN_BODY;
  const evidences = isArabic ? AR_EVIDENCE : EN_EVIDENCE;
  const closers = isArabic ? AR_CLOSERS : EN_CLOSERS;

  const hook = pick(hooks[t.hookKey], seed, pick(hooks.contrarian_claim, seed, ""));
  const bodyCount = target < 900 ? 1 : target < 1600 ? 2 : bodies.length;
  const bodyLines = bodies.slice(0, bodyCount);
  const wantsEvidence = evidence === null || evidence === undefined ? true : evidence >= 25;
  const closer = pick(closers[t.closerKey], seed, pick(closers.question, seed, ""));

  const segments: Segment[] = [
    { text: hook, kind: "hook", reason: `Opener: ${hookLabel} — from your opener bank` },
  ];
  for (const line of bodyLines) segments.push({ text: line, kind: "body" });
  if (wantsEvidence) {
    segments.push({
      text: pick(evidences, seed, evidences[0]),
      kind: "evidence",
      reason:
        evidence === null || evidence === undefined
          ? "Evidence line — Aura's default until evidence density is measured"
          : `Evidence density ${Math.round(evidence)}% — you put a figure before the close`,
    });
  }
  segments.push({
    text: closer,
    kind: "closer",
    reason: `Closer: ${t.closerKey.replace(/_/g, " ")} — from your closer bank`,
  });

  const join = pace !== null && pace !== undefined && pace >= 60 ? "\n\n" : "\n";
  return { segments, text: segments.map((s) => s.text).join(join), isArabic };
}

/** The control condition: what everyone else's LinkedIn post looks like. */
export const GENERIC_AI_SAMPLE = `🚀 Excited to share some thoughts on digital transformation!

In today's fast-paced world, organisations must leverage cutting-edge AI to stay ahead of the curve. Here are my top 3 takeaways:

✅ Data is the new oil
✅ Culture eats strategy for breakfast
✅ Innovation starts with people

At the end of the day, it's all about delivering value and empowering teams to unlock their full potential.

What are your thoughts? Let me know in the comments 👇

#AI #DigitalTransformation #Leadership #Innovation`;

/** Split a composed sample's plain text back into paragraphs for the pace join. */
export function segmentsToText(segments: Segment[], clipped: boolean): string {
  return segments.map((s) => s.text).join(clipped ? "\n\n" : "\n");
}

/* ── Compatibility shim for the legacy Voice Engine section ───────────────
 * `sampleBank.ts` was a second, divergent copy of this module using the old
 * opener vocabulary. It is deleted; the one legacy caller maps its own ids
 * onto the current keys here, so there is still only one template bank.
 */
export interface VoiceSpec {
  language: "en" | "ar";
  tone?: string;
  rhythm?: string;
  emoji?: string;
  opener?: string;
  closer?: string;
  structure?: string;
  length?: number;
}

const LEGACY_OPENER: Record<string, string> = {
  claim: "contrarian_claim",
  number: "number_first",
  story: "short_story",
  question: "question",
  experience: "experience_led",
  announcement: "announcement",
};

export const GENERIC_SAMPLE = GENERIC_AI_SAMPLE;

export function composeSample(spec: VoiceSpec, seed = 0): ComposedSample {
  const values: Record<string, number | null> = {
    pace: spec.rhythm === "clipped" ? 82 : spec.rhythm === "flowing" ? 28 : 50,
    emoji: spec.emoji && spec.emoji !== "none" ? 40 : 0,
    arabic: spec.language === "ar" ? 100 : 0,
  };
  return composeFromTraits(
    {
      values,
      targetChars: spec.length ?? null,
      hookKey: LEGACY_OPENER[spec.opener ?? ""] ?? "contrarian_claim",
      closerKey: spec.closer ?? "question",
    },
    seed,
  );
}
