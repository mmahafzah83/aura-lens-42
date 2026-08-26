import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildContentDNA,
  VOICE_PRECEDENCE,
  NUMBER_INTEGRITY,
  DEFAULT_REGISTER_EN,
  DEFAULT_REGISTER_AR,
  OPEN_TYPES,
  LAND_TYPES,
  OPEN_SPECS,
  LAND_SPECS,
  rotateType,
  rotationSeed,
  openTypeOfHook,
  landTypeOfEnding,
  firstSixWords,
  shouldCollapse,
  selectShape,
  deriveInVoiceSubsets,
  opensOnBannedWord,
  sameBeats,
  resolveMove,
  MOVES,
  MOVE_IDS,
  type OpenType,
  type LandType,
  type MoveId,
  type PastShape,
} from "../_shared/contentDNA.ts";
// The member's own distribution, and the ceilings a draft is held to.
import {
  fidelityCheck,
  distributionPromptBlock,
  MIN_DIST_CORPUS,
  type Distribution,
} from "../_shared/voiceDistribution.ts";

import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";
import { startRun, runIdFrom, type RunHandle } from "../_shared/operationRun.ts";
import { OPERATION_STAGES } from "../_shared/stageKeys.ts";
import { sanitizeStyleFields, pickEnding, ENDING_DIRECTIVE_EN, ENDING_DIRECTIVE_AR, endingShapeOk } from "../_shared/voiceStyle.ts";
import { stripUnsourcedNumbers, findUnsourcedNumbers } from "../_shared/numberGuard.ts";
import { findUnsourcedEntities } from "../_shared/entityGuard.ts";
import { splitForPrompt, enforcedRuleTexts } from "../_shared/voiceRules.ts";
import { PROMPT_VERSION, type Contribution, type GenerationProvenance } from "../_shared/provenance.ts";
import { loadActiveMemberRules, markMemberRulesApplied, memberRulesBlock, neverRuleViolations } from "../_shared/memberRules.ts";
import { endingTypeOf, hookStyleOf } from "../_shared/fingerprint.ts";
import { buildGrounding } from "../_shared/grounding.ts";
import {
  checkTextIntegrity,
  neutralizeRtlMarkers,
  profileBansEmoji,
  stripEmoji,
  containsEmoji,
} from "../_shared/outputHygiene.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* FRAMEWORK_PROMPTS and POST_TYPE_INSTRUCTIONS_* are gone. Both were tables of
   "what kind of post this is" that competed with each other and with the client's
   own list. There is now ONE such table — MOVES in `_shared/contentDNA.ts` — and
   the ids these two used resolve onto it through `resolveMove()`. */

/**
 * The Arabic layer. It carries IDENTITY, REGISTER, worked formatting examples
 * and hashtags — and nothing else. The structure is not defined here: it lives
 * once, in `contentDNA`, and it is language-independent. This prompt used to
 * carry its own competing 7-beat spec, its own banned list, its own "always end
 * on a question" mandate and a worked example that opened on "معظم" — which is
 * how 47 of 80 Arabic and English drafts came to open with the same word.
 */
const ARABIC_VOICE_PROMPT = `أنت محرك توليد المحتوى لـ Aura. مهمتك كتابة منشورات LinkedIn عربية باسم {{name}}، {{role}} المتخصص في {{sector}}.

هويتك في الكتابة:
أنت لا تكتب محتوى — أنت تكشف الواقع.
أنت شخص يفهم ما يجري فعلياً داخل المؤسسات، ويقول أشياء يفكر فيها كثيرون ولا يقولونها.
لست محفزاً، ولا مدرباً، ولا content creator.

السجل اللغوي:
السجل المستهدف: {{register}} — واضح، مباشر، كأنك تتحدث مع مدير لا تكتب مقالاً.
الكلمات التقنية تبقى بالإنجليزية: AI، KPI، dashboard، API، roadmap.
لا عامية كاملة، لا لغة إعلامية رسمية.

الهيكل: اتبع "هيكل المنشور" الوارد أعلاه حرفياً — هو الهيكل الوحيد. لا تضف حركات ولا تعد ترتيبها.

قواعد الأسطر:
- سطر فارغ بين كل فكرة رئيسية
- كل جملة في سطر مستقل

للقوائم والنقاط — استخدم:
◆ للنقاط الرئيسية في القائمة
- للنقاط الثانوية البسيطة
ولا تستخدم ↳ في العربية إطلاقاً.

للأرقام المتسلسلة — استخدم:
1. أو ١. للخطوات المرتبة

للفواصل والانتقالات — استخدم إيموجي واحد فقط كعلامة بصرية:
📍 لتحديد نقطة مهمة
⚠️ للتحذير أو المفارقة
✅ للصح / النتيجة الإيجابية
❌ للخطأ الشائع أو ما لا يجب

لا تستخدم أكثر من 2-3 إيموجي في البوست كله.
لا تضع إيموجي في الافتتاح ولا في سطر الخاتمة — فقط في منتصف البوست.

مثال على التنسيق الصحيح (مثال تنسيق فقط — لا تنسخ افتتاحه ولا خاتمته):
المشكلة ليست في غياب الخطة.
المشكلة في أن أحداً لا يملكها.

◆ الفريق التنفيذي وافق على الاستراتيجية
- لكن لا أحد يعرف من يقود التنفيذ

◆ الإدارة الوسطى تنتظر التوجيه
- لأن الأولويات تتغير كل ربع

📍 الخطة بلا مالك ليست خطة.
هي وثيقة.

قواعد افتتاح البوست:
- لا تبدأ البوست أبداً بكلمة "منشور" أو "منشور LinkedIn" أو أي تسمية للصيغة. ابدأ بالافتتاح مباشرة.
- الافتتاح يتبع نوع الافتتاح المحدد لهذا البوست أعلاه، ولا شيء غيره.
- مثال خاطئ: "منشور LinkedIn — مشاريع التحول الرقمي..." (لا تسبق الافتتاح بأي تسمية للصيغة)

قواعد التنسيق الصارمة:
- لا تستخدم "---" كفاصل بين الأقسام. استخدم سطراً فارغاً.
- لا تستخدم "#" كعنوان. LinkedIn لا يعرض markdown.
- لا تستخدم "POST" أو "منشور LinkedIn" كعنوان داخل النص.
- اجعل الجمل قصيرة (أقل من 12 كلمة)، كل جملة في سطر مستقل.

الهاشتاقات — 3 فقط في نهاية البوست:
- واحد لقطاع القارئ: استخدم قطاع المستخدم من ملفه الشخصي (sector_focus) بصيغة هاشتاق عربي مناسب. إن لم يوجد قطاع، استخدم #التحول_الرقمي
- واحد جغرافي: #السعودية أو #الخليج أو #رؤية2030
- واحد للجمهور: #قيادة أو #التحول_المؤسسي

أيضاً: اقرأ voice_profile المرفق واستخدم storytelling_patterns و vocabulary_preferences منه لتلوين النبرة والمفردات — لا لتغيير الهيكل.
البوست الناتج يجب أن يعكس هذا الصوت تحديداً، لا صوتاً عاماً.

الإخراج: البوست مباشرة فقط — بدون مقدمة أو عنوان أو تفسير.`;

/**
 * Explicit member choices live inside the existing `vocabulary_preferences`
 * jsonb under a single `prefs` key. No column, no migration. Absent prefs must
 * behave exactly as before, so every block below is emitted only when the
 * member has actually set the corresponding value.
 */
interface VoicePrefs {
  length_max?: number;
  emoji_level?: "none" | "rare" | "some";
  openings?: string[];
  story_mix?: Record<string, number>;
  anti_ai?: boolean;
  banned_phrases?: string[];
  /* The five the Voice screen writes and this function used to ignore
     completely — a member set them and nothing downstream ever read them. */
  rhythm?: string;
  structure?: string;
  opener?: string;
  closer?: string;
  language_mode?: "en" | "ar" | "mixed";
}

function readPrefs(voiceProfile: any): VoicePrefs {
  const vp = voiceProfile && typeof voiceProfile.vocabulary_preferences === "object" && voiceProfile.vocabulary_preferences
    ? voiceProfile.vocabulary_preferences as Record<string, unknown>
    : {};
  const p = vp.prefs;
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  const o = p as Record<string, unknown>;
  const out: VoicePrefs = {};
  if (Number.isFinite(Number(o.length_max)) && Number(o.length_max) > 0) out.length_max = Math.floor(Number(o.length_max));
  if (o.emoji_level === "none" || o.emoji_level === "rare" || o.emoji_level === "some") out.emoji_level = o.emoji_level;
  if (Array.isArray(o.openings)) {
    const list = o.openings.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (list.length) out.openings = list;
  }
  if (o.story_mix && typeof o.story_mix === "object" && !Array.isArray(o.story_mix)) {
    const mix: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.story_mix as Record<string, unknown>)) {
      if (Number.isFinite(Number(v))) mix[k] = Number(v);
    }
    if (Object.keys(mix).length) out.story_mix = mix;
  }
  if (typeof o.anti_ai === "boolean") out.anti_ai = o.anti_ai;
  for (const k of ["rhythm", "structure", "opener", "closer"] as const) {
    const v = String(o[k] ?? "").trim();
    if (v) (out as Record<string, unknown>)[k] = v;
  }
  if (o.language_mode === "en" || o.language_mode === "ar" || o.language_mode === "mixed") {
    out.language_mode = o.language_mode;
  }
  if (Array.isArray(o.banned_phrases)) {
    const list = o.banned_phrases.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (list.length) out.banned_phrases = list;
  }
  return out;
}

/** Emoji level is the member's explicit word; it overrides anything inferred. */
function prefsBansEmoji(voiceProfile: any): boolean {
  return readPrefs(voiceProfile).emoji_level === "none";
}

const OPENING_LABELS_EN: Record<string, string> = {
  number_first: "open on a specific figure drawn from the evidence",
  contrarian_claim: "open on a claim that contradicts what the sector believes",
  observation: "open on a plain observation of something you have seen",
  scene: "open inside a short concrete scene",
  question: "open on one specific question",
  confession: "open by admitting something you got wrong",
  contrast: "open by setting two things against each other",
  dialogue: "open on a line someone actually said",
};
const OPENING_LABELS_AR: Record<string, string> = {
  number_first: "ابدأ برقم محدد وارد في الأدلة",
  contrarian_claim: "ابدأ بادعاء يخالف ما يعتقده القطاع",
  observation: "ابدأ بملاحظة مباشرة لشيء رأيته",
  scene: "ابدأ بمشهد قصير وملموس",
  question: "ابدأ بسؤال واحد محدد",
  confession: "ابدأ باعتراف بخطأ وقعت فيه",
  contrast: "ابدأ بمقابلة بين أمرين متعارضين",
  dialogue: "ابدأ بعبارة قالها شخص فعلاً",
};
const humanOpening = (key: string, ar: boolean) =>
  (ar ? OPENING_LABELS_AR[key] : OPENING_LABELS_EN[key]) || key.replace(/_/g, " ");

/** One opening per generation, drawn from what the member allows. */
export function pickOpening(openings?: string[]): string | null {
  if (!Array.isArray(openings) || openings.length === 0) return null;
  return openings[Math.floor(Math.random() * openings.length)];
}

const STORY_MIX_LABELS_EN: Record<string, string> = {
  analytical: "analytical — reason through the evidence",
  actionable: "actionable — give the reader something to do",
  human: "human — anchored in a real moment with people in it",
  inspiring: "inspiring — lift the reader's view of the work",
};
const STORY_MIX_LABELS_AR: Record<string, string> = {
  analytical: "تحليلي — استدلال على الأدلة",
  actionable: "عملي — يمنح القارئ خطوة قابلة للتنفيذ",
  human: "إنساني — مرتكز على لحظة حقيقية بأشخاص حقيقيين",
  inspiring: "ملهم — يرفع نظرة القارئ إلى عمله",
};

const AI_SLOP_EN = [
  "In today's rapidly evolving…",
  "It's not about X, it's about Y",
  "The key takeaway is",
  "Let's dive in",
  "game changer",
  "At the end of the day",
  "Three things stand out",
];
const AI_SLOP_AR = [
  "في عالمنا سريع التغير…",
  "الأمر لا يتعلق بـ X بل بـ Y",
  "الخلاصة الأهم هي",
  "دعونا نغوص في التفاصيل",
  "نقلة نوعية",
  "في نهاية المطاف",
  "ثلاثة أمور تستحق الانتباه",
];

/**
 * The member's explicit choices, rendered as prompt blocks. Returns "" when
 * nothing has been set, so an untouched profile produces the same prompt it
 * produced before this existed.
 */
