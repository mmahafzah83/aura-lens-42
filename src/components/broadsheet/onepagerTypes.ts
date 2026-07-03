import type { FigKind } from "./figs";

export type OnePagerLang = "en" | "ar";

export interface ExplainerSection {
  label: string; // 'WHAT IT IS' | "HOW IT'S MEASURED" | free
  body: string;
  fig_kind: FigKind;
  fig_label: string;
}

export interface ExplainerDoc {
  term_headline: string;
  headline_accent: string;
  kicker: string;
  series_no: number;
  sections: ExplainerSection[];
  next_title: string;
  next_items: string[]; // ~4 items
  lang: OnePagerLang;
}

export interface QAItem { q: string; a: string; }

export interface QASheetDoc {
  topic_headline: string;
  headline_accent: string;
  source_line: string;
  items: QAItem[]; // 3..5
  invite: string;
  lang: OnePagerLang;
}

export const SAMPLE_EXPLAINER: ExplainerDoc = {
  term_headline: "Signal Density",
  headline_accent: "Density",
  kicker: "GLOSSARY · STRATEGIC INTELLIGENCE",
  series_no: 3,
  sections: [
    {
      label: "WHAT IT IS",
      fig_kind: "line_signal",
      fig_label: "FIG. A · signal over noise",
      body:
        "The share of your weekly inputs that carry decision-grade information — the moves, hires and numbers that actually change what a leader does next.",
    },
    {
      label: "HOW IT'S MEASURED",
      fig_kind: "step_bars",
      fig_label: "FIG. B · weekly bars",
      body:
        "Each captured item is scored 0-3 for evidence, novelty and proximity. Aggregate over a rolling week and normalise by capture volume.",
    },
  ],
  next_title: "NEXT IN THE SERIES",
  next_items: ["Base rate", "Attribution window", "Second-order effect", "Silent quarter"],
  lang: "en",
};

export const SAMPLE_EXPLAINER_AR: ExplainerDoc = {
  ...SAMPLE_EXPLAINER,
  term_headline: "كثافة الإشارة",
  headline_accent: "الإشارة",
  kicker: "معجم · الذكاء الاستراتيجي",
  sections: [
    { ...SAMPLE_EXPLAINER.sections[0], label: "ما هي", body: "نسبة المدخلات الأسبوعية التي تحمل معلومة قابلة للقرار — التحركات والتعيينات والأرقام التي تُغيّر فعلاً ما سيفعله القائد.", fig_label: "شكل أ · الإشارة" },
    { ...SAMPLE_EXPLAINER.sections[1], label: "كيف تُقاس", body: "يُقيَّم كل عنصر من 0 إلى 3 على الدليل والجدة والقرب. تُجمع أسبوعياً وتُعدَّل بحجم الالتقاط.", fig_label: "شكل ب · الأسبوع" },
  ],
  next_title: "التالي في السلسلة",
  next_items: ["المعدل الأساسي", "نافذة الإسناد", "الأثر الثاني", "الربع الصامت"],
  lang: "ar",
};

export const SAMPLE_QASHEET: QASheetDoc = {
  topic_headline: "On leaving a job you built",
  headline_accent: "leaving",
  source_line: "FROM MY INBOX · WEEK 27",
  items: [
    { q: "How do you know it's time?", a: "When the new problems bore you and the old wins feel like paperwork. That's the second signal — the first was six months earlier." },
    { q: "What should I tell my team first?", a: "The reason, not the timeline. Reasons travel; timelines slip. Give them the frame you're using to decide." },
    { q: "What do I lose that I'll miss?", a: "The default seat at the table. Everything else you can rebuild — that seat you have to earn again." },
  ],
  invite: "Reply to this post with your own question — the best three will get a full answer next week.",
  lang: "en",
};

export const SAMPLE_QASHEET_AR: QASheetDoc = {
  ...SAMPLE_QASHEET,
  topic_headline: "عن ترك وظيفة بنيتها بيدك",
  headline_accent: "ترك",
  source_line: "من صندوق البريد · الأسبوع 27",
  items: [
    { q: "كيف تعرف أن الوقت حان؟", a: "حين تُملّك المشاكل الجديدة وتبدو الانتصارات القديمة كأوراق روتينية. تلك الإشارة الثانية — الأولى كانت قبل ستة أشهر." },
    { q: "بماذا أخبر فريقي أولاً؟", a: "السبب لا التوقيت. الأسباب تُنقل والمواعيد تنزلق. اعطهم الإطار الذي تقرر به." },
    { q: "ما الذي سأفتقده؟", a: "المقعد الافتراضي على الطاولة. كل شيء آخر يُعاد بناؤه — أما ذلك المقعد فعليك أن تكسبه مجدداً." },
  ],
  invite: "شاركني سؤالك في تعليق — سأُجيب على أفضل ثلاثة الأسبوع القادم.",
  lang: "ar",
};