export const opportunityLabels = {
  en: {
    opportunity: "Opportunity", opportunities: "Opportunities", open: "open now", early: "early signal",
    fits: "Fits you", win: "You could win it", right: "That's right", notQuite: "Not quite",
    notArea: "Not my area", lessIssuer: "Less from this issuer", noted: "Noted — thank you.",
    part: "Which part?", understood: "Understood — fewer like this for the next six weeks.",
    understoodLong: "Understood — fewer like this for the next ninety days.", empty: "Nothing strong today",
    issuer: "This issuer", level: "This level", place: "This place", type: "This type", just: "Just this one",
    openAura: "Open Aura", expired: "This link has expired.", unanswered: "unanswered",
  },
  ar: {
    opportunity: "فرصة", opportunities: "الفرص", open: "متاحة الآن", early: "إشارة مبكرة",
    fits: "تناسبك", win: "تستطيع الفوز بها", right: "صحيح", notQuite: "ليس تماماً",
    notArea: "ليس مجالي", lessIssuer: "أقل من هذه الجهة", noted: "تم — شكراً لك.",
    part: "أي جزء تحديداً؟", understood: "فهمنا — سنقلّل ما يشبهها خلال الأسابيع الستة المقبلة.",
    understoodLong: "فهمنا — سنقلّل ما يشبهها خلال التسعين يوماً المقبلة.", empty: "لا شيء قوي اليوم",
    issuer: "هذه الجهة", level: "هذا المستوى", place: "هذا المكان", type: "هذا النوع", just: "هذه فقط",
    openAura: "افتح Aura", expired: "انتهت صلاحية هذا الرابط.", unanswered: "بلا رد",
  },
} as const;

export const chairLabels: Record<string, { en: string; ar: string }> = {
  board: { en: "Board seat", ar: "مقعد مجلس" }, mandate: { en: "Mandate", ar: "تكليف" },
  role: { en: "Role", ar: "دور" }, room: { en: "Room", ar: "غرفة" }, speaking: { en: "Speaking", ar: "منصة" },
  media: { en: "Media", ar: "إعلام" }, advisory: { en: "Advisory", ar: "استشارة" }, award: { en: "Award", ar: "جائزة" },
  learning: { en: "Learning", ar: "تعلّم" },
};

export const bandLabels: Record<string, { en: string; ar: string }> = {
  strong: { en: "strong", ar: "قوية" }, worth_a_look: { en: "worth a look", ar: "تستحق النظر" }, stretch: { en: "a stretch", ar: "بعيدة" },
};