function buildPrefsBlock(voiceProfile: any, ar: boolean, chosenOpening?: string | null, evidenceHasNumber = true): string {
  const prefs = readPrefs(voiceProfile);
  const lines: string[] = [];

  if (prefs.length_max) {
    lines.push(ar
      ? `الطول — إلزامي: لا يتجاوز المنشور ${prefs.length_max} حرفاً بأي حال.`
      : `LENGTH — hard rule: the finished post must be ${prefs.length_max} characters or fewer.`);
  }

  if (prefs.emoji_level === "none") {
    lines.push(ar
      ? "الإيموجي — ممنوع نهائياً: لا تستخدم أي إيموجي أو رمز تعبيري."
      : "EMOJI — none at all. Do not use a single emoji or pictographic symbol.");
  } else if (prefs.emoji_level === "rare") {
    lines.push(ar
      ? "الإيموجي — نادراً: إيموجي واحد كحد أقصى، ولا يكون في السطر الأول ولا في السؤال الختامي."
      : "EMOJI — rare: at most one in the whole post, never in the first line and never in the closing question.");
  } else if (prefs.emoji_level === "some") {
    lines.push(ar
      ? "الإيموجي — باعتدال: استخدامه محدود، ولا يظهر في الخطاف ولا في السؤال الختامي."
      : "EMOJI — sparing: a light touch only, never in the hook and never in the closing question.");
  }

  if (prefs.openings?.length) {
    const named = prefs.openings.map((o) => humanOpening(o, ar)).join(ar ? "؛ " : "; ");
    const pick = chosenOpening ?? pickOpening(prefs.openings);
    lines.push(ar
      ? `الافتتاحية — إلزامي: يجب أن يفتتح المنشور بإحدى هذه الطرق: ${named}. لهذا المنشور تحديداً: ${humanOpening(String(pick), true)}.`
      : `OPENING — hard rule: the post must open in one of these styles: ${named}. For THIS post: ${humanOpening(String(pick), false)}.`);
  }

  // RHYTHM · STRUCTURE · OPENER · CLOSER · LANGUAGE MODE — the five choices the
  // Voice screen has always saved and the writer never read. Each is a
  // guidance line, not a shape override: rotation still decides the shape.
  const RHYTHM: Record<string, [string, string]> = {
    clipped: ["Short sentences. One idea each. Full stops over commas.", "جمل قصيرة. فكرة واحدة في كل جملة. النقطة قبل الفاصلة."],
    balanced: ["Mixed sentence lengths — a long line, then a short one that lands it.", "طول متنوع للجمل — سطر طويل يتبعه سطر قصير يحسم المعنى."],
    flowing: ["Longer connected sentences that carry the thought through.", "جمل أطول ومتصلة تحمل الفكرة إلى نهايتها."],
  };
  const STRUCTURE: Record<string, [string, string]> = {
    tension_insight: ["Order: name the tension, then the insight that resolves it.", "الترتيب: اذكر التوتر أولاً، ثم البصيرة التي تحلّه."],
    claim_three_proofs: ["Order: one claim, then three concrete proofs.", "الترتيب: ادّعاء واحد، ثم ثلاثة إثباتات ملموسة."],
    story_lesson: ["Order: a short scene first, the lesson last.", "الترتيب: مشهد قصير أولاً، والدرس في النهاية."],
  };
  const OPENER: Record<string, [string, string]> = {
    claim: ["Open on a claim a peer would argue with.", "افتح بادّعاء قد يعارضه نظير في المجال."],
    number: ["Open on a specific number.", "افتح برقم محدد."],
    story: ["Open on one short concrete scene.", "افتح بمشهد واحد قصير وملموس."],
    question: ["Open on an uncomfortable question.", "افتح بسؤال غير مريح."],
  };
  const CLOSER: Record<string, [string, string]> = {
    question: ["Close on an uncomfortable question.", "اختم بسؤال غير مريح."],
    suspended: ["Close on a suspended line that stops rather than concludes.", "اختم بسطر معلّق يتوقف ولا يستنتج."],
    reframe: ["Close by reframing what the post was really about.", "اختم بإعادة تأطير لما كان المنشور عنه فعلاً."],
    equation: ["Close on a plain equation of the parts that matter.", "اختم بمعادلة بسيطة للعناصر المهمة."],
  };
  const prefLine = (table: Record<string, [string, string]>, key: string | undefined, en: string, arLabel: string) => {
    const hit = key ? table[key] : undefined;
    if (!hit) return;
    lines.push(ar ? `${arLabel}: ${hit[1]}` : `${en}: ${hit[0]}`);
  };
  prefLine(RHYTHM, prefs.rhythm, "RHYTHM", "الإيقاع");
  prefLine(STRUCTURE, prefs.structure, "STRUCTURE", "البناء");
  prefLine(OPENER, !evidenceHasNumber && prefs.opener === "number" ? undefined : prefs.opener, "OPENER", "الافتتاحية المختارة");
  prefLine(CLOSER, prefs.closer, "CLOSER", "الخاتمة المختارة");
  if (prefs.language_mode === "mixed") {
    lines.push(ar
      ? "اللغة — الكاتب يكتب بمزيج: يمكن أن يظهر مصطلح إنجليزي واحد أو اثنان حيث يستخدمهما فعلاً، والباقي عربي."
      : "LANGUAGE — this writer mixes: one or two Arabic terms may appear where they genuinely use them, the rest English.");
  } else if (prefs.language_mode === "en") {
    lines.push(ar
      ? "اللغة — الكاتب إنجليزي أصلاً: حافظ على مصطلحاته الإنجليزية كما هي."
      : "LANGUAGE — English throughout. No second-language garnish.");
  } else if (prefs.language_mode === "ar") {
    lines.push(ar
      ? "اللغة — عربية بالكامل: لا كلمات إنجليزية إطلاقاً."
      : "LANGUAGE — the writer works in Arabic; keep English out of the finished post except for proper names.");
  }

  if (prefs.story_mix) {
    const entries = Object.entries(prefs.story_mix);
    if (entries.length) {
      const lowest = entries.sort((a, b) => a[1] - b[1])[0][0];
      const label = (ar ? STORY_MIX_LABELS_AR[lowest] : STORY_MIX_LABELS_EN[lowest]) || lowest;
      lines.push(ar
        ? `نوع المنشور — إرشاد لا قاعدة: يميل هذا المنشور إلى النوع الأقل استخداماً لدى الكاتب: ${label}. اتبع ذلك حيث تسمح المادة.`
        : `KIND OF POST — guidance, not a hard rule: lean toward the writer's under-used type: ${label}. Follow it where the material allows.`);
    }
  }

  if (prefs.anti_ai !== false) {
    lines.push(ar
      ? `ممنوع منعاً باتاً — عبارات الذكاء الاصطناعي المستهلكة: ${AI_SLOP_AR.join("، ")}. وكذلك: التحوّط الفارغ، والجمل المتوازنة أكثر من اللازم، والقوائم الثلاثية غير الضرورية، والخواتيم التحفيزية العامة.`
      : `HARD BAN — AI-cliché patterns: ${AI_SLOP_EN.join(", ")}. Also: empty hedging, over-balanced constructions, unnecessary three-part lists, generic inspirational closers.`);
  }

  if (prefs.banned_phrases?.length) {
    lines.push(ar
      ? `ممنوع منعاً باتاً — عبارات حظرها الكاتب بنفسه: ${JSON.stringify(prefs.banned_phrases)}. لا تستخدمها ولا صيغها القريبة.`
      : `HARD BAN — phrases the writer has banned: ${JSON.stringify(prefs.banned_phrases)}. Never use them or near-variants.`);
  }

  if (lines.length === 0) return "";
  return "\n" + (ar ? "اختيارات الكاتب الصريحة — تتقدّم على أي استنتاج:" : "WRITER'S EXPLICIT CHOICES — these outrank anything inferred:") + "\n" + lines.join("\n") + "\n";
}

/**
 * A row is not a voice.
 *
 * `voiceRefresh` can create a row carrying only `example_posts` and
 * `vocabulary_preferences`; with a hardcoded default tone it used to be injected
 * under "VOICE PROFILE — Write in this voice" and read as trained. The bar:
 * at least 3 example posts, OR a non-default tone plus at least one structure.
 */
const DEFAULT_TONE = "analytical, calm confidence";
export function voiceProfileIsTrained(voiceProfile: any): boolean {
  if (!voiceProfile) return false;
  const examples = Array.isArray(voiceProfile.example_posts) ? voiceProfile.example_posts : [];
  if (examples.filter((e: any) => String(e?.content ?? e ?? "").trim().length > 0).length >= 3) return true;
  const tone = String(voiceProfile.tone ?? "").trim().toLowerCase();
  const structures = Array.isArray(voiceProfile.preferred_structures) ? voiceProfile.preferred_structures : [];
  const patterns = Array.isArray(voiceProfile.storytelling_patterns) ? voiceProfile.storytelling_patterns : [];
  const realTone = tone.length > 0 && tone !== DEFAULT_TONE;
  return realTone && (structures.length > 0 || patterns.length > 0);
}

function buildVoiceContext(voiceProfile: any, chosenOpening?: string | null, evidenceHasNumber = true): string {
  // Below the bar we take the honest no-profile path rather than dress a shell
  // up as the member's voice.
  if (!voiceProfileIsTrained(voiceProfile)) return `No voice profile set — use ${DEFAULT_TONE} tone.`;
  const vp = typeof voiceProfile.vocabulary_preferences === "object" && voiceProfile.vocabulary_preferences ? voiceProfile.vocabulary_preferences : {};
  const sp = voiceProfile.storytelling_patterns;
  // A rule observed in the member's own writing is a constraint; an inferred
  // one is guidance; one their edits have contradicted three times is gone.
  const useRules = splitForPrompt(vp.use);
  const avoidRules = splitForPrompt(vp.avoid);
  return `
VOICE PROFILE — Write in this voice: ${voiceProfile.tone || "analytical, calm confidence"}.
Use these structural patterns: ${JSON.stringify(voiceProfile.preferred_structures || [])}.
${Array.isArray(sp) && sp.length ? `Storytelling patterns: ${JSON.stringify(sp)}.` : ""}
Mirror vocabulary from these examples: ${(voiceProfile.example_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 500)).filter(Boolean).join("\n---\n")}
Admired voice references: ${(voiceProfile.admired_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 300)).filter(Boolean).join("\n---\n")}
${useRules.hard.length ? `Lean into this vocabulary — observed in their own writing: ${JSON.stringify(useRules.hard)}.` : ""}
${avoidRules.hard.length ? `Never do these — observed in their own edits: ${JSON.stringify(avoidRules.hard)}.` : ""}
${useRules.soft.length || avoidRules.soft.length ? `Soft guidance only — inferred, not confirmed by the writer. Follow where natural, set aside where it fights the material: prefer ${JSON.stringify(useRules.soft)}; lean away from ${JSON.stringify(avoidRules.soft)}.` : ""}
Vocabulary notes: ${vp.notes || ""}
Avoid patterns not present in the user's examples. Match their sentence length, paragraph density, and rhetorical style.
Mimic rhythm, interests, and boldness from the examples — never register or slang. The DNA register always outranks example mimicry.
${buildPrefsBlock(voiceProfile, false, chosenOpening, evidenceHasNumber)}`;
}

function buildArabicVoiceContext(voiceProfile: any, chosenOpening?: string | null, evidenceHasNumber = true): string {
  // Same bar as the English path: a shell row is not a voice.
  if (!voiceProfileIsTrained(voiceProfile)) return "";

  const vp = typeof voiceProfile.vocabulary_preferences === "object" && voiceProfile.vocabulary_preferences ? voiceProfile.vocabulary_preferences : {};
  const sp = voiceProfile.storytelling_patterns;
  const useRules = splitForPrompt(vp.use);
  const avoidRules = splitForPrompt(vp.avoid);
  const examples = (voiceProfile.example_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 500)).filter(Boolean).join("\n---\n");
  const admired = (voiceProfile.admired_posts as any[] || []).map((p: any) => (p.content || "").substring(0, 300)).filter(Boolean).join("\n---\n");
  return `ملف الصوت — اكتب بهذا الصوت تحديداً: ${voiceProfile.tone || ""}
استخدم هذه الأنماط البنيوية: ${JSON.stringify(voiceProfile.preferred_structures || [])}
${Array.isArray(sp) && sp.length ? `أنماط السرد والإقناع: ${JSON.stringify(sp)}` : ""}
${examples ? `حاكِ الإيقاع والاهتمامات والجرأة من هذه الأمثلة — لا اللهجة. لا تلتقط أي مفردات تنتمي إلى لهجة مختلفة عن السجل المستهدف. السجل المستهدف يتقدّم على محاكاة الأمثلة دائماً:\n${examples}` : ""}
${admired ? `مراجع صوتية يُقتدى بها:\n${admired}` : ""}
${useRules.hard.length ? `وظّف هذه العبارات والمفردات — ملاحظة فعلياً في كتابته: ${JSON.stringify(useRules.hard)}` : ""}
${avoidRules.hard.length ? `تجنّب هذه الأنماط — ملاحظة فعلياً في تعديلاته: ${JSON.stringify(avoidRules.hard)}` : ""}
${useRules.soft.length || avoidRules.soft.length ? `إرشاد مرن فقط (مستنتج وغير مؤكد من الكاتب): يُفضَّل ${JSON.stringify(useRules.soft)}، ويُبتعد عن ${JSON.stringify(avoidRules.soft)}` : ""}
${vp.notes ? `ملاحظات حول المفردات: ${vp.notes}` : ""}
اكتب بحيث يعكس الناتج هذا الصوت تحديداً، لا صوتاً عاماً.
${buildPrefsBlock(voiceProfile, true, chosenOpening, evidenceHasNumber)}`;
}

