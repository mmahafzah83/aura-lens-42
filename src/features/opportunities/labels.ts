/**
 * SENTENCES ONLY. Every label word lives in public.oe_vocabulary and is read
 * through useVocab — nothing here may duplicate one.
 */
export const opportunitySentences = {
  en: {
    opportunities: "Opportunities",
    part: "Which part?",
    understood: "Understood — fewer like this for the next six weeks.",
    understoodLong: "Understood — fewer like this for the next ninety days.",
    issuer: "This source", level: "This level", place: "This place", type: "This type", just: "Just this one",
    openAura: "Open Aura", expired: "This link has expired.", unanswered: "unanswered",
  },
  ar: {
    opportunities: "الفرص",
    part: "أي جزء تحديداً؟",
    understood: "فهمنا — سنقلّل ما يشبهها خلال الأسابيع الستة المقبلة.",
    understoodLong: "فهمنا — سنقلّل ما يشبهها خلال التسعين يوماً المقبلة.",
    issuer: "هذه الجهة", level: "هذا المستوى", place: "هذا المكان", type: "هذا النوع", just: "هذه فقط",
    openAura: "افتح Aura", expired: "انتهت صلاحية هذا الرابط.", unanswered: "بلا رد",
  },
} as const;
