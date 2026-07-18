// Aura Content DNA — single source of truth for all content generators.

// Import from posts, carousel, newsletter, and the quality gate.

// Change the method HERE; every generator updates together. Never inline-duplicate these rules.

export type DNALang = "ar" | "en";

export type DNATexture = "clean" | "daheeh" | "qawarish";

// 1. THE ENGINE — information as plot; the payoff is never the opening.

export const ENGINE = `CONTENT ENGINE — every piece follows this arc:

1. HOOK — open on a tension, paradox, or counterintuitive claim. Never open with the conclusion or "today I want to talk about".

2. SCENE — a concrete, specific situation the reader recognizes (show, don't tell). Not an abstraction.

3. VILLAIN — name the misconception the reader secretly believes ("everyone thinks X… it's not X").

4. PAYOFF + NUMBER — release the tension with the core insight, anchored by ONE number (see NUMBER INTEGRITY).

5. REFRAME — zoom out; connect the small thing to something larger.

6. UNCOMFORTABLE QUESTION — close on a question the reader carries into the week. Never "what do you think?".

Test: if the key insight is in the first two lines, move it down and build tension in front of it.`;

// 2. NUMBER INTEGRITY — the credibility guardrail. NON-NEGOTIABLE.

export const NUMBER_INTEGRITY = `NUMBER INTEGRITY (absolute — credibility is the entire product):

- Use AT MOST one specific number, and it MUST come from the provided signal/evidence/context.

- If no real number is provided, DO NOT include a number and DO NOT invent one.

- NEVER attribute a statistic to a "plausible", generic, or made-up source. No fabricated report names, percentages, or figures.

- A real sourced number beats an impressive invented one. When unsure, omit the number and keep the insight.`;

// 3. REGISTER

export const REGISTER_AR = `اللغة: عربية احترافية معاصرة (خليجية) — واضحة ومباشرة، كأنك تحدث مديرًا لا تكتب مقالًا. ليست عامية، وليست فصحى بيروقراطية.

- المصطلحات التقنية تبقى بالإنجليزية: AI, KPI, dashboard, smart meter, SCADA, digital twin, OT, IT.

- أسطر قصيرة تصنع إيقاعًا؛ جملة واحدة لكل سطر؛ التوتر قبل البصيرة.

- لا تُفرَض مفردات عامية؛ الإيقاع من قِصَر الأسطر لا من اللهجة.`;

export const REGISTER_EN = `LANGUAGE: contemporary professional English for a senior GCC executive (CIO/CDO). Peer-to-peer, not consultant-speak. Short lines, one idea per line, tension before insight.`;

// 4. FORMATTING

export const FORMATTING = `FORMATTING:

- ◆ for main points, ↳ for sub-points. One idea per line, blank line between ideas.

- Section markers 📍/⚠️/✅/❌ — max 2–3 total, NEVER in the Hook or the closing Question.

- No markdown (#, **, ---), no format labels ("POST"/"منشور LinkedIn"), no code fences.`;

// 5. BANNED — merged AI-tells (EN + AR)

export const BANNED = `BANNED — never use:

EN: delve, tapestry, landscape (figurative), navigate, realm, beacon, synergy, leverage (verb), utilize, facilitate, holistic, robust, comprehensive, cutting-edge, game-changing, groundbreaking, revolutionary, unprecedented, paradigm, dive deep, unpack, double down, move the needle, "it's worth noting", "at the end of the day", "not just X but Y", "serves as a testament", "at its core", trajectory (use "growth").

AR: "في عالم اليوم المتغير", "لا شك أن", "يسعدني أن أشارككم", "وفي هذا السياق", "لا يخفى على أحد", "من نافلة القول", "تجدر الإشارة إلى", "مما لا شك فيه", "من الضروري أن ندرك", "يُعد من أهم", "ما رأيكم؟", "شاركونا", "بذكاء" في بداية الجملة, "الجزر/الصوامع الرقمية".

Also: no sentence longer than ~15 words.`;

// 6. QAWARISH TEXTURE — optional literary layer; take the technique, stay professional.

export const QAWARISH_TEXTURE = `TEXTURE (optional depth — apply lightly, stay professional):

- Confession opener where honest ("قبل عامين، كدتُ أوصي بـ…" / "A confession:").

- Antithesis pairs — meaning by opposition ("بنية للقياس، بلا بنية للقرار").

- One compressed maxim that stands alone ("الـ AI لا يُصلح، بل يُضخّم").

- Trust the reader: do NOT spell out the takeaway — let them land it.`;

// 7. VOICE PRECEDENCE — stops the voice layer from re-introducing drift.

export const VOICE_PRECEDENCE = `VOICE PROFILE PRECEDENCE: the voice profile adjusts TONE and VOCABULARY FLAVOR only. It NEVER overrides the ENGINE, REGISTER, FORMATTING, BANNED list, or NUMBER INTEGRITY — those are structural and always win.`;

export const OUTPUT_CONTRACT = `OUTPUT CONTRACT (absolute): Your entire response is the finished post and nothing else. The first character you output is the first character of the hook. Do not write anything before the hook or after the closing question — no setup, no notes, no labels of any kind, in any language.`;

export function buildContentDNA(opts: { lang: DNALang; texture?: DNATexture }): string {

  const { lang, texture = "clean" } = opts;

  const register = lang === "ar" ? REGISTER_AR : REGISTER_EN;

  const parts = [ENGINE, NUMBER_INTEGRITY, register, FORMATTING, BANNED, VOICE_PRECEDENCE, OUTPUT_CONTRACT];

  if (texture !== "clean") parts.splice(5, 0, QAWARISH_TEXTURE);

  return parts.join("\n\n");

}