function buildIdentityContext(profile: any): string {
  if (!profile) return "";
  const brandResults = profile.brand_assessment_results as any;
  const auditInterp = profile.audit_interpretation as any;

  if (brandResults && brandResults.primary_archetype) {
    const distinctiveExpertise = typeof auditInterp === "string"
      ? (auditInterp.match(/(?:zone of genius|distinctive expertise|what only you can do)[:\s]*([^\n]+)/i)?.[1] || "")
      : (auditInterp?.zone_of_genius || auditInterp?.distinctive_expertise || "");
    const pillars = brandResults.content_pillars
      ? (Array.isArray(brandResults.content_pillars) ? brandResults.content_pillars.join(", ") : brandResults.content_pillars)
      : "";

    return `
IDENTITY CONTEXT — always apply this to every piece of content you generate:
The user's brand archetype is ${brandResults.primary_archetype}. Their positioning statement is ${brandResults.positioning_statement || "not yet defined"}. Their distinctive expertise is ${distinctiveExpertise || "not yet identified"}. Their top content pillars are ${pillars || "not yet defined"}. Their role is ${profile.level || "strategy professional"} in ${profile.sector_focus || "their field"} targeting ${profile.north_star_goal || "thought leadership"}.
Every piece of content must: (1) Sound like their archetype — if they are The Expert, write with rigour and depth. If they are The Challenger, write with a contrarian edge. If they are The Visionary, write with forward-looking perspective. (2) Reinforce their positioning statement — content should always move the reader toward seeing the user through the lens of their positioning. (3) Stay within or adjacent to their content pillars — do not generate content on topics unrelated to their pillars without explicit user request.
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
  }

  return `
IDENTITY:
- Role: ${profile.level || "strategy professional"}
- Sector: ${profile.sector_focus || "general"}
- North Star: ${profile.north_star_goal || "thought leadership"}
- Practice: ${profile.core_practice || "strategy"}
- Brand Pillars: ${(profile.brand_pillars || []).join(", ")}
- Authority Themes: ${JSON.stringify((profile.identity_intelligence as any)?.authority_themes || [])}
`;
}

serve(withObserve("generate-authority-content", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  /* One run row per drafting request, with the two stages the studio draws. */
  const [GATHER, WRITE] = OPERATION_STAGES.studio_generate;
  let run: RunHandle | null = null;
  const closeRun = async (outcome: "ok" | "refused" | "failed", reason?: string) => {
    try { await run?.finish({ outcome, reason_code: reason ?? null }); }
    catch (e) { console.error("[generate-authority-content] run finish failed:", (e as Error)?.message); }
    run = null;
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = !!SERVICE_ROLE && (bearer === SERVICE_ROLE || apiKey === SERVICE_ROLE);

    const body = await req.json();
    const { action, ...params } = body;

    let supabase: ReturnType<typeof createClient>;
    let effectiveUserId: string;

    if (isCron || isServiceRole) {
      const bodyUserId = typeof body.user_id === "string" ? body.user_id : null;
      if (!bodyUserId) {
        return new Response(JSON.stringify({ error: "Unauthorized: user_id required for service/cron call" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
      effectiveUserId = bodyUserId;
    } else {
      if (!authHeader) throw new Error("No authorization header");
      supabase = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Unauthorized");
      effectiveUserId = user.id;
    }

    const effectiveLanguage = (params.language || params.lang || "en") as string;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // A mode is the member's own voice tuned for one job. It is a separate row
    // with the same (user_id, language); absent a mode_key the request means
    // the member's default voice, exactly as before.
    const requestedMode = typeof (params as { mode_key?: unknown }).mode_key === "string"
      && (params as { mode_key: string }).mode_key.trim()
      ? (params as { mode_key: string }).mode_key.trim()
      : "default";
    let modeFallback = false;
    // A member whose only trained voice is Arabic used to get NO voice at all
    // when writing English. These say which profile actually drove the draft.
    let languageFallbackFrom: string | null = null;

    // Load voice profile and diagnostic profile in parallel
    let [voiceRes, profileRes] = await Promise.all([
      supabase.from("authority_voice_profiles").select("*").eq("user_id", effectiveUserId).eq("language", effectiveLanguage).eq("mode_key", requestedMode).maybeSingle(),
      supabase.from("diagnostic_profiles")
        .select("first_name, identity_intelligence, brand_pillars, core_practice, sector_focus, north_star_goal, level, target_register, audit_interpretation, brand_assessment_results")
        .eq("user_id", effectiveUserId).maybeSingle(),
    ]);

    // The mode does not exist in this language: fall back to the member's
    // default voice for that language and say so in the response.
    if (requestedMode !== "default" && !voiceRes.data) {
      voiceRes = await supabase.from("authority_voice_profiles").select("*")
        .eq("user_id", effectiveUserId).eq("language", effectiveLanguage).eq("mode_key", "default").maybeSingle();
      modeFallback = true;
    }

    // No profile in the requested language: fall back to the member's primary
    // voice in ANY language and use its DURABLE traits — tone, structures,
    // storytelling patterns. Example posts are NOT carried across scripts:
    // Arabic exemplars are not a style model for English prose.
    if (!voiceRes.data) {
      const cross = await supabase.from("authority_voice_profiles").select("*")
        .eq("user_id", effectiveUserId)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cross.data) {
        languageFallbackFrom = String((cross.data as any).language ?? "") || null;
        voiceRes = {
          ...cross,
          data: {
            ...(cross.data as any),
            language: effectiveLanguage,
            // Written in another script — never injected as style exemplars.
            example_posts: [],
            admired_posts: [],
          },
        } as any;
      }
    }

    // A voice profile describes HOW the member writes. Even if an older row
    // still carries a figure or an ending mandate, it is scrubbed here before
    // a single character of it reaches a prompt.
    const rawVoiceProfile = voiceRes.data as any;
    const voiceProfile = rawVoiceProfile
      ? { ...rawVoiceProfile, ...sanitizeStyleFields(rawVoiceProfile) }
      : rawVoiceProfile;
    const profile = profileRes.data;
    const texture = (voiceProfile?.vocabulary_preferences as any)?.texture;
    const effTexture = texture === "qawarish" || texture === "daheeh" ? texture : "clean";
    const identityContext = buildIdentityContext(profile);

    // Reader description is built from THIS user's own profile — never hardcoded.
    // The register is NOT folded in here: a description is not a constraint.
    // It is stated separately, as a mandate, by buildContentDNA.
    const readerDescription = (() => {
      const lvl = (profile?.level || "").trim();
      const sec = (profile?.sector_focus || "").trim();
      if (!lvl && !sec) return "a senior professional in their field";
      const who = lvl && sec ? `${lvl} in ${sec}` : (lvl || sec);
      return who ? `a ${who}` : "a senior professional in their field";
    })();

    // D125 — `target_register` is one language-agnostic column. A member whose
    // register reads "contemporary Gulf professional Arabic" had every English
    // post judged against it, and register_match failed 44 of 44. The register
    // is scoped to the language of the post: the stored value when its script
    // matches, a same-language default otherwise.
    const storedRegister = (profile?.target_register || "").trim();
    const registerIsArabic = /[\u0600-\u06FF]/.test(storedRegister);
    const effectiveRegister = effectiveLanguage === "ar"
      ? (registerIsArabic ? storedRegister : DEFAULT_REGISTER_AR)
      : (storedRegister && !registerIsArabic ? storedRegister : DEFAULT_REGISTER_EN);

    /* Recovery only: hand back a draft a finished run already stored. It starts
       no run and calls no model. */
    if (action === "fetch_result") {
      const wantedRunId = runIdFrom(params);
      if (!wantedRunId) {
        return new Response(JSON.stringify({ error: "run_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: row } = await admin
        .from("operation_runs")
        .select("id, user_id, outcome, meta")
        .eq("id", wantedRunId)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (row.user_id && row.user_id !== effectiveUserId) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (row.outcome !== "ok") {
        return new Response(JSON.stringify({ status: row.outcome ?? "pending" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify((row.meta as any)?.result ?? {}), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_content") {
      run = await startRun(undefined, { id: runIdFrom(params), operation: "studio_generate", user_id: effectiveUserId });
      run.mark(GATHER);
      const { content_type, topic, context, language, framework, extra_instruction, rewrite_instruction, current_draft, flash, stream, variation, lang, sector, post_type, theme, signal_id, post_id } = params;
      // A verdict must be joinable to the post it judged, whenever the caller
      // already has one.
      const requestedPostId = typeof post_id === "string" && post_id ? post_id : null;
      const isFlash = flash === true;
      const isNonStream = stream === false;

      // ── Grounding: fetch signal + evidence so the model draws facts only from real data
      let groundingSignal: any = null;
      let groundingFragments: any[] = [];
      // Every fragment behind the driving signal, used for provenance only.
      let provenanceRows: any[] = [];
      try {
        if (signal_id) {
          // Fetch the signal first — we need its own supporting_evidence_ids to ground on ITS chain.
          const { data: sigData } = await supabase.from("strategic_signals")
            .select("signal_title, explanation, strategic_implications, what_it_means_for_you, confidence, supporting_evidence_ids")
            .eq("id", signal_id).eq("user_id", effectiveUserId).maybeSingle();
          groundingSignal = sigData || null;

          const evidenceIds = Array.isArray(sigData?.supporting_evidence_ids)
            ? sigData!.supporting_evidence_ids.filter(Boolean)
            : [];

          if (evidenceIds.length > 0) {
            // Ground on THIS signal's own evidence chain, strongest first.
            const { data: fragData } = await supabase.from("evidence_fragments")
              .select("id, title, content, metadata, confidence")
              .eq("user_id", effectiveUserId)
              .in("id", evidenceIds)
              .order("confidence", { ascending: false });
            const candidates = fragData || [];
            const hasDigit = (f: any) => /[0-9٠-٩۰-۹]/.test(`${f?.title || ""} ${f?.content || ""} ${JSON.stringify(f?.metadata || "")}`);
            const selected = candidates.slice(0, 6);
            const digitBearing = candidates.find(hasDigit);
            if (digitBearing && !selected.some((f: any) => f?.id === digitBearing.id)) {
              selected.splice(Math.max(0, selected.length - 1), selected.length ? 1 : 0, digitBearing);
            }
            groundingFragments = selected;
            // Provenance needs the WHOLE chain, not the six shown to the model.
            for (let i = 0; i < evidenceIds.length; i += 100) {
              const { data: batch } = await supabase.from("evidence_fragments")
                .select("id, title, content, metadata")
                .eq("user_id", effectiveUserId)
                .in("id", evidenceIds.slice(i, i + 100));
              if (batch) provenanceRows.push(...batch);
            }
          } else {
            // Fallback ONLY when the signal has no linked evidence: most recent fragments.
            const { data: fragData } = await supabase.from("evidence_fragments")
              .select("id, title, content, metadata, confidence")
              .eq("user_id", effectiveUserId)
              .order("created_at", { ascending: false })
              .limit(5);
            groundingFragments = fragData || [];
            provenanceRows = fragData || [];
          }
        } else {
          const { data: sigs } = await supabase.from("strategic_signals")
            .select("signal_title, explanation, strategic_implications, what_it_means_for_you, confidence")
            .eq("user_id", effectiveUserId)
            .in("lifecycle_tier", ["live", "evergreen", "emerging"])
            .order("confidence", { ascending: false })
            .limit(3);
          if (sigs && sigs.length) {
            groundingSignal = sigs[0];
            groundingFragments = sigs.slice(1).map((s: any) => ({
              title: s.signal_title,
              content: s.explanation || (typeof s.strategic_implications === "string" ? s.strategic_implications : JSON.stringify(s.strategic_implications || "")),
            }));
            provenanceRows = sigs.map((s: any) => ({
              title: s.signal_title,
              content: [s.explanation, s.what_it_means_for_you, typeof s.strategic_implications === "string" ? s.strategic_implications : JSON.stringify(s.strategic_implications || "")].join(" "),
            }));
          }
        }
      } catch (e) {
        console.warn("[generate-authority-content] grounding fetch failed:", (e as Error).message);
      }

      const groundingString = buildGrounding({
        signal: groundingSignal,
        fragments: groundingFragments,
        provenanceRows,
        context,
        topic,
      });
      const evidenceHasNumber = /[0-9٠-٩۰-۹]/.test(groundingString);

      const formatInstructions: Record<string, string> = {
        post: `Write a LinkedIn post (scroll-stopping hook → insight → framework/key points → closing question). Short paragraphs, spaced lines. Mobile-readable.`,
        essay: `Write a strategic essay (800-1200 words). Introduction → context → analysis → framework → implications → conclusion.`,
        framework_summary: `Write a concise framework summary: problem it solves, when to use it, the steps, and strategic value. Under 500 words.`,
      };

      /* A requested framework is no longer a prompt of its own: it resolves to a
         MOVE, and the MOVE supplies the shape. One table, one instruction. */
      const requestedMove = resolveMove(framework) || resolveMove(typeof post_type === "string" ? post_type : null);

      // Extra instruction (e.g. for angle selection), or the Advisor rewrite path.
      const rewriteInstruction = typeof rewrite_instruction === "string" ? rewrite_instruction.trim() : "";
      const currentDraftText = typeof current_draft === "string" ? current_draft.trim() : "";
      const extraInstruction = rewriteInstruction && currentDraftText
        ? (effectiveLanguage === "ar"
          ? `\n\nإعادة كتابة دقيقة للمسودة الحالية — إلزامي:\n- أعد نفس المنشور مع تغيير الجزء الفاشل فقط: ${rewriteInstruction}\n- أبقِ كل سطر آخر كما هو حرفياً قدر الإمكان.\n- لا تبدأ من موضوع جديد. لا تضف زاوية جديدة.\n\nالمسودة الحالية:\n${currentDraftText}`
          : `\n\nPRECISE REWRITE OF THE CURRENT DRAFT — mandatory:\n- Return the same post with only the failing part changed: ${rewriteInstruction}\n- Keep every other line word for word wherever possible.\n- Do not start from a new topic. Do not add a new angle.\n\nCURRENT DRAFT:\n${currentDraftText}`)
        : (extra_instruction ? `\n\n${extra_instruction}` : "");

      // One opening per generation, drawn from what the member allows.
      const memberPrefs = readPrefs(voiceProfile);
      const allowedOpeningPrefs = evidenceHasNumber
        ? memberPrefs.openings
        : memberPrefs.openings?.filter((o) => !["number", "number_first", "specific_number"].includes(String(o)));
      const chosenOpening = pickOpening(allowedOpeningPrefs);

      /**
       * VARIATION LOOKBACK — repointed at `content_items`.
       *
       * This read used to query `linkedin_posts`, where Aura's drafts have
       * never lived, so it had literally never once seen the thing it exists to
       * differ from. Aura's drafts are `content_items` rows with
       * `made_by='aura'`; discarded rows are excluded because an archived draft
       * is not a shape the member saw. Five most recent, no minimum count: one
       * prior draft is enough to avoid repeating it.
       */
      let recentDrafts: Array<{ move_id: string | null; beats: string[] | null; hook_style: string | null; ending_type: string | null; body: string | null }> = [];
      try {
        const { data: recentRows } = await supabase
          .from("content_items")
          .select("move_id, beats, hook_style, ending_type, body, created_at")
          .eq("user_id", effectiveUserId)
          .eq("made_by", "aura")
          .neq("status", "discarded")
          .order("created_at", { ascending: false })
          // Ten, because the distribution check measures a RUN of drafts, not
          // the last one. Rotation still reads only the five most recent.
          .limit(10);
        recentDrafts = (recentRows || []) as any[];
      } catch (_e) {
        // A history read must never cost a member their draft.
      }
      /** The last ten drafts as text — the window the fidelity ceilings run on. */
      const recentBodies: string[] = recentDrafts
        .map((r) => String(r.body ?? ""))
        .filter((t) => t.trim().length > 0);

      /**
       * HOW THIS MEMBER ACTUALLY WRITES. Rung 1 of the precedence ladder in
       * `contentDNA.ts`: shares measured from their own posts, which no run of
       * drafts may exceed by more than twenty points. Absent, or fewer than
       * eight own posts, and nothing here can reject a draft.
       */
      let voiceDist: Distribution | null = null;
      try {
        const { data: distRow } = await supabase
          .from("voice_distribution")
          .select("corpus_n, open_type_share, land_type_share, move_share, marker_rate, length_p25, length_p50, length_p75")
          .eq("user_id", effectiveUserId)
          .eq("language", effectiveLanguage === "ar" ? "ar" : "en")
          .maybeSingle();
        voiceDist = (distRow as any) ?? null;
      } catch (_e) {
        // Same rule: a measurement read never costs a member their draft.
      }


      /**
       * SIBLING AWARENESS — a batch that writes three drafts in a loop makes
       * three independent calls. Without this, draft 2 and 3 cannot know what
       * draft 1 opened with, which is why one member ended up with seven drafts
       * all opening on the same word. The caller threads what it has already
       * produced in this run through `sibling_shapes`.
       */
      const siblingShapes: PastShape[] =
        Array.isArray((params as any)?.sibling_shapes) ? (params as any).sibling_shapes : [];

      /**
       * THE PAST, as one ordered list: this run's siblings first (they are the
       * most recent shapes that exist), then history. Every rotation level reads
       * this one array, so the three levels can never disagree about what "the
       * last two drafts" were.
       */
      const historyShapes: PastShape[] = recentDrafts.slice(0, 5).map((r) => ({
        move_id: r.move_id ?? null,
        beats: Array.isArray(r.beats) ? r.beats : null,
        hook_style: r.hook_style ?? null,
        ending_type: r.ending_type ?? null,
        opening: r.body ?? null,
      }));

      const pastShapes: PastShape[] = [
        ...siblingShapes.map((s) => ({
          move_id: s?.move_id ?? null,
          beats: Array.isArray(s?.beats) ? s.beats : null,
          hook_style: s?.hook_style ?? null,
          ending_type: s?.ending_type ?? null,
          opening: s?.opening ?? null,
        })),
        ...historyShapes,
      ];


      /**
       * VOICE NARROWS THE RANGE — it does not pick the shape. The profile marks
       * which moves / OPENs / LANDs are this member's; rotation then runs the
       * full three levels inside that subset. With no voice the subset is the
       * full table, so there is exactly one code path.
       */
      const derivation = deriveInVoiceSubsets(voiceProfile);
      if (derivation.log) console.log(derivation.log);
      const memberHasVoice = derivation.basis === "voice";

      const seed = rotationSeed(
        effectiveUserId,
        signal_id || topic || "",
        siblingShapes.length,
        new Date().toISOString().slice(0, 10),
      );

      const shapeSubset = evidenceHasNumber
        ? derivation.subset
        : {
          ...derivation.subset,
          opens: derivation.subset.opens.filter((o) => o !== "specific_number").length
            ? derivation.subset.opens.filter((o) => o !== "specific_number")
            : OPEN_TYPES.filter((o) => o !== "specific_number"),
        };
      const shape = selectShape(historyShapes, siblingShapes, shapeSubset, {
        seed,
        requestedMove,
      });
      const moveId: MoveId = shape.move;
      const beatsForThisPost = shape.beats;
      const openType: OpenType = shape.openType;
      const landType: LandType = shape.landType;
      const avoidOpenTypes = shape.avoidOpenTypes;
      const avoidLandTypes = shape.avoidLandTypes;
      const avoidOpeningTexts = shape.avoidOpeningTexts;
      /** The moves that must not come round again, and the previous shape. */
      const avoidMoves = pastShapes
        .slice(0, Math.max(1, Math.min(2, shape.subset.moves.length - 1)))
        .map((p) => resolveMove(p.move_id ?? null))
        .filter(Boolean) as MoveId[];
      const previousBeats = pastShapes[0]?.beats ?? null;


      const recentPatternBlock = (() => {
        const bannedOpens = [...new Set(avoidOpenTypes.filter(Boolean))] as OpenType[];
        const bits: string[] = [];
        if (avoidMoves.length) {
          const names = avoidMoves.map((m) => (effectiveLanguage === "ar" ? MOVES[m].label_ar : MOVES[m].label_en));
          bits.push(effectiveLanguage === "ar"
            ? `أنواع منشورات استُخدمت للتو — ممنوعة هنا: ${names.join("، ")}.`
            : `Kinds of post just used — banned here: ${names.join(", ")}.`);
        }
        if (bannedOpens.length) {
          bits.push(effectiveLanguage === "ar"
            ? `أنواع افتتاح مستهلكة في آخر المسودات — ممنوعة هنا: ${bannedOpens.join("، ")}.`
            : `OPEN types already used in the most recent drafts — banned here: ${bannedOpens.join(", ")}.`);
        }
        if (avoidOpeningTexts.length) {
          const shown = avoidOpeningTexts.slice(0, 5).map((t) => `"${firstSixWords(t)}"`).join(" / ");
          bits.push(effectiveLanguage === "ar"
            ? `ولا يجوز أن تبدأ الكلمات الست الأولى بأي من هذه: ${shown}.`
            : `The first six words must not match any of these: ${shown}.`);
        }
        if (!bits.length) return "";
        return "\n\n" + (effectiveLanguage === "ar" ? "منع التكرار:" : "NO-REPEAT:") + " " + bits.join(" ");
      })();

      /**
       * The member's real proportions, stated to the model BEFORE it writes.
       * Prevention is cheaper than a regeneration — the ceiling below is what
       * happens when this is ignored.
       */
      const distributionBlock = distributionPromptBlock(voiceDist, effectiveLanguage === "ar");




      // Language + voice handling
      let voiceSection: string;
      if (effectiveLanguage === "ar") {
        // Every placeholder is filled. A clause whose value is missing is
        // removed — a literal {{name}} must never reach the model.
        const arName = (profile as any)?.first_name?.trim?.() || "";
        const arRole = (profile?.level || "").trim();
        const arSector = (profile?.sector_focus || "").trim();
        let arabicBase = ARABIC_VOICE_PROMPT.replace(/\{\{register\}\}/g, effectiveRegister);
        if (arName && arRole && arSector) {
          arabicBase = arabicBase
            .replace(/\{\{name\}\}/g, arName)
            .replace(/\{\{role\}\}/g, arRole)
            .replace(/\{\{sector\}\}/g, arSector);
        } else {
          // Drop the whole naming clause rather than ship a half-filled one.
          arabicBase = arabicBase
            .replace(/\s*باسم \{\{name\}\}،\s*\{\{role\}\}\s*المتخصص في \{\{sector\}\}/g, "")
            .replace(/\{\{name\}\}/g, arName || "الكاتب")
            .replace(/\{\{role\}\}/g, arRole || "قيادي")
            .replace(/\{\{sector\}\}/g, arSector || "مجاله");
        }
        // Arabic-native prompt replaces voice section
        voiceSection = voiceProfile
          ? arabicBase + "\n\n" + buildArabicVoiceContext(voiceProfile, chosenOpening, evidenceHasNumber)
          : arabicBase;
        // If a specific framework is selected, use it; otherwise Arabic defaults to PAS/BAB (already in ARABIC_VOICE_PROMPT)
      } else {
        voiceSection = buildVoiceContext(voiceProfile, chosenOpening, evidenceHasNumber);
      }
      voiceSection += recentPatternBlock + distributionBlock;
      // Only rules the member wrote or explicitly accepted. A suggested rule
      // is a proposal and must never reach the model.
      const activeRules = effectiveUserId ? await loadActiveMemberRules(supabase, effectiveUserId) : [];
      const rulesBlock = memberRulesBlock(activeRules);
      if (rulesBlock) voiceSection += `\n\n${rulesBlock}`;
      // Exactly once per draft request: retries reuse the same prompt decision
      // and never increment rule effects a second time.
      if (activeRules.length > 0) {
        const ruleAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);
        await markMemberRulesApplied(ruleAdmin, activeRules);
      }

      const sectorContextLabel = `${(typeof sector === "string" && sector.trim()) || profile?.sector_focus || "their own"} context`;
      /**
       * What used to be `hookFramework` — a second, competing 4-step structure
       * that MANDATED a contrarian opening on every post — is gone. Structure
       * and formatting live once, in `contentDNA`. What remains here is only the
       * audience note, which is context, not structure.
       */
      const audienceNote = `You are writing for ${readerDescription}. Ground every concrete detail in ${sectorContextLabel}. Never open with "I am excited" or "In today's world".`;

      const langLabel = effectiveLanguage === "ar"
        ? `اكتب المنشور بالكامل بالعربية. الأدلة والحقائق أدناه قد تكون بالإنجليزية — استخرج المعنى واكتبه بالعربية، ولا تنسخ أي جملة أو عبارة إنجليزية كما هي. تبقى بالإنجليزية المصطلحات التقنية فقط (AI, KPI, dashboard, API).`
        : `Write the post ENTIRELY in English. Do not use any Arabic words or script, even if the examples or profile material contain Arabic.`;

      // Flash addendum (variation-aware)
      const variationNum = Number.isFinite(Number(variation)) ? Number(variation) : 1;
      let flashAddendum = "";
      if (isFlash) {
        if (effectiveLanguage === "ar") {
          flashAddendum = `\n\nوضع Flash — أنتج بوستاً واحداً مكتملاً جاهزاً للنشر فوراً.\nلا مقدمة. لا شرح. البوست مباشرة.\nالنسخة رقم ${variationNum}: غيّر الـ Hook والزاوية مع نفس الموضوع والصوت.`;
        } else {
          flashAddendum = `\n\nFlash mode: output one complete publish-ready post. No preamble.\nVariation ${variationNum}: different hook and angle, same topic and voice.`;
        }
        const sectorStr = typeof sector === "string" ? sector.trim() : "";
        const isGeneral = !sectorStr || /^عام/.test(sectorStr) || /^general/i.test(sectorStr);
        if (sectorStr && !isGeneral) {
          if (effectiveLanguage === "ar") {
            flashAddendum += `\nالقطاع المستهدف: ${sectorStr}. اربط البوست بهذا القطاع تحديداً.`;
          } else {
            flashAddendum += `\nTarget sector: ${sectorStr}. Ground the post in this specific sector.`;
          }
        }
      }

      /* The 8 Flash post types used to live here as their own instruction table,
         with the acronym frameworks above them and the client's move library on
         the other side of the wire — three tables, one job. They are now aliases
         onto MOVES (`resolveMove`), the MOVE is chosen by `selectShape` above,
         and the instruction the model receives is `buildMoveDirective`. Nothing
         to add here. */
      const postTypeInstruction = "";

      /**
       * The close is now decided in ONE place: the rotated LAND type. The old
       * `pickEnding()` draw is derived FROM it rather than competing with it, so
       * the shape check (`endingShapeOk`) and the prompt can never disagree —
       * and no post type mandates a question any more.
       */
      const LAND_TO_ENDING: Record<LandType, string> = {
        statement: "suspended",
        question: "question",
        contrast: "reframe",
        invitation: "cta",
        consequence: "number",
      };
      const allowedEndings: string[] = Array.isArray(voiceProfile?.allowed_endings) ? voiceProfile!.allowed_endings : [];
      const chosenEnding = (() => {
        const derived = LAND_TO_ENDING[landType];
        const endingPool = evidenceHasNumber ? allowedEndings : allowedEndings.filter((e) => e !== "number");
        if (!evidenceHasNumber && derived === "number") return "statement";
        if (!endingPool.length || endingPool.includes(derived)) return derived;
        // The member has narrowed the pool; respect it and fall back to a draw.
        const picked = pickEnding(endingPool);
        return !evidenceHasNumber && picked === "number" ? "statement" : picked;
      })();
      const endingDirective = effectiveLanguage === "ar"
        ? `\n\nالخاتمة لهذا البوست: ${chosenEnding === "statement" ? LAND_SPECS.statement.def_ar : (ENDING_DIRECTIVE_AR[chosenEnding] || LAND_SPECS[landType].def_ar)}`
        : `\n\nENDING FOR THIS POST: ${chosenEnding === "statement" ? LAND_SPECS.statement.def_en : (ENDING_DIRECTIVE_EN[chosenEnding] || LAND_SPECS[landType].def_en)}`;

      /**
       * The collapse: fewer than 4 pieces of evidence (or a short preferred
       * length) merges PROOF and SO-WHAT into one beat — a 4-beat post. Never an
       * empty beat, never a padded one.
       */
      const collapseThisPost = shouldCollapse({
        evidenceCount: groundingFragments.length,
        lengthMax: Number((voiceProfile as any)?.length_max) || null,
      });

      const systemPrompt = `You are a world-class thought leadership ghostwriter for senior strategy consultants.

${buildContentDNA({ lang: effectiveLanguage === "ar" ? "ar" : "en", texture: effTexture, readerDescription, register: effectiveRegister, move: moveId, openType, landType, collapse: collapseThisPost })}${recentPatternBlock}

${groundingString}

${audienceNote}

${voiceSection}

${VOICE_PRECEDENCE}
${identityContext}

${formatInstructions[content_type] || formatInstructions.post}
${langLabel}
${/* The MOVE directive inside buildContentDNA is the only kind-of-post instruction. */ ""}
${extraInstruction}${flashAddendum}${endingDirective}

Write with conviction. No generic statements. Every line should demonstrate strategic depth.
${postTypeInstruction}${
  isFlash
    ? (variationNum === 1
        ? "\n\nAngle: CONTRARIAN — challenge what the sector believes."
        : variationNum === 2
        ? "\n\nAngle: PATTERN REVEALER — expose a hidden structural pattern."
        : variationNum === 3
        ? "\n\nAngle: PRACTITIONER — a specific operational tension from real project experience."
        : "")
        : ""
}

===
FINAL OUTPUT RULE (highest priority): Your entire response is the finished post and nothing else. The first character you output is the first character of the OPEN beat. Write nothing before it and nothing after the LAND line — no setup, no notes, no labels of any kind, in any language.

قاعدة الإخراج النهائية: ردّك بالكامل هو البوست النهائي ولا شيء غيره. أول حرف تكتبه هو أول حرف من الافتتاح. لا تكتب أي شيء قبل الافتتاح ولا بعد سطر الخاتمة — بأي لغة.

OUTPUT FORMAT — absolute, overrides every other instruction. Emit the finished post and nothing else, wrapped exactly like this:
<<<POST>>>
the post
<<<END>>>
Nothing before <<<POST>>>. Nothing after <<<END>>>. No analysis, no restatement of the brief, no headings, no labels, no commentary.

صيغة الإخراج — قاعدة مطلقة تتقدم على كل تعليمة أخرى. أخرج البوست النهائي ولا شيء غيره، محصوراً هكذا تماماً:
<<<POST>>>
البوست
<<<END>>>
لا شيء قبل <<<POST>>>. لا شيء بعد <<<END>>>. لا تحليل، ولا إعادة صياغة للمطلوب، ولا عناوين، ولا تسميات، ولا تعليقات.`;


      const userMessageContent = (() => {
        const themeStr = typeof theme === "string" ? theme.trim() : "";
        const sectorStrUser = typeof sector === "string" ? sector.trim() : "";
        const lines: string[] = [`Topic: ${topic}`];
        if (themeStr) lines.push(`Post theme: ${themeStr}`);
        if (sectorStrUser) lines.push(`Sector: ${sectorStrUser}`);
        lines.push("");
        lines.push(`Context: ${context || "Use your knowledge of the user's expertise and stored insights."}`);
        return lines.join("\n");
      })();

      run?.mark(WRITE);
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        console.error("ANTHROPIC_API_KEY not configured");
        await closeRun("failed", "not_configured");
        return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // One place the model is called, so a corrective regeneration runs the
      // exact same prompt with an added directive.
      const MODEL_USED = "claude-sonnet-4-5-20250929";
      const baseMaxTokens = memberPrefs.length_max
        ? Math.max(512, Math.min(4096, Math.ceil(memberPrefs.length_max / 3) + 256))
        : 4096;
      const callModel = async (
        extraDirective = "",
        maxTokensOverride?: number,
      ): Promise<{ text: string; stop_reason: string | null } | null> => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL_USED,
            // A member-set length ceiling also sizes the call (~4 chars/token).
            max_tokens: maxTokensOverride ?? baseMaxTokens,
            system: systemPrompt + (extraDirective ? `\n\n${extraDirective}` : ""),
            messages: [
              { role: "user", content: userMessageContent },
            ],
          }),
        });
        if (!response.ok) {
          const t = await response.text();
          console.error("Anthropic error:", response.status, t);
          return null;
        }
        const json = await response.json();
        try {
          EdgeRuntime.waitUntil(logAIUsage({
            user_id: effectiveUserId ?? null,
            function_name: "generate-authority-content",
            provider: "anthropic",
            model: json.model,
            input_tokens: json.usage?.input_tokens,
            output_tokens: json.usage?.output_tokens,
          }));
        } catch (_) { /* non-blocking */ }
        return {
          text: (json.content || []).map((c: any) => c.text || "").join("") || "",
          stop_reason: typeof json.stop_reason === "string" ? json.stop_reason : null,
        };
      };

      /**
       * Law #85 — the output contract. The model marks the finished post with
       * sentinels; anything outside them is the model talking to itself and is
       * never text a member sees. A missing CLOSE also proves truncation.
       */
      type Extracted = { ok: true; text: string } | { ok: false; reason: "no_open" | "no_close" | "empty" };
      const OPEN = "<<<POST>>>", CLOSE = "<<<END>>>";
      const extractPost = (raw: string): Extracted => {
        if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
        const o = raw.indexOf(OPEN);
        if (o === -1) return { ok: false, reason: "no_open" };
        const c = raw.indexOf(CLOSE, o + OPEN.length);
        if (c === -1) return { ok: false, reason: "no_close" };
        const t = raw.slice(o + OPEN.length, c).trim();
        return t.length > 0 ? { ok: true, text: t } : { ok: false, reason: "empty" };
      };

      type ContractReason = "no_open" | "no_close" | "empty" | "max_tokens";
      const HARDENED_REMINDER =
        "Your previous response broke the output format. Emit ONLY the post between <<<POST>>> and <<<END>>>.";

      const logContractViolation = async (reason: string, raw: string) => {
        try {
          const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
          await admin.from("output_leak_log").insert({
            user_id: effectiveUserId,
            function_name: "generate-authority-content",
            language: effectiveLanguage,
            leak_stage: reason,
            first_lines: (raw || "").slice(0, 300),
          });
        } catch (_) { /* never block */ }
      };

      type ContractStage = "first_pass" | "reask" | "corrective" | "rotation";
      const stageExtractors: Record<ContractStage, (raw: string) => Extracted> = {
        first_pass: (raw) => extractPost(raw),
        reask: (raw) => extractPost(raw),
        corrective: (raw) => extractPost(raw),
        rotation: (raw) => extractPost(raw),
      };

      const judge = (
        res: { text: string; stop_reason: string | null },
        extractor: (raw: string) => Extracted,
      ): { ok: true; text: string } | { ok: false; reason: ContractReason } => {
        // Truncation is a contract violation regardless of sentinels.
        if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens" };
        const ex = extractor(res.text);
        return ex.ok ? { ok: true, text: ex.text } : { ok: false, reason: ex.reason };
      };

      /**
       * Every model call goes through here. Returns null only on transport
       * failure (unchanged behaviour); otherwise a contract verdict after at
       * most one hardened retry.
       */
      const callContract = async (
        stage: ContractStage,
        extraDirective = "",
      ): Promise<{ ok: true; text: string } | { ok: false; reason: ContractReason; raw: string } | null> => {
        const first = await callModel(extraDirective);
        if (first === null) return null;
        const extractor = stageExtractors[stage];
        const v1 = judge(first, extractor);
        if (v1.ok) return v1;
        console.warn("[generate-authority-content] output contract violation —", v1.reason);
        const retryTokens = v1.reason === "max_tokens"
          ? Math.min(8192, baseMaxTokens * 2)
          : undefined;
        const second = await callModel(
          `${extraDirective ? `${extraDirective}\n\n` : ""}${HARDENED_REMINDER}`,
          retryTokens,
        );
        if (second === null) return { ok: false, reason: v1.reason, raw: first.text };
        const v2 = judge(second, extractor);
        if (v2.ok) return v2;
        return { ok: false, reason: v2.reason, raw: second.text };
      };

      const failContractViolation = async (v: { reason: ContractReason; raw: string }): Promise<Response> => {
        // FAIL CLOSED — a broken contract is never handed to a member.
        await logContractViolation(v.reason, v.raw);
        await closeRun("failed", "contract_violation");
        return new Response(
          JSON.stringify({ success: false, error_code: "contract_violation", reason: v.reason }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      };


      const firstRes = await callContract("first_pass");
      if (firstRes === null) {
        await closeRun("failed", "ai_error");
        return new Response(JSON.stringify({ success: false, error: "AI error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!firstRes.ok) {
        return await failContractViolation(firstRes);
      }
      const firstPass = firstRes.text;
      let content = firstPass;

      const stripLabels = (text: string): string => text
        .replace(/^\s*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST|بوست)\s*[-—–:：]\s*(?:English|Arabic|عربي(?:ة)?|إنجليزي(?:ة)?)\s*\n?/i, '')
        .replace(/^\s*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST|بوست)\s*[:：\-—]?\s*\n?/i, '')
        .replace(/^[ \t]*(?:منشور\s*LinkedIn|LinkedIn\s*Post|POST|بوست)[ \t]*[:：\-—]?[ \t]*$\n?/gim, '')
        .replace(/^\s*-{3,}\s*$/gm, '')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .trim();

      content = stripLabels(content);

      const isAr = effectiveLanguage === "ar";
      // Only a ban the member's own edits confirmed is enforced mechanically.
      // An inferred "never uses emoji" must not strip emoji they deliberately keep.
      // An explicit "none" from the member is stronger than anything inferred.
      const bansEmoji = prefsBansEmoji(voiceProfile) || profileBansEmoji(
        enforcedRuleTexts((voiceProfile?.vocabulary_preferences as any)?.avoid),
      );

      // The member's own bans and RTL safety are enforced on the finished text,
      // never left to the prompt.
      const hygiene = (text: string): string => {
        let t = neutralizeRtlMarkers(text, isAr);
        if (bansEmoji) t = stripEmoji(t);
        return t.trim();
      };

      // ── D125 · CHEAP ASSERTIONS FIRST ─────────────────────────────────────
      // Three of the judge's assertions are decidable here for free. Failing
      // them is a re-ask with a targeted directive, not a paid verdict. One
      // re-ask, then proceed — never a loop.
      const primaryFigureCount = (text: string): number => {
        let n = 0;
        for (const line of text.split("\n")) {
          // An ordered-list marker is not a statistic.
          const body = line.replace(/^\s*\d+\.\s/, " ");
          const hits = body.match(/[0-9٠-٩۰-۹][\d٠-٩۰-۹,.]*/g);
          if (hits) n += hits.length;
        }
        return n;
      };
      const selfCheck = (text: string) => {
        const figures = primaryFigureCount(text);
        return {
          one_number_max: figures <= 1,
          grounded_number: findUnsourcedNumbers(text, groundingString).length === 0,
          ending_ok: endingShapeOk(text, chosenEnding),
          figures,
        };
      };
      let preGate = selfCheck(content);
      if (!preGate.one_number_max || !preGate.grounded_number || !preGate.ending_ok) {
        const endingLine = isAr
          ? `- الخاتمة: ${ENDING_DIRECTIVE_AR[chosenEnding]}`
          : `- Ending: ${ENDING_DIRECTIVE_EN[chosenEnding]}`;
        const directive = isAr
          ? `\n\nتصحيح إلزامي — أعد كتابة البوست كاملاً مع الالتزام بما يلي:${preGate.one_number_max ? "" : "\n- رقم واحد فقط في البوست كله (أرقام ترقيم القوائم لا تُحتسب)."}${preGate.grounded_number ? "" : "\n- لا تذكر أي رقم غير وارد حرفياً في الأدلة المرفقة."}${preGate.ending_ok ? "" : `\n${endingLine}`}`
          : `\n\nMANDATORY CORRECTION — rewrite the whole post obeying these:${preGate.one_number_max ? "" : "\n- Use AT MOST one figure in the entire post (ordered-list markers do not count)."}${preGate.grounded_number ? "" : "\n- State no figure that is not present verbatim in the supplied evidence."}${preGate.ending_ok ? "" : `\n${endingLine}`}`;
        console.warn(
          "[generate-authority-content] pre-gate self-check failed —",
          `figures: ${preGate.figures};`,
          `grounded: ${preGate.grounded_number};`,
          `ending(${chosenEnding}): ${preGate.ending_ok}`,
        );
        const reaskRes = await callContract("reask", directive);
        if (reaskRes && !reaskRes.ok) return await failContractViolation(reaskRes);
        const reask = reaskRes && reaskRes.ok ? hygiene(stripLabels(reaskRes.text)) : "";

        if (reask) {
          const after = selfCheck(reask);
          const scoreOf = (c: typeof after) =>
            Number(c.one_number_max) + Number(c.grounded_number) + Number(c.ending_ok);
          // Only keep the re-ask if it is genuinely better. One re-ask, no loop.
          if (scoreOf(after) > scoreOf(preGate)) {
            content = reask;
            preGate = after;
          }
        }
      }

      content = hygiene(content);
      let unsourcedRemoved = 0;
      let unsourcedEntitiesRemoved = 0;
      const warnings: string[] = [];
      let unsourced = findUnsourcedNumbers(content, groundingString);
      // A fabricated organisation, person or date costs a member exactly what a
      // fabricated figure costs them. Same evidence set, same one-retry rule.
      let unsourcedEntities = findUnsourcedEntities(content, groundingString);
      let integrity = checkTextIntegrity(content, isAr);

      // A number the evidence cannot account for is never cut out in place —
      // the draft is rewritten without the claim. Same for broken text.
      if (
        unsourced.length > 0 || unsourcedEntities.length > 0 || !integrity.ok ||
        (bansEmoji && containsEmoji(firstPass))
      ) {
        console.warn(
          "[generate-authority-content] regenerating —",
          `unsourced: ${unsourced.join(" | ") || "none"};`,
          `entities: ${unsourcedEntities.join(" | ") || "none"};`,
          `integrity: ${integrity.issues.join(" | ") || "ok"}`,
        );
        const corrective = isAr
          ? `\n\nإعادة كتابة إلزامية:\n- لا تذكر أي رقم أو نسبة أو مبلغ أو تاريخ غير وارد حرفياً في الأدلة المرفقة. إن لم يكن الرقم في الأدلة، اكتب الجملة بلا رقم.\n- لا تذكر اسم أي شركة أو جهة أو شخص أو تاريخ محدد غير وارد حرفياً في الأدلة. إن لم يرد الاسم في الأدلة، اكتب الجملة بلا اسم.${unsourcedEntities.length ? `\n- احذف تحديداً: ${unsourcedEntities.join("، ")}` : ""}\n- كل جملة مكتملة. لا جملة تنتهي بحرف جر (منذ، على، من، في، عن، إلى، خلال).\n- لا سطر يبدأ بمسافة أو بعلامة ترقيم أو بشظية جملة.${bansEmoji ? "\n- ممنوع استخدام الإيموجي أو الرموز التعبيرية نهائياً." : ""}\n- لا تستخدم ↳ أو ↲ إطلاقاً.`
          : `\n\nMANDATORY REWRITE:\n- Do not state any figure, percentage, amount or date that is not present verbatim in the supplied evidence. If the number is not in the evidence, write the sentence without a number.\n- Do not name any organisation, person or specific date that is not present verbatim in the supplied evidence. If the name is not in the evidence, write the sentence without it.${unsourcedEntities.length ? `\n- Specifically remove: ${unsourcedEntities.join(", ")}` : ""}\n- Every sentence must be complete. No sentence may end on a preposition.\n- No line may start with whitespace, punctuation or an orphaned fragment.${bansEmoji ? "\n- Use no emoji or pictographic symbols at all." : ""}`;

        const retry = await callContract("corrective", corrective);
        if (retry && !retry.ok) return await failContractViolation(retry);
        const candidate = retry && retry.ok ? hygiene(stripLabels(retry.text)) : "";

        const candidateUnsourced = candidate ? findUnsourcedNumbers(candidate, groundingString) : ["retry_failed"];
        const candidateEntities = candidate ? findUnsourcedEntities(candidate, groundingString) : ["retry_failed"];
        const candidateIntegrity = candidate ? checkTextIntegrity(candidate, isAr) : { ok: false, issues: ["retry_failed"] };

        if (candidate && candidateUnsourced.length === 0 && candidateEntities.length === 0 && candidateIntegrity.ok) {
          content = candidate;
          unsourcedRemoved = unsourced.length;
          unsourcedEntitiesRemoved = unsourcedEntities.length;
        } else {
          // Last resort: drop the whole sentence carrying each unsourced claim.
          // A member is never blocked — the best available text is returned with
          // a warning describing what could not be fixed.
          const base = candidate || content;
          const guarded = stripUnsourcedNumbers(base, groundingString);
          const cleaned = hygiene(guarded.text);
          // Provenance outranks style, but it downgrades the draft, never
          // destroys it: if the guard emptied the text, keep the fuller draft.
          content = cleaned.trim() ? cleaned : hygiene(base);
          unsourcedRemoved = unsourced.length + guarded.removed;
          /**
           * Names are never cut in place: a sentence stripped of the thing it
           * names becomes nonsense. The count records what the guard could not
           * source, and the member is told rather than blocked.
           */
          unsourcedEntitiesRemoved = Math.max(
            unsourcedEntities.length,
            Array.isArray(candidateEntities) ? candidateEntities.filter((e) => e !== "retry_failed").length : 0,
          );
        }
        unsourced = findUnsourcedNumbers(content, groundingString);
        unsourcedEntities = findUnsourcedEntities(content, groundingString);
        integrity = checkTextIntegrity(content, isAr);
      }

      if (unsourced.length > 0) warnings.push("unsourced_numbers");
      if (unsourcedEntities.length > 0) warnings.push("unsourced_entities");
      if (!integrity.ok) warnings.push("integrity_issues");
      if (bansEmoji && containsEmoji(content)) warnings.push("emoji_present");

      // ── ROTATION ENFORCEMENT — ALL THREE LEVELS ──────────────────────────
      // A prompt sentence is not enforcement; this check is. The produced draft
      // is compared against the member's last five drafts (and this run's
      // siblings) on the MOVE, on the beat order, on the OPEN type and on the
      // literal opening words — plus the outright ban on opening with "Most" /
      // "معظم". One regeneration naming exactly what was violated; if the retry
      // repeats too, the draft still ships — a member is never blocked — but it
      // ships FLAGGED (`shape_repeat`) and logged at `high`, never silently.
      let rotationRepeat: string | null = null;
      /** Why a shipped draft drifted from the member's own proportions. */
      let voiceFidelityFlags: string[] = [];
      /** 0–100. Null when the member has no distribution to be measured against. */
      let voiceMatch: number | null = null;
      {
        /**
         * THE ONE WRITE-TIME SHAPE CHECK. Rotation repetition and distribution
         * drift are the same question — "is this draft the shape it was
         * supposed to be?" — so they are ONE function with ONE regeneration.
         * A second, separate gate would be a second opinion, and two gates that
         * disagree is how a member ends up with a draft neither of them wanted.
         */
        const verdictOf = (text: string) => {
          const rotation = ((): string | null => {
            if (opensOnBannedWord(text)) {
              return "opens_on_banned_word";
            }
            const six = firstSixWords(text);
            if (six && avoidOpeningTexts.some((prev) => firstSixWords(prev) === six)) {
              return `same_first_six_words:"${six}"`;
            }
            // L1 — the MOVE this post was written as must not be one of the last two.
            if (avoidMoves.includes(moveId)) {
              return `repeated_move:${moveId}`;
            }
            // L2 — and it must not march in the same order as the previous draft.
            if (sameBeats(beatsForThisPost, previousBeats)) {
              return `repeated_beats:${beatsForThisPost.join(">")}`;
            }
            const producedOpen = openTypeOfHook(hookStyleOf(text));
            if (producedOpen && avoidOpenTypes.includes(producedOpen)) {
              return `repeated_open_type:${producedOpen}`;
            }
            const producedLand = landTypeOfEnding(endingTypeOf(text));
            if (producedLand && avoidLandTypes.slice(0, 1).includes(producedLand)) {
              return `repeated_land_type:${producedLand}`;
            }
            return null;
          })();
          // Rung 1 of the ladder: the member's own ceilings. Habits being
          // DROPPED come back as an instruction, never as a rejection.
          const fidelity = fidelityCheck({
            dist: voiceDist,
            recent: recentBodies,
            candidate: text,
            lang: isAr ? "ar" : "en",
          });
          const neverViolations = neverRuleViolations(text, activeRules);
          return {
            rotation,
            fidelity,
            neverViolations,
            failed: Boolean(rotation) || !fidelity.ok || neverViolations.length > 0,
            reasons: [rotation, ...fidelity.violations, ...neverViolations.map((rule) => `never_rule:${rule.text}`)].filter(Boolean) as string[],
          };
        };

        const first = verdictOf(content);
        // A draft that passes still carries the voice note, so the score below
        // reflects the check that actually ran.
        const scoreOf = (v: ReturnType<typeof verdictOf>) =>
          v.fidelity.reason === "no_distribution"
            ? null
            : Math.max(0, 100 - 25 * v.fidelity.violations.length - (v.rotation ? 25 : 0));
        voiceMatch = scoreOf(first);

        if (first.failed) {
          const avoidWords = [...new Set(avoidOpeningTexts.map(firstSixWords).filter(Boolean))].slice(0, 5);
          const moveLabel = isAr ? MOVES[moveId].label_ar : MOVES[moveId].label_en;
          const rotBit = first.rotation
            ? (isAr
              ? `\n\nإعادة كتابة إلزامية — الشكل مكرر (${first.rotation}).\n- نوع المنشور المطلوب: ${moveLabel}، بترتيب الحركات: ${beatsForThisPost.join(" ← ")}.\n- ابدأ البوست بنوع افتتاح "${openType}" كما هو محدد أعلاه.\n- لا تبدأ بكلمة "معظم" ولا بأي من هذه الكلمات: ${avoidWords.map((w) => `"${w}"`).join("، ")}.\n- غيّر الكلمات الست الأولى تماماً. أبقِ الجوهر والأدلة كما هي.`
              : `\n\nMANDATORY REWRITE — the shape repeats a recent draft (${first.rotation}).\n- The kind of post required: ${moveLabel}, in this beat order: ${beatsForThisPost.join(" → ")}.\n- Open in the "${openType}" OPEN type named above, and close in the "${landType}" LAND type.\n- Do not begin with the word "Most", and not with any of these: ${avoidWords.map((w) => `"${w}"`).join(", ")}.\n- Change the first six words entirely. Keep the substance and the evidence.`)
            : "";
          const neverBit = first.neverViolations.length
            ? (isAr
              ? `\n- لا تخالف هذه القواعد: ${first.neverViolations.map((rule) => `"${rule.text}"`).join("، ")}.`
              : `\n- Do not violate these member rules: ${first.neverViolations.map((rule) => `"${rule.text}"`).join(", ")}.`)
            : "";
          if (first.fidelity.violations.length) {
            console.warn(
              "[generate-authority-content] voice fidelity —",
              `violations: ${first.fidelity.violations.join(" | ")};`,
              `running: ${JSON.stringify(first.fidelity.running)}`,
            );
          }
          // ONE regeneration, carrying both corrections at once.
          const rot = await callContract("rotation", rotBit + neverBit + first.fidelity.directive);
          if (rot && !rot.ok) return await failContractViolation(rot);
          const rotCand = rot && rot.ok ? hygiene(stripLabels(rot.text)) : "";

          const second = rotCand ? verdictOf(rotCand) : null;
          if (rotCand && second && !second.failed) {
            content = rotCand;
            voiceMatch = scoreOf(second);
          } else {
            // Never blocked, never silent: the better of the two ships FLAGGED.
            if (rotCand) content = rotCand;
            const final = second ?? first;
            voiceMatch = rotCand ? scoreOf(final) : voiceMatch;
            if (final.rotation) {
              rotationRepeat = final.rotation;
              warnings.push("rotation_repeat");
            }
            if (final.fidelity.violations.length) {
              voiceFidelityFlags = final.fidelity.violations;
              warnings.push("voice_fidelity_drift");
            }
            if (final.neverViolations.length) {
              warnings.push("member_never_rule_violation");
            }
            try {
              const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
              await admin.from("ef_error_log").insert({
                function_name: "generate-authority-content",
                severity: "high",
                error_message: `SHAPE_CHECK ${(final.reasons.join(",") || "regenerate_failed")} user=${effectiveUserId}`,
                context: {
                  stage: "shape_enforcement",
                  user_id: effectiveUserId,
                  move_id: moveId,
                  beats: beatsForThisPost,
                  open_type: openType,
                  land_type: landType,
                  basis: shape.basis,
                  first_reasons: first.reasons,
                  after_retry: second ? second.reasons : ["regenerate_failed"],
                  running_shares: final.fidelity.running,
                  corpus_n: voiceDist?.corpus_n ?? null,
                  enforced: (voiceDist?.corpus_n ?? 0) >= MIN_DIST_CORPUS,
                  first_six_words: firstSixWords(content),
                },
              });
            } catch (e) {
              console.error("[generate-authority-content] shape log failed:", (e as Error).message);
            }
          }
        }
      }


      // Law #86 — the number guard runs after rotation/voice rewrites, so the
      // returned draft is the text that was checked. The flag is MEASURED: it
      // is set only after the guard has actually read the final text, so a
      // regression in ordering turns the assertion red on its own.
      let guardedAfterRotation = false;
      content = hygiene(content);
      const finalNumberGuard = stripUnsourcedNumbers(content, groundingString);
      if (finalNumberGuard.removed > 0) {
        content = hygiene(finalNumberGuard.text);
        unsourcedRemoved += finalNumberGuard.removed;
        if (!warnings.includes("unsourced_numbers")) warnings.push("unsourced_numbers");
      }
      unsourced = findUnsourcedNumbers(content, groundingString);
      guardedAfterRotation = true;
      unsourcedEntities = findUnsourcedEntities(content, groundingString);
      integrity = checkTextIntegrity(content, isAr);
      if (unsourced.length > 0 && !warnings.includes("unsourced_numbers")) warnings.push("unsourced_numbers");
      if (unsourcedEntities.length > 0 && !warnings.includes("unsourced_entities")) warnings.push("unsourced_entities");
      if (!integrity.ok && !warnings.includes("integrity_issues")) warnings.push("integrity_issues");




      // ── QUALITY GATE ─────────────────────────────────────────────────────
      // D125: the gate runs LAST, after every corrective rewrite, so the stored
      // verdict always describes the exact text the member receives. It uses a
      // different model (Anthropic Sonnet) for independent evaluation.
      let gateResult: any = null;
      let gateSkipReason: string | null = null;
      let gateResultId: string | null = null;
      try {
        const gatePromise = supabase.functions.invoke("evaluate-content-quality", {
          body: {
            post_text: content,
            language: effectiveLanguage,
            signal_title: groundingSignal?.signal_title || topic || null,
            voice_tone: voiceProfile?.tone || null,
            user_sector: profile?.sector_focus || null,
            target_register: effectiveRegister,
            grounding_text: groundingString || null,
            content_kind: "post",
            expected_ending: chosenEnding,
            signal_id: signal_id || null,
          },
          ...((isCron || isServiceRole)
            ? { headers: { Authorization: `Bearer ${SERVICE_ROLE}` } }
            : { headers: { Authorization: authHeader } }),
        });
        const timeout = new Promise((resolve) => {
          setTimeout(() => {
            console.warn("[generate-authority-content] quality gate timed out after 45s — skipped");
            resolve({ data: null, error: "timeout" });
          }, 45000);
        });
        const gateRes: any = await Promise.race([gatePromise, timeout]);
        if (gateRes?.data && !gateRes?.error) {
          gateResult = gateRes.data;
        } else {
          gateSkipReason = gateRes?.error === "timeout" ? "gate_timeout" : "gate_invoke_error";
        }
      } catch (e) {
        console.warn("[generate-authority-content] quality gate skipped:", (e as Error).message);
        gateSkipReason = "gate_invoke_exception";
      }

      const gatePayload = gateResult ? {
        overall_score: (() => {
          const o = Number(gateResult.overall ?? 0);
          // Model returns a weighted average of 0–10 sub-scores; rescale to 0–100.
          const scaled = o <= 10 ? Math.round(o * 10) : Math.round(o);
          return Math.min(100, Math.max(0, scaled));
        })(),
        // The fallback obeys the judge's own rule: a draft with an unsourced
        // number never passes on score alone.
        pass: (gateResult.pass === true) || (gateResult.pass === undefined && gateResult?.assertions?.grounded_number !== false && (() => { const o=Number(gateResult.overall??0); const scaled=o<=10?Math.round(o*10):Math.round(o); return scaled>=70; })()),
        assertions: gateResult.assertions || null,
        grounded_number: gateResult.assertions?.grounded_number ?? null,
        // Law #86 — carried through so the Advisor can tell "checked and failed"
        // from "never measured".
        grounding_available: gateResult.grounding_available ?? null,
        scores: gateResult.scores,
        verdict: gateResult.verdict,
        weaknesses: Array.isArray(gateResult.weaknesses) ? gateResult.weaknesses : [],
        skipped: gateResult.skipped || false,
        // The gate no longer rewrites the text it judged. An improved hook is
        // returned as a suggestion the member may take, never a silent swap.
        hook_replaced: false,
        suggested_hook: (gateResult?.scores?.hook < 7 && gateResult?.improved_hook) ? gateResult.improved_hook : null,
        content_hash: gateResult?.content_hash ?? null,
        expected_ending: chosenEnding,
      } : null;

      // Observability: record every gate outcome, always.
      try {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: gateRow } = await admin.from("content_gate_results").insert({
          user_id: effectiveUserId ?? null,
          post_id: requestedPostId,
          function_name: "generate-authority-content",
          language: effectiveLanguage,
          overall_score: gatePayload?.overall_score ?? 0,
          pass: (gatePayload && !gatePayload.skipped) ? gatePayload.pass : null,
          assertions: gateResult?.assertions ?? null,
          weaknesses: Array.isArray(gateResult?.weaknesses) ? gateResult.weaknesses : [],
          skipped: gateResult ? (gateResult.skipped === true) : true,
          skip_reason: gateResult?.skip_reason ?? gateSkipReason,
          judge_model: gateResult?.judge_model ?? null,
          content_hash: gateResult?.content_hash ?? null,
          expected_ending: chosenEnding,
        }).select("id").maybeSingle();
        gateResultId = gateRow?.id ?? null;
      } catch (err) {
        console.error("[generate-authority-content] gate log failed:", (err as Error).message);
      }

      // A gate that cannot answer must never swallow the draft. Only an actual
      // failing verdict blocks; a timeout / invoke error returns the draft free.
      const gateBlocked = (gatePayload && !gatePayload.skipped) ? gatePayload.pass === false : false;

      // The only failure a member may ever see is genuinely empty output.
      if (!content.trim()) {
        await closeRun("failed", "empty_output");
        return new Response(JSON.stringify({
          success: false,
          error: "The model returned no text. Please try again.",
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // What went into this draft, handed back so whoever stores the row can
      // record its lineage. The generator knows the material; only the caller
      // knows the row id.
      const contributions: Contribution[] = [];
      if (signal_id) contributions.push({ kind: "signal", id: signal_id, role: "topic" });
      for (const f of (provenanceRows || [])) {
        if (f?.id) contributions.push({ kind: "evidence_fragment", id: f.id, role: "evidence" });
      }
      if (rawVoiceProfile?.id) {
        contributions.push({ kind: "voice_profile", id: rawVoiceProfile.id, role: "voice" });
      }
      const provenance: GenerationProvenance = {
        made_by: "aura",
        produced_by: "composer",
        prompt_version: PROMPT_VERSION,
        model_used: MODEL_USED,
        contributions,
      };

      /* The draft is built ONCE and persisted on the run row before it is
         returned, so a client whose connection dropped can still recover it. */
      const resultPayload = {
        content,
        success: true,
        provenance,
        framework_used: resolveMove(framework) ? framework : null,
        quality_gate: gatePayload,
        blocked: gateBlocked,
        gate_result_id: gateResultId,
        // The label describes the text that was actually produced, never the
        // ending the prompt asked for.
        ending_type: endingTypeOf(content),
        hook_style: hookStyleOf(content),
        requested_ending: chosenEnding,
        evidence_has_number: evidenceHasNumber,
        guarded_after_rotation: guardedAfterRotation,
        mode_key: requestedMode,
        ...(modeFallback ? { mode_fallback: true } : {}),
        // So the surface can say "drafted from your Arabic voice" rather than
        // pretending the draft came from a voice trained in this language.
        voice_profile_language: languageFallbackFrom ?? (voiceProfile ? effectiveLanguage : null),
        ...(languageFallbackFrom ? { voice_language_fallback_from: languageFallbackFrom } : {}),
        chosen_opening: chosenOpening,
        // The rotation, handed back so the caller can store it and so siblings
        // in the same batch can be told what not to repeat. All three levels
        // travel together — a caller that stores only the OPEN type leaves the
        // next run unable to rotate the MOVE.
        move_id: moveId,
        beats: beatsForThisPost,
        rotation_basis: shape.basis,
        open_type: openType,
        land_type: landType,
        collapsed: collapseThisPost,
        rotation_repeat: rotationRepeat,
        // Does this sound like the member? 0–100, null when they have fewer
        // than eight of their own posts to be measured against.
        voice_match: voiceMatch,
        // Set only when a draft shipped despite drifting — never silent.
        voice_fidelity_flags: voiceFidelityFlags.length ? voiceFidelityFlags : null,
        voice_distribution_corpus_n: voiceDist?.corpus_n ?? null,


        opening_words: firstSixWords(content),
        unsourced_numbers_removed: unsourcedRemoved,
        unsourced_entities_removed: unsourcedEntitiesRemoved,
        unsourced_entity_values: unsourcedEntities,
        warnings,
        integrity_issues: integrity.ok ? [] : integrity.issues,
      };

      await run?.finish({ outcome: "ok", meta: { result: resultPayload } });
      run = null;
      return new Response(JSON.stringify(resultPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    }

    if (action === "extract_card_content") {
      const { post_text, language, topic } = params;
      const lang = language === "ar" ? "ar" : "en";
      if (!post_text || typeof post_text !== "string") {
        return new Response(JSON.stringify({ error: "post_text required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const langRule = lang === "ar"
        ? `All output text MUST be in فصحى معاصرة (modern standard Arabic). Short, sharp sentences. Keep technical terms in English (AI, KPI, dashboard, API). No classical filler.`
        : `All output text in English. Sharp, specific, executive register. No buzzwords (no "leverage", "synergy", "cutting-edge", "unlock"). No vague abstractions.`;

      const systemPrompt = `You are a senior consulting content strategist restructuring a LinkedIn post into 8 different visual card formats.

RULES (apply to every card):
- Every point must be SPECIFIC and ACTIONABLE — no vague generalizations.
- Items in a list must flow LOGICALLY (priority, sequence, or dependency). Order matters.
- Use the exact domain terminology a senior CDO/CIO in ${topic || "the relevant sector"} would use.
- Ground content in the actual post — do not invent statistics, frameworks, or claims that aren't supported.
- Each card must be COHERENT AS A STANDALONE — someone seeing only the card (not the post) should understand the argument.
- ${langRule}
- Never include markdown symbols (**, #, ---, •), format labels ("POST", "منشور LinkedIn"), or emojis in card text.

CARD-SPECIFIC INSTRUCTIONS:

insight: ONE killer line — the most provocative, shareable statement. Not a summary, a provocation. Max 18 words.

framework: 4–6 ordered pillars/steps that form a coherent model. Each has a short title (3–5 words) and one-sentence detail. Order by logic (foundation → structure → action).

stat: The single most impactful number from the post (percent, multiplier, money, count). Pull the EXACT figure from the post — do not invent. Provide unit/label, source attribution, and a one-line headline insight.

comparison: Strategic OLD vs NEW contrast. left = common mistake / old paradigm; right = correct approach / new paradigm. 3–4 paired rows. EACH PAIR must contrast the SAME dimension (row 1 left vs row 1 right address one topic, etc.).

question: The most uncomfortable question a senior leader can't ignore. Max 25 words.

principles: 4–6 imperative principles or hard truths, ordered most-foundational first. Each ≤ 12 words. Optional one-line elaboration.

cycle: 4–6 steps forming a continuous loop where the last step feeds back into the first. Each step has a short label (2–4 words) and one-sentence detail.

equation: A causal relationship — components combined = result. 2–4 specific components, an operator (+ or ×), one result, and a one-sentence footnote on why it matters.

Return ONLY a JSON object matching this exact schema:
{
  "insight": { "headline": string, "attribution"?: string },
  "framework": { "headline": string, "description"?: string, "items": [{ "title": string, "detail": string }] },
  "stat": { "number": string, "label": string, "context"?: string, "source"?: string, "headline": string },
  "comparison": { "headline": string, "left_label": string, "right_label": string, "pairs": [{ "wrong": string, "right": string }] },
  "question": { "question": string, "context"?: string },
  "principles": { "headline": string, "principles": [{ "title": string, "detail"?: string }] },
  "cycle": { "headline": string, "steps": [{ "label": string, "detail"?: string }] },
  "equation": { "headline": string, "components": [string], "operator": "+" | "×", "result": string, "footnote"?: string }
}`;

      const userMessage = `TOPIC: ${topic || "(unspecified)"}\nLANGUAGE: ${lang === "ar" ? "Arabic" : "English"}\n\nPOST TEXT:\n"""\n${post_text}\n"""\n\nReturn the JSON object now.`;

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            response_format: { type: "json_object" },
            max_tokens: 8192,
          }),
        });

        if (!aiResp.ok) {
          const t = await aiResp.text();
          console.error("extract_card_content AI error:", aiResp.status, t);
          if (aiResp.status === 429) {
            return new Response(JSON.stringify({ error: "Aura is busy — try again in a moment." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (aiResp.status === 402) {
            return new Response(JSON.stringify({ error: "Aura is temporarily unavailable. Try again later." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: "AI extraction failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const aiData = await aiResp.json();
        const raw = aiData.choices?.[0]?.message?.content || "{}";
        let parsed: any = {};
        // Escape raw control chars that appear inside JSON strings — a common
        // LLM output defect.
        const repair = (input: string): string => {
          let out = "";
          let inS = false, es = false;
          for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (es) { out += ch; es = false; continue; }
            if (ch === "\\") { out += ch; es = true; continue; }
            if (ch === '"') { inS = !inS; out += ch; continue; }
            if (inS) {
              if (ch === "\n") { out += "\\n"; continue; }
              if (ch === "\r") { out += "\\r"; continue; }
              if (ch === "\t") { out += "\\t"; continue; }
              const code = ch.charCodeAt(0);
              if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
            }
            out += ch;
          }
          return out;
        };
        // Scan a candidate prefix and return it closed off (open string/array/
        // object terminated) so a truncated or malformed tail still parses.
        const closeOff = (input: string): string => {
          let inS = false, es = false, dObj = 0, dArr = 0;
          for (let i = 0; i < input.length; i++) {
            const c = input[i];
            if (es) { es = false; continue; }
            if (c === "\\") { es = true; continue; }
            if (c === '"') { inS = !inS; continue; }
            if (inS) continue;
            if (c === "{") dObj++;
            else if (c === "}") dObj--;
            else if (c === "[") dArr++;
            else if (c === "]") dArr--;
          }
          let s = input;
          if (inS) s += '"';
          while (dArr-- > 0) s += "]";
          while (dObj-- > 0) s += "}";
          return s;
        };
        const tryParse = (s: string): any => {
          try { return JSON.parse(s); } catch { /* ignore */ }
          try { return JSON.parse(repair(s)); } catch { /* ignore */ }
          return null;
        };

        if (raw && typeof raw !== "string") {
          parsed = raw;
        } else {
          let cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
          const start = cleaned.indexOf("{");
          if (start > 0) cleaned = cleaned.slice(start);

          let result = tryParse(cleaned) ?? tryParse(closeOff(cleaned));

          // Progressive salvage: walk back through property boundaries, drop the
          // malformed tail, and close the remaining structure. Never throws.
          if (!result || typeof result !== "object") {
            let cut = cleaned.length;
            for (let attempt = 0; attempt < 80 && cut > 1; attempt++) {
              const comma = cleaned.lastIndexOf(",", cut - 1);
              if (comma <= 0) break;
              cut = comma;
              const candidate = tryParse(closeOff(cleaned.slice(0, cut)));
              if (candidate && typeof candidate === "object") { result = candidate; break; }
            }
          }

          if (!result || typeof result !== "object") {
            console.error("extract_card_content: unsalvageable JSON", cleaned.slice(0, 400));
            parsed = {};
          } else {
            parsed = result;
          }
        }

        return new Response(JSON.stringify({ success: true, cards: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("extract_card_content error:", e);
        return new Response(JSON.stringify({ error: e?.message || "extraction failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    /* ── generate_directions ────────────────────────────────────────────
       Four short ways into the SAME subject, offered before a post is
       written. Grounded on exactly the same signal + evidence chain that
       generate_content uses — no new fact source, no invented figures. */
    if (action === "generate_directions") {
      const { topic, context, signal_id, sector, theme } = params;

      let groundingSignal: any = null;
      let groundingFragments: any[] = [];
      try {
        if (signal_id) {
          const { data: sigData } = await supabase.from("strategic_signals")
            .select("signal_title, explanation, strategic_implications, what_it_means_for_you, confidence, supporting_evidence_ids")
            .eq("id", signal_id).eq("user_id", effectiveUserId).maybeSingle();
          groundingSignal = sigData || null;
          const evidenceIds = Array.isArray(sigData?.supporting_evidence_ids)
            ? sigData!.supporting_evidence_ids.filter(Boolean)
            : [];
          if (evidenceIds.length > 0) {
            const { data: fragData } = await supabase.from("evidence_fragments")
              .select("title, content, metadata, confidence")
              .eq("user_id", effectiveUserId)
              .in("id", evidenceIds.slice(0, 100))
              .order("confidence", { ascending: false })
              .limit(6);
            groundingFragments = fragData || [];
          } else {
            const { data: fragData } = await supabase.from("evidence_fragments")
              .select("id, title, content, metadata, confidence")
              .eq("user_id", effectiveUserId)
              .order("created_at", { ascending: false })
              .limit(5);
            groundingFragments = fragData || [];
          }
        } else {
          const { data: sigs } = await supabase.from("strategic_signals")
            .select("signal_title, explanation, strategic_implications, what_it_means_for_you, confidence")
            .eq("user_id", effectiveUserId)
            .in("lifecycle_tier", ["live", "evergreen", "emerging"])
            .order("confidence", { ascending: false })
            .limit(3);
          if (sigs && sigs.length) {
            groundingSignal = sigs[0];
            groundingFragments = sigs.slice(1).map((s: any) => ({
              title: s.signal_title,
              content: s.explanation || (typeof s.strategic_implications === "string" ? s.strategic_implications : JSON.stringify(s.strategic_implications || "")),
            }));
          }
        }
      } catch (e) {
        console.warn("[generate-authority-content] directions grounding failed:", (e as Error).message);
      }

      const groundingBlock = (() => {
        if (!groundingSignal && groundingFragments.length === 0) return "";
        const sigLine = groundingSignal
          ? `SIGNAL: ${groundingSignal.signal_title || ""} — ${groundingSignal.explanation || ""}`
          : "";
        const fragLines = groundingFragments
          .map((f: any) => `- ${(f.title ? f.title + ": " : "")}${(f.content || "").toString().slice(0, 260)}`)
          .filter(Boolean)
          .join("\n");
        return `GROUNDED EVIDENCE — the only facts you may lean on:\n${sigLine}\n${fragLines}`;
      })();

      const voiceBlock = effectiveLanguage === "ar"
        ? (voiceProfile ? buildArabicVoiceContext(voiceProfile) : "")
        : buildVoiceContext(voiceProfile);

      const sectorLine = `${(typeof sector === "string" && sector.trim()) || profile?.sector_focus || "their own"} context`;
      const themeLine = typeof theme === "string" && theme.trim() ? `Theme: ${theme.trim()}.` : "";

      const dirSystem = effectiveLanguage === "ar"
        ? `أنت تساعد ${readerDescription} على اختيار زاوية قبل الكتابة.
أعطِ أربع زوايا مختلفة تماماً لنفس الموضوع: زاوية معاكسة للسائد، زاوية تشخيصية، زاوية من تجربة ممارس، وزاوية استشرافية.
كل زاوية جملة واحدة قصيرة بالعربية الفصحى المعاصرة، والمصطلحات التقنية تبقى بالإنجليزية.
لا وسوم، لا إيموجي، لا مقدمة، لا تسميات مثل "زاوية معاكسة".
استند فقط إلى الأدلة أدناه؛ لا تخترع أرقاماً أو جهات.
أعد JSON فقط بهذا الشكل: {"directions":[{"id":"1","angle":"..."},{"id":"2","angle":"..."},{"id":"3","angle":"..."},{"id":"4","angle":"..."}]}`
        : `You help ${readerDescription} choose an angle before writing. ${themeLine}
Give four genuinely different ways into the SAME subject: one that argues against the common view, one that diagnoses a cause, one told from lived practitioner experience, and one that looks ahead.
Each angle is ONE plain sentence — a real sentence, never a label. Ground it in ${sectorLine}.
No hashtags, no emoji, no preamble, no labels.
Draw only on the evidence below; invent no numbers, names, or organisations.
Return ONLY this JSON: {"directions":[{"id":"1","angle":"..."},{"id":"2","angle":"..."},{"id":"3","angle":"..."},{"id":"4","angle":"..."}]}`;

      const dirUser = [
        `SUBJECT: ${String(topic || "").slice(0, 300)}`,
        context ? `CONTEXT: ${String(context).slice(0, 600)}` : "",
        groundingBlock,
        voiceBlock ? `VOICE:\n${voiceBlock.slice(0, 1200)}` : "",
      ].filter(Boolean).join("\n\n");

      const dirRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: dirSystem },
            { role: "user", content: dirUser },
          ],
        }),
      });

      if (!dirRes.ok) {
        const t = await dirRes.text();
        console.error("generate_directions AI error:", dirRes.status, t);
        return new Response(JSON.stringify({ error: "AI error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dirJson = await dirRes.json();
      try {
        EdgeRuntime.waitUntil(logAIUsage({
          user_id: effectiveUserId ?? null,
          function_name: "generate-authority-content",
          provider: "lovable",
          model: dirJson.model || "google/gemini-3-flash-preview",
          input_tokens: dirJson.usage?.prompt_tokens,
          output_tokens: dirJson.usage?.completion_tokens,
          metadata: { action: "generate_directions" },
        }));
      } catch (_) { /* non-blocking */ }

      const rawText = String(dirJson.choices?.[0]?.message?.content ?? "").trim();
      let directions: Array<{ id: string; angle: string }> = [];
      try {
        const cleaned = rawText.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        directions = (Array.isArray(parsed?.directions) ? parsed.directions : [])
          .map((d: any, i: number) => ({ id: String(d?.id ?? i + 1), angle: String(d?.angle ?? "").trim() }))
          .filter((d: any) => d.angle)
          .slice(0, 4);
      } catch (e) {
        console.error("generate_directions parse failed:", rawText.slice(0, 300));
      }

      return new Response(JSON.stringify({ directions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_narrative_plan") {
      const voiceContext = buildVoiceContext(voiceProfile);

      const [signalsRes, insightsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, explanation, theme_tags, content_opportunity, framework_opportunity").eq("status", "active").eq("user_id", effectiveUserId).order("confidence", { ascending: false }).limit(10),
        supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars, tags").eq("user_id", effectiveUserId).order("created_at", { ascending: false }).limit(15),
      ]);

      const signalsSummary = (signalsRes.data || []).map(s => `- ${s.signal_title}: ${s.explanation?.substring(0, 150)}`).join("\n");
      const insightsSummary = (insightsRes.data || []).map(i => `- ${i.title} (${i.intelligence_type})`).join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a strategic content advisor for an executive thought leader. Analyze their signals and insights to suggest publishing topics. Return structured suggestions via the tool.

${voiceContext}
${identityContext}

SIGNALS:
${signalsSummary}

INSIGHTS:
${insightsSummary}`
            },
            { role: "user", content: "Generate 5 narrative suggestions for topics I should publish about. Consider my voice, authority themes, and detected signals." }
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_narratives",
              description: "Return narrative publishing suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string" },
                        angle: { type: "string", description: "Narrative angle or framing" },
                        recommended_format: { type: "string", enum: ["post", "carousel", "essay", "framework_summary"] },
                        reason: { type: "string", description: "Why this topic and format" },
                      },
                      required: ["topic", "angle", "recommended_format", "reason"],
                    }
                  }
                },
                required: ["suggestions"],
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "suggest_narratives" } },
        }),
      });

      if (!response.ok) throw new Error("AI error");
      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call");

      const { suggestions } = JSON.parse(toolCall.function.arguments);

      const rows = suggestions.map((s: any) => ({
        user_id: effectiveUserId,
        topic: s.topic,
        angle: s.angle,
        recommended_format: s.recommended_format,
        reason: s.reason,
        status: "suggested",
      }));

      await supabase.from("narrative_suggestions").insert(rows);

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    await closeRun("failed", "exception");
    console.error("Authority content error:", e);
    EdgeRuntime.waitUntil(logError("generate-authority-content", e, { user_id: null }));
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    /* STRUCTURE, NOT DISCIPLINE. Every exit closes the run; `finish()` is
       idempotent, so a run already closed above pays nothing here, and an exit
       nobody thought of can no longer leave a run open forever. */
    await closeRun("failed", "unclosed");
  }
}));

