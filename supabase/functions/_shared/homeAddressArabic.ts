import { arabicTextNotes, type ArabicGateDetail } from "./arabicVoice.ts";

export type HomeAddressFacts = Record<string, any>;
export type HomeAddressMove = {
  key: string;
  title: string;
  what: string;
  ar?: { title: string; what: string };
} | null;

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const TIER_AR: Record<string, string> = {
  Observer: "متابع", Explorer: "مستكشف", Strategist: "استراتيجي", Voice: "صاحب رأي", Presence: "مرجع",
};
const FACET_AR: Record<string, string> = {
  conviction: "الثقة", discernment: "البصيرة", edge: "التخصّص", voice: "الأسلوب",
  focus: "التركيز", identity: "الهوية", audience: "الجمهور",
};

const shortTitle = (value: unknown) => {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > 7 ? `${words.slice(0, 7).join(" ")}…` : words.join(" ");
};
const monthAr = (iso: unknown): string | null => {
  if (typeof iso !== "string") return null;
  const month = Number(iso.slice(5, 7));
  return month >= 1 && month <= 12 ? MONTHS_AR[month - 1] : null;
};
const daysAgo = (iso: unknown): number | null => {
  if (typeof iso !== "string" || !iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

/** Whole Arabic evidence sentences. Counts are labels, never embedded as «عددها». */
export function buildArabicEvidenceLines(f: HomeAddressFacts, move: HomeAddressMove): string[] {
  const lines: string[] = [];
  const signal = f.top_signal;
  if (signal?.title) {
    const title = shortTitle(signal.title);
    const count = Number(signal.fragment_count ?? 0);
    const month = monthAr(signal.first_fragment_date);
    if (count > 0 && month) lines.push(`أدلة إشارة «${title}»: ${count}. بدأت تتكوّن في ${month}.`);
    else if (count > 0) lines.push(`أدلة إشارة «${title}»: ${count}.`);
    else lines.push(`لديك إشارة باسم «${title}».`);
    if (signal.gained_last_7d) lines.push(`وصل دليل جديد لإشارة «${title}» هذا الأسبوع.`);
    if (signal.velocity === "accelerating") lines.push(`إشارة «${title}» تنمو أسرع من بقية ما في ملفك.`);
    if ((f.signals_never_published_from ?? 0) > 0) lines.push(`لم تنشر شيئاً من إشارة «${title}» بعد.`);
  } else if ((f.signals_never_published_from ?? 0) > 0) {
    lines.push(`إشارات قائمة لم تنشر منها بعد: ${f.signals_never_published_from}.`);
  }

  const draft = f.last_night?.newest_signal_draft;
  if (draft?.title) lines.push(`تنتظرك مسودة عن «${String(draft.title).slice(0, 70)}».`);
  else if ((f.drafts_total ?? 0) > 0) lines.push(`مسودات مكتوبة لم تنشرها: ${f.drafts_total}.`);

  const lastPublished = daysAgo(f.last_publish_attempt);
  if (lastPublished === 0) lines.push("نشرت اليوم.");
  else if (lastPublished != null) lines.push(`الأيام منذ آخر مرة ضغطت فيها «نشر»: ${lastPublished}.`);
  else if ((f.published_total ?? 0) === 0 && (f.captures_total ?? 0) > 0) lines.push("لم ينشر شيء لك عبر KnownBy بعد.");

  if ((f.published_total ?? 0) > 0) {
    lines.push(`منشوراتك الظاهرة على LinkedIn: ${f.published_total}. منها ما صُنع مع KnownBy: ${f.published_through_aura ?? 0}.`);
  }

  const weeks = f.weeks_with_a_capture_last_4;
  if (typeof weeks === "number" && weeks < 4) lines.push(`أسابيع لم تحفظ فيها شيئاً من آخر 4 أسابيع: ${4 - weeks}.`);
  else if (weeks === 4) lines.push("حفظت شيئاً في كل أسبوع من الأسابيع الأربعة الماضية.");

  if (!f.captured_today && (f.captures_total ?? 0) > 0) lines.push("لم يصل شيء جديد اليوم.");
  if ((f.captures_total ?? 0) === 0) lines.push("لم تحفظ شيئاً بعد، لذلك لا يعكس ما هنا صوتك.");
  else if ((f.captures_this_week ?? 0) > 0) lines.push(`ما حفظته هذا الأسبوع: ${f.captures_this_week}.`);

  if ((f.facets_dormant?.length ?? 0) > 0) {
    lines.push(`جانب «${FACET_AR[f.facets_dormant[0]] ?? f.facets_dormant[0]}» لم يظهر بعد في شيء نشرته.`);
  }
  const read = f.last_night?.sources_read ?? 0;
  if (read > 0) lines.push(`صفحات قرأها KnownBy لك الليلة الماضية: ${read}.`);
  if (f.tier && f.next_band_name && f.points_to_next_band != null) {
    lines.push(`النقاط بين «${TIER_AR[f.tier] ?? f.tier}» و«${TIER_AR[f.next_band_name] ?? f.next_band_name}»: ${f.points_to_next_band}.`);
  }
  if (f.linkedin_connected === false) lines.push("صفحتك على LinkedIn غير مرتبطة، لذلك لا تصل نتائج منشوراتك إلى KnownBy.");
  if (move?.key === "capture" && (f.captures_total ?? 0) > 0) lines.push("يكفي رابط واحد الليلة ليعمل منه KnownBy.");
  return lines.slice(0, 10);
}

const canon = (value: string) => value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
const integers = (value: string) => [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
const quoted = (value: string) => [...value.matchAll(/«([^»]+)»/g)].map((match) => match[1].trim());

export type ArabicHomeGate = { pass: boolean; reasons: string[]; notes: ArabicGateDetail[] };

export function gateArabicHomeAddress(text: string, evidence: string[]): ArabicHomeGate {
  const reasons: string[] = [];
  const haystack = canon(text);
  const matched = evidence.filter((line) => haystack.includes(canon(line)));
  if (evidence.length >= 2 && matched.length < 2) reasons.push(`matched evidence lines: ${matched.length}`);
  const allowedNumbers = new Set(evidence.flatMap(integers));
  const unknownNumbers = integers(text).filter((n) => !allowedNumbers.has(n));
  if (unknownNumbers.length) reasons.push(`unknown figures: ${[...new Set(unknownNumbers)].join(", ")}`);
  const allowedNames = new Set(evidence.flatMap(quoted));
  const unknownNames = quoted(text).filter((name) => !allowedNames.has(name));
  if (unknownNames.length) reasons.push(`unknown names: ${[...new Set(unknownNames)].join(", ")}`);
  const notes = arabicTextNotes(text);
  if (notes.length) reasons.push(...notes.map((note) => `arabic:${note.check}`));
  return { pass: reasons.length === 0, reasons, notes };
}

export function fallbackArabicHomeAddress(evidence: string[]): string {
  const lines = evidence.length ? evidence.slice(0, 3) : ["لا تغيير يمكن عرضه من أدلتك اليوم."];
  return `هذا ما تغيّر منذ أمس:\n${lines.join("\n")}`;
}